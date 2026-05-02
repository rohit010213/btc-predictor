import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  candleTs: { type: Number, index: true },           // NEW — candle unix ts
  timestamp: { type: Date, required: true },
  date: { type: String, index: true },
  hour: { type: Number, index: true },
  direction: { type: String, enum: ['UP', 'DOWN'], required: true },
  confidence: { type: Number },
  entryPrice: { type: Number },
  priceToBeat: { type: Number },
  resolvePrice: { type: Number, default: null },
  resolveSource: { type: String, default: null },         // candle_history / ptb_lock / chainlink_live
  entryDiff: { type: Number, default: null },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending', index: true },
  result: { type: String, enum: ['win', 'loss', null], default: null, index: true },
  priceToBeatSource: { type: String, default: null },
  analysis: { type: String, default: null },
  risk: { type: String, default: null },
  score: { type: Number, default: null },
  bearScore: { type: Number, default: null },
  weightedBull: { type: Number, default: null },   // NEW — weighted bull confluence
  weightedBear: { type: Number, default: null },   // NEW — weighted bear confluence
}, { timestamps: true });

// ── Compound indexes for analytics queries ───────────────────
tradeSchema.index({ status: 1, result: 1 });           // summary query
tradeSchema.index({ date: 1, status: 1 });             // daily query
tradeSchema.index({ score: 1, status: 1 });            // score-performance query
tradeSchema.index({ status: 1, timestamp: -1 });       // recent resolved trades
tradeSchema.index({ candleTs: 1, status: 1 });         // cron resolve query

export const Trade = mongoose.model('Trade', tradeSchema);