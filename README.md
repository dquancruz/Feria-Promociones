# Feria de Promociones

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

`ADMIN_API_KEY` is optional. Set it to enable the admin view (see below); leave
it blank and the admin routes simply don't mount.

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
the environment variables in `.env.example`.

### Admin view

With `ADMIN_API_KEY` set, visiting `/admin` on the frontend shows a table of
confirmed registrations — the input for building each client's personalized
promotions portfolio. It asks for the key and calls the backend directly:

- `GET /api/admin/registrations` — paginated JSON (`limit`/`offset`).
- `GET /api/admin/registrations.csv` — the same data as CSV.

Both require an `x-admin-key` header matching `ADMIN_API_KEY`.

### Other commands

```bash
npm run lint       # lint all workspaces
npm run typecheck  # type-check all workspaces
npm run build      # build all workspaces
npm run test       # run tests in all workspaces
```
