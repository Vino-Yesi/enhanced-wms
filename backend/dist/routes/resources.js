"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOURCE_MAP = exports.RESOURCES = void 0;
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const num = zod_1.z.coerce.number().optional();
const int = zod_1.z.coerce.number().int().optional();
const str = zod_1.z.string().optional();
const bool = zod_1.z.boolean().optional();
const OPS_WRITE = auth_1.WRITE_ROLES; // admin, supervisor, operator
const SUP_WRITE = auth_1.SUPERVISOR_UP; // admin, supervisor
const ADMIN_DEL = auth_1.ADMIN_ONLY;
const SUP_DEL = ['admin', 'supervisor'];
exports.RESOURCES = [
    {
        path: 'inventory', model: 'inventoryItem', label: 'inventory',
        schema: zod_1.z.object({ sku: zod_1.z.string(), product: zod_1.z.string(), location: zod_1.z.string(), stock: int, category: str, velocity: str, weight: num, reorderPoint: int, reorderQty: int, barcode: str, rfidTag: str, length: num, width: num, height: num, costPerUnit: num, lotNumber: str, batchNumber: str, expiryDate: str, manufacturingDate: str, serializable: bool, fefoPriority: int }).passthrough(),
        searchFields: ['sku', 'product', 'location', 'category', 'barcode', 'lotNumber'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'orders', model: 'order', label: 'orders',
        schema: zod_1.z.object({ orderId: zod_1.z.string(), status: zod_1.z.string(), requiredSkus: zod_1.z.string(), priority: zod_1.z.string(), assignedTo: str, waveId: str, batchId: str, carrier: str, service: str, trackingNumber: str, shippingCost: num, weightTotal: num, dimensionsTotal: str, suggestedBoxSize: str, actualBoxSize: str, packingMaterials: str }).passthrough(),
        searchFields: ['orderId', 'status', 'assignedTo', 'carrier', 'trackingNumber', 'waveId'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'returns', model: 'returnRecord', label: 'returns',
        schema: zod_1.z.object({ orderId: zod_1.z.string(), sku: zod_1.z.string(), reason: zod_1.z.string(), restocked: bool, quantity: int, processedAt: zod_1.z.string() }).passthrough(),
        searchFields: ['orderId', 'sku', 'reason'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'inbound', model: 'inboundRecord', label: 'inbound',
        schema: zod_1.z.object({ sku: zod_1.z.string(), qty: zod_1.z.coerce.number().int(), bin: zod_1.z.string(), description: zod_1.z.string(), lotNumber: str, serialNumbers: str, expiryDate: str, receivedAt: zod_1.z.string(), crossDockOrderId: str, qcStatus: zod_1.z.string(), poNumber: str, supplier: str, expectedQty: int, variance: int, putawayLocation: str, putawayReason: str }).passthrough(),
        searchFields: ['sku', 'bin', 'description', 'poNumber', 'supplier', 'qcStatus'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'inventory-movements', model: 'inventoryMovement', label: 'inventory-movements',
        schema: zod_1.z.object({ sku: zod_1.z.string(), type: zod_1.z.string(), quantity: zod_1.z.coerce.number().int(), fromLocation: str, toLocation: str, orderId: str, operator: zod_1.z.string(), lotNumber: str, note: str, timestamp: zod_1.z.string() }).passthrough(),
        searchFields: ['sku', 'type', 'operator', 'orderId', 'fromLocation', 'toLocation'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: [], appendOnly: true,
    },
    {
        path: 'cycle-counts', model: 'cycleCount', label: 'cycle-counts',
        schema: zod_1.z.object({ sku: zod_1.z.string(), location: zod_1.z.string(), expectedQty: zod_1.z.coerce.number().int(), actualQty: zod_1.z.coerce.number().int(), variance: zod_1.z.coerce.number().int(), status: zod_1.z.string(), operator: zod_1.z.string(), countedAt: zod_1.z.string(), note: str, abcClass: str, countFrequency: str, nextScheduled: str }).passthrough(),
        searchFields: ['sku', 'location', 'status', 'operator', 'abcClass'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'zone-capacities', model: 'zoneCapacity', label: 'zone-capacities',
        schema: zod_1.z.object({ zone: zod_1.z.string(), maxCapacity: zod_1.z.coerce.number().int(), currentUtilization: zod_1.z.coerce.number(), category: str, velocityTarget: str, aisle: str, rack: str, shelf: str, binType: str, maxWeight: num, putawayRules: str }).passthrough(),
        searchFields: ['zone', 'category', 'aisle', 'binType'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'worker-tasks', model: 'workerTask', label: 'worker-tasks',
        schema: zod_1.z.object({ type: zod_1.z.string(), quantity: zod_1.z.coerce.number().int(), status: zod_1.z.string(), assignedTo: zod_1.z.string(), priority: zod_1.z.string(), orderId: str, sku: str, fromLocation: str, toLocation: str, completedAt: str, note: str, estimatedTime: num, actualTime: num, distance: num, pickPath: str }).passthrough(),
        searchFields: ['type', 'status', 'assignedTo', 'sku', 'orderId', 'priority'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
    },
    {
        path: 'replenishment-tasks', model: 'replenishmentTask', label: 'replenishment-tasks',
        schema: zod_1.z.object({ sku: zod_1.z.string(), fromLocation: zod_1.z.string(), toLocation: zod_1.z.string(), quantity: zod_1.z.coerce.number().int(), status: zod_1.z.string(), priority: zod_1.z.string(), completedAt: str, triggeredBy: str }).passthrough(),
        searchFields: ['sku', 'status', 'fromLocation', 'toLocation', 'triggeredBy'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
    },
    {
        path: 'qc-holds', model: 'qCHold', label: 'qc-holds',
        schema: zod_1.z.object({ sku: zod_1.z.string(), quantity: zod_1.z.coerce.number().int(), reason: zod_1.z.string(), status: zod_1.z.string(), operator: zod_1.z.string(), lotNumber: str, releasedAt: str }).passthrough(),
        searchFields: ['sku', 'status', 'reason', 'operator', 'lotNumber'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'wave-batches', model: 'waveBatch', label: 'wave-batches',
        schema: zod_1.z.object({ waveId: zod_1.z.string(), name: zod_1.z.string(), status: zod_1.z.string(), orderIds: zod_1.z.string(), zoneProfile: zod_1.z.string(), completedAt: str, pickPath: str, estimatedTime: num, actualTime: num, pickerId: str }).passthrough(),
        searchFields: ['waveId', 'name', 'status', 'pickerId', 'zoneProfile'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'purchase-orders', model: 'purchaseOrder', label: 'purchase-orders',
        schema: zod_1.z.object({ poNumber: zod_1.z.string(), supplier: zod_1.z.string(), status: zod_1.z.string(), expectedDelivery: zod_1.z.string(), items: zod_1.z.string(), totalValue: zod_1.z.coerce.number(), currency: zod_1.z.string(), notes: str }).passthrough(),
        searchFields: ['poNumber', 'supplier', 'status'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'shipping-labels', model: 'shippingLabel', label: 'shipping-labels',
        schema: zod_1.z.object({ orderId: zod_1.z.string(), carrier: zod_1.z.string(), service: zod_1.z.string(), trackingNumber: zod_1.z.string(), labelData: zod_1.z.string(), weight: zod_1.z.coerce.number(), dimensions: zod_1.z.string(), cost: zod_1.z.coerce.number(), status: zod_1.z.string(), printedAt: str }).passthrough(),
        searchFields: ['orderId', 'carrier', 'trackingNumber', 'status'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'carrier-rates', model: 'carrierRate', label: 'carrier-rates',
        schema: zod_1.z.object({ carrier: zod_1.z.string(), service: zod_1.z.string(), weightFrom: zod_1.z.coerce.number(), weightTo: zod_1.z.coerce.number(), zone: zod_1.z.string(), rate: zod_1.z.coerce.number(), currency: zod_1.z.string(), estimatedDays: zod_1.z.coerce.number().int(), active: bool }).passthrough(),
        searchFields: ['carrier', 'service', 'zone'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'worker-performance', model: 'workerPerformance', label: 'worker-performance',
        schema: zod_1.z.object({ workerId: zod_1.z.string(), workerName: zod_1.z.string(), date: zod_1.z.string(), picksCompleted: int, picksPerHour: num, accuracy: num, distanceWalked: num, tasksCompleted: int, avgTaskTime: num, uph: num, pickCount: int, packCount: int, receiveCount: int, putawayCount: int, errors: int, returnsCaused: int, notes: str }).passthrough(),
        searchFields: ['workerId', 'workerName', 'date'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'integration-endpoints', model: 'integrationEndpoint', label: 'integration-endpoints',
        schema: zod_1.z.object({ name: zod_1.z.string(), type: zod_1.z.string(), provider: zod_1.z.string(), config: zod_1.z.string(), status: zod_1.z.string(), lastSync: str, nextSync: str, syncInterval: int, recordsSynced: int, errorCount: int, lastError: str }).passthrough(),
        searchFields: ['name', 'type', 'provider', 'status'],
        readRoles: auth_1.ALL_ROLES, writeRoles: auth_1.ADMIN_ONLY, deleteRoles: auth_1.ADMIN_ONLY,
    },
    {
        path: 'batch-groups', model: 'batchGroup', label: 'batch-groups',
        schema: zod_1.z.object({ batchId: zod_1.z.string(), orderIds: zod_1.z.string(), status: zod_1.z.string(), zoneProfile: zod_1.z.string(), pickingMethod: zod_1.z.string(), pickerId: str, packerId: str, pickPath: str, estimatedTime: num, actualTime: num, totalItems: int, totalWeight: num, completedAt: str }).passthrough(),
        searchFields: ['batchId', 'status', 'pickerId', 'pickingMethod', 'zoneProfile'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'pick-paths', model: 'pickPath', label: 'pick-paths',
        schema: zod_1.z.object({ pathId: zod_1.z.string(), orderIds: zod_1.z.string(), route: zod_1.z.string(), totalDistance: zod_1.z.coerce.number(), estimatedTime: zod_1.z.coerce.number(), actualTime: num, pickerId: str, status: zod_1.z.string(), completedAt: str }).passthrough(),
        searchFields: ['pathId', 'status', 'pickerId'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'box-sizes', model: 'boxSize', label: 'box-sizes',
        schema: zod_1.z.object({ name: zod_1.z.string(), length: zod_1.z.coerce.number(), width: zod_1.z.coerce.number(), height: zod_1.z.coerce.number(), maxWeight: zod_1.z.coerce.number(), cost: zod_1.z.coerce.number(), material: zod_1.z.string(), active: bool }).passthrough(),
        searchFields: ['name', 'material'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'posting-records', model: 'postingRecord', label: 'posting-records',
        schema: zod_1.z.object({ postingId: zod_1.z.string(), status: zod_1.z.string(), operator: zod_1.z.string(), trackingId: str, orderId: str, carrier: str, photoData: str, videoData: str, geolocation: str, city: str, note: str, folder: str }).passthrough(),
        searchFields: ['postingId', 'trackingId', 'orderId', 'status', 'city', 'folder'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
        listOmit: ['photoData', 'videoData'],
    },
    {
        path: 'sim-db', model: 'simDbEntry', label: 'sim-db',
        schema: zod_1.z.object({ tacPrefix: zod_1.z.string(), expectedOffset: zod_1.z.coerce.number().int(), modelSeries: zod_1.z.string(), type: zod_1.z.string() }).passthrough(),
        searchFields: ['tacPrefix', 'modelSeries', 'type'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'templates', model: 'template', label: 'templates',
        schema: zod_1.z.object({ raw: zod_1.z.string(), standard: zod_1.z.string() }).passthrough(),
        searchFields: ['raw', 'standard'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'aliases', model: 'alias', label: 'aliases',
        schema: zod_1.z.object({ source: zod_1.z.string(), target: zod_1.z.string() }).passthrough(),
        searchFields: ['source', 'target'],
        readRoles: auth_1.ALL_ROLES, writeRoles: SUP_WRITE, deleteRoles: ADMIN_DEL,
    },
    {
        path: 'preferences', model: 'preference', label: 'preferences',
        schema: zod_1.z.object({ key: zod_1.z.string(), value: zod_1.z.string(), userId: int }).passthrough(),
        searchFields: ['key'],
        readRoles: auth_1.ALL_ROLES, writeRoles: OPS_WRITE, deleteRoles: SUP_DEL,
    },
    {
        path: 'users', model: 'user', label: 'users',
        schema: zod_1.z.object({ username: zod_1.z.string().min(1), password: zod_1.z.string().min(8).optional(), role: zod_1.z.string(), displayName: zod_1.z.string(), skillLevel: int, preferredTaskTypes: str, currentZone: str }).passthrough(),
        searchFields: ['username', 'displayName', 'role'],
        readRoles: auth_1.ADMIN_ONLY, writeRoles: auth_1.ADMIN_ONLY, deleteRoles: auth_1.ADMIN_ONLY, adminOnly: true,
        sensitiveFields: ['password'],
    },
    {
        path: 'audit-logs', model: 'auditLog', label: 'audit-logs',
        schema: zod_1.z.object({}).passthrough(),
        searchFields: ['entity', 'action', 'operatorName'],
        readRoles: auth_1.AUDIT_READ, writeRoles: [], deleteRoles: [], readOnly: true,
    },
];
exports.RESOURCE_MAP = Object.fromEntries(exports.RESOURCES.map((r) => [r.path, r]));
