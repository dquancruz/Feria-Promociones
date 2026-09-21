import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPool } from './test/db.js';

// The frontend proxies /api, so the browser talks to a single origin. These tests load
// the app the way it runs in production (config is read at import time).
describe('same-origin deployment', () => {
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
    process.env.NODE_ENV = 'production';
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

  it('issues the session cookie as first-party: Lax, Secure and HttpOnly', async () => {
    const app = await loadApp();

    // The cookie is only issued once a visitor saves something, so start a draft.
    const response = await request(app)
      .patch('/api/registrations/draft')
      .set('X-Forwarded-Proto', 'https')
      .send({ nombre: 'Ana' });

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('SameSite=None');
  });

  it('sends no CORS headers when CORS_ORIGIN is not set', async () => {
    const app = await loadApp();

    const response = await request(app).get('/api/catalog').set('Origin', 'https://elsewhere.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still answers CORS for the configured origin when CORS_ORIGIN is set', async () => {
    process.env.CORS_ORIGIN = 'https://partner.example';
    const app = await loadApp();

    const response = await request(app).get('/api/catalog').set('Origin', 'https://partner.example');

    expect(response.headers['access-control-allow-origin']).toBe('https://partner.example');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
