import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:4000';
const token = __ENV.CUSTOMER_TOKEN || '';
const eventId = __ENV.EVENT_ID || '';
const quantity = Number(__ENV.QUANTITY || 1);
const failures = new Counter('unexpected_failures');
const bookingLatency = new Trend('booking_latency_ms', true);
const businessRejections = new Counter('business_rejections');
const successRate = new Rate('booking_success_rate');
export const options = {
  scenarios: { bookings: { executor: 'ramping-vus', startVUs: 1, stages: [
    { duration: '20s', target: Number(__ENV.START_VUS || 10) },
    { duration: '30s', target: Number(__ENV.TARGET_VUS || 50) },
    { duration: '20s', target: Number(__ENV.MAX_VUS || 100) },
    { duration: '10s', target: 0 }
  ], gracefulRampDown: '5s' } },
  thresholds: { http_req_duration: ['p(95)<1500'], unexpected_failures: ['count<10'] }
};
export default function () {
  if (!token || !eventId) { throw new Error('Set CUSTOMER_TOKEN and EVENT_ID environment variables.'); }
  const key = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const res = http.post(`${baseUrl}/api/events/${eventId}/bookings`, JSON.stringify({ quantity }), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, timeout: '15s'
  });
  bookingLatency.add(res.timings.duration);
  const accepted = res.status === 201 || res.status === 200;
  const expectedRejection = res.status === 409 || res.status === 429;
  successRate.add(accepted);
  if (expectedRejection) businessRejections.add(1);
  if (!(accepted || expectedRejection)) failures.add(1);
  check(res, { 'status is accepted or expected business/rate-limit rejection': () => accepted || expectedRejection });
  sleep(0.1);
}
