// ============================================================
//  Technical Analysis Engine — v2.0  (Pure Math, No API)
//  Improvements:
//    1. Proper EMA seeding (SMA-based)
//    2. Wilder's Smoothed RSI
//    3. Signal Weighting (not flat count)
//    4. Macro Trend Filter (EMA slope)
//    5. ATR Volatility Filter (skip dead/explosive markets)
//    6. RSI Divergence Detection
//    7. PTB Distance Penalty
//    8. Multi-factor Confidence Formula (45–88 range)
//    9. Bollinger Band squeeze detection
//   10. Candle pattern: consecutive candle bias
// ============================================================

// ─────────────────────────────────────────────────────────────
// SIGNAL WEIGHTS — EMA aur VWAP heavy, candle body light
// ─────────────────────────────────────────────────────────────
const SIGNAL_WEIGHTS = {
    ema: 1.5,   // trend-following — reliable on 5m
    rsi: 1.0,   // momentum — medium weight
    vwap: 1.5,   // institutional level — heavy
    candle: 0.8,   // noisy on 5m — light
    ptb: 1.2,   // market-specific momentum — above average
    macroBias: 2.0,   // macro trend override — heaviest
    divergence: 1.8,   // RSI divergence — very reliable reversal signal
    consecutive: 0.7,   // candle streak — supporting signal
};

// Weighted confluence threshold
// 4.5 = roughly 3 medium signals + 1 heavy, ya 4 aligned medium signals
const REQUIRED_WEIGHTED_SCORE = 4.5;


// ─────────────────────────────────────────────────────────────
// 1. EMA — proper SMA seed
// ─────────────────────────────────────────────────────────────
export function calcEMA(closes, period) {
    if (!closes || closes.length < period) return null;

    // Seed: SMA of first `period` candles
    const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const k = 2 / (period + 1);
    let ema = seed;

    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}


// ─────────────────────────────────────────────────────────────
// 2. RSI — Wilder's Smoothed (standard)
// ─────────────────────────────────────────────────────────────
export function calcRSI(closes, period = 14) {
    if (!closes || closes.length < period + 1) return null;

    const slice = closes.slice(-(period * 2 + 1)); // extra data for smoothing warmup

    // First avg gain/loss (simple avg for seed)
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const d = slice[i] - slice[i - 1];
        if (d > 0) avgGain += d;
        else avgLoss += Math.abs(d);
    }
    avgGain /= period;
    avgLoss /= period;

    // Wilder's smoothing for rest
    for (let i = period + 1; i < slice.length; i++) {
        const d = slice[i] - slice[i - 1];
        const gain = d > 0 ? d : 0;
        const loss = d < 0 ? Math.abs(d) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    const rs = avgGain / (avgLoss || 0.0001);
    return 100 - 100 / (1 + rs);
}


// ─────────────────────────────────────────────────────────────
// 3. Rolling RSI history (call on each candle close)
// ─────────────────────────────────────────────────────────────
export function buildRSIHistory(candles, period = 14) {
    const closes = candles.map(c => c.close);
    const rsiHistory = [];
    for (let i = period + 1; i <= closes.length; i++) {
        const val = calcRSI(closes.slice(0, i), period);
        rsiHistory.push(val);
    }
    return rsiHistory; // aligned to candles from index `period`
}


// ─────────────────────────────────────────────────────────────
// 4. VWAP — tickCount proxy for volume
// ─────────────────────────────────────────────────────────────
export function calcVWAP(candles) {
    let cumTP = 0, cumVol = 0;
    for (const c of candles) {
        const tp = (c.high + c.low + c.close) / 3;
        const vol = c.tickCount || 1;
        cumTP += tp * vol;
        cumVol += vol;
    }
    return cumVol ? cumTP / cumVol : null;
}


// ─────────────────────────────────────────────────────────────
// 5. ATR — Average True Range (volatility gauge)
// ─────────────────────────────────────────────────────────────
export function calcATR(candles, period = 10) {
    if (!candles || candles.length < 2) return null;

    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const { high, low } = candles[i];
        const prevClose = candles[i - 1].close;
        trs.push(Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose),
        ));
    }

    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}


