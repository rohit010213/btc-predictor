import { useState, useEffect, useRef, useCallback } from 'react'

const BACKEND = '' // Vite proxy handles /api -> localhost:3001

const SOURCE_ICON = {
  'polymarket_exact': '✅ Polymarket API (exact)',
  'chainlink_rtds_captured': '🔗 Chainlink RTDS (candle open)',
  'chainlink_rtds_live_estimate': '🟡 Chainlink RTDS (live estimate)',
  'binance_kline_fallback': '⚠ Binance kline (fallback)',
}

function getCurrentCandleTs() {
  return Math.floor(Date.now() / 1000 / 300) * 300
}

export function useBtcEngine() {
  const [currentPrice, setCurrentPrice] = useState(null)
  const [priceToBeat, setPriceToBeat] = useState(null)
  const [ptbSource, setPtbSource] = useState(null)
  const [priceAtCandleStart, setPriceAtCandleStart] = useState(null)
  const [candleTs, setCandleTs] = useState(getCurrentCandleTs())
  const [countdown, setCountdown] = useState(300)
  const [prediction, setPrediction] = useState(null)
  const [predStatus, setPredStatus] = useState('empty') // empty|loading|done

  const currentPriceRef = useRef(null)
  const priceAtStartRef = useRef(null)
  const predInProgress = useRef(false)
  const lastCandleTs = useRef(getCurrentCandleTs())

  // ── Fetch BTC price ──────────────────────────────────────────────
  const fetchBtcPrice = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/chainlink/btc`)
      const d = await r.json()
      if (d.price) {
        currentPriceRef.current = d.price
        setCurrentPrice(d.price)
        if (!priceAtStartRef.current) {
          priceAtStartRef.current = d.price
          setPriceAtCandleStart(d.price)
        }
        return
      }
    } catch { /* fallback */ }
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      const d = await r.json()
      const p = parseFloat(d.price)
      currentPriceRef.current = p
      setCurrentPrice(p)
      if (!priceAtStartRef.current) {
        priceAtStartRef.current = p
        setPriceAtCandleStart(p)
      }
    } catch { }
  }, [])

  // ── Fetch PTB ─────────────────────────────────────────────────────
  const fetchPtb = useCallback(async (ts) => {
    try {
      const r = await fetch(`${BACKEND}/api/ptb/${ts}`)
      const d = await r.json()
      if (d.priceToBeat) {
        setPriceToBeat(d.priceToBeat)
        const icon = SOURCE_ICON[d.source] || d.source
        setPtbSource(icon)
        priceAtStartRef.current = d.priceToBeat
        setPriceAtCandleStart(d.priceToBeat)
        return { ptb: d.priceToBeat, sourceRaw: d.source, sourceIcon: icon }
      }
    } catch { }
    const est = priceAtStartRef.current || currentPriceRef.current
    if (est) {
      setPriceToBeat(est)
      setPtbSource('❌ Backend unavailable — estimate')
    }
    return { ptb: est, sourceRaw: 'estimate', sourceIcon: '❌ Backend unavailable — estimate' }
  }, [])

  // ── Save trade to DB ──────────────────────────────────────────────
  const saveTradeToDb = useCallback(async (tradeData) => {
    try {
      const r = await fetch(`${BACKEND}/api/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData),
      })
      return await r.json()
    } catch (e) {
      console.warn('Failed to save trade:', e)
    }
  }, [])

  // ── Resolve trade in DB ───────────────────────────────────────────
  const resolveTradeInDb = useCallback(async (id, resolvePrice, result) => {
    try {
      await fetch(`${BACKEND}/api/trades/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvePrice, result, status: 'resolved' }),
      })
    } catch (e) {
      console.warn('Failed to resolve trade:', e)
    }
  }, [])

  // ── Run prediction ────────────────────────────────────────────────
  const runPrediction = useCallback(async (ts, ptb, sourceRaw, sourceIcon) => {
    if (predInProgress.current) return;
    predInProgress.current = true;
    setPredStatus('loading');
    setPrediction(null);

    const cp = currentPriceRef.current;
    let pred;

    try {
      const r = await fetch(`${BACKEND}/api/predict/${ts}`);
      const ta = await r.json();

      if (ta.skip) {
        // Low confluence — don't trade
        pred = {
          direction: ta.direction || 'SKIP',
          confidence: ta.confidence || 45,
          skip: true,
          analysis: `Skip — ${ta.reason}`,
          risk: 'Insufficient signal confluence. Wait for next candle.',
          signals: ta.signals,
          score: ta.score,
          bearScore: ta.bearScore,
        };
      } else {
        pred = {
          direction: ta.direction,
          confidence: ta.confidence,
          skip: false,
          analysis: `${ta.score} bull / ${ta.bearScore} bear signals. ${ta.reason}.`,
          risk: buildRiskText(ta.signals),
          signals: ta.signals,
          score: ta.score,
          bearScore: ta.bearScore,
        };
      }
    } catch {
      // Pure fallback — price delta only
      const diff = ptb && cp ? cp - ptb : 0;
      pred = {
        direction: diff >= 0 ? 'UP' : 'DOWN',
        confidence: 51,
        skip: false,
        analysis: 'Backend unavailable — using price delta only.',
        risk: 'No TA signals available.',
        signals: {},
        score: 0,
        bearScore: 0,
      };
    }

    setPrediction(pred);
    setPredStatus('done');
    predInProgress.current = false;

    if (pred.skip) return; // Don't save skipped trades to DB

    const tradePayload = {
      id: ts,
      timestamp: new Date(ts * 1000).toISOString(),
      direction: pred.direction,
      confidence: pred.confidence,
      entryPrice: cp,
      priceToBeat: ptb,
      priceToBeatSource: sourceIcon,
      analysis: pred.analysis,
      risk: pred.risk,
      score: pred.score,
      bearScore: pred.bearScore,
      status: 'pending',
    };
    await saveTradeToDb(tradePayload);

    if (sourceRaw !== 'polymarket_exact') {
      setTimeout(async () => {
        const exactData = await fetchPtb(ts);
        if (exactData.sourceRaw === 'polymarket_exact') {
          try {
            await fetch(`${BACKEND}/api/trades/${ts}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ priceToBeat: exactData.ptb, priceToBeatSource: exactData.sourceIcon }),
            });
          } catch { }
        }
      }, 10000);
    }

    setTimeout(async () => {
      await fetchBtcPrice();
      const closePrice = currentPriceRef.current;
      const wentUp = closePrice >= ptb;
      const result = (wentUp && pred.direction === 'UP') || (!wentUp && pred.direction === 'DOWN') ? 'win' : 'loss';
      await resolveTradeInDb(ts, closePrice, result);
    }, 300000);
  }, [saveTradeToDb, resolveTradeInDb, fetchBtcPrice, fetchPtb]);

  // Helper
  function buildRiskText(signals) {
    const weak = Object.values(signals || {})
      .filter(s => s.bull === null)
      .map(s => s.name);
    return weak.length ? `Weak/neutral: ${weak.join(', ')}` : 'All signals confirmed.';
  }

  // ── New candle handler ────────────────────────────────────────────
  const onNewCandle = useCallback(async (ts) => {
    priceAtStartRef.current = null
    setPriceAtCandleStart(null)
    await fetchBtcPrice()
    const { ptb, sourceRaw, sourceIcon } = await fetchPtb(ts)
    await runPrediction(ts, ptb, sourceRaw, sourceIcon)
  }, [fetchBtcPrice, fetchPtb, runPrediction])

  // ── Countdown tick ────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000)
      const ts = Math.floor(now / 300) * 300
      const rem = 300 - (now % 300)
      setCountdown(rem)
      setCandleTs(ts)

      if (ts !== lastCandleTs.current) {
        lastCandleTs.current = ts
        onNewCandle(ts)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [onNewCandle])

  // ── Price refresh every 10s ───────────────────────────────────────
  useEffect(() => {
    fetchBtcPrice()
    const id = setInterval(fetchBtcPrice, 10000)
    return () => clearInterval(id)
  }, [fetchBtcPrice])

  // ── Init PTB for current candle ───────────────────────────────────
  useEffect(() => {
    const ts = getCurrentCandleTs()
    console.log(`[Engine Init] Frontend loaded. Current candle TS: ${ts}`);
    fetchPtb(ts)
  }, [fetchPtb])

  return {
    currentPrice, priceAtCandleStart,
    priceToBeat, ptbSource,
    candleTs, countdown,
    prediction, predStatus,
  }
}
