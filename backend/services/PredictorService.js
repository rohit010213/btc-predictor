import { Trade } from '../models/Trade.js';
import { runTAEngine } from './taEngine.js';
import { getCandleHistory, getChainlinkState } from './chainlinkService.js';

// PTB Fetching logic (Centralized for Backend use)
async function fetchPtbForTs(candleTs, currentPrice) {
    const slug = `btc-updown-5m-${candleTs}`;
    
    // 1. Polymarket Exact
    try {
        const pmRes = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
        const pmData = await pmRes.json();
        if (Array.isArray(pmData) && pmData.length) {
            const ptb = pmData[0]?.events?.[0]?.eventMetadata?.priceToBeat;
            if (ptb) return { ptb: parseFloat(ptb), source: 'polymarket_exact' };
        }
    } catch (e) { console.warn(`[Predictor] PM Fetch failed: ${e.message}`); }

    // 2. Chainlink Locked
    const { candlePriceLock } = getChainlinkState();
    const locked = candlePriceLock.get(candleTs);
    if (locked) return { ptb: locked.price, source: 'chainlink_rtds_captured' };

    // 3. Binance Fallback
    try {
        const klineRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${candleTs * 1000}&limit=1`);
        const klines = await klineRes.json();
        if (Array.isArray(klines) && klines.length) {
            return { ptb: parseFloat(klines[0][1]), source: 'binance_kline_fallback' };
        }
    } catch (e) { console.warn(`[Predictor] Binance Fetch failed: ${e.message}`); }

    return { ptb: currentPrice, source: 'estimate_live' };
}

export async function runAutoPrediction(candleTs, currentPrice) {
    try {
        console.log(`[Predictor] Running auto-prediction for candle ${candleTs}...`);

        // 1. Check if trade already exists (Duplicate prevention)
        const existing = await Trade.findOne({ id: candleTs });
        if (existing) {
            console.log(`[Predictor] Trade for ${candleTs} already exists. Skipping.`);
            return;
        }

        // 2. Get PTB
        const { ptb, source } = await fetchPtbForTs(candleTs, currentPrice);

        // 3. Run TA Engine
        const { candleHistory } = getCandleHistory();
        const ta = runTAEngine(candleHistory, currentPrice, ptb);

        if (ta.skip) {
            console.log(`[Predictor] Skipping trade for ${candleTs}: ${ta.reason}`);
            return;
        }

        // 4. Save Trade to DB
        const tsDate = new Date(candleTs * 1000);
        
        // IST formatting
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tsDate);
        const hour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(tsDate)) % 24;

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
            status: 'pending'
        });

        await trade.save();
        console.log(`[Predictor] ✅ Auto-trade saved: ${ta.direction} @ PTB ${ptb} (Score: ${ta.score}/${ta.bearScore})`);

    } catch (err) {
        console.error(`[Predictor] ❌ Error in auto-prediction:`, err.message);
    }
}
