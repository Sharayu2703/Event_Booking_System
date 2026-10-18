import { Router } from 'express';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { createOutboxRecord } from '../services/outbox.js';

const router = Router();
const validId = id => mongoose.isValidObjectId(id);
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page || '1', 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit || '20', 10) || 20));
    const filter = { status: 'PUBLISHED', startsAt: { $gte: new Date() } };
    if (typeof req.query.search === 'string' && req.query.search.trim()) filter.title = { $regex: req.query.search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [items, total] = await Promise.all([Event.find(filter).select('-__v').populate('organizer', 'name').sort({ startsAt: 1 }).skip((page - 1) * limit).limit(limit).lean(), Event.countDocuments(filter)]);
    res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try { if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
    const event = await Event.findOne({ _id: req.params.id, status: 'PUBLISHED' }).populate('organizer', 'name').lean();
    if (!event) return res.status(404).json({ error: 'Event not found' }); res.json({ event });
  } catch (e) { next(e); }
});
router.post('/', authenticate, allowRoles('ORGANIZER'), async (req, res, next) => {
  try {
    const { title, description = '', venue, startsAt, totalTickets } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || typeof venue !== 'string' || !venue.trim() || typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now() || !Number.isInteger(totalTickets) || totalTickets < 1 || totalTickets > 1000000 || typeof description !== 'string') return res.status(400).json({ error: 'Provide title (3+ chars), venue, future startsAt, description string and totalTickets (1-1000000 integer)' });
    const event = await Event.create({ title: title.trim(), description, venue: venue.trim(), startsAt: new Date(startsAt), totalTickets, availableTickets: totalTickets, organizer: req.user._id });
    res.status(201).json({ event });
  } catch (e) { next(e); }
});
router.patch('/:id', authenticate, allowRoles('ORGANIZER'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
    const allowed = ['title', 'description', 'venue', 'startsAt', 'status'];
    const update = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) update[key] = req.body[key];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No supported fields supplied' });
    if (update.title !== undefined && (typeof update.title !== 'string' || update.title.trim().length < 3)) return res.status(400).json({ error: 'Title must be at least 3 characters' });
    if (update.venue !== undefined && (typeof update.venue !== 'string' || !update.venue.trim())) return res.status(400).json({ error: 'Venue is required' });
    if (update.startsAt !== undefined && (!Number.isFinite(Date.parse(update.startsAt)) || Date.parse(update.startsAt) <= Date.now())) return res.status(400).json({ error: 'startsAt must be a future date' });
    if (update.status !== undefined && !['PUBLISHED', 'CANCELLED'].includes(update.status)) return res.status(400).json({ error: 'Invalid status' });
    if (update.title) update.title = update.title.trim(); if (update.venue) update.venue = update.venue.trim(); if (update.startsAt) update.startsAt = new Date(update.startsAt);
    const event = await Event.findOneAndUpdate({ _id: req.params.id, organizer: req.user._id }, { $set: update, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!event) {
      const exists = await Event.exists({ _id: req.params.id });
      return res.status(exists ? 403 : 404).json({ error: exists ? 'You do not own this event' : 'Event not found' });
    }
    const recipients = await Booking.distinct('customer', { event: event._id, status: 'CONFIRMED' });
    if (recipients.length) await createOutboxRecord('EVENT_UPDATED', { eventId: String(event._id), eventTitle: event.title, eventVenue: event.venue, startsAt: event.startsAt.toISOString(), revision: event.revision, recipientIds: recipients.map(String) }, `event-updated:${event._id}:${event.revision}`);
    res.json({ event, notificationRecipients: recipients.length });
  } catch (e) { next(e); }
});
router.delete('/:id', authenticate, allowRoles('ORGANIZER'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const bookings = await Booking.countDocuments({ event: event._id, status: 'CONFIRMED' });
    if (bookings) return res.status(409).json({ error: 'Cannot delete an event with confirmed bookings; cancel it instead' });
    await event.deleteOne(); res.status(204).send();
  } catch (e) { next(e); }
});
export default router;
