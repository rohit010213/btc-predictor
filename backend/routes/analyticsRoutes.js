import express from 'express';
import { Trade } from '../models/Trade.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    const trades = await Trade.find({ status: 'resolved' });
    const wins = trades.filter(t => t.result === 'win').length;
    const losses = trades.filter(t => t.result === 'loss').length;
    const total = trades.length;
    const winRate = total ? ((wins / total) * 100).toFixed(1) : 0;

    const now = Date.now();
    const last24h = trades.filter(t => now - new Date(t.timestamp).getTime() < 86400000);
    const last24Wins = last24h.filter(t => t.result === 'win').length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter(t => t.date === todayStr);
    const todayWins = todayTrades.filter(t => t.result === 'win').length;

    res.json({
      total, wins, losses,
      winRate: parseFloat(winRate),
      last24h: {
        total: last24h.length,
        wins: last24Wins,
        losses: last24h.length - last24Wins,
        winRate: last24h.length ? parseFloat(((last24Wins / last24h.length) * 100).toFixed(1)) : 0
      },
      today: {
        date: todayStr,
        total: todayTrades.length,
        wins: todayWins,
        losses: todayTrades.length - todayWins,
        winRate: todayTrades.length ? parseFloat(((todayWins / todayTrades.length) * 100).toFixed(1)) : 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
      if (!hourMap[h]) hourMap[h] = { hour: h, total: 0, wins: 0, losses: 0, winRate: 0, trades: [] };
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
        timestamp: t.timestamp,
      });
    });

    const result = Object.values(hourMap)
      .filter(h => h.total > 0)
      .map(h => ({
        ...h,
        winRate: h.total ? parseFloat(((h.wins / h.total) * 100).toFixed(1)) : 0,
        avgPtb: h.trades.length
          ? parseFloat((h.trades.reduce((s, t) => s + (t.priceToBeat || 0), 0) / h.trades.length).toFixed(2))
          : null,
        avgResolvePrice: h.trades.length
          ? parseFloat((h.trades.reduce((s, t) => s + (t.resolvePrice || 0), 0) / h.trades.length).toFixed(2))
          : null,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/daily', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const trades = await Trade.find({ status: 'resolved' }).sort({ timestamp: -1 });

    const dayMap = {};
    trades.forEach(t => {
      const d = t.date || t.timestamp?.toISOString()?.slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { date: d, total: 0, wins: 0, losses: 0, pending: 0 };
      dayMap[d].total++;
      if (t.result === 'win') dayMap[d].wins++;
      else if (t.result === 'loss') dayMap[d].losses++;
    });

    const result = Object.values(dayMap)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map(d => ({
        ...d,
        winRate: d.total ? parseFloat(((d.wins / d.total) * 100).toFixed(1)) : 0
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
      const dow = ts.getUTCDay(); // 0=Sun
      const h = t.hour ?? ts.getUTCHours();
      if (matrix[dow] && matrix[dow][h] !== undefined) {
        matrix[dow][h].total++;
        if (t.result === 'win') matrix[dow][h].wins++;
      }
    });

    const result = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = matrix[d][h];
        result.push({
          day: days[d],
          dayIndex: d,
          hour: h,
          total: cell.total,
          wins: cell.wins,
          winRate: cell.total ? parseFloat(((cell.wins / cell.total) * 100).toFixed(1)) : null
        });
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
