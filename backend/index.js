import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { connectChainlinkStream, getChainlinkState, loadCandleHistory } from './services/chainlinkService.js';
import { startTradeResolver } from './services/Traderesolver.js';
import tradeRoutes from './routes/tradeRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import ptbRoutes from './routes/ptbRoutes.js';

// ── Global error handlers — crash nahi hona chahiye ───────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});

const app = express();
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use('/api/trades', tradeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', ptbRoutes);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  try {
    const { chainlinkBtcPrice, candlePriceLock } = getChainlinkState();
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1,
      chainlink: !!chainlinkBtcPrice,
      chainlinkPrice: chainlinkBtcPrice,
      candlesLocked: candlePriceLock?.size ?? 0,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Startup sequence ──────────────────────────────────────────
async function start() {
  // 1. DB connect first
  await connectDB();

  // 2. Load saved candles from DB (warmup solve)
  await loadCandleHistory();

  // 3. Start WebSocket stream
  connectChainlinkStream();

  // 4. Start trade resolver cron
  startTradeResolver();

  // 5. Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start();