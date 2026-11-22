import mongoose from 'mongoose';
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  description: { type: String, default: '', maxlength: 5000 },
  venue: { type: String, required: true, trim: true, maxlength: 250 },
  startsAt: { type: Date, required: true, index: true },
  totalTickets: { type: Number, required: true, min: 1, max: 1000000 },
  availableTickets: { type: Number, required: true, min: 0 },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['PUBLISHED', 'CANCELLED'], default: 'PUBLISHED', index: true },
  revision: { type: Number, default: 1 }
}, { timestamps: true, versionKey: false });
eventSchema.index({ status: 1, startsAt: 1 });
export default mongoose.model('Event', eventSchema);
