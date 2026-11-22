# Event Booking System – Backend API

A RESTful backend application for managing events and booking tickets, built with Node.js, Express.js, MongoDB, Redis, and BullMQ.

The system supports two types of users:

- **Event Organizers:** Create, manage, and update events.
- **Customers:** Browse events and book tickets.

It includes JWT-based authentication, role-based authorization, booking idempotency, and asynchronous email jobs. SMTP delivery requires valid provider settings and has not been verified in this repository.

---

## Table of Contents

1. Project Overview
2. Features
3. Technology Stack
4. System Architecture
5. Project Structure
6. User Roles and Permissions
7. API Overview
8. Background Job Processing
9. Email Notification System
10. Database Design
11. Important Design Decisions
12. Installation and Local Setup
13. Environment Variables
14. Running the Application
15. API Testing
16. Error Handling and Security
17. Performance and Load Testing
18. Deployment Architecture
19. Known Limitations and Future Improvements
20. Author

---

## 1. Project Overview

The Event Booking System is a backend application designed to manage event creation, event discovery, and ticket reservations.

Organizers can create and manage events, while customers can browse available events and reserve tickets.

The application uses role-based access control to ensure that users can access only the operations permitted for their roles.

To improve responsiveness, email notifications are processed asynchronously using BullMQ and Redis.

The system provides two important background workflows:

1. Booking Confirmation Email
2. Event Update Notification Email

The application also supports idempotent booking requests to reduce duplicate bookings when clients retry requests.

---

## 2. Features

### Authentication and Authorization

- Customer registration
- Organizer registration
- User login
- JWT-based authentication
- Role-based access control
- Protected API endpoints

### Event Management

- Create events
- Update events
- Delete events
- Browse available events
- Search and filter events
- View event details
- Manage ticket inventory

### Ticket Booking

- Customers can book event tickets.
- Booking confirmation is generated after a successful booking.
- Available ticket inventory is updated.
- Booking records are stored in MongoDB.
- Idempotency keys help prevent duplicate bookings on request retries.
- Customers can access their booking information.

### Background Processing

- BullMQ for job queue management
- Redis as the queue backend
- Separate background worker
- Asynchronous booking confirmation emails
- Event update notifications to customers who booked the event

### Email Notifications

- Nodemailer integration
- SMTP configuration through environment variables
- Email delivery code (actual delivery is unverified)
- Booking confirmation email
- Event update notification email

---

## 3. Technology Stack

| Technology    | Purpose                          |
| ------------- | -------------------------------- |
| Node.js       | JavaScript runtime               |
| Express.js    | Backend framework                |
| MongoDB       | Database                         |
| Mongoose      | MongoDB object modeling          |
| JWT           | Authentication                   |
| bcrypt        | Password hashing                 |
| Redis         | Queue storage and job processing |
| BullMQ        | Background job management        |
| Nodemailer    | Email sending                    |
| SMTP provider | Email delivery                   |
| Postman       | API testing                      |
| Docker        | Local infrastructure             |

---

## 4. System Architecture

The application follows a modular backend architecture.

### High-Level Architecture

```text
                 CLIENT / POSTMAN
                        |
                        |
                  EXPRESS API
                        |
          +-------------+-------------+
          |             |             |
       Auth API      Event API    Booking API
          |             |             |
          +-------------+-------------+
                        |
                     MONGODB
                        |
                        |
                BACKGROUND JOB QUEUE
                     BULLMQ
                        |
                      REDIS
                        |
                        |
                 BACKGROUND WORKER
                        |
                    NODEMAILER
                        |
                   CONFIGURED SMTP
                        |
                        |
                  CUSTOMER EMAIL
```

### Architecture Explanation

