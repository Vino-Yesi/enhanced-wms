import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  console.log('[seed] starting (idempotent)...');

  // ── Users ───────────────────────────────────────────────────────
  const seedUsers = [
    { username: 'VINOVJ', password: 'VINOVJ', role: 'admin', displayName: 'VINOVJ Admin' },
    { username: 'supervisor', password: 'supervisor', role: 'supervisor', displayName: 'Demo Supervisor' },
    { username: 'operator', password: 'operator', role: 'operator', displayName: 'Demo Operator' },
    { username: 'auditor', password: 'auditor', role: 'auditor', displayName: 'Demo Auditor' },
  ];
  for (const u of seedUsers) {
    const exists = await prisma.user.findUnique({ where: { username: u.username } });
    if (!exists) {
      const hash = await argon2.hash(u.password);
      await prisma.user.create({ data: { username: u.username, password: hash, role: u.role, displayName: u.displayName, rev: 0 } });
      console.log(`[seed] created user ${u.username} (${u.role})`);
    }
  }

  // Idempotency: if demo inventory already seeded, skip the rest
  const invCount = await prisma.inventoryItem.count();
  if (invCount > 0) {
    console.log('[seed] demo data already present, skipping.');
    await prisma.$disconnect();
    return;
  }

  const DEMO = '[DEMO]';

  // ── Zones / capacities (3 zones) ────────────────────────────────
  const zones = [
    { zone: 'ZONE-A', maxCapacity: 5000, currentUtilization: 62.5, category: 'Electronics', velocityTarget: 'high', aisle: 'A', rack: 'R1', binType: 'shelf', maxWeight: 500, putawayRules: '{"fefo":true,"highVelocity":true}' },
    { zone: 'ZONE-B', maxCapacity: 8000, currentUtilization: 45.2, category: 'General', velocityTarget: 'medium', aisle: 'B', rack: 'R2', binType: 'carton', maxWeight: 1000, putawayRules: '{"fifo":true}' },
    { zone: 'ZONE-C', maxCapacity: 12000, currentUtilization: 30.1, category: 'Bulk', velocityTarget: 'low', aisle: 'C', rack: 'R3', binType: 'pallet', maxWeight: 2000, putawayRules: '{"floor":true}' },
  ];
  for (const z of zones) await prisma.zoneCapacity.create({ data: { ...z, rev: 0 } });

  // ── Inventory (~40 SKUs across 3 zones) ─────────────────────────
  const cats = ['Electronics', 'Accessories', 'Wearables', 'Audio', 'Cables', 'Power'];
  const velocities = ['high', 'medium', 'low'];
  const inventory: any[] = [];
  for (let i = 1; i <= 40; i++) {
    const zone = i <= 14 ? 'ZONE-A' : i <= 27 ? 'ZONE-B' : 'ZONE-C';
    const loc = `${zone.slice(5)}-${String(Math.ceil(i / 4)).padStart(2, '0')}-${(i % 4) + 1}`;
    const vel = velocities[i % 3];
    const stock = i % 7 === 0 ? 3 : 20 + ((i * 13) % 180); // some low-stock
    inventory.push({
      sku: `DEMO-SKU-${String(i).padStart(4, '0')}`,
      product: `${DEMO} Product ${i} — ${cats[i % cats.length]}`,
      stock,
      location: loc,
      category: cats[i % cats.length],
      velocity: vel,
      weight: 0.1 + (i % 10) * 0.15,
      reorderPoint: 10 + (i % 5) * 5,
      reorderQty: 30,
      barcode: `0${String(1000000 + i)}`,
      rfidTag: `RFID-${i}`,
      length: 10 + (i % 5) * 2, width: 6 + (i % 4), height: 2 + (i % 3),
      costPerUnit: 10 + (i % 20) * 5,
      lotNumber: `LOT-DEMO-${i}`,
      batchNumber: `B${2024}${String(i).padStart(3, '0')}`,
      expiryDate: iso(daysAgo(-365 - i)).slice(0, 10),
      manufacturingDate: iso(daysAgo(60 + i)).slice(0, 10),
      serializable: i % 3 === 0,
      fefoPriority: (i % 5) + 1,
      rev: 0,
    });
  }
  await prisma.inventoryItem.createMany({ data: inventory });
  console.log(`[seed] ${inventory.length} inventory items`);

  // ── Orders (~25 across statuses) ────────────────────────────────
  const statuses = ['Pending', 'Picking', 'Packed', 'ReadyToShip', 'Shipped', 'Cancelled', 'Returned', 'QCHold'];
  const priorities = ['normal', 'high', 'urgent'];
  const carriers = ['DHL', 'FedEx', 'UPS', 'USPS'];
  const orders: any[] = [];
  for (let i = 1; i <= 25; i++) {
    const status = statuses[i % statuses.length];
    const created = daysAgo(25 - i);
    orders.push({
      orderId: `DEMO-ORD-${String(i).padStart(5, '0')}`,
      status,
      requiredSkus: JSON.stringify([{ sku: `DEMO-SKU-${String((i % 40) + 1).padStart(4, '0')}`, qty: 1 + (i % 3) }]),
      priority: priorities[i % 3],
      assignedTo: i % 4 === 0 ? 'operator' : null,
      waveId: i % 5 === 0 ? `WAVE-${Math.ceil(i / 5)}` : null,
      carrier: status === 'Shipped' ? carriers[i % 4] : null,
      service: status === 'Shipped' ? 'Express' : null,
      trackingNumber: status === 'Shipped' ? `TRK${100000 + i}` : null,
      shippingCost: status === 'Shipped' ? 5 + (i % 10) : null,
      weightTotal: 0.5 + (i % 5),
      suggestedBoxSize: 'MEDIUM',
      actualBoxSize: status === 'Shipped' ? 'MEDIUM' : null,
      createdAt: created,
      updatedAt: status === 'Shipped' ? daysAgo(25 - i + 1) : created,
      rev: 0,
    });
  }
  await prisma.order.createMany({ data: orders });
  console.log(`[seed] ${orders.length} orders`);

  // ── Returns (~6) ────────────────────────────────────────────────
  const returns: any[] = [];
  for (let i = 1; i <= 6; i++) {
    returns.push({
      orderId: `DEMO-ORD-${String(i).padStart(5, '0')}`,
      sku: `DEMO-SKU-${String(i).padStart(4, '0')}`,
      reason: ['damaged', 'wrong_item', 'not_as_described'][i % 3],
      restocked: i % 2 === 0,
      quantity: 1,
      processedAt: iso(daysAgo(i)),
      rev: 0,
    });
  }
  await prisma.returnRecord.createMany({ data: returns });

  // ── Inbound (~15) ───────────────────────────────────────────────
  const inbound: any[] = [];
  for (let i = 1; i <= 15; i++) {
    inbound.push({
      sku: `DEMO-SKU-${String((i % 40) + 1).padStart(4, '0')}`,
      qty: 10 + (i % 5) * 10,
      bin: `INB-${String(i).padStart(2, '0')}`,
      description: `${DEMO} Inbound shipment ${i}`,
      lotNumber: `LOT-IN-${i}`,
      receivedAt: iso(daysAgo(15 - i)),
      qcStatus: ['pending', 'passed', 'failed'][i % 3],
      poNumber: `PO-DEMO-${String((i % 6) + 1).padStart(3, '0')}`,
      supplier: ['SupplierAlpha', 'SupplierBeta', 'SupplierGamma'][i % 3],
      expectedQty: 10 + (i % 5) * 10,
      variance: i % 4 === 0 ? -2 : 0,
      putawayLocation: i % 3 === 0 ? `A-${i}` : null,
      rev: 0,
    });
  }
  await prisma.inboundRecord.createMany({ data: inbound });

  // ── Inventory movements (~20) ───────────────────────────────────
  const movements: any[] = [];
  const mvTypes = ['inbound', 'outbound', 'transfer', 'putaway', 'pick', 'pack'];
  for (let i = 1; i <= 20; i++) {
    movements.push({
      sku: `DEMO-SKU-${String((i % 40) + 1).padStart(4, '0')}`,
      type: mvTypes[i % mvTypes.length],
      quantity: 1 + (i % 10),
      fromLocation: `A-${(i % 14) + 1}`,
      toLocation: `B-${(i % 13) + 1}`,
      orderId: i % 3 === 0 ? `DEMO-ORD-${String((i % 25) + 1).padStart(5, '0')}` : null,
      operator: 'operator',
      lotNumber: `LOT-DEMO-${i}`,
      note: `${DEMO} movement ${i}`,
      timestamp: iso(daysAgo(20 - i)),
      rev: 0,
    });
  }
  await prisma.inventoryMovement.createMany({ data: movements });

  // ── Cycle counts (~10) ──────────────────────────────────────────
  const cc: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const expected = 50 + i * 5;
    const actual = expected + (i % 3 === 0 ? -2 : 0);
    cc.push({
      sku: `DEMO-SKU-${String(i).padStart(4, '0')}`,
      location: `A-${i}`,
      expectedQty: expected,
      actualQty: actual,
      variance: actual - expected,
      status: ['pending', 'completed', 'approved'][i % 3],
      operator: 'operator',
      countedAt: iso(daysAgo(10 - i)),
      note: `${DEMO} cycle count`,
      abcClass: ['A', 'B', 'C'][i % 3],
      countFrequency: ['daily', 'weekly', 'monthly'][i % 3],
      nextScheduled: iso(daysAgo(-7)),
      rev: 0,
    });
  }
  await prisma.cycleCount.createMany({ data: cc });

  // ── Worker tasks (~12) ──────────────────────────────────────────
  const taskTypes = ['pick', 'pack', 'receive', 'putaway', 'cycle_count', 'replenish', 'ship'];
  const tasks: any[] = [];
  for (let i = 1; i <= 12; i++) {
    tasks.push({
      type: taskTypes[i % taskTypes.length],
      orderId: i % 2 === 0 ? `DEMO-ORD-${String((i % 25) + 1).padStart(5, '0')}` : null,
      sku: `DEMO-SKU-${String((i % 40) + 1).padStart(4, '0')}`,
      fromLocation: `A-${i}`,
      toLocation: `PACK-${i}`,
      quantity: 1 + (i % 5),
      status: ['pending', 'in_progress', 'completed'][i % 3],
      assignedTo: 'operator',
      priority: priorities[i % 3],
      completedAt: i % 3 === 2 ? iso(daysAgo(12 - i)) : null,
      estimatedTime: 5 + (i % 4) * 2,
      actualTime: i % 3 === 2 ? 4 + (i % 5) * 2 : null,
      distance: 20 + i * 5,
      createdAt: daysAgo(12 - i),
      rev: 0,
    });
  }
  await prisma.workerTask.createMany({ data: tasks });

  // ── Replenishment tasks (~8) ────────────────────────────────────
  const replen: any[] = [];
  for (let i = 1; i <= 8; i++) {
    replen.push({
      sku: `DEMO-SKU-${String((i % 40) + 1).padStart(4, '0')}`,
      fromLocation: `RESERVE-${i}`,
      toLocation: `A-${i}`,
      quantity: 20 + i * 5,
      status: ['pending', 'in_progress', 'completed'][i % 3],
      priority: i % 3 === 0 ? 'high' : 'normal',
      completedAt: i % 3 === 2 ? iso(daysAgo(8 - i)) : null,
      triggeredBy: ['auto', 'low_stock', 'manual', 'wave_demand'][i % 4],
      createdAt: daysAgo(8 - i),
      rev: 0,
    });
  }
  await prisma.replenishmentTask.createMany({ data: replen });

  // ── QC holds (~5) ───────────────────────────────────────────────
  const qc: any[] = [];
  for (let i = 1; i <= 5; i++) {
    qc.push({
      sku: `DEMO-SKU-${String(i).padStart(4, '0')}`,
      lotNumber: `LOT-QC-${i}`,
      quantity: 5 + i * 2,
      reason: ['damaged', 'expired', 'documentation_mismatch'][i % 3],
      status: ['hold', 'released', 'rejected'][i % 3],
      operator: 'supervisor',
      releasedAt: i % 3 === 1 ? iso(daysAgo(5 - i)) : null,
      createdAt: daysAgo(5 - i),
      rev: 0,
    });
  }
  await prisma.qCHold.createMany({ data: qc });

  // ── Wave batches (~4) ───────────────────────────────────────────
  const waves: any[] = [];
  for (let i = 1; i <= 4; i++) {
    waves.push({
      waveId: `WAVE-${i}`,
      name: `${DEMO} Wave ${i}`,
      status: ['open', 'picking', 'completed'][i % 3],
      orderIds: JSON.stringify([`DEMO-ORD-${String(i * 5).padStart(5, '0')}`]),
      zoneProfile: 'ZONE-A',
      completedAt: i % 3 === 2 ? iso(daysAgo(4 - i)) : null,
      estimatedTime: 30 + i * 5,
      actualTime: i % 3 === 2 ? 28 + i * 5 : null,
      pickerId: 'operator',
      createdAt: daysAgo(4 - i),
      rev: 0,
    });
  }
  await prisma.waveBatch.createMany({ data: waves });

  // ── Purchase orders (~6) ────────────────────────────────────────
  const pos: any[] = [];
  for (let i = 1; i <= 6; i++) {
    pos.push({
      poNumber: `PO-DEMO-${String(i).padStart(3, '0')}`,
      supplier: ['SupplierAlpha', 'SupplierBeta', 'SupplierGamma'][i % 3],
      status: ['open', 'partial', 'received', 'closed'][i % 4],
      expectedDelivery: iso(daysAgo(-i * 2)).slice(0, 10),
      items: JSON.stringify([{ sku: `DEMO-SKU-${String(i).padStart(4, '0')}`, qty: 50, expected: 50, received: i % 2 ? 50 : 0 }]),
      totalValue: 1000 + i * 250,
      currency: 'USD',
      notes: `${DEMO} PO ${i}`,
      createdAt: daysAgo(20 - i * 3),
      rev: 0,
    });
  }
  await prisma.purchaseOrder.createMany({ data: pos });

  // ── Shipping labels (~6) ────────────────────────────────────────
  const labels: any[] = [];
  for (let i = 1; i <= 6; i++) {
    labels.push({
      orderId: `DEMO-ORD-${String(i).padStart(5, '0')}`,
      carrier: carriers[i % 4],
      service: 'Express',
      trackingNumber: `TRK${200000 + i}`,
      labelData: 'base64labeldata...',
      weight: 0.5 + i * 0.3,
      dimensions: JSON.stringify({ l: 20, w: 15, h: 10 }),
      cost: 6 + i,
      status: ['printed', 'void', 'draft'][i % 3],
      printedAt: iso(daysAgo(6 - i)),
      createdAt: daysAgo(6 - i),
      rev: 0,
    });
  }
  await prisma.shippingLabel.createMany({ data: labels });

  // ── Carrier rates (3 carriers) ──────────────────────────────────
  const rates: any[] = [];
  for (const c of carriers.slice(0, 3)) {
    for (let z = 1; z <= 3; z++) {
      rates.push({
        carrier: c, service: 'Express', weightFrom: 0, weightTo: z * 5,
        zone: `Z${z}`, rate: 5 + z * 2 + (c === 'DHL' ? 2 : 0), currency: 'USD',
        estimatedDays: 2 + z, active: true, rev: 0,
      });
    }
  }
  await prisma.carrierRate.createMany({ data: rates });

  // ── Worker performance (30 days × 2 workers) ────────────────────
  const perf: any[] = [];
  const workers = [{ id: 'W001', name: 'Alice Operator' }, { id: 'W002', name: 'Bob Operator' }];
  for (let d = 0; d < 30; d++) {
    for (const w of workers) {
      const picks = 60 + ((d * 7 + w.id.charCodeAt(1)) % 40);
      perf.push({
        workerId: w.id, workerName: w.name, date: iso(daysAgo(29 - d)).slice(0, 10),
        picksCompleted: picks, picksPerHour: Math.round((picks / 7.5) * 10) / 10,
        accuracy: 96 + ((d + w.id.charCodeAt(1)) % 4), distanceWalked: 4000 + d * 50,
        tasksCompleted: picks + 10, avgTaskTime: 3.5, uph: Math.round((picks / 7.5) * 10) / 10,
        pickCount: picks, packCount: 15 + (d % 5), receiveCount: 5 + (d % 3), putawayCount: 8 + (d % 4),
        errors: d % 5 === 0 ? 1 : 0, returnsCaused: 0, notes: `${DEMO} perf`,
        rev: 0,
      });
    }
  }
  await prisma.workerPerformance.createMany({ data: perf });

  // ── Integration endpoints (3) ───────────────────────────────────
  await prisma.integrationEndpoint.createMany({ data: [
    { name: `${DEMO} ERP Sync`, type: 'erp', provider: 'sap', config: JSON.stringify({ apiKey: 'masked', endpoint: 'https://example.com' }), status: 'active', syncInterval: 15, recordsSynced: 1200, errorCount: 0, lastSync: iso(daysAgo(0)), rev: 0 },
    { name: `${DEMO} Marketplace`, type: 'marketplace', provider: 'shopify', config: JSON.stringify({ apiKey: 'masked' }), status: 'active', syncInterval: 30, recordsSynced: 850, errorCount: 2, lastSync: iso(daysAgo(1)), rev: 0 },
    { name: `${DEMO} Carrier`, type: 'carrier', provider: 'dhl', config: JSON.stringify({ apiKey: 'masked' }), status: 'syncing', syncInterval: 60, recordsSynced: 300, errorCount: 0, rev: 0 },
  ] });

  // ── Batch groups (~4), pick paths (~3), box sizes (5) ───────────
  const bg: any[] = [];
  for (let i = 1; i <= 4; i++) {
    bg.push({
      batchId: `BATCH-${i}`, orderIds: `DEMO-ORD-${i * 5}`, status: ['open', 'picking', 'packed', 'shipped'][i - 1],
      pickerId: 'operator', packerId: 'operator', totalItems: 10 + i * 2, totalWeight: 5 + i,
      zoneProfile: 'ZONE-A', pickingMethod: ['single', 'batch', 'zone', 'wave'][i - 1],
      estimatedTime: 20 + i * 5, createdAt: daysAgo(4 - i), rev: 0,
    });
  }
  await prisma.batchGroup.createMany({ data: bg });

  const pp: any[] = [];
  for (let i = 1; i <= 3; i++) {
    pp.push({
      pathId: `PATH-${i}`, orderIds: `DEMO-ORD-${i}`, route: JSON.stringify([{ location: `A-${i}`, sku: `DEMO-SKU-${i}`, qty: 1 }]),
      totalDistance: 100 + i * 20, estimatedTime: 15 + i * 3, pickerId: 'operator',
      status: ['planned', 'active', 'completed'][i - 1], createdAt: daysAgo(3 - i), rev: 0,
    });
  }
  await prisma.pickPath.createMany({ data: pp });

  await prisma.boxSize.createMany({ data: [
    { name: 'SMALL', length: 20, width: 15, height: 10, maxWeight: 5, cost: 1.5, material: 'corrugated', active: true, rev: 0 },
    { name: 'MEDIUM', length: 30, width: 25, height: 20, maxWeight: 15, cost: 2.5, material: 'corrugated', active: true, rev: 0 },
    { name: 'LARGE', length: 45, width: 35, height: 30, maxWeight: 30, cost: 4, material: 'corrugated', active: true, rev: 0 },
    { name: 'XL', length: 60, width: 45, height: 40, maxWeight: 50, cost: 6, material: 'double-wall', active: true, rev: 0 },
    { name: 'MAILER', length: 25, width: 18, height: 5, maxWeight: 2, cost: 0.8, material: 'poly', active: true, rev: 0 },
  ] });

  // ── Posting records (~4), sim DB (~5), templates, aliases, prefs ─
  const postings: any[] = [];
  for (let i = 1; i <= 4; i++) {
    postings.push({
      postingId: `POST-${i}`, trackingId: `TRK${300000 + i}`, orderId: `DEMO-ORD-${i}`,
      status: ['received', 'in_transit', 'delivered', 'posted'][i - 1], carrier: 'DHL',
      photoData: 'base64photo...', videoData: null, geolocation: JSON.stringify({ lat: 25.2, lng: 55.3 }),
      city: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain'][i - 1], note: `${DEMO} posting`,
      operator: 'operator', folder: 'DEMO', createdAt: daysAgo(4 - i), rev: 0,
    });
  }
  await prisma.postingRecord.createMany({ data: postings });

  const sim: any[] = [];
  for (let i = 1; i <= 5; i++) {
    sim.push({ tacPrefix: `35${String(10000 + i)}`, expectedOffset: i * 2, modelSeries: `IPHONE-${14 + (i % 3)}`, type: 'eSIM', rev: 0 });
  }
  await prisma.simDbEntry.createMany({ data: sim });

  await prisma.template.createMany({ data: [
    { raw: 'RAW_TEMPLATE_1', standard: 'Standard Template 1', rev: 0 },
    { raw: 'RAW_TEMPLATE_2', standard: 'Standard Template 2', rev: 0 },
  ] });
  await prisma.alias.createMany({ data: [
    { source: 'OLD-SKU-1', target: 'DEMO-SKU-0001', rev: 0 },
    { source: 'OLD-SKU-2', target: 'DEMO-SKU-0002', rev: 0 },
  ] });
  await prisma.preference.createMany({ data: [
    { key: 'theme', value: 'dark', userId: 1, rev: 0 },
    { key: 'defaultZone', value: 'ZONE-A', userId: 2, rev: 0 },
    { key: 'language', value: 'en', rev: 0 },
  ] });

  // ── Settings + notifications + audit seed ───────────────────────
  await prisma.setting.createMany({ data: [
    { key: 'companyName', value: 'DEMO Warehouse Inc.' },
    { key: 'defaultCarrier', value: 'DHL' },
    { key: 'lowStockAlertEnabled', value: 'true' },
  ] });
  await prisma.notification.create({ data: { title: `${DEMO} Welcome`, body: 'Demo data seeded successfully.', level: 'info', createdBy: 1, acknowledgedBy: '[]', rev: 0 } });
  await prisma.auditLog.create({ data: { entity: 'system', action: 'CREATE', operatorName: 'seed', newValues: JSON.stringify({ seed: 'DEMO data' }) } });

  console.log('[seed] done. Demo data labeled [DEMO].');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