// ─────────────────────────────────────────────────────────────
// 6. Macro Trend — EMA slope + EMA alignment
// ─────────────────────────────────────────────────────────────
export function calcMacroTrend(closes) {
    if (!closes || closes.length < 15) return null;

    const ema8 = calcEMA(closes, 8);
    const ema20 = calcEMA(closes, Math.min(20, closes.length));

    // Slope over last 6 candles (30 min window)
    const window = closes.slice(-6);
    const slope = window.length >= 2
        ? (window[window.length - 1] - window[0]) / window[0] * 100
        : 0;

    const trend = ema8 > ema20 ? 'UP' : 'DOWN';
    const slopeStrong = Math.abs(slope) > 0.25; // 0.25% in 30min = meaningful

    return { ema8, ema20, trend, slope, slopeStrong };
}


// ─────────────────────────────────────────────────────────────
// 7. RSI Divergence
// ─────────────────────────────────────────────────────────────
export function checkRSIDivergence(candles, rsiHistory) {
    // Need last 6 candles min
    if (!candles || candles.length < 6 || !rsiHistory || rsiHistory.length < 6) return null;

    const recentC = candles.slice(-6);
    const recentRSI = rsiHistory.slice(-6);

    const firstClose = recentC[0].close;
    const lastClose = recentC[recentC.length - 1].close;
    const firstRSI = recentRSI[0];
    const lastRSI = recentRSI[recentRSI.length - 1];

    if (firstRSI == null || lastRSI == null) return null;

    const priceHigher = lastClose > firstClose * 1.001; // min 0.1% move to count
    const priceLower = lastClose < firstClose * 0.999;
    const rsiLower = lastRSI < firstRSI - 3;  // RSI at least 3 points different
    const rsiHigher = lastRSI > firstRSI + 3;

    if (priceHigher && rsiLower) return 'bearish'; // price up, RSI down = exhaustion
    if (priceLower && rsiHigher) return 'bullish'; // price down, RSI up = reversal up
    return null;
}


// ─────────────────────────────────────────────────────────────
// 8. Bollinger Band Squeeze Detection
// ─────────────────────────────────────────────────────────────
export function calcBollingerSqueeze(closes, period = 20, multiplier = 2) {
    if (!closes || closes.length < period) return null;

    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);

    const upper = mean + multiplier * stdDev;
    const lower = mean - multiplier * stdDev;
    const bandWidth = (upper - lower) / mean * 100; // as % of price

    return {
        upper,
        lower,
        mean,
        stdDev,
        bandWidth,
        // Squeeze = bands very narrow = breakout coming
        squeeze: bandWidth < 0.3,
        // Expansion = breakout happening
        expanding: bandWidth > 0.8,
    };
}


// ─────────────────────────────────────────────────────────────
// 9. Consecutive Candle Bias
// ─────────────────────────────────────────────────────────────
export function checkConsecutiveCandles(candles, lookback = 4) {
    if (!candles || candles.length < lookback) return null;

    const recent = candles.slice(-lookback);
    let bullCount = 0, bearCount = 0;

    for (const c of recent) {
        if (c.close > c.open) bullCount++;
        else if (c.close < c.open) bearCount++;
    }

    if (bullCount >= lookback - 1) return 'bull'; // 3+ of 4 green
    if (bearCount >= lookback - 1) return 'bear'; // 3+ of 4 red
    return null;
}


// ─────────────────────────────────────────────────────────────
// 10. Multi-Factor Confidence Calculator
// ─────────────────────────────────────────────────────────────
function calcConfidence({
    weightedBull,
    weightedBear,
    volSurge,
    isCounterTrend,
    atrPct,
    ptbDistPct,
    hasDivergence,
    bbSqueeze,
}) {
    const total = weightedBull + weightedBear;
    const dominance = total > 0 ? Math.max(weightedBull, weightedBear) / total : 0.5;

    // Base confidence from signal dominance: 50 (coin flip) → 80 (all aligned)
    let conf = 50 + (dominance - 0.5) * 60;

    // Modifiers
    if (volSurge) conf += 4;   // volume confirms move
    if (isCounterTrend) conf -= 18;  // going against macro = risky
    if (hasDivergence) conf -= 12;  // divergence = reversal risk
    if (bbSqueeze) conf += 6;   // squeeze = directional breakout likely

    // ATR penalties
    if (atrPct !== null) {
        if (atrPct > 0.4) conf -= 8;   // too volatile
        if (atrPct < 0.05) conf -= 5;  // dead market
    }

    // PTB stretch penalty
    if (ptbDistPct !== null) {
        if (ptbDistPct > 0.35) conf -= 10; // price too far from PTB
        if (ptbDistPct > 0.5) conf -= 8;  // stack penalty for extreme stretch
        if (ptbDistPct >= 0.05 && ptbDistPct <= 0.15) conf += 4; // sweet spot
    }

    return Math.round(Math.min(88, Math.max(45, conf)));
}


