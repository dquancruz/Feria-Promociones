import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, testAttendAt } from '../test/db.js';

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
      attendAt: testAttendAt(),
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
      items: [{ name: 'Servicio A', type: 'service', priceCents: 80000 }],
      outOfWindow: false,
    });
  });

  it('exports the CSV with the expected header row', async () => {
    const app = createApp(pool);
    await confirmRegistration(app);

    const { status, bytes } = await downloadCsv(app);

    expect(status).toBe(200);
    expect(decodeCsv(bytes).split('\r\n')[0]).toBe(
      'confirmationId,nombre,apellidos,email,attendAt,items,serviceDiscountPct,productDiscountPct,servicesTotal,productsTotal,grandTotal,confirmedAt',
    );
  });

  it('starts the CSV with a UTF-8 BOM so Excel shows accents correctly', async () => {
    const { bytes } = await downloadCsv(createApp(pool));

    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('neutralizes spreadsheet formulas in exported cells', async () => {
    const names = ['=HYPERLINK("http://evil.test","Clic")', '+1+1', '-2+3', '@SUM(1)', '\tcmd', '\rcmd'];
    for (const [i, nombre] of names.entries()) {
      await pool.query(
        `INSERT INTO registrations (session_id, status, nombre, apellidos, email, confirmed_at)
         VALUES ($1, 'confirmed', $2, 'Lopez', $3, now())`,
        [`session-${i}`, nombre, `user${i}@example.com`],
      );
    }

    const { bytes } = await downloadCsv(createApp(pool));
    const csv = decodeCsv(bytes);

    for (const nombre of ['=HYPERLINK', '+1+1', '-2+3', '@SUM(1)', '\tcmd', '\rcmd']) {
      expect(csv).toContain(`'${nombre}`);
      expect(csv).not.toContain(`,${nombre}`);
      expect(csv).not.toContain(`,"${nombre}`);
    }
  });

  it('keeps ordinary text untouched and quoted when it has commas or quotes', async () => {
    await pool.query(
      `INSERT INTO registrations (session_id, status, nombre, apellidos, email, confirmed_at)
       VALUES ('s', 'confirmed', 'María "Mari"', 'Pérez, Gómez', 'maria@example.com', now())`,
    );

    const csv = decodeCsv((await downloadCsv(createApp(pool))).bytes);

    expect(csv).toContain(',"María ""Mari""","Pérez, Gómez",maria@example.com,');
  });

  it('exports every confirmed registration, not just the first page', async () => {
    await pool.query(
      `INSERT INTO registrations (session_id, status, nombre, apellidos, email, confirmed_at)
       SELECT 'session-' || n, 'confirmed', 'Nombre ' || n, 'Apellido', 'user' || n || '@example.com',
              now() - (n || ' minutes')::interval
       FROM generate_series(1, 450) AS n`,
    );

    const csv = decodeCsv((await downloadCsv(createApp(pool))).bytes);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(451);
    expect(new Set(lines.slice(1).map((line) => line.split(',')[3])).size).toBe(450);
  });

  async function downloadCsv(app: ReturnType<typeof createApp>) {
    const response = await request(app)
      .get('/api/admin/registrations.csv')
      .set('x-admin-key', ADMIN_KEY)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    return { status: response.status, bytes: response.body as Buffer };
  }

  function decodeCsv(bytes: Buffer): string {
    const text = bytes.toString('utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }
});
