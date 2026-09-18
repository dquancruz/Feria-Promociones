import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, testAttendAt } from '../test/db.js';

describe('registrations draft/confirm flow', () => {
  let pool: Pool;
  let serviceA: string;
  let serviceB: string;
  let productA: string;
  let productB: string;
  let productC: string;

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
       ('product', 'Producto B', 5000),
       ('product', 'Producto C', 5000)
       RETURNING id, name`,
    );
    serviceA = rows.find((r) => r.name === 'Servicio A')!.id;
    serviceB = rows.find((r) => r.name === 'Servicio B')!.id;
    productA = rows.find((r) => r.name === 'Producto A')!.id;
    productB = rows.find((r) => r.name === 'Producto B')!.id;
    productC = rows.find((r) => r.name === 'Producto C')!.id;
  });

  it('creates an empty draft on first contact and persists the session cookie', async () => {
    const agent = request.agent(createApp(pool));
    const response = await agent.get('/api/registrations/draft');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'draft',
      nombre: '',
      apellidos: '',
      email: '',
      attendAt: null,
      selectedItemIds: [],
    });
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('PATCH updates fields and selections, returning a live discount preview', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');

    const response = await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      selectedItemIds: [serviceA, serviceB, productA, productB, productC],
    });

    expect(response.status).toBe(200);
    expect(response.body.nombre).toBe('Ana');
    expect(response.body.selectedItemIds).toHaveLength(5);
    expect(response.body.discountPreview).toEqual({ serviceDiscountPct: 5, productDiscountPct: 3 });
  });

  it('keeps separate sessions isolated from each other', async () => {
    const agentOne = request.agent(createApp(pool));
    const agentTwo = request.agent(createApp(pool));

    await agentOne.patch('/api/registrations/draft').send({ nombre: 'Uno' });
    await agentTwo.get('/api/registrations/draft');

    const draftTwo = await agentTwo.get('/api/registrations/draft');
    expect(draftTwo.body.nombre).toBe('');
  });

  it('rejects confirm when required fields are missing', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');

    const response = await agent.post('/api/registrations/confirm');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.fieldErrors).toMatchObject({
      nombre: expect.any(String),
      apellidos: expect.any(String),
      email: expect.any(String),
      attendAt: expect.any(String),
      selectedItemIds: expect.any(String),
    });
  });

  it('confirms a valid draft, recomputing discounts and totals server-side', async () => {
    const app = createApp(pool);
    const agent = request.agent(app);
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: testAttendAt(),
      selectedItemIds: [serviceA, serviceB, productA, productB, productC],
    });

    const response = await agent.post('/api/registrations/confirm');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'confirmed',
      serviceDiscountPct: 5,
      productDiscountPct: 3,
      servicesTotal: 1520,
      productsTotal: 145.5,
      grandTotal: 1665.5,
    });
    expect(response.body.confirmationId).toEqual(expect.any(String));
  });

  it('is idempotent on a repeat confirm, returning 409 with the existing confirmation', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: testAttendAt(),
      selectedItemIds: [serviceA, productA, productB, productC],
    });
    const first = await agent.post('/api/registrations/confirm');

    const second = await agent.post('/api/registrations/confirm');

    expect(second.status).toBe(409);
    expect(second.body).toEqual(first.body);
  });

  it('persists a field cleared to an empty string, instead of ignoring the update', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({ nombre: 'Diego' });

    await agent.patch('/api/registrations/draft').send({ nombre: '' });
    const response = await agent.get('/api/registrations/draft');

    expect(response.body.nombre).toBe('');
  });

  it('rejects confirm with the field error when a required field was cleared after being valid', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: testAttendAt(),
      selectedItemIds: [serviceA],
    });
    await agent.patch('/api/registrations/draft').send({ nombre: '' });

    const response = await agent.post('/api/registrations/confirm');

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toMatchObject({ nombre: expect.any(String) });
  });

  it('rejects confirm when attendAt is in the past', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: '1990-01-01T15:00:00.000Z',
      selectedItemIds: [serviceA],
    });

    const response = await agent.post('/api/registrations/confirm');

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toMatchObject({ attendAt: expect.any(String) });
  });

  it('resets the session without deleting the confirmed registration', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: testAttendAt(),
      selectedItemIds: [serviceA],
    });
    await agent.post('/api/registrations/confirm');

    const resetResponse = await agent.post('/api/registrations/session/reset');
    expect(resetResponse.status).toBe(204);

    const draftResponse = await agent.get('/api/registrations/draft');
    expect(draftResponse.body).toEqual({
      status: 'draft',
      nombre: '',
      apellidos: '',
      email: '',
      attendAt: null,
      selectedItemIds: [],
    });

    const { rows } = await pool.query('SELECT status FROM registrations WHERE nombre = $1', ['Ana']);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');
  });

  it('ignores unknown or inactive catalog item ids sent by the client', async () => {
    const agent = request.agent(createApp(pool));
    await agent.get('/api/registrations/draft');

    const response = await agent
      .patch('/api/registrations/draft')
      .send({ selectedItemIds: [serviceA, '00000000-0000-0000-0000-000000000000'] });

    expect(response.status).toBe(200);
    expect(response.body.selectedItemIds).toEqual([serviceA]);
  });
});
