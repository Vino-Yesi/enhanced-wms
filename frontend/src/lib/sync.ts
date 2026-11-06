// Sync engine — offline-first per API_CONTRACT.md §4, §9.
//  - Dexie remains the offline cache; mutations while offline are queued to
//    the `outbox` table (added in db.ts v6).
//  - On app start and on navigator 'online' event: GET /api/sync/pull (apply
//    upserts/tombstones to Dexie), then POST /api/sync/push (flush outbox).
//  - zustand syncState (idle|syncing|error|offline) + lastSync + error are
//    exposed via useAppStore; SyncStatus component reads them.
import { useEffect, useCallback } from 'react';
import { db, type OutboxEntry } from './db';
import { api, ApiError } from './api';
import { tokenStore } from './tokenStore';
import { useAppStore } from './store';
import { toast } from 'sonner';

const SYNC_CURSOR_KEY = 'yesi_sync_cursor';

// API resource name (§3) → Dexie table name (db.ts). Used by pull to route
// upserts/tombstones into the right local cache table.
const RESOURCE_TABLE_MAP: Record<string, string> = {
  inventory: 'inventory',
  orders: 'orders',
  returns: 'returns',
  inbound: 'inbound',
  'inventory-movements': 'inventoryMovements',
  'cycle-counts': 'cycleCounts',
  'zone-capacities': 'zoneCapacities',
  'worker-tasks': 'workerTasks',
  'replenishment-tasks': 'replenishmentTasks',
  'qc-holds': 'qcHolds',
  'wave-batches': 'waveBatches',
  'purchase-orders': 'purchaseOrders',
  'shipping-labels': 'shippingLabels',
  'carrier-rates': 'carrierRates',
  'worker-performance': 'workerPerformance',
  'integration-endpoints': 'integrationEndpoints',
  'batch-groups': 'batchGroups',
  'pick-paths': 'pickPaths',
  'box-sizes': 'boxSizes',
  'posting-records': 'postingRecords',
  'sim-db': 'simDb',
  templates: 'templates',
  aliases: 'aliases',
  preferences: 'preferences',
  users: 'users',
  'audit-logs': 'auditLogs',
};

const ALL_RESOURCES = Object.keys(RESOURCE_TABLE_MAP).join(',');

function getCursor(): string {
  try {
    return localStorage.getItem(SYNC_CURSOR_KEY) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function setCursor(cursor: string): void {
  try {
    localStorage.setItem(SYNC_CURSOR_KEY, cursor);
  } catch {
    // ignore
  }
}

// ─── Outbox ──────────────────────────────────────────────────────────────

let outboxRev = Date.now() * 1000;

/** Queue a mutation to the outbox (called when offline or when online API fails). */
export async function enqueueOutbox(
  resource: string,
  method: 'POST' | 'PUT' | 'DELETE',
  entityId: number | string | undefined,
  payload: unknown
): Promise<void> {
  await db.outbox.add({
    resource,
    method,
    entityId,
    payload,
    clientRev: ++outboxRev,
    createdAt: new Date().toISOString(),
  });
  useAppStore.getState().setOutboxCount(await db.outbox.count());
}

/**
 * Best-effort mutation: if online, call the API directly; enqueue only when
 * offline or on a transient network/server failure. Pages call this ALONGSIDE their existing
 * Dexie writes (Dexie remains the immediate source of truth for the UI).
 */
export async function mutateOnlineOrQueue(
  resource: string,
  method: 'POST' | 'PUT' | 'DELETE',
  entityId: number | string | undefined,
  payload: unknown
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOutbox(resource, method, entityId, payload);
    return;
  }
  try {
    if (method === 'POST') {
      await api.post(`/${resource}`, payload, { silent: true });
    } else if (method === 'PUT' && entityId !== undefined) {
      await api.put(`/${resource}/${entityId}`, payload, { silent: true });
    } else if (method === 'DELETE' && entityId !== undefined) {
      await api.del(`/${resource}/${entityId}`, { silent: true });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 0 || error.status >= 500) {
        await enqueueOutbox(resource, method, entityId, payload);
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.error('The change could not be saved.');
  }
}

/**
 * Read-through cache helper for pages: return latest API rows and cache them
 * locally, except for users, which are intentionally not persisted in Dexie.
 */
export async function fetchAndCache<T extends { id?: number }>(
  resource: string
): Promise<T[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const res = await api.get<{ data?: T[] } | T[]>(`/${resource}`, undefined, { silent: true });
    const rows: T[] = Array.isArray(res) ? res : res?.data ?? [];
    if (rows.length > 0) {
      const tableName = RESOURCE_TABLE_MAP[resource];
      if (tableName && resource !== 'users') {
        await db.table(tableName).bulkPut(rows as never[]).catch(() => undefined);
      }
    }
    return rows;
  } catch {
    return null;
  }
}

// ─── Pull / Push ─────────────────────────────────────────────────────────

interface PullChange {
  _op: 'upsert' | 'delete';
  id?: number;
  [key: string]: unknown;
}

interface PullResponse {
  cursor: string;
  changes: Record<string, PullChange[]>;
  hasMore?: boolean;
  continuation?: Record<string, { updatedAt: string; id: number } | null>;
}

async function pull(): Promise<void> {
  const since = getCursor();
  let continuation: PullResponse['continuation'];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const res = await api.get<PullResponse>(
      '/sync/pull',
      {
        since,
        resources: ALL_RESOURCES,
        ...(continuation ? { continuation: JSON.stringify(continuation), until: cursor } : {}),
      },
      { silent: true }
    );
    if (!res?.changes || !res.cursor) throw new Error('Invalid sync pull response');

    for (const [resource, rows] of Object.entries(res.changes)) {
      const tableName = RESOURCE_TABLE_MAP[resource];
      if (!tableName || !rows?.length) continue;
      const table = db.table(tableName);
      const upserts: Record<string, unknown>[] = [];
      const deletes: number[] = [];
      for (const row of rows) {
        if (row._op === 'delete') {
          if (typeof row.id === 'number') deletes.push(row.id);
        } else {
          const { _op, ...rest } = row;
          void _op;
          upserts.push(rest);
        }
      }
      if (upserts.length) await table.bulkPut(upserts as never[]);
      if (deletes.length) await table.bulkDelete(deletes);
    }

    cursor = res.cursor;
    hasMore = Boolean(res.hasMore);
    if (hasMore) {
      if (!res.continuation) throw new Error('Sync pull response is missing its continuation cursor');
      continuation = res.continuation;
    }
  }
  if (cursor) setCursor(cursor);
}

