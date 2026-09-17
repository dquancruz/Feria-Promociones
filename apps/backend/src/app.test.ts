import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
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
