import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createApp } from './app.js';
import { errorHandler } from './middleware/error-handler.js';
import { createTestPool } from './test/db.js';

describe('GET /health', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns ok status without touching the session store', async () => {
    const response = await request(createApp(pool)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 200 even when the database is unreachable', async () => {
    const brokenPool = new Pool({ connectionString: 'postgresql://user:pass@127.0.0.1:1/doesnotexist' });
    const response = await request(createApp(brokenPool)).get('/health');
    expect(response.status).toBe(200);
    await brokenPool.end();
  });
});

describe('GET /health/ready', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns ok when the database is reachable', async () => {
    const response = await request(createApp(pool)).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const brokenPool = new Pool({ connectionString: 'postgresql://user:pass@127.0.0.1:1/doesnotexist' });
    const response = await request(createApp(brokenPool)).get('/health/ready');
    expect(response.status).toBe(503);
    await brokenPool.end();
  });
});

describe('request body errors', () => {
  let pool: Pool;
  let consoleError: MockInstance;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('answers 400 for malformed JSON without logging a stack trace', async () => {
    const response = await request(createApp(pool))
      .patch('/api/registrations/draft')
      .set('content-type', 'application/json')
      .send('{"nombre": ');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_json', message: expect.any(String) });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('answers 413 when the body is over the size limit without logging a stack trace', async () => {
    const selectedItemIds = Array.from({ length: 3000 }, () => '3f2b8c1e-5d4a-4b7e-9c6f-1a2b3c4d5e6f');

    const response = await request(createApp(pool)).patch('/api/registrations/draft').send({ selectedItemIds });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: 'payload_too_large', message: expect.any(String) });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('answers 400 for a body in an unsupported encoding', async () => {
    const response = await request(createApp(pool))
      .patch('/api/registrations/draft')
      .set('content-type', 'application/json')
      .set('content-encoding', 'nonsense')
      .send('{}');

    expect(response.status).toBe(400);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('still answers 500 and logs when the error is a real, unexpected one', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('something broke');
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'internal_server_error' });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe('unknown API routes', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('answers 404 JSON instead of the default HTML page', async () => {
    const response = await request(createApp(pool)).get('/api/noexiste');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 404 JSON for an unknown path under a real router, whatever the method', async () => {
    const app = createApp(pool);

    const wrongPath = await request(app).get('/api/registrations/nope');
    const wrongMethod = await request(app).delete('/api/catalog');

    expect(wrongPath.status).toBe(404);
    expect(wrongPath.body).toEqual({ error: 'not_found' });
    expect(wrongMethod.status).toBe(404);
    expect(wrongMethod.body).toEqual({ error: 'not_found' });
  });

  it('leaves the health endpoints and the real API routes alone', async () => {
    const app = createApp(pool);

    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/health/ready')).status).toBe(200);
    expect((await request(app).get('/api/registrations/draft')).status).toBe(200);
  });
});

describe('general API rate limit', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('limits an IP across the whole /api, not just registrations', async () => {
    const app = createApp(pool, { apiRateLimitPerIp: 4 });

    const statuses: number[] = [];
    for (const path of ['/api/catalog', '/api/event', '/api/admin/me', '/api/catalog', '/api/event']) {
      statuses.push((await request(app).get(path)).status);
    }

    expect(statuses.slice(0, 4)).not.toContain(429);
    expect(statuses[4]).toBe(429);
  });

  it('answers with the same Spanish JSON message as the other limiters', async () => {
    const app = createApp(pool, { apiRateLimitPerIp: 1 });
    await request(app).get('/api/catalog');

    const response = await request(app).get('/api/catalog');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'rate_limited', message: 'Demasiadas solicitudes, espera un momento.' });
  });

  it('never limits the health endpoints', async () => {
    const app = createApp(pool, { apiRateLimitPerIp: 1 });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await request(app).get('/health')).status);
      statuses.push((await request(app).get('/health/ready')).status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it('gives each app its own counters, so tests do not share a budget', async () => {
    const first = createApp(pool, { apiRateLimitPerIp: 1 });
    await request(first).get('/api/catalog');
    expect((await request(first).get('/api/catalog')).status).toBe(429);

    const second = createApp(pool, { apiRateLimitPerIp: 1 });

    expect((await request(second).get('/api/catalog')).status).toBe(200);
  });

  it('is generous by default and leaves the registrations limits as they were', async () => {
    const app = createApp(pool);

    const statuses: number[] = [];
    for (let i = 0; i < 100; i++) {
      statuses.push((await request(app).get('/api/catalog')).status);
    }

    expect(statuses.filter((status) => status === 429)).toHaveLength(0);
  });

  it('does not stop the registrations per-session limit from applying first when it is lower', async () => {
    const app = createApp(pool, { rateLimits: { perSession: 2, perIp: 1000 }, apiRateLimitPerIp: 1000 });
    const agent = request.agent(app);
    await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

    const statuses = [(await agent.get('/api/registrations/draft')).status, (await agent.get('/api/registrations/draft')).status];

    expect(statuses).toEqual([200, 429]);
  });
});
