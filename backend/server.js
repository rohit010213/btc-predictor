import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { connectChainlinkStream, getChainlinkState } from './services/chainlinkService.js';
import tradeRoutes from './routes/tradeRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import ptbRoutes from './routes/ptbRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Connect Database
connectDB();

// Start Chainlink Stream
connectChainlinkStream();

// Routes
app.use('/api/trades', tradeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', ptbRoutes);

// Health Check
app.get('/health', (req, res) => {
  const { chainlinkBtcPrice, candlePriceLock } = getChainlinkState();
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1,
    chainlink: !!chainlinkBtcPrice,
    chainlinkPrice: chainlinkBtcPrice,
    candlesLocked: candlePriceLock.size
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
