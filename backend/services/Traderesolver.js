// ============================================================
//  Trade Resolver — Cron Job
//  Har 1 minute mein pending trades check karta hai
//  Agar candleTs + 300s < now → resolve karo chainlink price se
// ============================================================

import cron from 'node-cron';
import { Trade } from '../models/Trade.js';
import { getChainlinkState, getCandleHistory } from './chainlinkService.js';

let isResolving = false; // concurrent resolve prevent karo

async function resolvePendingTrades() {
    // Agar pichla resolve cycle chal raha hai toh skip
    if (isResolving) return;
    isResolving = true;

    try {
        const nowTs = Math.floor(Date.now() / 1000);
        const { chainlinkBtcPrice, candlePriceLock } = getChainlinkState();
        const { candleHistory } = getCandleHistory();

        // Sirf woh pending trades jo 5 min pehle ke hain
        const pending = await Trade.find({ status: 'pending' }).lean();

        if (!pending.length) return;

        const toResolve = pending.filter(t => {
            if (!t.candleTs) {
                // candleTs nahi hai — timestamp se estimate karo
                const tradeTs = Math.floor(new Date(t.timestamp).getTime() / 1000);
                const estimatedCandleTs = Math.floor(tradeTs / 300) * 300;
                return nowTs > estimatedCandleTs + 300 + 30; // 30s buffer
            }
            return nowTs > t.candleTs + 300 + 30; // 30s buffer after candle close
        });

        if (!toResolve.length) return;

        console.log(`🔄 Resolving ${toResolve.length} pending trades...`);

        for (const trade of toResolve) {
            let resolvePrice = null;
            let resolveSource = 'unknown';

            // ── Priority 1: Candle history mein close price dekho ──
            const tradeCandleTs = trade.candleTs ||
                Math.floor(new Date(trade.timestamp).getTime() / 1000 / 300) * 300;

            // Resolve candle = trade candle ka NEXT candle ka open
            // (5-min market: candle close pe settle hota hai)
            const resolveTs = tradeCandleTs + 300;
            const nextCandle = candleHistory.find(c => c.ts === resolveTs);

            if (nextCandle) {
                resolvePrice = nextCandle.open; // next candle ka open = current candle ka close
                resolveSource = 'candle_history';
            }

            // ── Priority 2: candlePriceLock mein dekho ────────────
            if (!resolvePrice) {
                const locked = candlePriceLock.get(resolveTs);
                if (locked) {
                    resolvePrice = locked.price;
                    resolveSource = 'ptb_lock';
                }
            }

            // ── Priority 3: Current chainlink price (last resort) ──
            if (!resolvePrice && chainlinkBtcPrice) {
                resolvePrice = chainlinkBtcPrice;
                resolveSource = 'chainlink_live';
                console.warn(`⚠ Trade ${trade.id}: using live price as resolve — may be inaccurate`);
            }

            if (!resolvePrice) {
                console.warn(`⚠ Trade ${trade.id}: no resolve price available — skipping`);
                continue;
            }

            // ── Win/Loss logic ─────────────────────────────────────
            const ptb = trade.priceToBeat;
            if (!ptb) {
                console.warn(`⚠ Trade ${trade.id}: no PTB — cannot resolve`);
                continue;
            }

            const won = trade.direction === 'UP'
                ? resolvePrice > ptb
                : resolvePrice < ptb;

            await Trade.updateOne(
                { id: trade.id },
                {
                    $set: {
                        status: 'resolved',
                        result: won ? 'win' : 'loss',
                        resolvePrice,
                        resolveSource,
                    },
                },
            );

            console.log(
                `✅ Trade ${trade.id} resolved: ${trade.direction} | PTB=$${ptb} | Resolve=$${resolvePrice} | ${won ? '🟢 WIN' : '🔴 LOSS'} | src=${resolveSource}`
            );
        }

    } catch (err) {
        console.error('❌ Resolver error:', err.message);
    } finally {
        isResolving = false;
    }
}

// ─────────────────────────────────────────────────────────────
// Start cron — har minute run karo
// ─────────────────────────────────────────────────────────────
export function startTradeResolver() {
    console.log('⏰ Trade resolver cron started');

    // Immediately run on startup (catch any missed resolves from downtime)
    resolvePendingTrades();

    // Har minute
    cron.schedule('* * * * *', resolvePendingTrades);
}