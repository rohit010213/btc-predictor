import express from 'express';
import { Trade } from '../models/Trade.js';

const router = express.Router();

// ── /api/analytics/summary ────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const trades = await Trade.find({ status: 'resolved' });
    const wins = trades.filter(t => t.result === 'win').length;
    const losses = trades.filter(t => t.result === 'loss').length;
    const total = trades.length;
    const winRate = total ? ((wins / total) * 100).toFixed(1) : 0;

    // last 24h
    const now = Date.now();
    const last24h = trades.filter(t => now - new Date(t.timestamp).getTime() < 86400000);
    const last24Wins = last24h.filter(t => t.result === 'win').length;

    // today IST
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const todayTrades = trades.filter(t => t.date === todayStr);
    const todayWins = todayTrades.filter(t => t.result === 'win').length;

    // ── Score group analysis (NEW) ────────────────────────────────
    // Groups: trades jinke score field available hain
    // Score 4 vs 5 vs 6 ka win rate compare karo
    const scoreGroups = {};
    trades.forEach(t => {
      if (t.score == null) return;
      if (!scoreGroups[t.score]) {
        scoreGroups[t.score] = { score: t.score, total: 0, wins: 0, losses: 0 };
      }
      scoreGroups[t.score].total++;
      if (t.result === 'win') scoreGroups[t.score].wins++;
      if (t.result === 'loss') scoreGroups[t.score].losses++;
    });

    const scoreBreakdown = Object.values(scoreGroups)
      .sort((a, b) => a.score - b.score)
      .map(g => ({
        ...g,
        winRate: g.total ? parseFloat(((g.wins / g.total) * 100).toFixed(1)) : 0,
      }));

    // ── High confidence (score >= 5) trades (NEW) ─────────────────
    const highConf = trades.filter(t => t.score != null && t.score >= 5);
    const highConfWins = highConf.filter(t => t.result === 'win').length;
    const highConfWinRate = highConf.length
      ? parseFloat(((highConfWins / highConf.length) * 100).toFixed(1))
      : 0;

    // ── Bear score analysis (NEW) ─────────────────────────────────
    // Jab bearScore > 0 tha tab bhi trade liya — kya woh trades bura perform kiya?
    const withBearSignals = trades.filter(t => t.bearScore != null && t.bearScore > 0);
    const bearSignalWins = withBearSignals.filter(t => t.result === 'win').length;
    const bearSignalWinRate = withBearSignals.length
      ? parseFloat(((bearSignalWins / withBearSignals.length) * 100).toFixed(1))
      : 0;

    res.json({
      total, wins, losses,
      winRate: parseFloat(winRate),
      last24h: {
        total: last24h.length,
        wins: last24Wins,
        losses: last24h.length - last24Wins,
        winRate: last24h.length
          ? parseFloat(((last24Wins / last24h.length) * 100).toFixed(1))
          : 0,
      },
      today: {
        date: todayStr,
        total: todayTrades.length,
        wins: todayWins,
        losses: todayTrades.length - todayWins,
        winRate: todayTrades.length
          ? parseFloat(((todayWins / todayTrades.length) * 100).toFixed(1))
          : 0,
      },
      // NEW
      scoreBreakdown,
      highConfidence: {
        threshold: 5,
        total: highConf.length,
        wins: highConfWins,
        winRate: highConfWinRate,
      },
      bearSignalImpact: {
        total: withBearSignals.length,
        wins: bearSignalWins,
        winRate: bearSignalWinRate,
        insight: bearSignalWinRate < 55
          ? 'Bear signals reduce win rate — consider raising confluence threshold'
          : 'Bear signals not significantly hurting performance',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /api/analytics/hourly ─────────────────────────────────────────
router.get('/hourly', async (req, res) => {
  try {
    const { date } = req.query;
    const query = { status: 'resolved' };
    if (date) query.date = date;

    const trades = await Trade.find(query);

    const hourMap = {};
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { hour: h, total: 0, wins: 0, losses: 0, winRate: 0, trades: [] };
    }

    trades.forEach(t => {
      const h = t.hour ?? new Date(t.timestamp).getUTCHours();
      if (!hourMap[h]) return;
      hourMap[h].total++;
      if (t.result === 'win') hourMap[h].wins++;
      else hourMap[h].losses++;
      hourMap[h].trades.push({
        id: t.id,
        direction: t.direction,
        result: t.result,
        priceToBeat: t.priceToBeat,
        resolvePrice: t.resolvePrice,
        entryPrice: t.entryPrice,
        confidence: t.confidence,
        score: t.score,      // NEW
        bearScore: t.bearScore,  // NEW
        timestamp: t.timestamp,
      });
    });

    const result = Object.values(hourMap)
      .filter(h => h.total > 0)
      .map(h => ({
        ...h,
        winRate: h.total
          ? parseFloat(((h.wins / h.total) * 100).toFixed(1))
          : 0,
        avgScore: h.trades.filter(t => t.score != null).length  // NEW
          ? parseFloat(
            (h.trades.reduce((s, t) => s + (t.score ?? 0), 0) /
              h.trades.filter(t => t.score != null).length).toFixed(1)
          )
          : null,
        avgPtb: h.trades.length
          ? parseFloat(
            (h.trades.reduce((s, t) => s + (t.priceToBeat || 0), 0) /
              h.trades.length).toFixed(2)
          )
          : null,
        avgResolvePrice: h.trades.length
          ? parseFloat(
            (h.trades.reduce((s, t) => s + (t.resolvePrice || 0), 0) /
              h.trades.length).toFixed(2)
          )
          : null,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /api/analytics/daily ──────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const trades = await Trade.find({ status: 'resolved' }).sort({ timestamp: -1 });

    const dayMap = {};
    trades.forEach(t => {
      const d = t.date || t.timestamp?.toISOString()?.slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) {
        dayMap[d] = { date: d, total: 0, wins: 0, losses: 0, totalScore: 0, scoreCount: 0 };
      }
      dayMap[d].total++;
      if (t.result === 'win') dayMap[d].wins++;
      else if (t.result === 'loss') dayMap[d].losses++;
      // NEW — daily avg score
      if (t.score != null) {
        dayMap[d].totalScore += t.score;
        dayMap[d].scoreCount++;
      }
    });

    const result = Object.values(dayMap)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map(d => ({
        date: d.date,
        total: d.total,
        wins: d.wins,
        losses: d.losses,
        winRate: d.total
          ? parseFloat(((d.wins / d.total) * 100).toFixed(1))
          : 0,
        avgScore: d.scoreCount  // NEW
          ? parseFloat((d.totalScore / d.scoreCount).toFixed(1))
          : null,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /api/analytics/heatmap ────────────────────────────────────────
router.get('/heatmap', async (req, res) => {
  try {
    const trades = await Trade.find({ status: 'resolved' });
    const matrix = {};
    for (let d = 0; d < 7; d++) {
      matrix[d] = {};
      for (let h = 0; h < 24; h++) {
        matrix[d][h] = { total: 0, wins: 0 };
      }
    }

    trades.forEach(t => {
      const ts = new Date(t.timestamp);
      const dow = ts.getUTCDay();
      const h = t.hour ?? ts.getUTCHours();
      if (matrix[dow]?.[h] !== undefined) {
        matrix[dow][h].total++;
        if (t.result === 'win') matrix[dow][h].wins++;
      }
    });

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = matrix[d][h];
        result.push({
          day: days[d],
          dayIndex: d,
          hour: h,
          total: cell.total,
          wins: cell.wins,
          winRate: cell.total
            ? parseFloat(((cell.wins / cell.total) * 100).toFixed(1))
            : null,
        });
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /api/analytics/score-performance (NEW) ───────────────────────
// Dedicated endpoint — score 4 vs 5 vs 6 performance detail
router.get('/score-performance', async (req, res) => {
  try {
    const trades = await Trade.find({
      status: 'resolved',
      score: { $ne: null },
    });

    const groups = {};
    trades.forEach(t => {
      const key = `${t.score}`;
      if (!groups[key]) {
        groups[key] = {
          score: t.score,
          total: 0,
          wins: 0,
          losses: 0,
          up: 0,
          down: 0,
          upWins: 0,
          downWins: 0,
        };
      }
      groups[key].total++;
      if (t.result === 'win') groups[key].wins++;
      if (t.result === 'loss') groups[key].losses++;
      if (t.direction === 'UP') groups[key].up++;
      if (t.direction === 'DOWN') groups[key].down++;
      if (t.direction === 'UP' && t.result === 'win') groups[key].upWins++;
      if (t.direction === 'DOWN' && t.result === 'win') groups[key].downWins++;
    });

    const result = Object.values(groups)
      .sort((a, b) => a.score - b.score)
      .map(g => ({
        score: g.score,
        total: g.total,
        wins: g.wins,
        losses: g.losses,
        winRate: g.total ? parseFloat(((g.wins / g.total) * 100).toFixed(1)) : 0,
        upWinRate: g.up ? parseFloat(((g.upWins / g.up) * 100).toFixed(1)) : 0,
        downWinRate: g.down ? parseFloat(((g.downWins / g.down) * 100).toFixed(1)) : 0,
        // Yeh batayega ki threshold badhana chahiye ya nahi
        recommendation: g.total >= 10  // min 10 trades ke baad reliable
          ? g.winRate >= 65
            ? `Score ${g.score} is profitable — keep threshold here`
            : g.winRate >= 55
              ? `Score ${g.score} is marginal — monitor closely`
              : `Score ${g.score} underperforming — raise threshold to ${g.score + 1}`
          : `Not enough data (${g.total}/10 trades)`,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;