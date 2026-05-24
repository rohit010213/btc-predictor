// ============================================================
//  Auto Predictor — v6.0 FINAL
//  Analysis: 1120 trades (2 datasets, May 3-24 2026)
//
//  WHAT ACTUALLY WORKS (stable across BOTH datasets):
//
//  Hour 15 IST only — European close + US open overlap
//  ┌─────────────────────────────────────────────────────┐
//  │ UP:   wBull 4.5-5.5 + bearScore<=1  → 66.7% (18t)  │
//  │ DOWN: wBear >= 5.0                  → 85.7% (7t)   │
//  │ COMBINED:                           → 72.0% (25t)  │
//  └─────────────────────────────────────────────────────┘
//
//  WHY ONLY HOUR 15:
//  - Hour 11: 45.7% on new data — unreliable, skip
//  - Hour 16: 26.5% on new data — dead, skip
//  - Hour 15: 63%+ across both datasets — only stable hour
//
//  WHY wBull 4.5-5.5 (not wider):
//  - wBull 5.5-7.0 = 35-47% on new data — kills win rate
//  - wBull 4.5-5.5 = confirmed sweet spot both datasets
//
//  TRADEOFF: ~2 trades/day but 72% WR
//  More trades = lower quality = back to 44% overall
// ============================================================

import { Trade } from '../models/Trade.js';
import { runTAEngine } from './taEngine.js';
import { getCandleHistory, getChainlinkState } from './chainlinkService.js';

// ─────────────────────────────────────────────────────────────
// RULES
// ─────────────────────────────────────────────────────────────
const TRADE_HOUR = 15;    // only hour 15 IST — only stable hour

const UP_WBULL_MIN = 4.5;   // below = too weak
const UP_WBULL_MAX = 5.5;   // above = win rate drops hard
const UP_BEAR_MAX = 1;     // max 1 opposing signal for UP

const DOWN_WBEAR_MIN = 5.0;   // all H15 DOWN trades with wBear>=5 won (85.7%)

// ─────────────────────────────────────────────────────────────
function getISTHour() {
    return parseInt(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            hour12: false,
        }).format(new Date())
    ) % 24;
}

async function fetchPtbForTs(candleTs, currentPrice) {
    const slug = `btc-updown-5m-${candleTs}`;

    try {
        const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
        const d = await r.json();
        if (Array.isArray(d) && d.length) {
            const ptb = d[0]?.events?.[0]?.eventMetadata?.priceToBeat;
            if (ptb) return { ptb: parseFloat(ptb), source: 'polymarket_exact' };
        }
    } catch (e) { console.warn(`[Predictor] PM failed: ${e.message}`); }

    const { candlePriceLock } = getChainlinkState();
    const locked = candlePriceLock.get(candleTs);
    if (locked) return { ptb: locked.price, source: 'chainlink_rtds_captured' };

    try {
        const r = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${candleTs * 1000}&limit=1`
        );
        const k = await r.json();
        if (Array.isArray(k) && k.length) {
            return { ptb: parseFloat(k[0][1]), source: 'binance_kline_fallback' };
        }
    } catch (e) { console.warn(`[Predictor] Binance failed: ${e.message}`); }

    return { ptb: currentPrice, source: 'estimate_live' };
}

function applyFilters(ta, hour) {
    const wBull = ta.weightedBull || 0;
    const wBear = ta.weightedBear || 0;
    const bScore = ta.bearScore || 0;

    // Hour 15 only
    if (hour !== TRADE_HOUR) {
        return { allowed: false, reason: `Hour ${hour}h — only trading at hour 15 IST` };
    }

    // ── UP ────────────────────────────────────────────────────
    if (ta.direction === 'UP') {
        if (wBull < UP_WBULL_MIN)
            return { allowed: false, reason: `UP wBull=${wBull.toFixed(2)} < ${UP_WBULL_MIN} — too weak` };

        if (wBull >= UP_WBULL_MAX)
            return { allowed: false, reason: `UP wBull=${wBull.toFixed(2)} >= ${UP_WBULL_MAX} — outside sweet spot` };

        if (bScore > UP_BEAR_MAX)
            return { allowed: false, reason: `UP bearScore=${bScore} > ${UP_BEAR_MAX} — opposing signals` };

        return { allowed: true, reason: `UP ✅ wBull=${wBull.toFixed(2)} bear=${bScore} — 66.7% WR zone` };
    }

    // ── DOWN ──────────────────────────────────────────────────
    if (ta.direction === 'DOWN') {
        if (wBear < DOWN_WBEAR_MIN)
            return { allowed: false, reason: `DOWN wBear=${wBear.toFixed(2)} < ${DOWN_WBEAR_MIN} — weak` };

        return { allowed: true, reason: `DOWN ✅ wBear=${wBear.toFixed(2)} — 85.7% WR zone` };
    }

    return { allowed: false, reason: 'No direction from TA engine' };
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export async function runAutoPrediction(candleTs, currentPrice) {
    try {
        const hour = getISTHour();
        console.log(`[Predictor] Candle ${candleTs} | IST=${hour}h | $${currentPrice?.toFixed(0)}`);

        // Fast gate — skip before any DB call
        if (hour !== TRADE_HOUR) {
            console.log(`[Predictor] ⏭ ${hour}h — only active at 15h IST`);
            return;
        }

        const existing = await Trade.findOne({ id: candleTs });
        if (existing) { console.log(`[Predictor] Already exists`); return; }

        const { ptb, source } = await fetchPtbForTs(candleTs, currentPrice);
        const { candleHistory } = getCandleHistory();
        const ta = runTAEngine(candleHistory, currentPrice, ptb);

        if (ta.skip) {
            console.log(`[Predictor] ⏭ TA: ${ta.reason}`);
            return;
        }

        const { allowed, reason } = applyFilters(ta, hour);
        if (!allowed) {
            console.log(`[Predictor] ⛔ ${reason}`);
            return;
        }

        const tsDate = new Date(candleTs * 1000);
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tsDate);

        const trade = new Trade({
            id: candleTs,
            candleTs,
            timestamp: tsDate,
            date: dateStr,
            hour,
            direction: ta.direction,
            confidence: ta.confidence,
            entryPrice: currentPrice,
            priceToBeat: ptb,
            priceToBeatSource: source,
            analysis: `${ta.score} bull / ${ta.bearScore} bear. ${ta.reason}`,
            score: ta.score,
            bearScore: ta.bearScore,
            weightedBull: ta.weightedBull,
            weightedBear: ta.weightedBear,
            status: 'pending',
        });

        await trade.save();

        console.log(
            `[Predictor] ✅ TRADE SAVED | ${ta.direction} | ` +
            `PTB=$${ptb?.toFixed(0)} | ` +
            `wBull=${ta.weightedBull.toFixed(1)} wBear=${ta.weightedBear.toFixed(1)} | ` +
            `score=${ta.score} bear=${ta.bearScore} | ` +
            `${reason}`
        );

    } catch (err) {
        console.error(`[Predictor] ❌ Error:`, err.message);
    }
}