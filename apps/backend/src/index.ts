import 'dotenv/config';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { seedCatalog, seedEvent } from './db/seed.js';

const port = Number(process.env.PORT ?? 4000);
const pool = createPool();

async function main(): Promise<void> {
  await runMigrations(pool);
  await seedCatalog(pool);
  await seedEvent(pool);

  createApp(pool).listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start backend', err);
  process.exit(1);
});
