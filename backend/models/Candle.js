import mongoose from 'mongoose';

const candleSchema = new mongoose.Schema({
    ts: { type: Number, required: true, unique: true }, // unix epoch (candle start)
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    tickCount: { type: Number, default: 1 },
}, {
    timestamps: false,
});

// Keep only last 100 candles — older ones useless
candleSchema.index({ ts: -1 });

export const candle = mongoose.model('candle', candleSchema);