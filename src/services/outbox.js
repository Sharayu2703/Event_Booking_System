import Outbox from '../models/Outbox.js';
import { notificationQueue } from '../config/queue.js';

export async function createOutboxRecord(type, payload, dedupeKey) {
  return Outbox.create({ type, payload, dedupeKey });
}
export async function dispatchPendingOutbox(limit = 100) {
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
