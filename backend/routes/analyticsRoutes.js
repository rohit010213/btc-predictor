import express from 'express';
import { Trade } from '../models/Trade.js';

const router = express.Router();

// ── /api/analytics/summary ────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    // ── Single aggregation pipeline — replaces 6+ .find() calls ──
    const now = new Date();
    const last24hTs = new Date(now.getTime() - 86400000);
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const [agg] = await Trade.aggregate([
      { $match: { status: 'resolved' } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', 'loss'] }, 1, 0] } },

          // last 24h
          last24Total: { $sum: { $cond: [{ $gte: ['$timestamp', last24hTs] }, 1, 0] } },
          last24Wins: { $sum: { $cond: [{ $and: [{ $gte: ['$timestamp', last24hTs] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },

          // today IST
          todayTotal: { $sum: { $cond: [{ $eq: ['$date', todayStr] }, 1, 0] } },
          todayWins: { $sum: { $cond: [{ $and: [{ $eq: ['$date', todayStr] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },

          // high confidence (score >= 5)
          highConfTotal: { $sum: { $cond: [{ $gte: ['$score', 5] }, 1, 0] } },
          highConfWins: { $sum: { $cond: [{ $and: [{ $gte: ['$score', 5] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },

          // bear signal impact
          bearTotal: { $sum: { $cond: [{ $gt: ['$bearScore', 0] }, 1, 0] } },
          bearWins: { $sum: { $cond: [{ $and: [{ $gt: ['$bearScore', 0] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },
        },
      },
    ]);

    // Score breakdown — separate aggregation (group by score)
    const scoreAgg = await Trade.aggregate([
      { $match: { status: 'resolved', score: { $ne: null } } },
      {
        $group: {
          _id: '$score',
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', 'loss'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const data = agg || {
      total: 0, wins: 0, losses: 0,
      last24Total: 0, last24Wins: 0,
      todayTotal: 0, todayWins: 0,
      highConfTotal: 0, highConfWins: 0,
      bearTotal: 0, bearWins: 0,
    };

    const pct = (a, b) => b ? parseFloat(((a / b) * 100).toFixed(1)) : 0;

    const scoreBreakdown = scoreAgg.map(g => ({
      score: g._id,
      total: g.total,
      wins: g.wins,
      losses: g.losses,
      winRate: pct(g.wins, g.total),
    }));

    const bearSignalWinRate = pct(data.bearWins, data.bearTotal);

    res.json({
      total: data.total,
      wins: data.wins,
      losses: data.losses,
      winRate: pct(data.wins, data.total),
      last24h: {
        total: data.last24Total,
        wins: data.last24Wins,
        losses: data.last24Total - data.last24Wins,
        winRate: pct(data.last24Wins, data.last24Total),
      },
      today: {
        date: todayStr,
        total: data.todayTotal,
        wins: data.todayWins,
        losses: data.todayTotal - data.todayWins,
        winRate: pct(data.todayWins, data.todayTotal),
      },
      scoreBreakdown,
      highConfidence: {
        threshold: 5,
        total: data.highConfTotal,
        wins: data.highConfWins,
        winRate: pct(data.highConfWins, data.highConfTotal),
      },
      bearSignalImpact: {
        total: data.bearTotal,
        wins: data.bearWins,
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


// ── /api/analytics/hourly ─────────────────────────────────────
router.get('/hourly', async (req, res) => {
  try {
    const { date } = req.query;
    const match = { status: 'resolved' };
    if (date) match.date = date;

    const agg = await Trade.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$hour',
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', 'loss'] }, 1, 0] } },
          avgScore: { $avg: '$score' },
          avgConf: { $avg: '$confidence' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result = agg.map(h => ({
      hour: h._id,
      total: h.total,
      wins: h.wins,
      losses: h.losses,
      winRate: h.total ? parseFloat(((h.wins / h.total) * 100).toFixed(1)) : 0,
      avgScore: h.avgScore != null ? parseFloat(h.avgScore.toFixed(1)) : null,
      avgConf: h.avgConf != null ? parseFloat(h.avgConf.toFixed(1)) : null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── /api/analytics/daily ─────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;

    const agg = await Trade.aggregate([
      { $match: { status: 'resolved' } },
      {
        $group: {
          _id: '$date',
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', 'loss'] }, 1, 0] } },
          avgScore: { $avg: '$score' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: limit },
    ]);

    const result = agg.map(d => ({
      date: d._id,
      total: d.total,
      wins: d.wins,
      losses: d.losses,
      winRate: d.total ? parseFloat(((d.wins / d.total) * 100).toFixed(1)) : 0,
      avgScore: d.avgScore != null ? parseFloat(d.avgScore.toFixed(1)) : null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── /api/analytics/heatmap ────────────────────────────────────
router.get('/heatmap', async (req, res) => {
  try {
    const agg = await Trade.aggregate([
      { $match: { status: 'resolved' } },
      {
        $group: {
          _id: { dow: { $dayOfWeek: '$timestamp' }, hour: '$hour' },
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
        },
      },
    ]);

    // MongoDB $dayOfWeek: 1=Sun, 2=Mon... convert to 0-indexed
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const matrix = {};
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        matrix[`${d}_${h}`] = { day: days[d], dayIndex: d, hour: h, total: 0, wins: 0 };
      }
    }

    agg.forEach(item => {
      const dayIndex = item._id.dow - 1; // 0-indexed
      const key = `${dayIndex}_${item._id.hour}`;
      if (matrix[key]) {
        matrix[key].total = item.total;
        matrix[key].wins = item.wins;
      }
    });

    const result = Object.values(matrix)
      .filter(c => c.total > 0)
      .map(c => ({
        ...c,
        winRate: c.total ? parseFloat(((c.wins / c.total) * 100).toFixed(1)) : null,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── /api/analytics/score-performance ─────────────────────────
router.get('/score-performance', async (req, res) => {
  try {
    const agg = await Trade.aggregate([
      { $match: { status: 'resolved', score: { $ne: null } } },
      {
        $group: {
          _id: '$score',
          total: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$result', 'win'] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', 'loss'] }, 1, 0] } },
          upTotal: { $sum: { $cond: [{ $eq: ['$direction', 'UP'] }, 1, 0] } },
          downTotal: { $sum: { $cond: [{ $eq: ['$direction', 'DOWN'] }, 1, 0] } },
          upWins: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'UP'] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },
          downWins: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'DOWN'] }, { $eq: ['$result', 'win'] }] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const pct = (a, b) => b ? parseFloat(((a / b) * 100).toFixed(1)) : 0;

    const result = agg.map(g => ({
      score: g._id,
      total: g.total,
      wins: g.wins,
      losses: g.losses,
      winRate: pct(g.wins, g.total),
      upWinRate: pct(g.upWins, g.upTotal),
      downWinRate: pct(g.downWins, g.downTotal),
      recommendation: g.total >= 10
        ? g.winRate >= 65
          ? `Score ${g._id} profitable ✅ — keep threshold`
          : g.winRate >= 55
            ? `Score ${g._id} marginal ⚠ — monitor closely`
            : `Score ${g._id} underperforming ❌ — raise threshold to ${g._id + 1}`
        : `Not enough data (${g.total}/10 trades)`,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;