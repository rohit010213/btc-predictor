import express from 'express';
import { getChainlinkState, getCurrentCandleTs, getCandleHistory } from '../services/chainlinkService.js';
import { runTAEngine } from '../services/taEngine.js';

const router = express.Router();

// ── Prediction cache — same candleTs pe 30s tak cache ─────────
const predictionCache = new Map();

function getCachedPrediction(candleTs) {
  const cached = predictionCache.get(candleTs);
  if (cached && Date.now() - cached.at < 30000) return cached.data;
  return null;
}

function setCachedPrediction(candleTs, data) {
  predictionCache.set(candleTs, { data, at: Date.now() });
  // 50 se zyada entries mat rakhna
  if (predictionCache.size > 50) {
    const oldest = [...predictionCache.keys()].sort()[0];
    predictionCache.delete(oldest);
  }
}


// ── GET /predict/:candleTs ────────────────────────────────────
router.get('/predict/:candleTs', (req, res) => {
  const candleTs = parseInt(req.params.candleTs);

  // Cache hit
  const cached = getCachedPrediction(candleTs);
  if (cached) return res.json({ ...cached, cached: true });

  const { candleHistory } = getCandleHistory();
  const { chainlinkBtcPrice, candlePriceLock } = getChainlinkState();

  const ptbData = candlePriceLock.get(candleTs);
  const ptb = ptbData?.price || null;
  const currentPrice = chainlinkBtcPrice;

  const ta = runTAEngine(candleHistory, currentPrice, ptb);

  const response = {
    candleTs,
    ptb,
    currentPrice,
    direction: ta.direction,
    confidence: ta.confidence,
    skip: ta.skip,
    reason: ta.reason,
    score: ta.score,
    bearScore: ta.bearScore,
    weightedBull: ta.weightedBull,
    weightedBear: ta.weightedBear,
    signals: ta.signals,
    candlesAvailable: candleHistory.length,
    cached: false,
  };

  // Sirf non-skip predictions cache karo (skip results fast change ho sakte hain)
  if (!ta.skip) setCachedPrediction(candleTs, response);

  res.json(response);
});


// ── GET /chainlink/btc ────────────────────────────────────────
router.get('/chainlink/btc', (req, res) => {
  const { chainlinkBtcPrice, chainlinkPriceTs } = getChainlinkState();
  if (!chainlinkBtcPrice) {
    return res.status(503).json({ error: 'Chainlink price not yet received' });
  }
  res.json({
    price: chainlinkBtcPrice,
    priceTs: chainlinkPriceTs,
    source: 'Polymarket RTDS — crypto_prices_chainlink',
  });
});


// ── GET /ptb/:candleTs ────────────────────────────────────────
router.get('/ptb/:candleTs', async (req, res) => {
  const candleTs = parseInt(req.params.candleTs);
  const slug = `btc-updown-5m-${candleTs}`;

  // Priority 1: Polymarket exact PTB
  try {
    const pmRes = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    const pmData = await pmRes.json();
    if (Array.isArray(pmData) && pmData.length) {
      const ptb = pmData[0]?.events?.[0]?.eventMetadata?.priceToBeat;
      if (ptb) {
        return res.json({ priceToBeat: parseFloat(ptb), source: 'polymarket_exact', slug });
      }
    }
  } catch (e) {
    console.warn('Polymarket fetch failed:', e.message);
  }

  // Priority 2: Chainlink RTDS captured at candle open
  const { candlePriceLock, chainlinkBtcPrice } = getChainlinkState();
  const locked = candlePriceLock.get(candleTs);
  if (locked) {
    return res.json({
      priceToBeat: locked.price,
      source: 'chainlink_rtds_captured',
      capturedAt: new Date(locked.capturedAt).toISOString(),
      chainlinkTs: locked.chainlinkTs,
      slug,
    });
  }

  // Priority 3: Current candle live estimate
  const currentCandle = getCurrentCandleTs();
  if (candleTs === currentCandle && chainlinkBtcPrice) {
    return res.json({
      priceToBeat: chainlinkBtcPrice,
      source: 'chainlink_rtds_live_estimate',
      note: 'Candle just started — using latest Chainlink tick',
      slug,
    });
  }

  // Priority 4: Binance kline fallback
  try {
    const startMs = candleTs * 1000;
    const klineRes = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${startMs}&limit=1`
    );
    const klines = await klineRes.json();
    if (Array.isArray(klines) && klines.length) {
      return res.json({
        priceToBeat: parseFloat(klines[0][1]),
        source: 'binance_kline_fallback',
        slug,
      });
    }
  } catch (e) {
    console.warn('Binance kline fetch failed:', e.message);
  }

  res.status(404).json({ error: 'PTB not available', slug });
});

export default router;