import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { maxPoolSize: 30, minPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected');
}
