# Event Booking System API (MERN backend)

A backend hiring-test implementation using **Node.js, Express, MongoDB/Mongoose, Redis and BullMQ**. This repository contains API code, background worker, SMTP email integration, smoke tests, a k6 load-test script, Docker helpers, and deployment notes.

> **Honest verification status:** source-level JavaScript syntax checks and a static review can be run locally. Full integration tests require Node.js dependencies, MongoDB, Redis and valid SMTP credentials. Do not describe the project as production-tested until you run the steps below. Email delivery and cloud deployment cannot be verified from this archive alone. No performance numbers are fabricated; run k6 and record your actual output.

## Features

- Customer registration and login with bcrypt password hashing and JWT.
- Organizer registration protected by `ORGANIZER_INVITE_SECRET` and `x-organizer-invite` header; public registration can only create customers.
- Role-based authorization and organizer ownership checks.
- Event creation, browse/search/pagination, detail, update, cancellation status, and guarded deletion.
- Ticket booking with atomic conditional inventory decrement, quantity validation, and idempotency key.
- BullMQ background tasks: booking confirmation email and event update email to customers with confirmed bookings.
- MongoDB outbox records plus a polling dispatcher to reduce the chance of lost queue jobs.
- Helmet, CORS configuration, request body limit, rate limiting, structured error responses, health endpoint.
- k6 concurrent booking test script and smoke tests.

## Requirements

- Node.js 20+
- Docker Desktop (recommended for local MongoDB and Redis) or equivalent MongoDB and Redis services
- SMTP account with permission to send real emails (Resend SMTP or another provider)
- k6 for load testing

## Quick start

1. Copy `.env.example` to `.env` and configure secrets and SMTP settings. Set `JWT_SECRET` to a random string at least 32 characters long. Set `ORGANIZER_INVITE_SECRET` to a separate strong secret.
2. Start local dependencies:

   ```bash
   docker compose up -d mongo redis
   ```

3. Install dependencies and run checks:

   ```bash
   npm install
   npm run lint:syntax
   npm test
   ```

4. Start the API and worker in separate terminals:

   ```bash
   npm start
   npm run worker
   ```

5. Check `GET http://localhost:4000/health`.

The API requires MongoDB and Redis to be reachable at startup. The worker requires the same `.env` and services. SMTP is checked when a job sends; if SMTP is not configured, jobs fail and retry rather than pretending an email was sent.

## API reference

Base URL: `http://localhost:4000`

### Authentication

- `POST /api/auth/register` — `{ "name": "Customer One", "email": "customer@example.com", "password": "securePass123" }`
- `POST /api/auth/register-organizer` — same body, plus `x-organizer-invite: <ORGANIZER_INVITE_SECRET>` header.
- `POST /api/auth/login` — `{ "email": "customer@example.com", "password": "securePass123" }`; returns `{ token, user }`.

Use `Authorization: Bearer <token>` for protected routes.

### Events

- `GET /api/events?page=1&limit=20&search=music`
- `GET /api/events/:id`
- `POST /api/events` (organizer):

  ```json
  { "title": "Live Music Night", "description": "Local artists", "venue": "City Hall", "startsAt": "2030-05-01T18:00:00.000Z", "totalTickets": 100 }
  ```

- `PATCH /api/events/:id` (owning organizer): any supported subset of `title`, `description`, `venue`, `startsAt`, `status`. `startsAt` must be in the future. `status` can be `PUBLISHED` or `CANCELLED`.
- `DELETE /api/events/:id` (owning organizer): rejected with 409 if confirmed bookings exist; cancel instead.

### Bookings

