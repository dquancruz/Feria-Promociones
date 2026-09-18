import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb } from '../test/db.js';

const ADMIN_KEY = 'test-admin-key';

function sessionCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((value) => value.startsWith('sid='));
  if (!cookie) throw new Error('Response did not set the sid cookie');
  return cookie.split(';')[0];
}

describe('admin authentication', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
  });

  it('is not logged in by default', async () => {
    const app = createApp(pool);

    expect((await request(app).get('/api/admin/me')).body).toEqual({ isAdmin: false });
    expect((await request(app).get('/api/admin/registrations')).status).toBe(401);
    expect((await request(app).get('/api/admin/event')).status).toBe(401);
  });

  it('rejects a wrong key without granting access', async () => {
    const agent = request.agent(createApp(pool));

    const login = await agent.post('/api/admin/login').send({ key: 'not-the-key' });

    expect(login.status).toBe(401);
    expect((await agent.get('/api/admin/me')).body).toEqual({ isAdmin: false });
    expect((await agent.get('/api/admin/registrations')).status).toBe(401);
  });

  it('rejects a login without a key as a validation error', async () => {
    const response = await request(createApp(pool)).post('/api/admin/login').send({});

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.key).toBeDefined();
  });

  it('logs in with the right key and then needs no header on later requests', async () => {
    const agent = request.agent(createApp(pool));

    const login = await agent.post('/api/admin/login').send({ key: ADMIN_KEY });

    expect(login.status).toBe(200);
    expect(login.body).toEqual({ isAdmin: true });
    expect((await agent.get('/api/admin/me')).body).toEqual({ isAdmin: true });
    expect((await agent.get('/api/admin/registrations')).status).toBe(200);
  });

  it('issues a new session id on login, so one known beforehand is worthless', async () => {
    const app = createApp(pool);
    const before = await request(app).get('/api/registrations/draft');
    const oldCookie = sessionCookie(before);

    const login = await request(app).post('/api/admin/login').set('Cookie', oldCookie).send({ key: ADMIN_KEY });
    const newCookie = sessionCookie(login);

    expect(newCookie).not.toBe(oldCookie);
    expect((await request(app).get('/api/admin/me').set('Cookie', newCookie)).body).toEqual({ isAdmin: true });
    expect((await request(app).get('/api/admin/me').set('Cookie', oldCookie)).body).toEqual({ isAdmin: false });
  });

  it('logs out by destroying the session', async () => {
    const app = createApp(pool);
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/login').send({ key: ADMIN_KEY });
    const adminCookie = sessionCookie(login);

    const logout = await agent.post('/api/admin/logout');

    expect(logout.status).toBe(204);
    expect((await agent.get('/api/admin/me')).body).toEqual({ isAdmin: false });
    expect((await agent.get('/api/admin/registrations')).status).toBe(401);
    // The old cookie must not work again, even if someone kept a copy of it.
    expect((await request(app).get('/api/admin/me').set('Cookie', adminCookie)).body).toEqual({ isAdmin: false });
  });

  it('still accepts the x-admin-key header for scripts', async () => {
    const app = createApp(pool);

    const withKey = await request(app).get('/api/admin/registrations').set('x-admin-key', ADMIN_KEY);
    const withWrongKey = await request(app).get('/api/admin/registrations').set('x-admin-key', 'nope');
    const me = await request(app).get('/api/admin/me').set('x-admin-key', ADMIN_KEY);

    expect(withKey.status).toBe(200);
    expect(withWrongKey.status).toBe(401);
    expect(me.body).toEqual({ isAdmin: true });
  });

  it('rate-limits login attempts, even for the right key once the budget is spent', async () => {
    const app = createApp(pool, { admin: { loginAttemptsPerMinute: 3 } });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await request(app).post('/api/admin/login').send({ key: 'wrong' })).status).toBe(401);
    }
    const blocked = await request(app).post('/api/admin/login').send({ key: ADMIN_KEY });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('rate_limited');
  });

  it('does not spend the login budget on other admin routes', async () => {
    const app = createApp(pool, { admin: { loginAttemptsPerMinute: 2 } });

    for (let i = 0; i < 5; i += 1) {
      await request(app).get('/api/admin/registrations').set('x-admin-key', ADMIN_KEY);
    }

    expect((await request(app).post('/api/admin/login').send({ key: ADMIN_KEY })).status).toBe(200);
  });
});
