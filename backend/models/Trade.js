import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  timestamp: { type: Date, required: true },
  date: { type: String, index: true },
  hour: { type: Number, index: true },
  direction: { type: String, enum: ['UP', 'DOWN'], required: true },
  confidence: { type: Number },
  entryPrice: { type: Number },
  priceToBeat: { type: Number },
  resolvePrice: { type: Number, default: null },
  entryDiff: { type: Number, default: null },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending', index: true },
  result: { type: String, enum: ['win', 'loss', null], default: null, index: true },
  priceToBeatSource: { type: String, default: null },
  analysis: { type: String, default: null },
  risk: { type: String, default: null },
}, { timestamps: true });

export const Trade = mongoose.model('Trade', tradeSchema);
