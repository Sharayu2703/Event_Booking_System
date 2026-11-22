import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let mongod;
let app;
let User;
let Booking;
let Event;
let Outbox;

before(async () => {
  if (process.env.RUN_DB_INTEGRATION !== '1') return;
  process.env.JWT_SECRET = 'integration-test-secret-that-is-long-enough';
  process.env.ORGANIZER_INVITE_SECRET = 'organizer-test-secret';
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  process.env.MONGODB_URI = mongod.getUri('event_booking_test');
  ({ default: app } = await import('../src/app.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Booking } = await import('../src/models/Booking.js'));
  ({ default: Event } = await import('../src/models/Event.js'));
  ({ default: Outbox } = await import('../src/models/Outbox.js'));
  const { connectDB } = await import('../src/config/db.js');
  await connectDB();
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('auth, organizer ownership, idempotency and concurrent inventory stay consistent', {
  skip: process.env.RUN_DB_INTEGRATION !== '1'
}, async () => {
  const customerResponse = await request(app).post('/api/auth/register').send({
    name: 'Customer One', email: 'customer@example.test', password: 'securePass123'
  }).expect(201);
  assert.equal(customerResponse.body.user.role, 'CUSTOMER');
  const customerLogin = await request(app).post('/api/auth/login').send({
    email: 'customer@example.test', password: 'securePass123'
  }).expect(200);
  const customerToken = customerLogin.body.token;

  const organizerResponse = await request(app).post('/api/auth/register-organizer')
    .set('x-organizer-invite', 'organizer-test-secret')
    .send({ name: 'Organizer One', email: 'organizer@example.test', password: 'securePass123' })
    .expect(201);
  assert.equal(organizerResponse.body.user.role, 'ORGANIZER');
  const organizerToken = (await request(app).post('/api/auth/login').send({
    email: 'organizer@example.test', password: 'securePass123'
  }).expect(200)).body.token;

  const eventResponse = await request(app).post('/api/events').set('Authorization', `Bearer ${organizerToken}`).send({
    title: 'Concurrency Test Concert', description: 'Test event', venue: 'Test Hall',
    startsAt: new Date(Date.now() + 86400000).toISOString(), totalTickets: 25
  }).expect(201);
  const eventId = eventResponse.body.event._id;
  await request(app).post('/api/events').set('Authorization', `Bearer ${customerToken}`).send({}).expect(403);

  const initialBooking = await request(app).post(`/api/events/${eventId}/bookings`)
    .set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', 'initial-key-0001')
    .send({ quantity: 2 }).expect(201);
  const replay = await request(app).post(`/api/events/${eventId}/bookings`)
    .set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', 'initial-key-0001')
    .send({ quantity: 2 }).expect(200);
  assert.equal(replay.body.booking._id, initialBooking.body.booking._id);
  await request(app).post(`/api/events/${eventId}/bookings`)
    .set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', 'initial-key-0001')
    .send({ quantity: 3 }).expect(409);

  const simultaneous = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    request(app).post(`/api/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `parallel-key-${String(index).padStart(4, '0')}`)
      .send({ quantity: 4 })
  ));
  const created = simultaneous.filter(response => response.status === 201);
  const soldOut = simultaneous.filter(response => response.status === 409);
  assert.equal(created.length, 5);
  assert.equal(soldOut.length, 5);

  const storedEvent = await Event.findById(eventId).lean();
  const confirmed = await Booking.find({ event: eventId, status: 'CONFIRMED' }).lean();
  assert.equal(storedEvent.availableTickets, 3);
  assert.equal(confirmed.reduce((sum, booking) => sum + booking.quantity, 0), 22);
  assert.equal(await Outbox.countDocuments({ type: 'BOOKING_CONFIRMATION' }), 6);

  await request(app).patch(`/api/events/${eventId}`).set('Authorization', `Bearer ${organizerToken}`)
    .send({ venue: 'Updated Test Hall' }).expect(200);
  assert.equal(await Outbox.countDocuments({ type: 'EVENT_UPDATED' }), 1);
  await request(app).get(`/api/bookings/${initialBooking.body.booking._id}`)
    .set('Authorization', `Bearer ${organizerToken}`).expect(200);
  await request(app).patch(`/api/events/${eventId}`).set('Authorization', `Bearer ${organizerToken}`)
    .send({ status: 'CANCELLED' }).expect(200);
  const cancellationNotice = await Outbox.findOne({ type: 'EVENT_UPDATED' }).sort({ createdAt: -1 }).lean();
  assert.equal(cancellationNotice.payload.status, 'CANCELLED');

  const secondCustomer = await request(app).post('/api/auth/register').send({
    name: 'Customer Two', email: 'customer2@example.test', password: 'securePass123'
  }).expect(201);
  const secondToken = (await request(app).post('/api/auth/login').send({
    email: secondCustomer.body.user.email, password: 'securePass123'
  }).expect(200)).body.token;
  await request(app).get(`/api/bookings/${initialBooking.body.booking._id}`)
    .set('Authorization', `Bearer ${secondToken}`).expect(403);
  assert.equal(await User.countDocuments({}), 3);
});
