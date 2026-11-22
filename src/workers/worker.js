import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { validateEnv } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { redisConnection } from '../config/queue.js';
import { sendEmail } from '../services/mailer.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import Outbox from '../models/Outbox.js';

validateEnv();
await connectDB();
const worker = new Worker('event-notifications', async job => {
  if (job.name === 'BOOKING_CONFIRMATION') {
    const booking = /** @type {any} */ (await Booking.findById(job.data.bookingId).populate('customer', 'name email').populate('event', 'title venue startsAt'));
    if (!booking || booking.status !== 'CONFIRMED') return { skipped: true };
    await sendEmail({ to: booking.customer.email, subject: `Booking confirmed: ${booking.event.title}`,
      text: `Hello ${booking.customer.name},\n\nYour booking is confirmed.\nEvent: ${booking.event.title}\nVenue: ${booking.event.venue}\nDate: ${booking.event.startsAt.toISOString()}\nTickets: ${booking.quantity}\nBooking reference: ${booking.id}\n`,
      html: `<p>Hello ${escapeHtml(booking.customer.name)},</p><p>Your booking is confirmed.</p><ul><li>Event: ${escapeHtml(booking.event.title)}</li><li>Venue: ${escapeHtml(booking.event.venue)}</li><li>Date: ${booking.event.startsAt.toISOString()}</li><li>Tickets: ${booking.quantity}</li><li>Booking reference: ${booking.id}</li></ul>` });
    return { sent: true, to: booking.customer.email };
  }
  if (job.name === 'EVENT_UPDATED') {
    const event = await Event.findById(job.data.eventId).select('title venue startsAt status');
    if (!event) return { skipped: true };
    const cancelled = event.status === 'CANCELLED';
    const subject = `${cancelled ? 'Event cancelled' : 'Event update'}: ${event.title}`;
    let sent = 0;
    // Recheck current confirmed bookings at send time to avoid notifying customers who cancelled.
    const customerIds = await Booking.distinct('customer', { event: event._id, status: 'CONFIRMED', customer: { $in: job.data.recipientIds || [] } });
    for (let i = 0; i < customerIds.length; i += 50) {
      const users = await User.find({ _id: { $in: customerIds.slice(i, i + 50) } }).select('name email').lean();
      for (const user of users) {
        await sendEmail({ to: user.email, subject,
          text: `Hello ${user.name},\n\n${cancelled ? 'An event you booked has been cancelled.' : 'An event you booked has been updated.'}\nEvent: ${event.title}\nVenue: ${event.venue}\nDate: ${event.startsAt.toISOString()}\nRevision: ${job.data.revision}\n`,
          html: `<p>Hello ${escapeHtml(user.name)},</p><p>${cancelled ? 'An event you booked has been cancelled.' : 'An event you booked has been updated.'}</p><ul><li>Event: ${escapeHtml(event.title)}</li><li>Venue: ${escapeHtml(event.venue)}</li><li>Date: ${event.startsAt.toISOString()}</li></ul>` });
        sent++;
      }
    }
    return { sent };
  }
  throw new Error(`Unknown job type: ${job.name}`);
}, { connection: redisConnection, concurrency: 10, limiter: { max: 20, duration: 1000 } });
worker.on('completed', async job => {
  if (job.data.outboxId) await Outbox.updateOne({ _id: job.data.outboxId }, { $set: { status: 'DELIVERED' }, $unset: { lastError: 1 } });
  console.log(`Job ${job.id} completed`);
});
worker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (!job?.data.outboxId) return;
  try {
    const attempts = Number(job.opts.attempts || 1);
    const finalAttempt = job.attemptsMade >= attempts;
    await Outbox.updateOne({ _id: job.data.outboxId }, {
      $set: { status: finalAttempt ? 'FAILED' : 'QUEUED', lastError: String(err.message).slice(0, 1000) },
      $inc: { attempts: 1 }
    });
  } catch (updateError) {
    console.error('Unable to update outbox failure status:', updateError.message);
  }
});
console.log('Background worker started');
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
async function stop() { await worker.close(); await redisConnection.quit(); await mongoose.disconnect(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
