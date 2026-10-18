import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
export const notificationQueue = new Queue('event-notifications', { connection: redisConnection, defaultJobOptions: {
  attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000
}});
