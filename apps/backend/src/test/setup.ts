import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Test files run with the workspace dir as cwd, so dotenv's default lookup
// misses the root .env — point it there explicitly (a no-op if DATABASE_URL
// is already set, e.g. in CI or `docker compose exec`).
const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
config({ path: path.join(rootDir, '.env') });
