# Event Booking Backend — 10-Minute Submission Guide

## What is included

- Express API with customer and organizer authentication and role checks
- MongoDB/Mongoose models and indexes
- Ticket booking with conditional atomic inventory decrement and idempotency key
- Redis + BullMQ background notification worker
- SMTP/Nodemailer email delivery (real provider credentials required)
- MongoDB outbox dispatcher
- k6 load-test script and smoke tests
- Dockerfile, docker-compose.yml, `.env.example`, and detailed design README

## Verified in this archive

- `node scripts/syntax-check.js` passed on Node.js 22.16.0.
- Deployment, SMTP delivery, full database integration tests, and load-test results have NOT been verified from this archive. Do not claim they have been completed.

## Fast local setup

1. Extract the ZIP and open a terminal in `event-booking-mern`.
2. Copy `.env.example` to `.env` and fill in valid MongoDB, Redis, JWT, organizer invite, and SMTP settings. Never submit `.env` or commit it.
3. Install dependencies: `npm install`.
4. Run syntax checks and smoke tests: `npm run lint:syntax` then `npm test`.
5. Ensure MongoDB and Redis are reachable.
6. Terminal 1: `npm start`
7. Terminal 2: `npm run worker`
8. Test `GET /health` at the local API URL.

## Gmail SMTP (if you choose Gmail)

Use Google Account 2-Step Verification and an App Password if your account supports it. Never use your normal Gmail password. Set:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_gmail_address
SMTP_PASS=your_google_app_password
MAIL_FROM=Event Booking <your_gmail_address>
```

Alternatively use a transactional email provider's SMTP settings and an authorized sender. Do not put real secrets in this archive.

## Before submitting — be accurate

The hiring test asks for an online deployment, real email delivery, measured load results (baseline and optimized), and a 2–5 minute demo. This archive cannot create hosting/provider accounts or record a video on your behalf. Do not invent a deployed URL, email-delivery proof, or performance numbers.

If you have only minutes left, submit the code archive plus your actual repository/deployment URL if already available. If not deployed, say so honestly rather than fabricating a URL. If you have not run k6, mark performance figures as not measured.

## 3-minute demo narration outline

1. (0:00–0:20) Introduce yourself in English and show the deployed API URL / health response, if deployed.
2. (0:20–0:55) Show customer registration/login and explain JWT role-based access.
3. (0:55–1:35) Show organizer event creation and customer booking with an idempotency key.
4. (1:35–2:05) Explain atomic inventory decrement, MongoDB indexes, and BullMQ background jobs/outbox.
5. (2:05–2:35) Show a real confirmation/update email if verified. If not, explicitly say SMTP is configured but delivery is not yet verified; do not imply otherwise.
6. (2:35–3:00) Show actual k6 output if run and state measured p95/error rates. Do not make up capacity numbers.

## Security

The previously shared `.env` contained credentials. Rotate the MongoDB password and JWT secret before deployment. Keep `.env` out of Git and submission ZIPs. Use separate strong JWT and organizer invite secrets.