- `POST /api/events/:id/bookings` (customer) with headers `Authorization`, `Content-Type: application/json`, and `Idempotency-Key` (8-128 chars), body `{ "quantity": 2 }`.
- `GET /api/bookings/me` (customer)
- `GET /api/bookings/:id` (booking owner or event's organizer)

Typical responses: `201` new booking; `200` idempotent replay; `400` invalid input; `401` missing/invalid token; `403` role/ownership denied; `404` unknown resource; `409` sold out, cancelled event, or idempotency conflict; `429` rate limit; `500` unexpected server failure.

## Email and background job design

The API creates an outbox record for a booking confirmation or event update. A dispatcher polls pending outbox records and enqueues BullMQ jobs. The worker uses Nodemailer over SMTP and retries transient failures with exponential backoff. Configure real SMTP credentials before testing. Check provider logs and the recipient inbox/spam folder to verify delivery. Event update notifications are sent individually to confirmed bookers; cancelled bookings are excluded at processing time.

The outbox reduces enqueue-loss risk but this sample is not a complete exactly-once delivery system. The outbox dispatcher and worker need operational monitoring; duplicate delivery is possible around crashes/provider timeouts. Production hardening should include delivery-attempt records, dead-letter handling, alerting, and reconciliation of stuck PENDING outbox rows. Also, booking inventory decrement and booking creation are compensating operations rather than one MongoDB transaction; for stronger crash consistency, use a MongoDB replica set and a transaction-based implementation or a reservation state machine.

## Data and concurrency decisions

- MongoDB is the primary data store. Mongoose models define required fields, enum values and indexes.
- Booking inventory is decremented using one conditional `findOneAndUpdate` requiring `availableTickets >= quantity`. MongoDB applies that single-document update atomically, so simultaneous requests cannot decrement the same inventory below zero.
- Booking has a unique compound index on `(customer, idempotencyKey)` to prevent duplicate bookings for the same operation.
- A compensating inventory increment is attempted if booking insert fails. A process crash between decrement and insert remains a known limitation; see above.
- Booking quantity is limited to 1-10. Event inventory is capped at one million tickets.
- Event listing uses pagination and an index on status/start time. Add a dedicated text-search index or Atlas Search for high-volume search workloads.
- Rate limits are per process by default; multi-instance deployment should use a shared rate-limit store.
- JWT tokens are stateless and currently have no refresh/revocation mechanism. Use HTTPS and protect secrets in deployment settings.

## Manual end-to-end checklist

- [ ] Customer registration succeeds; invalid email/password rejected.
- [ ] Organizer registration fails without the invite header and succeeds with the secret.
- [ ] Login returns a JWT; wrong password returns 401.
- [ ] Customer cannot create/update/delete events.
- [ ] Organizer cannot update an event owned by another organizer.
- [ ] Event listing supports page, limit and search.
- [ ] Booking requires auth, CUSTOMER role, valid quantity and idempotency key.
- [ ] Same idempotency key and same request replays the booking; different payload returns 409.
- [ ] Concurrent booking requests never produce negative available inventory or more confirmed tickets than capacity.
- [ ] Booking confirmation email is delivered through SMTP.
- [ ] Event update email is delivered to all eligible customers with confirmed bookings.
- [ ] Worker retry behavior is visible for a deliberate transient failure.
- [ ] Deleting an event with confirmed bookings returns 409.
- [ ] `GET /health` returns 200 and unknown routes return 404.
- [ ] k6 results and environment details are recorded below.

## Load test

First create an event with sufficient inventory and a test customer token. Do not load-test production data or an event with real customers. Set environment variables in your shell:

```bash
BASE_URL=http://localhost:4000 \
CUSTOMER_TOKEN='paste_test_customer_jwt' \
EVENT_ID='paste_event_object_id' \
START_VUS=10 TARGET_VUS=50 MAX_VUS=100 \
k6 run scripts/k6-bookings.js
```

PowerShell example:

```powershell
$env:BASE_URL='http://localhost:4000'
$env:CUSTOMER_TOKEN='paste_test_customer_jwt'
$env:EVENT_ID='paste_event_object_id'
$env:START_VUS='10'; $env:TARGET_VUS='50'; $env:MAX_VUS='100'
k6 run scripts/k6-bookings.js
```

The script treats 409 sold-out and 429 rate-limit responses as expected business/system-policy outcomes, not unexpected server failures. Check `unexpected_failures`, latency percentiles, successful booking rate, database inventory and queue backlog. For a meaningful capacity test, replenish/reset inventory between runs and use the same event, environment, stages and duration for baseline and optimized versions. A 409 due to inventory exhaustion does not itself mean performance degraded.

### Results log (fill with measured data)

| Run | VUs/stages | Successful bookings | Unexpected errors | p95 latency | Inventory correct? | Environment/notes |
|---|---|---:|---:|---:|---|---|
| Baseline | Not run yet | — | — | — | — | Record actual values |
| Optimized | Not run yet | — | — | — | — | Record actual values |

Recommended improvements to benchmark independently: database connection/pool sizing, indexes, queue worker concurrency, bounded email batches, rate-limit tuning, MongoDB replica set/transaction strategy, and separate API/worker resources. Report the actual sustainable threshold using explicit p95 and error-rate targets; don't claim an unmeasured concurrent-user limit.

## Deployment

Deploy API and worker as separate long-running services using the same image/repository and environment variables. Attach managed MongoDB and Redis-compatible services. Set `PORT`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `ORGANIZER_INVITE_SECRET`, `CLIENT_ORIGIN`, and SMTP variables in the host dashboard. API start command: `npm start`; worker command: `npm run worker`; health path: `/health`. Ensure the platform supports long-running workers and outbound SMTP. Use TLS, managed secrets and a restricted production database. This repository has not been deployed from this environment; add the real URL after deployment.

## Known limitations / next steps

1. Full database integration/concurrency tests are not included in the dependency-light smoke suite; add them against a disposable MongoDB replica set.
2. Atomic decrement + booking insert needs transaction/state-machine hardening for process-crash safety.
3. Outbox delivery needs reconciliation/monitoring and per-recipient dedupe for production-grade email guarantees.
4. `GET /api/bookings/:id` uses role/ownership checks, but organizer access is restricted to the event's owner.
5. Configure shared rate-limit storage before running multiple API replicas.
6. This archive does not include a frontend; “MERN” here means MongoDB, Express, React-compatible API, and Node.js backend. The hiring test is backend-focused.
