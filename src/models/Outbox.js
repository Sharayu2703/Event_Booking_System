import mongoose from 'mongoose';
const outboxSchema = new mongoose.Schema({
  type: { type: String, enum: ['BOOKING_CONFIRMATION', 'EVENT_UPDATED'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['PENDING', 'QUEUED', 'DELIVERED', 'FAILED'], default: 'PENDING', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  lastError: { type: String, maxlength: 1000 },
  dedupeKey: { type: String, required: true, unique: true }
}, { timestamps: true, versionKey: false });
export default mongoose.model('Outbox', outboxSchema);
