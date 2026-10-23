import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { units, stations } from '../db/schema';

const unit = new Hono();

unit.get('/', async (c) => {
  const ownerId = c.req.query('ownerId');
  const stationId = c.req.query('stationId');
  let query = db.select().from(units);
  if (ownerId) {
    const result = await query.where(eq(units.ownerId, ownerId));
    return c.json({ units: result.map(formatUnit) });
  }
  if (stationId) {
    const result = await query.where(eq(units.stationId, stationId));
    return c.json({ units: result.map(formatUnit) });
  }
  const result = await query;
  return c.json({ units: result.map(formatUnit) });
});

unit.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (result.length === 0) {
    return c.json({ error: 'Unit not found' }, 404);
  }
  return c.json({ unit: formatUnit(result[0]) });
});

unit.post('/', async (c) => {
  const body = await c.req.json();
  const { ownerId, stationId, unitType, name } = body;
  if (!ownerId || !stationId || !unitType) {
    return c.json({ error: 'Missing required fields: ownerId, stationId, unitType' }, 400);
  }
  const result = await db.insert(units).values({
    ownerId,
    stationId,
    unitType,
    name: name ?? null,
    status: 'available',
    heading: 0,
    speed: 0,
    trainingLevel: 1,
  }).returning();
  await db.update(stations)
    .set({ unitCount: sql`(SELECT COUNT(*) FROM ${units} WHERE station_id = ${stationId})` })
    .where(eq(stations.id, stationId));
  return c.json({ unit: formatUnit(result[0]) }, 201);
});

unit.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowedFields = ['status', 'lat', 'lng', 'heading', 'speed', 'eta', 'missionId', 'trainingLevel'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  await db.update(units).set(updates).where(eq(units.id, id));
  return c.json({ success: true });
});

unit.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(units).where(eq(units.id, id));
  return c.json({ success: true });
});

function formatUnit(row: typeof units.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    stationId: row.stationId,
    type: row.unitType,
    name: row.name,
    status: row.status,
    position: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    destination: null,
    heading: row.heading,
    speed: row.speed,
    eta: row.eta,
    missionId: row.missionId,
    trainingLevel: row.trainingLevel,
    createdAt: row.createdAt,
  };
}

export { unit as unitRoutes };