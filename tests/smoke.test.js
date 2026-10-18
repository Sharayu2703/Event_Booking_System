import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { createServer } from 'node:http';

// Dependency-light smoke test for public middleware and routes; database/Redis integration tests need services.
test('GET /health responds with service status', async () => {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'event-booking-api');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('unknown route returns 404 JSON', async () => {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/does-not-exist`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'Route not found');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
