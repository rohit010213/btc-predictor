import { WebSocket } from 'ws';

let chainlinkBtcPrice = null;
let chainlinkPriceTs = null;
const candlePriceLock = new Map(); // candleTs -> { price, capturedAt, chainlinkTs }

// NEW: store last 50 closed candles for TA
// Each entry: { ts, open, high, low, close, tickCount }
const candleHistory = [];
const MAX_HISTORY = 50;

// Track current building candle
let currentCandleTs = null;
let currentCandle = null; // { open, high, low, close, tickCount, volume }

export function getCurrentCandleTs() {
  return Math.floor(Date.now() / 1000 / 300) * 300;
}

function rotateCandleIfNeeded(newPrice, nowTs) {
  const expectedTs = getCurrentCandleTs();

  if (currentCandleTs === null) {
    // First tick ever
    currentCandleTs = expectedTs;
    currentCandle = { open: newPrice, high: newPrice, low: newPrice, close: newPrice, tickCount: 1 };
    return;
  }

  if (expectedTs !== currentCandleTs) {
    // Candle closed — push to history
    candleHistory.push({
      ts: currentCandleTs,
      open: currentCandle.open,
      high: currentCandle.high,
      low: currentCandle.low,
      close: currentCandle.close,
      tickCount: currentCandle.tickCount,
    });
    if (candleHistory.length > MAX_HISTORY) candleHistory.shift();

    // Start new candle
    currentCandleTs = expectedTs;
    currentCandle = { open: newPrice, high: newPrice, low: newPrice, close: newPrice, tickCount: 1 };
  } else {
    // Update current candle
    currentCandle.close = newPrice;
    if (newPrice > currentCandle.high) currentCandle.high = newPrice;
    if (newPrice < currentCandle.low) currentCandle.low = newPrice;
    currentCandle.tickCount++;
  }
}

export function connectChainlinkStream() {
  const ws = new WebSocket('wss://ws-live-data.polymarket.com');

  ws.on('open', () => {
    console.log('✅ Polymarket RTDS connected');
    ws.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{
        topic: 'crypto_prices_chainlink',
        type: '*',
        filters: '{"symbol":"btc/usd"}'
      }]
    }));
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('PING');
    }, 5000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.topic === 'crypto_prices_chainlink' && msg.payload?.symbol === 'btc/usd') {
        chainlinkBtcPrice = msg.payload.value;
        chainlinkPriceTs = msg.payload.timestamp;

        rotateCandleIfNeeded(chainlinkBtcPrice, Date.now());

        const candleTs = getCurrentCandleTs();
        if (!candlePriceLock.has(candleTs)) {
          candlePriceLock.set(candleTs, {
            price: chainlinkBtcPrice,
            capturedAt: Date.now(),
            chainlinkTs: chainlinkPriceTs,
          });
          console.log(`🕯 Candle ${candleTs} locked at $${chainlinkBtcPrice}`);
          if (candlePriceLock.size > 100) {
            const oldest = [...candlePriceLock.keys()].sort()[0];
            candlePriceLock.delete(oldest);
          }
        }
      }
    } catch (e) { }
  });

  ws.on('close', () => {
    console.warn('⚠ RTDS disconnected — reconnecting in 3s');
    setTimeout(connectChainlinkStream, 3000);
  });

  ws.on('error', (err) => {
    console.error('RTDS error:', err.message);
    ws.terminate();
  });
}

export function getChainlinkState() {
  return { chainlinkBtcPrice, chainlinkPriceTs, candlePriceLock };
}

// NEW export
export function getCandleHistory() {
  return { candleHistory, currentCandle, currentCandleTs };
}