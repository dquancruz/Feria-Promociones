import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// `npm run dev -w apps/backend` runs with the workspace dir as cwd, so dotenv's default
// lookup misses the root .env. Load the workspace one first (if any), then the root one;
// dotenv never overrides a variable that is already set, so real environment variables
// (Docker, Railway, CI) always win. Lives in its own module so it runs before any other
// import reads process.env.
const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
config();
config({ path: path.join(rootDir, '.env') });