interface PushConflict {
  resource: string;
  id: number | string | null;
  serverRev?: number;
  clientRev: number | null;
  resolution: string;
  message?: string;
}

interface PushResponse {
  applied: number;
  conflicts?: PushConflict[];
}

async function push(): Promise<boolean> {
  const entries = await db.outbox.orderBy('createdAt').toArray();
  if (!entries.length) return false;
  // Group by resource into the contract shape: { changes: { resource: [{...row, clientRev}] } }
  const changes: Record<string, Record<string, unknown>[]> = {};
  for (const e of entries) {
    if (!changes[e.resource]) changes[e.resource] = [];
    if (e.method === 'DELETE') {
      changes[e.resource].push({ id: e.entityId, _op: 'delete', clientRev: e.clientRev });
    } else {
      const base = (e.payload && typeof e.payload === 'object' ? (e.payload as Record<string, unknown>) : {});
      changes[e.resource].push({
        ...base,
        ...(e.method === 'PUT' && e.entityId !== undefined ? { id: e.entityId } : {}),
        clientRev: e.clientRev,
      });
    }
  }
  const res = await api.post<PushResponse>('/sync/push', { changes }, { silent: true });
  if (!res || !Number.isInteger(res.applied) || !Array.isArray(res.conflicts)) {
    throw new Error('Invalid sync push response');
  }
  const failedEntries = new Set(
    (res?.conflicts ?? [])
      .filter((conflict) => conflict.resolution === 'error')
      .map((conflict) => `${conflict.resource}|${String(conflict.id ?? '')}|${String(conflict.clientRev ?? '')}`),
  );
  const ids = entries
    .filter((entry) => {
      const payload = entry.payload;
      const payloadId = payload && typeof payload === 'object' && 'id' in payload ? payload.id : undefined;
      return !failedEntries.has(`${entry.resource}|${String(entry.entityId ?? payloadId ?? '')}|${entry.clientRev}`);
    })
    .map((entry) => entry.id)
    .filter((id): id is number => typeof id === 'number');
  if (ids.length) await db.outbox.bulkDelete(ids);
  const rejectedCount = res?.conflicts?.filter((conflict) => conflict.resolution === 'error').length ?? 0;
  const resolvedCount = (res?.conflicts?.length ?? 0) - rejectedCount;
  if (rejectedCount) {
    toast.warning(`${rejectedCount} change(s) could not sync and were retained in the outbox`);
  } else if (resolvedCount) {
    toast.warning(`${resolvedCount} sync conflict(s) resolved by server (last-write-wins)`);
  }
  return resolvedCount > 0;
}

// ─── Main sync entrypoint ────────────────────────────────────────────────

let syncing = false;

export async function runSync(): Promise<void> {
  if (syncing) return;
  const store = useAppStore.getState();
  // Sync only after an access token is established by login/session validation.
  if (!tokenStore.getAccessToken()) {
    store.setSyncState('idle');
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    store.setSyncState('offline');
    store.setOutboxCount(await db.outbox.count());
    return;
  }
  syncing = true;
  store.setSyncState('syncing');
  store.setSyncError(null);
  try {
    await pull();
    const hadConflicts = await push();
    if (hadConflicts) {
      // Reconcile even when the saved cursor is newer than the conflicted row.
      setCursor(new Date(0).toISOString());
      await pull();
    }
    store.setSyncState('idle');
    store.setLastSync(new Date().toISOString());
  } catch (err) {
    store.setSyncState('error');
    store.setSyncError(err instanceof Error ? err.message : 'Sync failed');
  } finally {
    syncing = false;
    store.setOutboxCount(await db.outbox.count());
  }
}

// ─── useSync hook ────────────────────────────────────────────────────────

export function useSync() {
  const syncState = useAppStore((s) => s.syncState);
  const lastSync = useAppStore((s) => s.lastSync);
  const syncError = useAppStore((s) => s.syncError);
  const outboxCount = useAppStore((s) => s.outboxCount);

  const triggerSync = useCallback(() => {
    void runSync();
  }, []);

  useEffect(() => {
    // No-op until an access token has been established by login validation.
    void runSync();
    const onOnline = () => void runSync();
    window.addEventListener('online', onOnline);
    // Refresh outbox badge every 10s while mounted.
    const interval = window.setInterval(() => {
      void db.outbox.count().then((n) => useAppStore.getState().setOutboxCount(n));
    }, 10000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, []);

  return { syncState, lastSync, syncError, outboxCount, triggerSync };
}

// Re-export type for convenience
export type { OutboxEntry };
