import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { missions } from '../db/schema';

const mission = new Hono();

mission.get('/', async (c) => {
  const status = c.req.query('status');
  const ownerId = c.req.query('ownerId');
  let query = db.select().from(missions);
  if (status) {
    const result = await query.where(eq(missions.status, status));
    return c.json({ missions: result.map(formatMission) });
  }
  const result = await query.orderBy(desc(missions.createdAt));
  return c.json({ missions: result.map(formatMission) });
});

mission.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(missions).where(eq(missions.id, id)).limit(1);
  if (result.length === 0) {
    return c.json({ error: 'Mission not found' }, 404);
  }
  return c.json({ mission: formatMission(result[0]) });
});

mission.post('/', async (c) => {
  const body = await c.req.json();
  const { templateId, name, description, category, difficulty, creditsReward, xpReward, requirements, lat, lng, totalTime } = body;
  if (!templateId || !name || !category || difficulty === undefined || creditsReward === undefined || xpReward === undefined || lat === undefined || lng === undefined) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const duration = totalTime ?? 600;
  const result = await db.insert(missions).values({
    templateId,
    name,
    description: description ?? null,
    category,
    status: 'active',
    lat,
    lng,
    poiType: body.poiType ?? null,
    difficulty,
    creditsReward,
    xpReward,
    requirements: requirements ?? [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: duration,
    totalTime: duration,
    expiresAt: new Date(Date.now() + duration * 1000),
  }).returning();
  return c.json({ mission: formatMission(result[0]) }, 201);
});

mission.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowedFields = ['status', 'progress', 'timeRemaining', 'assignedUnits', 'poiType'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  await db.update(missions).set(updates).where(eq(missions.id, id));
  return c.json({ success: true });
});

mission.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(missions).where(eq(missions.id, id));
  return c.json({ success: true });
});

function formatMission(row: typeof missions.$inferSelect) {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    icon: '',
    status: row.status,
    location: { lat: row.lat, lng: row.lng },
    poiType: row.poiType,
    difficulty: row.difficulty,
    creditsReward: row.creditsReward,
    xpReward: row.xpReward,
    requirements: row.requirements,
    assignedUnits: row.assignedUnits,
    progress: row.progress,
    timeRemaining: row.timeRemaining,
    totalTime: row.totalTime,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export { mission as missionRoutes };