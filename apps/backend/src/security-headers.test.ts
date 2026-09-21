import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPool } from './test/db.js';

// config is read at import time, so each test loads the app fresh under the environment it needs.
describe('security headers', () => {
  const originalEnv = { ...process.env };
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = 'a-real-secret';
    delete process.env.CORS_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadApp() {
    const { createApp } = await import('./app.js');
    return createApp(pool);
  }

  it('forbids framing, sniffing and referrer leaks on API responses', async () => {
    const response = await request(await loadApp()).get('/api/catalog');

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sends a CSP that allows nothing but forbids framing, with no helmet defaults mixed in', async () => {
    const response = await request(await loadApp()).get('/api/catalog');

    expect(response.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  });

  it('sets the same headers on health checks, 404s and errors', async () => {
    const app = await loadApp();

    for (const path of ['/health', '/api/noexiste']) {
      const response = await request(app).get(path);
      expect(response.headers['x-frame-options'], path).toBe('DENY');
      expect(response.headers['x-content-type-options'], path).toBe('nosniff');
    }
  });

  it('does not send HSTS outside production', async () => {
    const response = await request(await loadApp()).get('/api/catalog');

    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends HSTS in production', async () => {
    process.env.NODE_ENV = 'production';

    const response = await request(await loadApp()).get('/api/catalog').set('X-Forwarded-Proto', 'https');

    expect(response.headers['strict-transport-security']).toMatch(/^max-age=\d+/);
  });

  it('keeps the session cookie and CORS working alongside the headers', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://partner.example';

    const response = await request(await loadApp())
      .patch('/api/registrations/draft')
      .set('Origin', 'https://partner.example')
      .set('X-Forwarded-Proto', 'https')
      .send({ nombre: 'Ana' });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://partner.example');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(String(response.headers['set-cookie'])).toMatch(/^sid=/);
  });
});
