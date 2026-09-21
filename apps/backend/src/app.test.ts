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
