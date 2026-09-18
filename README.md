# Feria de Promociones

**Live**: https://frontend-production-396f7.up.railway.app

A web platform for an annual promotions fair. Clients confirm their attendance and
select the services and/or products they're interested in ahead of time, so a
personalized promotions portfolio can be prepared for each confirmed client.
Interest-based discounts are calculated automatically and shown to the client
before they confirm.

## Tech stack

- **Frontend**: React + TypeScript, built with Vite.
- **Backend**: Node.js + TypeScript, Express.
- **Database**: PostgreSQL.
- **Shared package**: common types and discount-calculation logic shared between
  frontend and backend.
- **Infrastructure**: Docker per service, orchestrated locally with Docker
  Compose, deployed as separate services in the cloud.

This is an npm-workspaces monorepo:

```
apps/
  frontend/   React + Vite client
  backend/    Express API
packages/
  shared/     Types and logic shared by both apps
```

## Running locally

### Prerequisites

- Node.js 20+
- npm 10+
- Docker and Docker Compose (optional, for running everything containerized)

### Install dependencies

```bash
npm install
```

### Environment variables

Copy the example env file and adjust values as needed:

```bash
cp .env.example .env
```

| Variable | Required in production | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | Postgres connection string. |
| `SESSION_SECRET` | Yes | `dev-secret` (non-production only) | Signs the session cookie. |
| `CORS_ORIGIN` | No | unset — no CORS headers | Only for a browser app on another origin calling the API directly. The bundled frontend is same-origin (see below). |
| `PORT` | No | `4000` (backend) / `4173` (frontend) | Railway assigns its own at runtime and takes priority. |
| `TRUST_PROXY_HOPS` | No | `1` (production only) | Number of reverse proxies in front of the backend; used to read the real client IP. |
| `ADMIN_API_KEY` | No | unset — admin routes don't mount | Enables `/api/admin` and the `/admin` view (see below). |
| `API_PROXY_TARGET` | Yes (frontend service) | — | Backend URL the frontend server forwards `/api` and `/health` to, e.g. `http://backend.railway.internal:4000`. Read at runtime. |

The backend fails fast on startup if a variable marked "required in
production" is missing while `NODE_ENV=production` — see
`apps/backend/src/config.ts`.

### Run in development mode

In two terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The frontend dev server runs on `http://localhost:5173` and the backend on
`http://localhost:4000`. Vite forwards `/api` to the backend, so the browser
still only talks to one origin.

### Run with Docker Compose

```bash
docker compose up --build
```

This starts PostgreSQL, the backend API, and the frontend (on
`http://localhost:4173`), wired together with the environment variables in
`docker-compose.yml` and `.env`. The backend seeds the catalog
automatically on startup if the `catalog_items` table is empty, and creates a
sample event (open, three consecutive days a month out, 09:00 to 18:00) if none
exists yet — no separate seed step to run.

### Admin view

With `ADMIN_API_KEY` set, visiting `/admin` on the frontend shows a table of
confirmed registrations — the input for building each client's personalized
promotions portfolio. It asks for the key and calls the API (through the same
origin as the rest of the app):

- `POST /api/admin/login` `{ key }` starts an admin session (cookie),
  `POST /api/admin/logout` ends it and `GET /api/admin/me` tells whether one is
  active. Login is limited to 5 attempts per minute per IP.
- `GET /api/admin/registrations` — paginated JSON (`limit`/`offset`), filterable
  with `q` (name, surname or email, ignoring case and accents) and `day`
  (`YYYY-MM-DD`, Guatemala time).
- `GET /api/admin/registrations.csv` — the same data as CSV, with the same filters.
- `GET /api/admin/stats` — confirmations per day, the five most requested items
  and how many drafts are still open.
- `GET /api/admin/event` and `PUT /api/admin/event` — read and replace the event
  settings (see below).

Every admin route accepts either that session or, for scripts, an `x-admin-key`
header matching `ADMIN_API_KEY`.

### Event dates

The days and hours of the fair are data, not code. They live in the database
(`event_settings` and `event_days`), always in Guatemala time (UTC-6), and the
public form reads them from `GET /api/event` (only days from today onwards).

`POST /api/registrations/confirm` rejects a visit that is in the past, on a day
that is not configured, outside that day's opening hours or off the slot grid
(15, 30 or 60 minutes, counted from opening time). With registration switched
off it answers `403 { "error": "registration_closed" }`.

`PUT /api/admin/event` takes `{ name, location, slotMinutes, registrationOpen, days }`
and replaces the days. If the new dates leave already-confirmed registrations
outside them, the response reports how many in `outOfWindowCount`; those
registrations are never modified or deleted.

### Architecture decisions

**Monorepo with a shared package.** `packages/shared` holds the discount rules
and the request/response types for both apps. The frontend runs the exact
same discount function for its live preview that the backend runs as the
source of truth at confirm time — one implementation, so the two can't drift
apart on what "5% off" means.

**Discounts are recalculated server-side on confirm.** The frontend's preview
is just that: a preview. `POST /api/registrations/confirm` re-reads current
catalog prices and recomputes both discounts from the registration's actual
selected items, ignoring anything the client might have sent. A client can't
confirm with a discount it didn't actually earn.

**One origin for the browser.** The frontend container serves the built app
and forwards `/api` and `/health` to the backend (`apps/frontend/server.mjs`,
locally the Vite dev server does the same). Everything the browser loads comes
from a single origin, so the session cookie is first-party (`SameSite=Lax`,
`Secure`, `HttpOnly`) and no CORS setup is needed. This matters because
`*.up.railway.app` is on the Public Suffix List: two Railway services on
separate subdomains are cross-site, and a `SameSite=None` cookie between them
is treated as third-party and blocked by Safari and by private windows.

**Money as integer cents.** Prices and totals are stored and computed in
integer cents end-to-end, only formatted to `Q123.45` at the UI edge. This
avoids the rounding drift that floating-point currency math is prone to,
particularly when applying a percentage discount.

### Deploying to Railway

The project has three services: the managed Postgres plugin, `backend` and
`frontend`, each built from its own Dockerfile (`apps/backend/Dockerfile`,
`apps/frontend/Dockerfile`, with the repo root as the build context).

1. **backend**: set `DATABASE_URL` (reference the Postgres plugin),
   `SESSION_SECRET`, `NODE_ENV=production`, `PORT=4000` and, optionally,
   `ADMIN_API_KEY`. It does not need a public domain: the frontend reaches it
   over Railway's private network.
2. **frontend**: set `PORT=4173` and `API_PROXY_TARGET` to the backend's private
   address, e.g. `http://backend.railway.internal:4000`. Only this service needs
   a public domain.
3. The frontend forwards the client's `X-Forwarded-For`/`X-Forwarded-Proto`
   headers unchanged, so the backend's default `TRUST_PROXY_HOPS=1` is right.
   Raise it only if another proxy is added in front of the frontend.

### Other commands

```bash
npm run lint       # lint all workspaces
npm run typecheck  # type-check all workspaces
npm run build      # build all workspaces
npm run test       # run tests in all workspaces
```
