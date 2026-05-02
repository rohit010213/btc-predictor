import { WebSocket } from 'ws';
import { Candle } from '../models/Candle.js';

let chainlinkBtcPrice = null;
let chainlinkPriceTs = null;
const candlePriceLock = new Map(); // candleTs → { price, capturedAt, chainlinkTs }

// In-memory candle history (loaded from DB on startup)
const candleHistory = [];
const MAX_HISTORY = 50;

// Current building candle
let currentCandleTs = null;
let currentCandle = null;

export function getCurrentCandleTs() {
  return Math.floor(Date.now() / 1000 / 300) * 300;
}


// ─────────────────────────────────────────────────────────────
// Load last 50 closed candles from MongoDB on startup
// Restart pe warmup problem solve — seedha history milegi
// ─────────────────────────────────────────────────────────────
export async function loadCandleHistory() {
  try {
    const saved = await Candle.find()
      .sort({ ts: -1 })
      .limit(MAX_HISTORY)
      .lean();

    // Reverse karo — oldest first (TA engine expects chronological)
    const ordered = saved.reverse();
    candleHistory.push(...ordered);

    console.log(`📦 Loaded ${ordered.length} candles from DB`);
  } catch (err) {
    console.error('❌ Failed to load candle history:', err.message);
  }
}


// ─────────────────────────────────────────────────────────────
// Persist closed candle to MongoDB
// ─────────────────────────────────────────────────────────────
async function persistCandle(candle) {
  try {
    await Candle.updateOne(
      { ts: candle.ts },
      { $set: candle },
      { upsert: true },
    );

    // Cleanup — sirf last 100 candles rakhne hain
    const count = await Candle.countDocuments();
    if (count > 100) {
      const oldest = await Candle.find()
        .sort({ ts: 1 })
        .limit(count - 100)
        .select('_id')
        .lean();
      await Candle.deleteMany({ _id: { $in: oldest.map(o => o._id) } });
    }
  } catch (err) {
    console.error('❌ Candle persist error:', err.message);
  }
}


// ─────────────────────────────────────────────────────────────
// Candle rotation — reconnect-safe
// State preserve hoti hai even after WS reconnect
// ─────────────────────────────────────────────────────────────
async function rotateCandleIfNeeded(newPrice) {
  const expectedTs = getCurrentCandleTs();

  if (currentCandleTs === null) {
    // Fresh start — check karo kya DB mein current candle already hai
    currentCandleTs = expectedTs;
    currentCandle = {
      open: newPrice,
      high: newPrice,
      low: newPrice,
      close: newPrice,
      tickCount: 1,
    };
    return;
  }

  if (expectedTs !== currentCandleTs) {
    // ── Candle closed ────────────────────────────────────────
    const closedCandle = {
      ts: currentCandleTs,
      open: currentCandle.open,
      high: currentCandle.high,
      low: currentCandle.low,
      close: currentCandle.close,
      tickCount: currentCandle.tickCount,
    };

    // Push to in-memory history
    candleHistory.push(closedCandle);
    if (candleHistory.length > MAX_HISTORY) candleHistory.shift();

    // Persist to MongoDB (non-blocking)
    persistCandle(closedCandle);

    // ── Start new candle ─────────────────────────────────────
    // NOTE: currentCandleTs/currentCandle ko yahan update karo
    // Reconnect ke baad bhi yeh state preserve rahegi — 
    // new WS connection same variables use karega
    currentCandleTs = expectedTs;
    currentCandle = {
      open: newPrice,
      high: newPrice,
      low: newPrice,
      close: newPrice,
      tickCount: 1,
    };

    console.log(`🕯 New candle started: ${expectedTs} @ $${newPrice}`);

  } else {
    // ── Update current candle ────────────────────────────────
    currentCandle.close = newPrice;
    if (newPrice > currentCandle.high) currentCandle.high = newPrice;
    if (newPrice < currentCandle.low) currentCandle.low = newPrice;
    currentCandle.tickCount++;
  }
}


// ─────────────────────────────────────────────────────────────
// WebSocket connection — reconnect-safe
// State (currentCandle, candleHistory) WS se bahar hai
// Reconnect ke baad fresh WS milta hai lekin state same rahti
// ─────────────────────────────────────────────────────────────
export function connectChainlinkStream() {
  const ws = new WebSocket('wss://ws-live-data.polymarket.com');

  let pingInterval = null; // track interval to clear on reconnect

  ws.on('open', () => {
    console.log('✅ Polymarket RTDS connected');

    ws.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{
        topic: 'crypto_prices_chainlink',
        type: '*',
        filters: '{"symbol":"btc/usd"}',
      }],
    }));

    // Clear old interval if any (safety)
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('PING');
    }, 5000);
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (
        msg.topic === 'crypto_prices_chainlink' &&
        msg.payload?.symbol === 'btc/usd'
      ) {
        chainlinkBtcPrice = msg.payload.value;
        chainlinkPriceTs = msg.payload.timestamp;

        // Candle rotation — await nahi karna (non-blocking enough)
        rotateCandleIfNeeded(chainlinkBtcPrice);

        // PTB lock — pehli tick of candle capture karo
        const candleTs = getCurrentCandleTs();
        if (!candlePriceLock.has(candleTs)) {
          candlePriceLock.set(candleTs, {
            price: chainlinkBtcPrice,
            capturedAt: Date.now(),
            chainlinkTs: chainlinkPriceTs,
          });
          console.log(`🔒 PTB locked: candle=${candleTs} price=$${chainlinkBtcPrice}`);

          // Cleanup — 100 se zyada entries mat rakhna
          if (candlePriceLock.size > 100) {
            const oldest = [...candlePriceLock.keys()].sort()[0];
            candlePriceLock.delete(oldest);
          }
        }
      }
    } catch (_) {
      // JSON parse fail — PING/PONG etc, ignore
    }
  });

  ws.on('close', (code, reason) => {
    console.warn(`⚠ RTDS disconnected (code=${code}) — reconnecting in 3s`);
    if (pingInterval) clearInterval(pingInterval);
    // currentCandle state preserved — sirf WS reconnect hoga
    setTimeout(connectChainlinkStream, 3000);
  });

  ws.on('error', (err) => {
    console.error('RTDS error:', err.message);
    if (pingInterval) clearInterval(pingInterval);
    ws.terminate(); // close trigger karega → reconnect
  });
}


// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────
export function getChainlinkState() {
  return { chainlinkBtcPrice, chainlinkPriceTs, candlePriceLock };
}

export function getCandleHistory() {
  return { candleHistory, currentCandle, currentCandleTs };
}