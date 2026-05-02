import express from 'express';
import { Trade } from '../models/Trade.js';

const router = express.Router();

// ── GET /api/trades ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { date, limit = 500 } = req.query;
    const query = {};
    if (date) query.date = date;
    const trades = await Trade.find(query).sort({ id: -1 }).limit(parseInt(limit));
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/trades ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const ts = new Date(body.timestamp || Date.now());

    // IST date + hour
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    const dateStr = dateFormatter.format(ts);
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(hourFormatter.format(ts)) % 24;

    // candleTs — frontend se aaye toh use karo, warna timestamp se derive karo
    const candleTs = body.candleTs
      || Math.floor(ts.getTime() / 1000 / 300) * 300;

    const entryDiff = (body.entryPrice && body.priceToBeat)
      ? (body.entryPrice - body.priceToBeat) / body.priceToBeat * 100
      : null;

    const trade = new Trade({
      ...body,
      timestamp: ts,
      date: dateStr,
      hour,
      candleTs,   // always saved now
      entryDiff,
    });

    await trade.save();
    res.json({ ok: true, id: trade.id });
  } catch (e) {
    if (e.code === 11000) {
      res.status(409).json({ error: 'Trade already exists', id: req.body.id });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// ── PUT /api/trades/:id ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const update = req.body;
    await Trade.updateOne({ id: parseInt(req.params.id) }, { $set: update });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;