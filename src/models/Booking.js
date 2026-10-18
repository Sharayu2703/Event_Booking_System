import mongoose from 'mongoose';
const bookingSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  quantity: { type: Number, required: true, min: 1, max: 10 },
  status: { type: String, enum: ['CONFIRMED', 'CANCELLED'], default: 'CONFIRMED', index: true },
  idempotencyKey: { type: String, required: true },
  eventRevisionAtBooking: { type: Number, default: 1 }
}, { timestamps: true, versionKey: false });
bookingSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true });
bookingSchema.index({ event: 1, status: 1, customer: 1 });
export default mongoose.model('Booking', bookingSchema);
