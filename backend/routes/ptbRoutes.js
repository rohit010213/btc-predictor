import express from 'express';
import { getChainlinkState, getCurrentCandleTs } from '../services/chainlinkService.js';
import { getCandleHistory } from '../services/chainlinkService.js';
import { runTAEngine } from '../services/taEngine.js';

const router = express.Router();

router.get('/predict/:candleTs', (req, res) => {
  const candleTs = parseInt(req.params.candleTs);
  const { candleHistory } = getCandleHistory();
  const { chainlinkBtcPrice, candlePriceLock } = getChainlinkState();

  const ptbData = candlePriceLock.get(candleTs);
  const ptb = ptbData?.price || null;
  const currentPrice = chainlinkBtcPrice;

  const ta = runTAEngine(candleHistory, currentPrice, ptb);

  res.json({
    candleTs,
    ptb,
    currentPrice,
    direction: ta.direction,
    confidence: ta.confidence,
    skip: ta.skip,
    reason: ta.reason,
    score: ta.score,
    bearScore: ta.bearScore,
    signals: ta.signals,
    candlesAvailable: candleHistory.length,
  });
});

router.get('/chainlink/btc', (req, res) => {
  const { chainlinkBtcPrice, chainlinkPriceTs } = getChainlinkState();
  if (!chainlinkBtcPrice) return res.status(503).json({ error: 'Chainlink price not yet received' });
  res.json({
    price: chainlinkBtcPrice,
    priceTs: chainlinkPriceTs,
    source: 'Polymarket RTDS — crypto_prices_chainlink'
  });
});

router.get('/ptb/:candleTs', async (req, res) => {
  const candleTs = parseInt(req.params.candleTs);
  const slug = `btc-updown-5m-${candleTs}`;

  try {
    const pmRes = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    const pmData = await pmRes.json();
    if (Array.isArray(pmData) && pmData.length) {
      const market = pmData[0];
      const ptb = market?.events?.[0]?.eventMetadata?.priceToBeat;
      if (ptb) {
        return res.json({
          priceToBeat: parseFloat(ptb),
          source: 'polymarket_exact',
          slug
        });
      }
    }
  } catch (e) {
    console.warn('Polymarket fetch failed:', e.message);
  }

  const { candlePriceLock, chainlinkBtcPrice } = getChainlinkState();
  const locked = candlePriceLock.get(candleTs);
  if (locked) {
    return res.json({
      priceToBeat: locked.price,
      source: 'chainlink_rtds_captured',
      capturedAt: new Date(locked.capturedAt).toISOString(),
      chainlinkTs: locked.chainlinkTs,
      slug
    });
  }

  const currentCandle = getCurrentCandleTs();
  if (candleTs === currentCandle && chainlinkBtcPrice) {
    return res.json({
      priceToBeat: chainlinkBtcPrice,
      source: 'chainlink_rtds_live_estimate',
      note: 'Candle just started, using latest Chainlink tick',
      slug
    });
  }

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
        slug
      });
    }
  } catch (e) {
    console.warn('Binance kline fetch failed:', e.message);
  }

  res.status(404).json({ error: 'PTB not available', slug });
});

export default router;
