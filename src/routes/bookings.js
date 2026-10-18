import { Router } from 'express';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { createOutboxRecord } from '../services/outbox.js';

const router = Router();
router.post('/events/:id/bookings', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
    const quantity = req.body?.quantity;
    const key = req.get('Idempotency-Key');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return res.status(400).json({ error: 'quantity must be an integer between 1 and 10' });
    if (typeof key !== 'string' || key.length < 8 || key.length > 128) return res.status(400).json({ error: 'Idempotency-Key header (8-128 chars) is required' });
    const existing = await Booking.findOne({ customer: req.user._id, idempotencyKey: key }).populate('event', 'title venue startsAt');
    if (existing) {
      if (String(existing.event?._id || existing.event) !== req.params.id || existing.quantity !== quantity) return res.status(409).json({ error: 'Idempotency key was already used for a different request' });
      return res.status(200).json({ booking: existing, idempotentReplay: true });
    }
    // Atomic conditional decrement prevents overselling when concurrent requests race.
    const event = await Event.findOneAndUpdate({ _id: req.params.id, status: 'PUBLISHED', startsAt: { $gt: new Date() }, availableTickets: { $gte: quantity } }, { $inc: { availableTickets: -quantity } }, { new: true });
    if (!event) {
      const found = await Event.findById(req.params.id).select('status startsAt availableTickets');
      if (!found) return res.status(404).json({ error: 'Event not found' });
      if (found.status !== 'PUBLISHED' || found.startsAt <= new Date()) return res.status(409).json({ error: 'Event is not available for booking' });
      return res.status(409).json({ error: 'Not enough tickets available', availableTickets: found.availableTickets });
    }
    let booking;
    try {
      booking = await Booking.create({ customer: req.user._id, event: event._id, quantity, idempotencyKey: key, eventRevisionAtBooking: event.revision });
    } catch (error) {
      await Event.updateOne({ _id: event._id }, { $inc: { availableTickets: quantity } });
      if (error?.code === 11000) {
        const duplicate = await Booking.findOne({ customer: req.user._id, idempotencyKey: key }).populate('event', 'title venue startsAt');
        if (duplicate && String(duplicate.event?._id || duplicate.event) === req.params.id && duplicate.quantity === quantity) return res.status(200).json({ booking: duplicate, idempotentReplay: true });
        return res.status(409).json({ error: 'Idempotency key already used' });
      }
      throw error;
    }
    try { await createOutboxRecord('BOOKING_CONFIRMATION', { bookingId: String(booking._id) }, `booking-confirmation:${booking._id}`); }
    catch (error) { console.error('Booking committed but outbox creation failed; reconciliation required', booking.id, error.message); }
    res.status(201).json({ booking, availableTickets: event.availableTickets, message: 'Booking confirmed; email is queued asynchronously' });
  } catch (e) { next(e); }
});
router.get('/bookings/me', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try { const bookings = await Booking.find({ customer: req.user._id }).populate('event', 'title venue startsAt status').sort({ createdAt: -1 }).lean(); res.json({ items: bookings }); }
  catch (e) { next(e); }
});
router.get('/bookings/:id', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid booking id' });
    const booking = await Booking.findById(req.params.id).populate('event', 'title venue startsAt organizer').populate('customer', 'name email').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isOwner = String(booking.customer._id) === String(req.user._id);
    const isOrganizer = req.user.role === 'ORGANIZER' && String(booking.event.organizer) === String(req.user._id);
    if (!isOwner && !isOrganizer) return res.status(403).json({ error: 'You cannot access this booking' });
    if (!isOrganizer) delete booking.customer.email;
    res.json({ booking });
  } catch (e) { next(e); }
});
export default router;
