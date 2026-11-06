import { z } from 'zod';
import { ALL_ROLES, SUPERVISOR_UP, WRITE_ROLES, ADMIN_ONLY, AUDIT_READ } from '../middleware/auth';

const num = z.coerce.number().optional();
const int = z.coerce.number().int().optional();
const str = z.string().optional();
const bool = z.boolean().optional();

export interface ResourceConfig {
  path: string;            // route path under /api, e.g. 'inventory'
  model: string;           // Prisma delegate name, e.g. 'inventoryItem'
  label: string;           // audit entity label, e.g. 'inventory'
  schema: z.ZodObject<any, any>;
  searchFields: string[];  // fields for ?q= full-text search
  readRoles: string[];
  writeRoles: string[];    // POST + PUT
  deleteRoles: string[];
  appendOnly?: boolean;    // no PUT/DELETE (inventory-movements)
  readOnly?: boolean;      // GET only (audit-logs)
  adminOnly?: boolean;     // users
  listOmit?: string[];     // fields omitted from list view (large blobs)
  sensitiveFields?: string[]; // never returned (password)
}

const OPS_WRITE = WRITE_ROLES; // admin, supervisor, operator
const SUP_WRITE = SUPERVISOR_UP; // admin, supervisor
const ADMIN_DEL = ADMIN_ONLY;
const SUP_DEL = ['admin', 'supervisor'];