1. The client sends HTTP requests to the Express API.
2. Authentication middleware validates JWT tokens.
3. Authorization middleware checks user roles.
4. Route handlers process incoming requests.
5. Mongoose communicates with MongoDB.
6. A successful booking or event update writes a notification record to the MongoDB outbox.
7. The API's polling dispatcher forwards pending records to BullMQ, which stores jobs in Redis.
8. The separate background worker processes queued jobs.
9. Nodemailer attempts to send email using the configured SMTP provider.

This separation prevents email delivery from blocking the main API request.

---

## 5. Project Structure

This is the actual folder structure in the repository (generated dependency files are omitted).

```text
src/
├── app.js, server.js
├── config/          # env.js, db.js, queue.js
├── middleware/      # auth.js, errors.js
├── models/          # User, Event, Booking, Outbox
├── routes/          # auth.js, events.js, bookings.js
├── services/        # mailer.js, outbox.js
├── workers/         # worker.js
└── types/           # Express request types
tests/               # smoke and opt-in MongoDB integration tests
scripts/             # syntax check and k6 booking test
Dockerfile
docker-compose.yml   # MongoDB and Redis only
package.json
README.md
SUBMISSION_NOW.md
```

The project uses separate modules for configuration, routing, data models, business logic, and background processing.

---

## 6. User Roles and Permissions

The system supports two roles.

| Feature                | Customer | Organizer |
| ---------------------- | -------: | --------: |
| Register               |      Yes |       Yes |
| Login                  |      Yes |       Yes |
| Browse Events          |      Yes |       Yes |
| Search Events          |      Yes |       Yes |
| Book Tickets           |      Yes |        No |
| View Own Bookings      |      Yes |        No |
| Create Events          |       No |       Yes |
| Update Own Events      |       No |       Yes |
| Delete Own Events      |       No |       Yes |
| Manage Event Inventory |       No |       Yes |

Role-based middleware protects restricted endpoints.

Users must provide a valid JWT token to access protected resources.

---

## 7. API Overview

The application exposes REST APIs for authentication, event management, and booking operations.

### Authentication APIs

- `POST /api/auth/register` — public customer registration.
- `POST /api/auth/register-organizer` — organizer registration; requires `x-organizer-invite` matching `ORGANIZER_INVITE_SECRET`.
- `POST /api/auth/login` — customer or organizer login; returns a JWT.

### Event APIs

- `GET /api/events?page=1&limit=20&search=music` — browse and search upcoming published events.
- `GET /api/events/:id` — event details.
- `POST /api/events` — organizer creates an event.
- `PATCH /api/events/:id` — owning organizer updates or cancels an event.
- `DELETE /api/events/:id` — owning organizer deletes an event only if there are no confirmed bookings.

### Booking APIs

- `POST /api/events/:id/bookings` — customer booking; requires `Idempotency-Key` (8–128 characters) and JSON such as `{ "quantity": 2 }`.
- `GET /api/bookings/me` — customer lists their bookings.
- `GET /api/bookings/:id` — booking owner or event-owning organizer reads a booking.
- `GET /health` — API process health response.

**Note:** Refer to the actual route files in `src/routes/` for the exact HTTP methods, endpoint paths, request bodies, and authorization requirements.

All protected APIs require the appropriate JWT access token.

---

## 8. Background Job Processing

The application uses BullMQ and Redis for asynchronous task processing.

Background jobs are used for two workflows.

### Background Task 1: Booking Confirmation

**Trigger:** When a customer successfully books tickets.

Workflow:

1. Customer submits a booking request.
2. The API validates the booking.
3. Booking information is saved.
4. The API writes a booking-confirmation record to the MongoDB outbox; its dispatcher later adds a queue job.
5. The background worker receives the job from BullMQ/Redis.
6. The worker processes the email task.
7. Nodemailer attempts delivery through the configured SMTP provider.
8. The customer receives booking details if the provider accepts and delivers the message.

The email includes:

- Customer name
- Event name
- Venue
- Event date
- Ticket quantity
- Booking reference

### Background Task 2: Event Update Notification

**Trigger:** When an organizer updates an event.

Workflow:

1. Organizer updates an event.
2. The API saves the updated event information.
3. The system identifies customers with confirmed bookings and writes an outbox record.
4. The dispatcher queues an event-update job through BullMQ/Redis.
5. The background worker processes the notification.
6. The worker attempts to email the eligible customers; delivery depends on SMTP acceptance and recipient-provider handling.

This queues an update notification for customers with confirmed bookings when an organizer changes an event.

### Why Background Jobs?

- Avoid blocking API responses during email delivery.
- Separate email processing from business logic.
- Allow asynchronous task execution.
- Support retry and job management capabilities through BullMQ.

---

## 9. Email Notification System

The application uses Nodemailer with the SMTP provider configured through environment variables. Real delivery has not been verified as part of this repository audit.

Email configuration is stored in environment variables.

The SMTP credentials are never hardcoded into application source files.

The mailer service is responsible for sending email messages, while background workers trigger email delivery.

**Important:** Successful queue insertion does not guarantee final email delivery. Delivery should be verified through the recipient's inbox and email provider responses.

---

## 10. Database Design

MongoDB is used as the primary database.

The application stores information related to users, events, and bookings.

### User

Stores customer and organizer information.

Important fields include:

- Name
- Email
- Password hash
- Role
- Created timestamp
- Updated timestamp

Passwords are stored as hashes rather than plain text.

### Event

Stores event information and ticket inventory.

The event information includes details such as:

- Event title
- Description
- Venue
- Date
- Ticket availability
- Organizer information
- Event revision information

### Booking

Stores customer ticket reservations.

Important fields include:

- Customer reference
- Event reference
- Ticket quantity
- Booking status
- Idempotency key
- Event revision at booking
- Created timestamp
- Updated timestamp

MongoDB references are used to connect related records.

---

## 11. Important Design Decisions

### 1. JWT Authentication

JWT was selected to authenticate users and protect restricted APIs.

It allows the backend to validate user identity without maintaining traditional server-side session state.

### 2. Role-Based Authorization

Two roles are supported: CUSTOMER and ORGANIZER.

Authorization middleware ensures that users cannot perform operations outside their permissions.

### 3. MongoDB

MongoDB was selected for flexible document-based data storage.

Mongoose provides schema definitions, validation, and database interaction.

### 4. Booking Idempotency

An idempotency key is used to identify repeated booking requests.

This helps prevent duplicate bookings when a client retries a request after a timeout or network failure.

### 5. Background Processing

BullMQ and Redis were selected to process email notifications asynchronously.

This keeps email delivery separate from the main request-response lifecycle.

### 6. Separate Worker Process

A dedicated worker processes queued email jobs.

The API and worker can run as separate processes.

### 7. Environment-Based Configuration

Database credentials, JWT secrets, Redis configuration, and SMTP credentials are stored in environment variables.

Sensitive configuration is not committed to GitHub.

### 8. Email Service Separation

Nodemailer email functionality is separated into a mailer service.

This makes the email-sending logic reusable across different workflows.

### 9. Inventory Consistency

Ticket inventory must remain consistent when multiple customers attempt to book the same event.

The current implementation performs inventory decrement and booking insertion as separate database operations.

This means a failure between these operations can leave inventory and booking records inconsistent.

A production-grade implementation should use a MongoDB transaction or an atomic reservation workflow to ensure inventory and booking changes succeed or fail together.

---

## 12. Installation and Local Setup

### Prerequisites

Install the following:

- Node.js
- npm
- MongoDB or MongoDB Atlas
- Redis
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/Sharayu2703/Event_Booking_System
```

### Step 2: Open the Project

```bash
cd Event_Booking_System
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment Variables

Create a `.env` file in the project root.

Use the variable names defined in `src/config/env.js` and your `.env.example`.

### Step 5: Start MongoDB and Redis

If using Docker Compose:

```bash
docker compose up -d
```