// ─────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────
export function runTAEngine(candleHistory, currentPrice, ptb) {
    const closes = candleHistory.map(c => c.close);

    const result = {
        signals: {},
        score: 0,        // raw bull signal count (for DB storage / analytics)
        bearScore: 0,        // raw bear signal count
        weightedBull: 0,
        weightedBear: 0,
        direction: null,
        confidence: 0,
        skip: false,
        reason: '',
    };

    // ── Guard: warmup ─────────────────────────────────────────
    if (candleHistory.length < 10) {
        result.skip = true;
        result.reason = `Warming up — need 10 candles, have ${candleHistory.length}`;
        return result;
    }

    const lastCandle = candleHistory[candleHistory.length - 1];


    // ═══════════════════════════════════════════════════════════
    // SIGNAL LAYER
    // ═══════════════════════════════════════════════════════════

    // ── Signal 1: EMA 8 vs EMA 21 ────────────────────────────
    const ema8 = calcEMA(closes, 8);
    const ema21 = calcEMA(closes, Math.min(21, closes.length));

    if (ema8 !== null && ema21 !== null) {
        const crossBull = ema8 > ema21;
        const priceAboveEma8 = currentPrice > ema8;
        const emaBull = crossBull && priceAboveEma8;
        const emaBear = !crossBull && currentPrice < ema8;

        const bull = emaBull ? true : emaBear ? false : null;

        result.signals.ema = {
            name: 'EMA 8/21',
            bull,
            weight: SIGNAL_WEIGHTS.ema,
            detail: `EMA8=${ema8.toFixed(1)} EMA21=${ema21.toFixed(1)} price=${currentPrice?.toFixed(1)}`,
        };

        if (bull === true) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.ema; }
        if (bull === false) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.ema; }
    }


    // ── Signal 2: RSI (Wilder's) ─────────────────────────────
    const rsi = calcRSI(closes, Math.min(14, closes.length - 1));
    let rsiBull = null;

    if (rsi !== null) {
        if (rsi > 58) rsiBull = true;
        else if (rsi < 42) rsiBull = false;
        // 42–58 = chop zone, skip

        result.signals.rsi = {
            name: 'RSI 14',
            bull: rsiBull,
            weight: SIGNAL_WEIGHTS.rsi,
            detail: `RSI=${rsi.toFixed(1)} ${rsi > 58 ? '(bullish)' : rsi < 42 ? '(bearish)' : '(chop zone)'}`,
            value: rsi,
        };

        if (rsiBull === true) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.rsi; }
        if (rsiBull === false) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.rsi; }
    }


    // ── Signal 3: Volume Surge ────────────────────────────────
    const recent20 = candleHistory.slice(-20);
    const avgTicks = recent20.reduce((s, c) => s + (c.tickCount || 1), 0) / recent20.length;
    const volRatio = lastCandle ? (lastCandle.tickCount || 1) / avgTicks : 1;
    const volSurge = volRatio >= 1.2;

    result.signals.volume = {
        name: 'Volume Surge',
        bull: null, // non-directional — acts as multiplier only
        weight: 0,
        detail: `ratio=${volRatio.toFixed(2)}x avg`,
        ratio: volRatio,
    };


    // ── Signal 4: VWAP Deviation ──────────────────────────────
    const vwap = calcVWAP(candleHistory.slice(-20));

    if (vwap && currentPrice) {
        const devPct = (currentPrice - vwap) / vwap * 100;
        let vwapBull = null;

        if (devPct > 0.15) vwapBull = true;
        else if (devPct < -0.15) vwapBull = false;

        result.signals.vwap = {
            name: 'VWAP Dev',
            bull: vwapBull,
            weight: SIGNAL_WEIGHTS.vwap,
            detail: `VWAP=${vwap.toFixed(1)} dev=${devPct.toFixed(3)}%`,
            devPct,
        };

        if (vwapBull === true) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.vwap; }
        if (vwapBull === false) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.vwap; }
    }


    // ── Signal 5: Candle Body Strength ───────────────────────
    if (lastCandle) {
        const range = lastCandle.high - lastCandle.low;
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const bodyRatio = range > 0 ? body / range : 0;
        let candleBull = null;

        if (bodyRatio >= 0.6) {
            candleBull = lastCandle.close > lastCandle.open;
        }

        result.signals.candle = {
            name: 'Candle Body',
            bull: candleBull,
            weight: SIGNAL_WEIGHTS.candle,
            detail: `body=${(bodyRatio * 100).toFixed(0)}% ${candleBull === true ? '(bull engulf)' :
                    candleBull === false ? '(bear engulf)' : '(doji/weak)'
                }`,
        };

        if (candleBull === true) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.candle; }
        if (candleBull === false) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.candle; }
    }


    // ── Signal 6: PTB Momentum ───────────────────────────────
    let ptbDistPct = null;

    if (ptb && currentPrice) {
        const ptbDiff = (currentPrice - ptb) / ptb * 100;
        ptbDistPct = Math.abs(ptbDiff);
        let ptbBull = null;

        if (ptbDiff > 0.05) ptbBull = true;
        else if (ptbDiff < -0.05) ptbBull = false;

        result.signals.ptb = {
            name: 'PTB Momentum',
            bull: ptbBull,
            weight: SIGNAL_WEIGHTS.ptb,
            detail: `diff=${ptbDiff.toFixed(4)}% dist=${ptbDistPct.toFixed(3)}%`,
            distPct: ptbDistPct,
        };

        if (ptbBull === true) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.ptb; }
        if (ptbBull === false) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.ptb; }

        // PTB stretch warning — not a signal but logged
        if (ptbDistPct > 0.35) {
            result.signals.ptbStretch = {
                name: 'PTB Stretch ⚠',
                bull: null,
                weight: 0,
                detail: `${ptbDistPct.toFixed(3)}% from PTB — confidence penalized`,
                warning: true,
            };
        }
    }


    // ── Signal 7: Consecutive Candle Bias ────────────────────
    const streak = checkConsecutiveCandles(candleHistory, 4);
    if (streak !== null) {
        const streakBull = streak === 'bull';

        result.signals.consecutive = {
            name: 'Candle Streak',
            bull: streakBull,
            weight: SIGNAL_WEIGHTS.consecutive,
            detail: `${streak === 'bull' ? '3+ green' : '3+ red'} of last 4 candles`,
        };

        if (streakBull) { result.score++; result.weightedBull += SIGNAL_WEIGHTS.consecutive; }
        if (!streakBull) { result.bearScore++; result.weightedBear += SIGNAL_WEIGHTS.consecutive; }
    }


    // ═══════════════════════════════════════════════════════════
    // CONTEXT LAYER (modifiers — not counted in score)
    // ═══════════════════════════════════════════════════════════

    // ── Context 1: ATR Volatility Filter ─────────────────────
    const atr = calcATR(candleHistory, Math.min(10, candleHistory.length - 1));
    let atrPct = null;

    if (atr && currentPrice) {
        atrPct = (atr / currentPrice) * 100;

        result.signals.atr = {
            name: 'ATR Volatility',
            bull: null,
            weight: 0,
            detail: `ATR=${atr.toFixed(1)} (${atrPct.toFixed(3)}%)`,
            atrPct,
        };

        if (atrPct > 0.45) {
            result.skip = true;
            result.reason = `High volatility skip: ATR=${atrPct.toFixed(3)}% > 0.45% — whipsaw risk`;
            result.direction = result.weightedBull > result.weightedBear ? 'UP' : 'DOWN';
            result.confidence = 45;
            return result;
        }

        if (atrPct < 0.04) {
            result.skip = true;
            result.reason = `Dead market skip: ATR=${atrPct.toFixed(3)}% < 0.04% — no movement`;
            result.direction = result.weightedBull > result.weightedBear ? 'UP' : 'DOWN';
            result.confidence = 45;
            return result;
        }
    }


    // ── Context 2: Macro Trend ───────────────────────────────
    const macro = calcMacroTrend(closes);
    let isCounterTrend = false;

    if (macro) {
        const tentativeDir = result.weightedBull >= result.weightedBear ? 'UP' : 'DOWN';
        isCounterTrend = macro.trend !== tentativeDir;

        result.signals.macroTrend = {
            name: 'Macro Trend',
            bull: macro.trend === 'UP',
            weight: SIGNAL_WEIGHTS.macroBias,
            detail: `EMA8=${macro.ema8?.toFixed(1)} EMA20=${macro.ema20?.toFixed(1)} slope=${macro.slope.toFixed(3)}% ${isCounterTrend ? '⚠ counter-trend' : '✓ aligned'}`,
            isCounterTrend,
            trend: macro.trend,
            slope: macro.slope,
        };

        // Macro trend counts as a weighted signal too
        if (macro.trend === 'UP') { result.weightedBull += SIGNAL_WEIGHTS.macroBias; }
        else { result.weightedBear += SIGNAL_WEIGHTS.macroBias; }

        // Counter-trend trade — raise bar, require even stronger confluence
        if (isCounterTrend && !macro.slopeStrong) {
            // Weak counter-trend signal — skip
            result.skip = true;
            result.reason = `Counter-trend skip: signals say ${tentativeDir} but macro=${macro.trend} (slope=${macro.slope.toFixed(3)}%)`;
            result.direction = tentativeDir;
            result.confidence = 48;
            return result;
        }
    }


    // ── Context 3: RSI Divergence ────────────────────────────
    const rsiHistory = buildRSIHistory(candleHistory);
    const divergence = checkRSIDivergence(candleHistory, rsiHistory);
    let hasDivergence = false;

    if (divergence) {
        hasDivergence = true;
        const divBull = divergence === 'bullish';
        const tentativeDir = result.weightedBull >= result.weightedBear ? 'UP' : 'DOWN';
        const divConflict = (divBull && tentativeDir === 'DOWN') || (!divBull && tentativeDir === 'UP');

        result.signals.divergence = {
            name: 'RSI Divergence',
            bull: divBull,
            weight: SIGNAL_WEIGHTS.divergence,
            detail: `${divergence} divergence ${divConflict ? '⚠ conflicts with direction' : '✓ confirms direction'}`,
            type: divergence,
        };

        // Divergence in same direction = boost
        if (divBull) { result.weightedBull += SIGNAL_WEIGHTS.divergence; }
        else { result.weightedBear += SIGNAL_WEIGHTS.divergence; }

        // Strong conflict: divergence says opposite of all other signals
        // Only skip if divergence is against AND overall weighted score is marginal
        if (divConflict) {
            const netBefore = Math.abs(result.weightedBull - result.weightedBear);
            if (netBefore < 2.0) {
                result.skip = true;
                result.reason = `RSI ${divergence} divergence conflicts with marginal ${tentativeDir} signal — too risky`;
                result.direction = tentativeDir;
                result.confidence = 47;
                return result;
            }
        }
    }


    // ── Context 4: Bollinger Band Squeeze ────────────────────
    const bb = calcBollingerSqueeze(closes);
    let bbSqueeze = false;

    if (bb) {
        bbSqueeze = bb.squeeze;

        result.signals.bollinger = {
            name: 'Bollinger Bands',
            bull: null,
            weight: 0,
            detail: `width=${bb.bandWidth.toFixed(3)}% ${bb.squeeze ? '🔴 SQUEEZE — breakout incoming' : bb.expanding ? '🟢 expanding' : 'normal'}`,
            squeeze: bb.squeeze,
            expanding: bb.expanding,
            bandWidth: bb.bandWidth,
        };
    }


    // ═══════════════════════════════════════════════════════════
    // CONFLUENCE CHECK
    // ═══════════════════════════════════════════════════════════

    const dominantWeighted = Math.max(result.weightedBull, result.weightedBear);

    if (dominantWeighted < REQUIRED_WEIGHTED_SCORE) {
        result.skip = true;
        result.reason = `Low confluence: bull=${result.weightedBull.toFixed(1)} bear=${result.weightedBear.toFixed(1)} — need ${REQUIRED_WEIGHTED_SCORE} weighted score`;
        result.direction = result.weightedBull > result.weightedBear ? 'UP' : 'DOWN';
        result.confidence = 45 + Math.floor(dominantWeighted * 2);
        return result;
    }


    // ═══════════════════════════════════════════════════════════
    // FINAL DIRECTION + CONFIDENCE
    // ═══════════════════════════════════════════════════════════

    result.direction = result.weightedBull > result.weightedBear ? 'UP' : 'DOWN';

    result.confidence = calcConfidence({
        weightedBull: result.weightedBull,
        weightedBear: result.weightedBear,
        volSurge,
        isCounterTrend,
        atrPct,
        ptbDistPct,
        hasDivergence,
        bbSqueeze,
    });

    result.skip = false;
    result.reason = `wBull=${result.weightedBull.toFixed(1)} wBear=${result.weightedBear.toFixed(1)} | ${result.score}B/${result.bearScore}R raw signals`;

    return result;
}