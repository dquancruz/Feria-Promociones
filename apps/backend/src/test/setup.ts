import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Test files run with the workspace dir as cwd, so dotenv's default lookup
// misses the root .env — point it there explicitly (a no-op if DATABASE_URL
// is already set, e.g. in CI or `docker compose exec`).
const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
config({ path: path.join(rootDir, '.env') });

// Lets the admin router mount during tests without requiring every test file to know
// about it; harmless for tests that never hit /api/admin. Always overridden (not `??=`)
// so a developer's real ADMIN_API_KEY in their local .env can't desync it from the
// literal 'test-admin-key' that admin.test.ts asserts against.
process.env.ADMIN_API_KEY = 'test-admin-key';