If MongoDB and Redis are already running, reuse those services instead of starting duplicate containers.

---

## 13. Environment Variables

The application uses environment variables for configuration.

Typical configuration includes:

```env
PORT=4000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_secure_jwt_secret

REDIS_URL=your_redis_connection_string

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password

MAIL_FROM=Event Booking <your_authorized_sender@example.com>
ORGANIZER_INVITE_SECRET=your_separate_invitation_secret
CLIENT_ORIGIN=http://localhost:5173
JWT_EXPIRES_IN=1d
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

**Important:**

- Use the exact variable names expected by `src/config/env.js`.
- Use a Gmail App Password when required by your Gmail SMTP setup.
- Never commit the `.env` file.
- Never expose database passwords, JWT secrets, or SMTP credentials.
- Configure production environment variables in the hosting provider dashboard.

---

## 14. Running the Application

The application requires the API server and background worker.

### Start the API Server

Use the start script for the API or the development script while editing.

For example:

```bash
npm start
```

### Start the Background Worker

```bash
npm run worker
```

The worker connects to MongoDB and starts processing background jobs.

Expected worker startup output:

```text
MongoDB connected
Background worker started
```

### Health Check

The API provides a health endpoint.

Example successful response:

```json
{
  "status": "ok",
  "service": "event-booking-api",
  "timestamp": "2026-11-22T10:03:14.316Z"
}
```

Use the actual health route configured in the application.

---

## 15. API Testing

Postman or another HTTP client can be used to exercise the REST APIs. Automated checks are listed below.

The following workflows should be tested:

### Authentication Testing

- Customer registration
- Organizer registration
- Customer login
- Organizer login
- Invalid credentials
- Unauthorized requests

### Event Testing

- Browse events
- Search events
- View event details
- Create an event as an organizer
- Update an event
- Delete an event
- Verify role-based restrictions

### Booking Testing

- Book tickets as a customer
- Verify booking confirmation
- Verify available ticket count
- Retry a request with the same idempotency key
- Verify that duplicate booking is prevented
- Verify insufficient inventory handling

### Email Testing

- Verify actual booking confirmation email delivery.
- Verify event update notification email delivery.
- Verify that the worker processes queued jobs.
- Check failed jobs and SMTP errors.

### Test Results

Audit run: `npm run lint`, `npm run typecheck`, `npm run lint:syntax`, and `npm test` passed. `npm test` reported 2 passing HTTP smoke tests and skipped the opt-in database integration test. SMTP delivery, full database integration, Docker image build, cloud deployment, and k6 load tests are not verified. See `SUBMISSION_NOW.md` for the current submission checklist.

---

## 16. Error Handling and Security

The application includes important security measures:

- JWT-based authentication
- Role-based authorization
- Password hashing
- Environment-based secrets
- Organizer registration depends on a reusable shared invite secret; protect it and rotate or remove it to stop further signups.
- Request validation
- Protected routes
- Idempotency support for booking requests

Production deployment should additionally ensure:

- HTTPS communication
- Restricted CORS origins
- Appropriate request rate limits
- Secure environment configuration
- Database access restrictions
- Monitoring and logging
- Safe error responses without exposing internal secrets

---

## 17. Performance and Load Testing

Performance testing is important because multiple customers may attempt to book tickets for the same event simultaneously.

The objective is to identify the maximum concurrent booking load the system can handle before performance degrades.

### Testing Objectives

- Measure API response times.
- Measure successful booking requests.
- Identify failed or dropped requests.
- Measure error rates.
- Identify inventory consistency issues.
- Determine the system's practical concurrency limits.

### Initial Implementation

The initial implementation should be tested using a load-testing tool such as k6.

Record:

- Number of virtual users
- Number of concurrent booking requests
- Total requests
- Successful requests
- Failed requests
- Average response time
- p95 response time
- Error rate

### Optimization Approach

Potential optimization techniques include:

1. Database indexing.
2. Atomic ticket inventory updates.
3. MongoDB transactions for consistent booking operations.
4. Optimized database queries.
5. Connection pool configuration.
6. Background processing for non-critical operations.
7. Improved queue processing and worker configuration.
8. Appropriate request rate limiting.

### Final Performance Results

Complete this table after running the actual load tests.

| Metric                | Initial Implementation | Optimized Implementation |
| --------------------- | ---------------------: | -----------------------: |
| Concurrent Users      |                    TBD |                      TBD |
| Booking Requests      |                    TBD |                      TBD |
| Successful Bookings   |                    TBD |                      TBD |
| Failed Requests       |                    TBD |                      TBD |
| Average Response Time |                    TBD |                      TBD |
| p95 Response Time     |                    TBD |                      TBD |
| Error Rate            |                    TBD |                      TBD |

**Note:** Performance results must be measured through actual tests. No benchmark values are assumed or fabricated.

---

## 18. Deployment Architecture

The application can be deployed using cloud hosting services.

### Recommended Production Architecture

| Component         | Suggested Hosting                                           |
| ----------------- | ----------------------------------------------------------- |
| Backend API       | A host that supports a long-running Node.js web service     |
| MongoDB           | MongoDB Atlas                                               |
| Redis             | Redis Cloud or another managed Redis provider               |
| Background Worker | A host that supports a separate long-running worker process |
| Email Service     | SMTP provider configured with authorized sender             |

### Important Deployment Consideration

The API entry point starts a persistent Express listener, and the queue worker is also a persistent process. A serverless platform is suitable only if its documented runtime supports the API pattern and a separate persistent worker is hosted elsewhere.

Therefore:

- Deploy the API as a long-running Node.js web service using `npm start` and configure its `PORT` setting.
- Configure MongoDB Atlas as the production database.
- Configure a managed Redis service.
- Deploy the worker as a separate long-running service.
- Configure the same required production environment variables for the API and worker.

Both API and worker must connect to the same MongoDB database and Redis instance.

This repository starts Express by calling `app.listen()` in `src/server.js` and has no serverless adapter or function configuration. It is therefore not ready to deploy as a serverless API without additional adaptation. The Dockerfile defaults to the API command; deploy the worker as a separate service with the same image and the command `npm run worker`. The current `docker-compose.yml` starts only MongoDB and Redis for local development.

Set `PORT`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` (at least 32 characters), `ORGANIZER_INVITE_SECRET`, `CLIENT_ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in the API/worker environment as applicable. Both processes require MongoDB and Redis; the API must also have a valid JWT secret. The worker requires SMTP credentials when it sends a job. Start the API with `npm start` and the worker with `npm run worker`; the health route is `/health`.

### Production URLs

**Backend API:**

```text
https://event-booking-system-sigma-bice.vercel.app/
```

---

## 19. Known Limitations and Future Improvements

The following improvements are recommended for a more production-ready system:

- Use MongoDB transactions or an atomic reservation workflow for booking consistency.
- Improve recovery for failed and stalled background jobs.
- Add monitoring for queue processing and email delivery.
- Implement stronger duplicate-notification protection.
- Add comprehensive integration tests.
- Perform stress testing under different concurrency levels.
- Add structured logging and production monitoring.
- Implement automated deployment pipelines.
- Improve API documentation using Swagger/OpenAPI.
- Add email delivery tracking and retry policies.

---

## 20. Author

**Sharayu Borude**

Computer Engineering Graduate

Project: Event Booking System – Backend API

---

## Conclusion

The Event Booking System demonstrates the implementation of a backend application with authentication, role-based authorization, event management, ticket booking, idempotency, and asynchronous email notifications.

The project uses Node.js, Express.js, MongoDB, Redis, BullMQ, and Nodemailer to build a modular backend architecture.

The main focus is to provide reliable booking workflows, asynchronous communication, and a foundation for performance optimization and scalability.

**Built as a backend engineering project.**
