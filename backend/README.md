# Enhanced WMS — Backend

Production-grade backend for the Enhanced WMS. Node.js + Express + TypeScript + Prisma ORM.
Default database: SQLite (zero-config). Switchable to PostgreSQL via `DATABASE_URL`.

## Quick start

```bash
cd backend
npm install
cp .env.example .env          # edit secrets
npx prisma generate
npx prisma db push            # or: npx prisma migrate dev
npm run seed                  # idempotent; creates 4 users + DEMO data
npm run dev                   # tsx watch, http://localhost:4000/api
```

Production build:

```bash
npm run build                 # tsc → dist/
npm start                     # node dist/index.js
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `development` enables `*` CORS |
| `DATABASE_URL` | `file:./dev.db` | SQLite default. PostgreSQL: `postgresql://USER:PASS@HOST:5432/wms?schema=public` (set `provider = "postgresql"` in `prisma/schema.prisma`) |
| `JWT_ACCESS_SECRET` | Development fallback only | Signing secret for 15-min access tokens (required in production; min 32 chars) |
| `JWT_REFRESH_SECRET` | Development fallback only | Signing secret for 7-day rotating refresh tokens (required in production; min 32 chars) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed origin; `*` only in dev |
| `WEBHOOK_SECRET` | — | HMAC-SHA256 secret for `/integrations/webhook/:provider` |

## Seed users (argon2-hashed)

| Username | Password | Role |
| --- | --- | --- |
| `VINOVJ` | `VINOVJ` | admin |
| `supervisor` | `supervisor` | supervisor |
| `operator` | `operator` | operator |
| `auditor` | `auditor` | auditor (read-only) |

## Endpoints

- Health: `GET /api/health` (no auth)
- Docs: `GET /api/docs` (Swagger UI)
- Auth: `POST /api/auth/{login,refresh,logout,change-password}`, `GET /api/auth/me`, `PUT /api/auth/profile`
- Sync: `GET /api/sync/pull`, `POST /api/sync/push`
- Advanced: `GET /api/dashboard/{kpis,charts}`, `GET /api/alerts/low-stock`, `POST /api/inventory/transfer`, `GET /api/labor/aggregation`, `GET|POST /api/notifications` + `POST /api/notifications/:id/ack`, `GET /api/export/:resource?format=csv|xlsx`, `POST /api/integrations/webhook/:provider`, `GET|PUT /api/settings`
- CRUD (26 resources): `inventory, orders, returns, inbound, inventory-movements (append-only), cycle-counts, zone-capacities, worker-tasks, replenishment-tasks, qc-holds, wave-batches, purchase-orders, shipping-labels, carrier-rates, worker-performance, integration-endpoints, batch-groups, pick-paths, box-sizes, posting-records, sim-db, templates, aliases, preferences, users (admin-only), audit-logs (read-only)`

List endpoints support `?q=&page=&pageSize=&sortBy=&sortDir=` plus arbitrary equality filters (`?status=Shipped`). Soft-delete (tombstone) on `DELETE`. Every row carries `id/createdAt/updatedAt/deletedAt/rev`.

Sync writes apply the same resource role policies as CRUD and validate incoming fields. Pull responses use a fixed timestamp window and resumable continuation cursors; clients must retain rejected push rows and advance the saved cursor only after applying all pull pages. User administration is excluded from sync and requires connectivity.

See `API.md` for the full frozen contract reference.
