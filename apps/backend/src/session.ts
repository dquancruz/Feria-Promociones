import connectPgSimple from 'connect-pg-simple';
import session, { type SessionOptions } from 'express-session';
import type { Pool } from 'pg';
import { config } from './config.js';

export function createSessionMiddleware(pool: Pool): ReturnType<typeof session> {
  const PgSession = connectPgSimple(session);

  const options: SessionOptions = {
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    // A session only reaches the store, and the browser only gets its cookie, once something is
    // written to it. Merely opening the form (or a bot hitting the API) leaves no row behind.
    // Whatever creates a draft must therefore write to the session first: see bindDraftToSession.
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      // The browser reaches the API through the frontend's own origin (/api is proxied),
      // so this is a first-party cookie. Lax is enough, and unlike SameSite=None it is
      // not blocked by Safari's or private windows' third-party cookie rules.
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  };

  return session(options);
}

declare module 'express-session' {
  interface SessionData {
    // Set when a draft row is created for this session. Its only job is to make the session
    // "modified" so it is persisted and its cookie is sent; without it the id would change
    // on every request and the draft (keyed by session id) could never be found again.
    hasDraft?: boolean;
    isAdmin?: boolean;
    // Epoch milliseconds of the last admin request; drives the idle timeout.
    adminLastSeen?: number;
  }
}
