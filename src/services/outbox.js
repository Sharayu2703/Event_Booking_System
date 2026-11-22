import Outbox from '../models/Outbox.js';

export async function createOutboxRecord(type, payload, dedupeKey) {
  return Outbox.create({ type, payload, dedupeKey });
}
export async function dispatchPendingOutbox(limit = 100) {
  // Keep API-only consumers (including the HTTP app and its smoke tests) free
  // of Redis connections. The dispatcher loads the queue only when it runs.
  const { notificationQueue } = await import('../config/queue.js');
  const pending = await Outbox.find({ status: 'PENDING' }).sort({ createdAt: 1 }).limit(limit);
  for (const record of pending) {
    try {
      await notificationQueue.add(record.type, { outboxId: String(record._id), ...record.payload }, { jobId: String(record._id) });
      await Outbox.updateOne({ _id: record._id, status: 'PENDING' }, { $set: { status: 'QUEUED' } });
    } catch (error) {
      console.error('Outbox dispatch failed for', String(record._id), error.message);
    }
  }
  return pending.length;
}
