# Enhanced WMS — API Reference (frozen contract v1)

Base URL: `http://localhost:4000/api`. All bodies JSON. Auth: `Authorization: Bearer <accessToken>`.
Error shape: `{ "error": { "code": "...", "message": "..." } }` with 400/401/403/404/409/422/429/500.

## Auth
- `POST /auth/login` `{username,password}` → `{accessToken, refreshToken, user:{id,username,role,displayName}}`
- `POST /auth/refresh` `{refreshToken}` → `{accessToken, refreshToken}` (rotation; old revoked)
- `POST /auth/logout` (auth) — revokes refresh token(s)
- `GET /auth/me` → `{id,username,role,displayName,createdAt}`
- `PUT /auth/profile` `{displayName}` — updates the authenticated user's display name only
- `POST /auth/change-password` `{currentPassword,newPassword}` (min 8 chars) — invalidates refresh tokens

## CRUD (all require auth)
For each resource: `GET /<res>` (`{data,total,page,pageSize}`; `?q=&page=&pageSize=&sortBy=&sortDir=` + equality filters), `GET /<res>/:id`, `POST /<res>` (201), `PUT /<res>/:id`, `DELETE /<res>/:id` (soft delete tombstone). `rev` increments on every write.

Resources: `inventory, orders, returns, inbound, inventory-movements (append-only: no PUT/DELETE), cycle-counts, zone-capacities, worker-tasks, replenishment-tasks, qc-holds, wave-batches, purchase-orders, shipping-labels, carrier-rates, worker-performance, integration-endpoints, batch-groups, pick-paths, box-sizes, posting-records (photoData/videoData truncated in list), sim-db, templates, aliases, preferences, users (admin-only, password write-only), audit-logs (read-only, admin+auditor; filters `?entity=&action=&operator=&from=&to=`)`.

## Sync
- `GET /sync/pull?since=<ISO>&resources=a,b` → `{cursor, changes:{resource:[{...row,_op:'upsert'|'delete'}]}, hasMore, continuation?}`. If more pages remain, repeat with `continuation=<JSON>` and `until=<cursor>`; advance the client cursor only after applying the last page.
- `POST /sync/push` `{changes:{resource:[{...row, clientRev, _op?}]}}` → `{applied, conflicts:[{resource,id,serverRev,clientRev,resolution,message?}]}`. Sync enforces resource write/delete roles and schemas. `last_write_wins` conflicts are audited; `error` conflicts are rejected and must stay queued. Users and audit logs are excluded from sync.

## Advanced
- `GET /dashboard/kpis` → `{totalSkus,totalUnits,ordersOpen,ordersShippedToday,inboundPending,lowStockCount,cycleCountPending,pickingAccuracy,uphAvg,onTimeShipRate}`
- `GET /dashboard/charts?range=7d|30d|90d` → `{ordersByDay,inboundByDay,topSkus,velocityDistribution,zoneUtilization,lowStock}`
- `GET /alerts/low-stock` → inventory where `stock <= reorderPoint`
- `POST /inventory/transfer` `{sku,quantity,fromLocation,toLocation,note}` (admin/supervisor) — atomic move + movement record
- `GET /labor/aggregation?from=&to=` → `{byWorker, byTaskType}`
- `GET /notifications`, `POST /notifications` (admin), `POST /notifications/:id/ack`
- `GET /export/:resource?format=csv|xlsx` (admin/supervisor) — streamed download
- `POST /integrations/webhook/:provider` — validates `X-Webhook-Signature` (HMAC-SHA256 of raw body, `WEBHOOK_SECRET`), returns 200
- `GET /settings`, `PUT /settings` (admin) — global key/value

## Security
helmet, CORS (`http://localhost:3000`; `*` only in dev), rate limits (auth 5/15min/IP, API 100/min/IP), zod validation, input sanitization, argon2 password hashing, refresh tokens stored hashed + rotating + revocable, audit log on every mutation, no stack traces in responses.

## Health & docs
`GET /health` → `{status, uptime, db}` (no auth). `GET /docs` — Swagger UI.
