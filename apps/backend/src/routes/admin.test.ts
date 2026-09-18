import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb } from '../test/db.js';

const ADMIN_KEY = 'test-admin-key';

describe('admin registrations', () => {
  let pool: Pool;
  let serviceId: string;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO catalog_items (type, name, price_cents) VALUES ('service', 'Servicio A', 80000) RETURNING id`,
    );
    serviceId = rows[0].id;
  });

  async function confirmRegistration(app: ReturnType<typeof createApp>) {
    const agent = request.agent(app);
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: '2026-10-01T15:00:00.000Z',
      selectedItemIds: [serviceId],
    });
    await agent.post('/api/registrations/confirm');
  }

  it('rejects requests without the admin key', async () => {
    const response = await request(createApp(pool)).get('/api/admin/registrations');
    expect(response.status).toBe(401);
  });

  it('returns only confirmed registrations with the admin key', async () => {
    const app = createApp(pool);
    await confirmRegistration(app);
    await request.agent(app).get('/api/registrations/draft'); // an unrelated, unconfirmed draft session

    const response = await request(app).get('/api/admin/registrations').set('x-admin-key', ADMIN_KEY);

    expect(response.status).toBe(200);
    expect(response.body.registrations).toHaveLength(1);
    expect(response.body.registrations[0]).toMatchObject({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      items: ['Servicio A'],
    });
  });

  it('exports the CSV with the expected header row', async () => {
    const app = createApp(pool);
    await confirmRegistration(app);

    const response = await request(app).get('/api/admin/registrations.csv').set('x-admin-key', ADMIN_KEY);

    expect(response.status).toBe(200);
    expect(response.text.split('\r\n')[0]).toBe(
      'confirmationId,nombre,apellidos,email,attendAt,items,serviceDiscountPct,productDiscountPct,servicesTotal,productsTotal,grandTotal,confirmedAt',
    );
  });
});
