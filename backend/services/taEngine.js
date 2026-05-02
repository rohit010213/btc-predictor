// Technical Analysis Engine — no Claude API, pure math
// Returns { direction, confidence, signals, score, skip }

export function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

export function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    const slice = closes.slice(-(period + 1));
    let gains = 0, losses = 0;
    for (let i = 1; i < slice.length; i++) {
        const d = slice[i] - slice[i - 1];
        if (d > 0) gains += d;
        else losses += Math.abs(d);
    }
    const rs = gains / (losses || 0.0001);
    return 100 - 100 / (1 + rs);
}

export function calcVWAP(candles) {
    // VWAP using tickCount as proxy for volume
    let cumTP = 0, cumVol = 0;
    for (const c of candles) {
        const tp = (c.high + c.low + c.close) / 3;
        const vol = c.tickCount || 1;
        cumTP += tp * vol;
        cumVol += vol;
    }
    return cumVol ? cumTP / cumVol : null;
}

export function runTAEngine(candleHistory, currentPrice, ptb) {
    const closes = candleHistory.map(c => c.close);
    const result = {
        signals: {},
        score: 0,        // bull signals count
        bearScore: 0,    // bear signals count
        direction: null,
        confidence: 0,
        skip: false,
        reason: '',
    };

    // Need minimum 22 candles (~1.8 hours) for reliable signals
    if (candleHistory.length < 10) {
        result.skip = true;
        result.reason = `Warming up — need 10 candles, have ${candleHistory.length}`;
        return result;
    }

    // ── Signal 1: EMA 8 vs EMA 21 ────────────────────────────────────
    const ema8 = calcEMA(closes, 8);
    const ema21 = calcEMA(closes, Math.min(21, closes.length));
    let emaBull = null;
    if (ema8 && ema21) {
        emaBull = ema8 > ema21;
        // Also check current price vs EMA8
        const priceAboveEma8 = currentPrice > ema8;
        emaBull = emaBull && priceAboveEma8;
        result.signals.ema = {
            name: 'EMA 8/21',
            bull: emaBull,
            detail: `EMA8=${ema8.toFixed(1)} EMA21=${ema21.toFixed(1)}`,
        };
        if (emaBull === true) result.score++;
        else if (emaBull === false) result.bearScore++;
    }

    // ── Signal 2: RSI ─────────────────────────────────────────────────
    const rsi = calcRSI(closes, Math.min(14, closes.length - 1));
    let rsiBull = null;
    if (rsi !== null) {
        if (rsi > 60) rsiBull = true;
        else if (rsi < 40) rsiBull = false;
        // 40-60 = chop zone, no signal
        result.signals.rsi = {
            name: 'RSI 14',
            bull: rsiBull,
            detail: `RSI=${rsi.toFixed(1)} ${rsi > 60 ? '(bullish)' : rsi < 40 ? '(bearish)' : '(neutral/chop)'}`,
        };
        if (rsiBull === true) result.score++;
        else if (rsiBull === false) result.bearScore++;
    }

    // ── Signal 3: Volume surge (tickCount proxy) ──────────────────────
    const recent = candleHistory.slice(-20);
    const avgTicks = recent.reduce((s, c) => s + (c.tickCount || 1), 0) / recent.length;
    const lastCandle = candleHistory[candleHistory.length - 1];
    const volRatio = lastCandle ? lastCandle.tickCount / avgTicks : 1;
    const volSurge = volRatio >= 1.2;
    result.signals.volume = {
        name: 'Volume surge',
        bull: volSurge ? true : null, // volume confirms direction, not a directional signal itself
        detail: `ratio=${volRatio.toFixed(2)}x avg`,
        ratio: volRatio,
    };
    // Volume is a multiplier — not directional on its own

    // ── Signal 4: VWAP deviation ──────────────────────────────────────
    const vwap = calcVWAP(candleHistory.slice(-20));
    let vwapBull = null;
    if (vwap && currentPrice) {
        const devPct = ((currentPrice - vwap) / vwap) * 100;
        if (devPct > 0.15) vwapBull = true;
        else if (devPct < -0.15) vwapBull = false;
        result.signals.vwap = {
            name: 'VWAP dev',
            bull: vwapBull,
            detail: `VWAP=${vwap.toFixed(1)} dev=${devPct.toFixed(3)}%`,
        };
        if (vwapBull === true) result.score++;
        else if (vwapBull === false) result.bearScore++;
    }

    // ── Signal 5: Candle body strength ───────────────────────────────
    let candleBull = null;
    if (lastCandle) {
        const range = lastCandle.high - lastCandle.low;
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const bodyRatio = range > 0 ? body / range : 0;
        if (bodyRatio >= 0.6) {
            candleBull = lastCandle.close > lastCandle.open;
        }
        result.signals.candle = {
            name: 'Candle body',
            bull: candleBull,
            detail: `body=${(bodyRatio * 100).toFixed(0)}% ${candleBull === true ? '(bull engulf)' : candleBull === false ? '(bear engulf)' : '(doji/weak)'}`,
        };
        if (candleBull === true) result.score++;
        else if (candleBull === false) result.bearScore++;
    }

    // ── Signal 6: PTB momentum (price vs candle open) ─────────────────
    let ptbBull = null;
    if (ptb && currentPrice) {
        const ptbDiff = ((currentPrice - ptb) / ptb) * 100;
        // Only count if meaningful move (>0.05%)
        if (ptbDiff > 0.05) ptbBull = true;
        else if (ptbDiff < -0.05) ptbBull = false;
        result.signals.ptb = {
            name: 'PTB momentum',
            bull: ptbBull,
            detail: `diff=${ptbDiff.toFixed(4)}%`,
        };
        if (ptbBull === true) result.score++;
        else if (ptbBull === false) result.bearScore++;
    }

    // ── Confluence check ──────────────────────────────────────────────
    const totalSignals = result.score + result.bearScore;
    const dominantScore = Math.max(result.score, result.bearScore);

    // Need 4+ directional signals aligned (out of max 5 directional signals)
    const REQUIRED = 4;
    if (dominantScore < REQUIRED) {
        result.skip = true;
        result.reason = `Low confluence: ${result.score}B/${result.bearScore}R — need ${REQUIRED} aligned`;
        result.direction = result.score > result.bearScore ? 'UP' : 'DOWN';
        result.confidence = 45 + (dominantScore * 3);
        return result;
    }

    // Volume multiplier — if vol surge, confidence +5
    const volBonus = volSurge ? 5 : 0;

    result.direction = result.score > result.bearScore ? 'UP' : 'DOWN';

    // Confidence formula: base 55 + (aligned signals * 5) + vol bonus
    result.confidence = Math.min(85, 55 + (dominantScore * 5) + volBonus);
    result.skip = false;
    result.reason = `${dominantScore}/5 signals aligned`;

    return result;
}