import type { Pool } from 'pg';
import { deleteStaleDrafts } from './registrations.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function cleanUp(pool: Pool): Promise<void> {
  try {
    const removed = await deleteStaleDrafts(pool);
    if (removed > 0) console.log(`Removed ${removed} stale draft registration(s).`);
  } catch (err) {
    // Housekeeping must never take the API down; it simply runs again next time.
    console.error('Draft cleanup failed', err);
  }
}

// Runs once now and then every six hours. The session table cleans itself
// (connect-pg-simple), so only drafts need this.
export function startDraftCleanup(pool: Pool): NodeJS.Timeout {
  void cleanUp(pool);
  return setInterval(() => void cleanUp(pool), SIX_HOURS_MS).unref();
}
