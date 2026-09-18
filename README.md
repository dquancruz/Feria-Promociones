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
| `CORS_ORIGIN` | Yes | reflects any origin (non-production only) | Must match the deployed frontend's URL. |
| `PORT` | No | `4000` (backend) / `4173` (frontend) | Railway assigns its own at runtime and takes priority. |
| `TRUST_PROXY_HOPS` | No | `1` (production only) | Number of reverse proxies in front of the backend; used to read the real client IP. |
| `ADMIN_API_KEY` | No | unset — admin routes don't mount | Enables `/api/admin` and the `/admin` view (see below). |
| `VITE_API_URL` | Yes, at frontend build time | — | Backend URL, baked into the frontend bundle when it's built. |

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
`http://localhost:4000`.

### Run with Docker Compose

```bash
docker compose up --build
```

This starts PostgreSQL, the backend API, and the frontend, wired together with
the environment variables in `.env.example`. The backend seeds the catalog
automatically on startup if the `catalog_items` table is empty — no separate
seed step to run.

### Admin view

With `ADMIN_API_KEY` set, visiting `/admin` on the frontend shows a table of
confirmed registrations — the input for building each client's personalized
promotions portfolio. It asks for the key and calls the backend directly:

- `GET /api/admin/registrations` — paginated JSON (`limit`/`offset`).
- `GET /api/admin/registrations.csv` — the same data as CSV.

Both require an `x-admin-key` header matching `ADMIN_API_KEY`.

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

**`sameSite: 'none'` on the session cookie in production.** The frontend and
backend are deployed as separate Railway services on separate subdomains,
which browsers treat as cross-site for cookie purposes. `SameSite=Lax` (the
default) would silently drop the session cookie on the frontend's `fetch()`
calls to the backend, breaking the autosave/session feature outright.
`SameSite=None` requires `Secure`, which is only set in production.

**Money as integer cents.** Prices and totals are stored and computed in
integer cents end-to-end, only formatted to `Q123.45` at the UI edge. This
avoids the rounding drift that floating-point currency math is prone to,
particularly when applying a percentage discount.

### Other commands

```bash
npm run lint       # lint all workspaces
npm run typecheck  # type-check all workspaces
npm run build      # build all workspaces
npm run test       # run tests in all workspaces
```
