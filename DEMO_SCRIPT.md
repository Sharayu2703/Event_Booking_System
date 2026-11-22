# Demo Script (English, approximately 3 minutes)

Hello, my name is [YOUR NAME]. This is my Event Booking backend built with Node.js, Express, MongoDB, Redis, and BullMQ.

First, the health endpoint confirms that the API is running: [SHOW REAL URL AND RESPONSE]. Customers can register and log in. Passwords are hashed, and login returns a JWT. Organizer registration is protected by an invitation secret, and role middleware restricts event-management routes.

An organizer can create and update events. A customer can book tickets using an idempotency key. The booking flow validates quantity and uses a conditional atomic MongoDB update so available inventory cannot be decremented below zero by simultaneous requests. A unique index on customer plus idempotency key helps prevent duplicate operations.

For notifications, the API writes an outbox record and dispatches work to BullMQ on Redis. A separate worker sends booking confirmations and event update notifications through Nodemailer and SMTP, so email sending does not block the booking API request.

Now I will show the real email delivery result: [SHOW ONLY IF RECEIVED]. The load test uses k6 to generate concurrent booking requests. My measured results are [STATE REAL VUs, SUCCESS COUNT, P95, ERROR COUNT]. I compare the baseline and optimized run under the same environment. [IF NOT RUN, SAY: Load-test results are not yet measured, so I will not claim a capacity number.]

Thank you.

## Recording checklist
- Record 16:9 screen with face camera visible and clear English audio.
- Show a real deployed URL only if deployment is complete.
- Never expose `.env`, passwords, API keys, JWTs, or personal customer data.
- Show actual terminal/API responses; do not fabricate email or load-test evidence.
