import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { stations } from '../db/schema';

const station = new Hono();

station.get('/', async (c) => {
  const ownerId = c.req.query('ownerId');
  if (ownerId) {
    const result = await db.select().from(stations).where(eq(stations.ownerId, ownerId));
    return c.json({ stations: result.map(formatStation) });
  }
  const result = await db.select().from(stations);
  return c.json({ stations: result.map(formatStation) });
});

station.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(stations).where(eq(stations.id, id)).limit(1);
  if (result.length === 0) {
    return c.json({ error: 'Station not found' }, 404);
  }
  return c.json({ station: formatStation(result[0]) });
});

station.post('/', async (c) => {
  const body = await c.req.json();
  const { ownerId, stationType, name, lat, lng } = body;
  if (!ownerId || !stationType || !name || lat === undefined || lng === undefined) {
    return c.json({ error: 'Missing required fields: ownerId, stationType, name, lat, lng' }, 400);
  }
  const result = await db.insert(stations).values({
    ownerId,
    stationType,
    name,
    lat,
    lng,
    level: 1,
    capacity: 3,
    unitCount: 0,
    coverageRadius: 1000,
  }).returning();
  return c.json({ station: formatStation(result[0]) }, 201);
});

station.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowedFields = ['level', 'capacity', 'unitCount', 'coverageRadius', 'name'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  await db.update(stations).set(updates).where(eq(stations.id, id));
  return c.json({ success: true });
});

station.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(stations).where(eq(stations.id, id));
  return c.json({ success: true });
});

function formatStation(row: typeof stations.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    type: row.stationType,
    level: row.level,
    name: row.name,
    position: { lat: row.lat, lng: row.lng },
    capacity: row.capacity,
    unitCount: row.unitCount,
    coverageRadius: row.coverageRadius,
    createdAt: row.createdAt,
  };
}

export { station as stationRoutes };