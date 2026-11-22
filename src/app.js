import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import eventRoutes from "./routes/events.js";
import bookingRoutes from "./routes/bookings.js";
import { notFound, errorHandler } from "./middleware/errors.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin:
      env.clientOrigin === "*"
        ? "*"
        : env.clientOrigin.split(",").map((x) => x.trim()),
    credentials: false,
  }),
);

app.use(express.json({ limit: "100kb" }));

app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests; retry later" },
  }),
);

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Welcome to Event Booking API",
    service: "event-booking-api",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      events: "/api/events",
      bookings: "/api",
    },
  });
});

// Health route
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "event-booking-api",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api", bookingRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