export const RESOURCES: ResourceConfig[] = [
  {
    path: 'inventory', model: 'inventoryItem', label: 'inventory',
    schema: z.object({ sku: z.string(), product: z.string(), location: z.string(), stock: int, category: str, velocity: str, weight: num, reorderPoint: int, reorderQty: int, barcode: str, rfidTag: str, length: num, width: num, height: num, costPerUnit: num, lotNumber: str, batchNumber: str, expiryDate: str, manufacturingDate: str, serializable: bool, fefoPriority: int }).passthrough(),
    searchFields: ['sku', 'product', 'location', 'category', 'barcode', 'lotNumber'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'orders', model: 'order', label: 'orders',
    schema: z.object({ orderId: z.string(), status: z.string(), requiredSkus: z.string(), priority: z.string(), assignedTo: str, waveId: str, batchId: str, carrier: str, service: str, trackingNumber: str, shippingCost: num, weightTotal: num, dimensionsTotal: str, suggestedBoxSize: str, actualBoxSize: str, packingMaterials: str }).passthrough(),
    searchFields: ['orderId', 'status', 'assignedTo', 'carrier', 'trackingNumber', 'waveId'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'returns', model: 'returnRecord', label: 'returns',
    schema: z.object({ orderId: z.string(), sku: z.string(), reason: z.string(), restocked: bool, quantity: int, processedAt: z.string() }).passthrough(),
    searchFields: ['orderId', 'sku', 'reason'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'inbound', model: 'inboundRecord', label: 'inbound',
    schema: z.object({ sku: z.string(), qty: z.coerce.number().int(), bin: z.string(), description: z.string(), lotNumber: str, serialNumbers: str, expiryDate: str, receivedAt: z.string(), crossDockOrderId: str, qcStatus: z.string(), poNumber: str, supplier: str, expectedQty: int, variance: int, putawayLocation: str, putawayReason: str }).passthrough(),
    searchFields: ['sku', 'bin', 'description', 'poNumber', 'supplier', 'qcStatus'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'inventory-movements', model: 'inventoryMovement', label: 'inventory-movements',
    schema: z.object({ sku: z.string(), type: z.string(), quantity: z.coerce.number().int(), fromLocation: str, toLocation: str, orderId: str, operator: z.string(), lotNumber: str, note: str, timestamp: z.string() }).passthrough(),
    searchFields: ['sku', 'type', 'operator', 'orderId', 'fromLocation', 'toLocation'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: [], appendOnly: true,
  },
  {
    path: 'cycle-counts', model: 'cycleCount', label: 'cycle-counts',
    schema: z.object({ sku: z.string(), location: z.string(), expectedQty: z.coerce.number().int(), actualQty: z.coerce.number().int(), variance: z.coerce.number().int(), status: z.string(), operator: z.string(), countedAt: z.string(), note: str, abcClass: str, countFrequency: str, nextScheduled: str }).passthrough(),
    searchFields: ['sku', 'location', 'status', 'operator', 'abcClass'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'zone-capacities', model: 'zoneCapacity', label: 'zone-capacities',
    schema: z.object({ zone: z.string(), maxCapacity: z.coerce.number().int(), currentUtilization: z.coerce.number(), category: str, velocityTarget: str, aisle: str, rack: str, shelf: str, binType: str, maxWeight: num, putawayRules: str }).passthrough(),
    searchFields: ['zone', 'category', 'aisle', 'binType'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'worker-tasks', model: 'workerTask', label: 'worker-tasks',
    schema: z.object({ type: z.string(), quantity: z.coerce.number().int(), status: z.string(), assignedTo: z.string(), priority: z.string(), orderId: str, sku: str, fromLocation: str, toLocation: str, completedAt: str, note: str, estimatedTime: num, actualTime: num, distance: num, pickPath: str }).passthrough(),
    searchFields: ['type', 'status', 'assignedTo', 'sku', 'orderId', 'priority'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
  },
  {
    path: 'replenishment-tasks', model: 'replenishmentTask', label: 'replenishment-tasks',
    schema: z.object({ sku: z.string(), fromLocation: z.string(), toLocation: z.string(), quantity: z.coerce.number().int(), status: z.string(), priority: z.string(), completedAt: str, triggeredBy: str }).passthrough(),
    searchFields: ['sku', 'status', 'fromLocation', 'toLocation', 'triggeredBy'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
  },
  {
    path: 'qc-holds', model: 'qCHold', label: 'qc-holds',
    schema: z.object({ sku: z.string(), quantity: z.coerce.number().int(), reason: z.string(), status: z.string(), operator: z.string(), lotNumber: str, releasedAt: str }).passthrough(),
    searchFields: ['sku', 'status', 'reason', 'operator', 'lotNumber'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'wave-batches', model: 'waveBatch', label: 'wave-batches',
    schema: z.object({ waveId: z.string(), name: z.string(), status: z.string(), orderIds: z.string(), zoneProfile: z.string(), completedAt: str, pickPath: str, estimatedTime: num, actualTime: num, pickerId: str }).passthrough(),
    searchFields: ['waveId', 'name', 'status', 'pickerId', 'zoneProfile'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'purchase-orders', model: 'purchaseOrder', label: 'purchase-orders',
    schema: z.object({ poNumber: z.string(), supplier: z.string(), status: z.string(), expectedDelivery: z.string(), items: z.string(), totalValue: z.coerce.number(), currency: z.string(), notes: str }).passthrough(),
    searchFields: ['poNumber', 'supplier', 'status'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'shipping-labels', model: 'shippingLabel', label: 'shipping-labels',
    schema: z.object({ orderId: z.string(), carrier: z.string(), service: z.string(), trackingNumber: z.string(), labelData: z.string(), weight: z.coerce.number(), dimensions: z.string(), cost: z.coerce.number(), status: z.string(), printedAt: str }).passthrough(),
    searchFields: ['orderId', 'carrier', 'trackingNumber', 'status'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'carrier-rates', model: 'carrierRate', label: 'carrier-rates',
    schema: z.object({ carrier: z.string(), service: z.string(), weightFrom: z.coerce.number(), weightTo: z.coerce.number(), zone: z.string(), rate: z.coerce.number(), currency: z.string(), estimatedDays: z.coerce.number().int(), active: bool }).passthrough(),
    searchFields: ['carrier', 'service', 'zone'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'worker-performance', model: 'workerPerformance', label: 'worker-performance',
    schema: z.object({ workerId: z.string(), workerName: z.string(), date: z.string(), picksCompleted: int, picksPerHour: num, accuracy: num, distanceWalked: num, tasksCompleted: int, avgTaskTime: num, uph: num, pickCount: int, packCount: int, receiveCount: int, putawayCount: int, errors: int, returnsCaused: int, notes: str }).passthrough(),
    searchFields: ['workerId', 'workerName', 'date'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'integration-endpoints', model: 'integrationEndpoint', label: 'integration-endpoints',
    schema: z.object({ name: z.string(), type: z.string(), provider: z.string(), config: z.string(), status: z.string(), lastSync: str, nextSync: str, syncInterval: int, recordsSynced: int, errorCount: int, lastError: str }).passthrough(),
    searchFields: ['name', 'type', 'provider', 'status'],
    readRoles: ALL_ROLES, writeRoles: ADMIN_ONLY, deleteRoles: ADMIN_ONLY,
  },
  {
    path: 'batch-groups', model: 'batchGroup', label: 'batch-groups',
    schema: z.object({ batchId: z.string(), orderIds: z.string(), status: z.string(), zoneProfile: z.string(), pickingMethod: z.string(), pickerId: str, packerId: str, pickPath: str, estimatedTime: num, actualTime: num, totalItems: int, totalWeight: num, completedAt: str }).passthrough(),
    searchFields: ['batchId', 'status', 'pickerId', 'pickingMethod', 'zoneProfile'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'pick-paths', model: 'pickPath', label: 'pick-paths',
    schema: z.object({ pathId: z.string(), orderIds: z.string(), route: z.string(), totalDistance: z.coerce.number(), estimatedTime: z.coerce.number(), actualTime: num, pickerId: str, status: z.string(), completedAt: str }).passthrough(),
    searchFields: ['pathId', 'status', 'pickerId'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'box-sizes', model: 'boxSize', label: 'box-sizes',
    schema: z.object({ name: z.string(), length: z.coerce.number(), width: z.coerce.number(), height: z.coerce.number(), maxWeight: z.coerce.number(), cost: z.coerce.number(), material: z.string(), active: bool }).passthrough(),
    searchFields: ['name', 'material'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'posting-records', model: 'postingRecord', label: 'posting-records',
    schema: z.object({ postingId: z.string(), status: z.string(), operator: z.string(), trackingId: str, orderId: str, carrier: str, photoData: str, videoData: str, geolocation: str, city: str, note: str, folder: str }).passthrough(),
    searchFields: ['postingId', 'trackingId', 'orderId', 'status', 'city', 'folder'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    listOmit: ['photoData', 'videoData'],
  },
  {
    path: 'sim-db', model: 'simDbEntry', label: 'sim-db',
    schema: z.object({ tacPrefix: z.string(), expectedOffset: z.coerce.number().int(), modelSeries: z.string(), type: z.string() }).passthrough(),
    searchFields: ['tacPrefix', 'modelSeries', 'type'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'templates', model: 'template', label: 'templates',
    schema: z.object({ raw: z.string(), standard: z.string() }).passthrough(),
    searchFields: ['raw', 'standard'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'aliases', model: 'alias', label: 'aliases',
    schema: z.object({ source: z.string(), target: z.string() }).passthrough(),
    searchFields: ['source', 'target'],
    readRoles: ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
  },
  {
    path: 'preferences', model: 'preference', label: 'preferences',
    schema: z.object({ key: z.string(), value: z.string(), userId: int }).passthrough(),
    searchFields: ['key'],
    readRoles: ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
  },
  {
    path: 'users', model: 'user', label: 'users',
    schema: z.object({ username: z.string().min(1), password: z.string().min(8).optional(), role: z.string(), displayName: z.string(), skillLevel: int, preferredTaskTypes: str, currentZone: str }).passthrough(),
    searchFields: ['username', 'displayName', 'role'],
    readRoles: ADMIN_ONLY, writeRoles: ADMIN_ONLY, deleteRoles: ADMIN_ONLY, adminOnly: true,
    sensitiveFields: ['password'],
  },
  {
    path: 'audit-logs', model: 'auditLog', label: 'audit-logs',
    schema: z.object({}).passthrough(),
    searchFields: ['entity', 'action', 'operatorName'],
    readRoles: AUDIT_READ, writeRoles: [], deleteRoles: [], readOnly: true,
  },
];

export const RESOURCE_MAP: Record<string, ResourceConfig> = Object.fromEntries(
  RESOURCES.map((r) => [r.path, r]),
);
