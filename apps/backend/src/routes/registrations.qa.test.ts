import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, testAttendAt } from '../test/db.js';

// Regression tests for the issues found during exploratory QA of the registration API.
describe('registrations QA regressions', () => {
  let pool: Pool;
  let serviceA: string;
  let serviceB: string;
  let productA: string;
  let productB: string;

  const validFields = {
    nombre: 'Ana',
    apellidos: 'Lopez',
    email: 'ana@example.com',
    attendAt: testAttendAt(),
  };

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const { rows } = await pool.query<{ id: string; name: string }>(
      `INSERT INTO catalog_items (type, name, price_cents) VALUES
       ('service', 'Servicio A', 80000),
       ('service', 'Servicio B', 80000),
       ('product', 'Producto A', 5000),
       ('product', 'Producto B', 5000)
       RETURNING id, name`,
    );
    serviceA = rows.find((r) => r.name === 'Servicio A')!.id;
    serviceB = rows.find((r) => r.name === 'Servicio B')!.id;
    productA = rows.find((r) => r.name === 'Producto A')!.id;
    productB = rows.find((r) => r.name === 'Producto B')!.id;
  });

  async function readyToConfirm(app: ReturnType<typeof createApp>, overrides: Record<string, unknown> = {}) {
    const agent = request.agent(app);
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({ ...validFields, selectedItemIds: [serviceA], ...overrides });
    return agent;
  }

  describe('draft autosave', () => {
    it('keeps autosaving while the email is half typed', async () => {
      const agent = request.agent(createApp(pool));
      await agent.get('/api/registrations/draft');

      const response = await agent.patch('/api/registrations/draft').send({
        nombre: 'Carla',
        apellidos: 'Pérez',
        email: 'carla@gmail',
        selectedItemIds: [productA, productB],
      });
      const reloaded = await agent.get('/api/registrations/draft');

      expect(response.status).toBe(200);
      expect(reloaded.body).toMatchObject({ nombre: 'Carla', apellidos: 'Pérez', email: 'carla@gmail' });
      expect(reloaded.body.selectedItemIds).toHaveLength(2);
    });

    it('still rejects a malformed email at confirm time', async () => {
      const agent = await readyToConfirm(createApp(pool), { email: 'carla@gmail' });

      const response = await agent.post('/api/registrations/confirm');

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toMatchObject({ email: 'Email inválido' });
    });

    it('trims the email of a draft', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send({ email: '  ana@example.com  ' });

      const response = await agent.get('/api/registrations/draft');

      expect(response.body.email).toBe('ana@example.com');
    });

    it('rejects oversized draft fields with Spanish messages', async () => {
      const agent = request.agent(createApp(pool));

      const response = await agent.patch('/api/registrations/draft').send({
        nombre: 'A'.repeat(101),
        apellidos: 'B'.repeat(101),
        email: `${'c'.repeat(250)}@x.co`,
      });

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toEqual({
        nombre: [expect.stringContaining('100 caracteres')],
        apellidos: [expect.stringContaining('100 caracteres')],
        email: [expect.stringContaining('254 caracteres')],
      });
    });

    it('accepts names of exactly 100 characters', async () => {
      const agent = request.agent(createApp(pool));

      const response = await agent.patch('/api/registrations/draft').send({ nombre: 'A'.repeat(100) });

      expect(response.status).toBe(200);
    });

    it('reports validation errors in Spanish, including wrong types', async () => {
      const agent = request.agent(createApp(pool));

      const response = await agent.patch('/api/registrations/draft').send({
        nombre: 5,
        email: 7,
        attendAt: 'mañana',
        selectedItemIds: ['no-es-un-uuid'],
      });

      expect(response.status).toBe(400);
      const messages = Object.values(response.body.fieldErrors).flat() as string[];
      expect(messages).toHaveLength(4);
      for (const message of messages) {
        expect(message).not.toMatch(/invalid|expected|required|string/i);
      }
    });

    it('survives concurrent PATCHes on the same session without a 5xx', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          agent.patch('/api/registrations/draft').send({
            selectedItemIds: i % 2 === 0 ? [serviceA, serviceB, productA] : [serviceA, productA, productB],
          }),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      const { rows } = await pool.query('SELECT count(*)::int AS count FROM registration_items');
      expect(rows[0].count).toBe(3);
    });
  });

  describe('confirmation', () => {
    it('drops items deactivated after selection, so the stored and shown discounts agree', async () => {
      const agent = await readyToConfirm(createApp(pool), { selectedItemIds: [serviceA, serviceB] });
      await pool.query('UPDATE catalog_items SET active = false WHERE id = $1', [serviceB]);

      const response = await agent.post('/api/registrations/confirm');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ serviceDiscountPct: 0, servicesTotal: 800, grandTotal: 800 });
      const { rows: items } = await pool.query('SELECT catalog_item_id FROM registration_items');
      expect(items.map((row) => row.catalog_item_id)).toEqual([serviceA]);
      const { rows: stored } = await pool.query(
        "SELECT service_discount_pct::float AS pct FROM registrations WHERE status = 'confirmed'",
      );
      expect(stored[0].pct).toBe(0);
      const again = await agent.get('/api/registrations/draft');
      expect(again.body).toMatchObject({ serviceDiscountPct: 0, grandTotal: 800 });
    });

    it('reports the stored discount percentages in the confirmation', async () => {
      const agent = await readyToConfirm(createApp(pool), { selectedItemIds: [serviceA, serviceB] });
      await agent.post('/api/registrations/confirm');
      await pool.query("UPDATE registrations SET service_discount_pct = 4 WHERE status = 'confirmed'");

      const response = await agent.get('/api/registrations/draft');

      expect(response.body.serviceDiscountPct).toBe(4);
    });

    it('rejects a second confirmation with the same email, ignoring case', async () => {
      const app = createApp(pool);
      const first = await readyToConfirm(app);
      const second = await readyToConfirm(app, { email: 'ANA@Example.com', selectedItemIds: [serviceB] });

      expect((await first.post('/api/registrations/confirm')).status).toBe(200);
      const response = await second.post('/api/registrations/confirm');

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toEqual({ email: 'Este email ya tiene una asistencia confirmada.' });
      const { rows } = await pool.query("SELECT count(*)::int AS count FROM registrations WHERE status = 'confirmed'");
      expect(rows[0].count).toBe(1);
    });

    it('rejects a second confirmation with the same email, ignoring surrounding spaces', async () => {
      const app = createApp(pool);
      const first = await readyToConfirm(app);
      const second = await readyToConfirm(app, { email: '  ana@example.com  ', selectedItemIds: [serviceB] });

      expect((await first.post('/api/registrations/confirm')).status).toBe(200);
      const response = await second.post('/api/registrations/confirm');

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toEqual({ email: 'Este email ya tiene una asistencia confirmada.' });
    });

    it('lets only one of two simultaneous confirmations for the same email through', async () => {
      const app = createApp(pool);
      const agents = await Promise.all([
        readyToConfirm(app),
        readyToConfirm(app, { email: 'Ana@example.com', selectedItemIds: [serviceB] }),
      ]);

      const responses = await Promise.all(agents.map((agent) => agent.post('/api/registrations/confirm')));

      expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    });
  });

  describe('rate limiting', () => {
    it('does not block a whole venue sharing one IP after 30 requests in a minute', async () => {
      const app = createApp(pool);

      const statuses: number[] = [];
      for (let i = 0; i < 40; i++) {
        statuses.push((await request(app).get('/api/registrations/draft')).status);
      }

      expect(statuses.filter((status) => status === 429)).toHaveLength(0);
    });

    it('limits a single session that floods the API without affecting other sessions', async () => {
      const app = createApp(pool, { rateLimits: { perSession: 5, perIp: 1000 } });
      const agent = request.agent(app);
      // The per-session counter is keyed by the session id, which only stays the same once
      // the visitor has saved something. This first request counts towards the limit too.
      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await agent.get('/api/registrations/draft')).status);
      }
      const other = await request(app).get('/api/registrations/draft');

      expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
      expect(other.status).toBe(200);
    });

    it('limits an IP as a safety net across sessions', async () => {
      const app = createApp(pool, { rateLimits: { perSession: 1000, perIp: 3 } });

      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push((await request(app).get('/api/registrations/draft')).status);
      }

      expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it('answers rate-limited requests with a Spanish JSON message', async () => {
      const app = createApp(pool, { rateLimits: { perSession: 1, perIp: 1000 } });
      const agent = request.agent(app);
      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

      const response = await agent.get('/api/registrations/draft');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        error: 'rate_limited',
        message: 'Demasiadas solicitudes, espera un momento.',
      });
    });
  });
});
