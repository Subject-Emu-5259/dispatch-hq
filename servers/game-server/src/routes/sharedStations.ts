// ============================================
// Dispatch HQ — Alliance Shared Station Routes
// ============================================
// Phase 3 of the v1.0 co-op endgame: build/upgrade/claim stations from the
// alliance treasury. Shared stations belong to the alliance, not a player,
// and answer missions for any alliance member in the same city.

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { stations, allianceMembers, allianceTreasury, allianceTreasuryTransactions, players } from '../db/schema';
import { logAllianceActivity } from './activity';
import type { AuthVars } from '../auth/middleware';

const sharedStationsRouter = new Hono<{ Variables: AuthVars }>();

// ── Station build costs (mirrors STATION_CONFIGS in shared/constants) ────────
const STATION_COSTS: Record<string, number> = {
  fire_station: 5000,
  police_station: 4000,
  ems_station: 4500,
};

const UPGRADE_COSTS: number[] = [
  0,      // level 1 (free)
  12_500, // level 2
  31_250, // level 3
  78_125, // level 4
  195_312, // level 5
];

async function getMembership(playerId: string) {
  const rows = await db
    .select({ allianceId: allianceMembers.allianceId, role: allianceMembers.role, allianceLevel: sql<number>`COALESCE((SELECT level FROM alliances WHERE id = ${allianceMembers.allianceId}), 1)` })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  return rows[0] ?? null;
}

async function getOrCreateTreasury(allianceId: string) {
  await db.insert(allianceTreasury).values({ allianceId, balance: 0 }).onConflictDoNothing();
  const rows = await db.select().from(allianceTreasury).where(eq(allianceTreasury.allianceId, allianceId)).limit(1);
  return rows[0];
}

// ── GET /api/alliances/shared-stations — list alliance-owned stations ───────
sharedStationsRouter.get('/', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const rows = await db
    .select()
    .from(stations)
    .where(eq(stations.allianceId, membership.allianceId));

  return c.json({
    stations: rows.map((s) => ({
      id: s.id,
      ownerId: s.ownerId,
      allianceId: s.allianceId,
      type: s.stationType,
      level: s.level,
      name: s.name,
      position: { lat: s.lat, lng: s.lng },
      capacity: s.capacity,
      unitCount: s.unitCount,
      coverageRadius: s.coverageRadius,
    })),
  });
});

// ── POST /api/alliances/shared-stations/build — build a station from treasury ─
sharedStationsRouter.post('/build', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json<{ stationType?: string; name?: string; lat?: number; lng?: number }>();
  const { stationType, name, lat, lng } = body;

  if (!stationType || !name || lat === undefined || lng === undefined) {
    return c.json({ error: 'Missing required fields: stationType, name, lat, lng' }, 400);
  }

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Shared stations require alliance level 3+
  if (membership.allianceLevel < 3) {
    return c.json({ error: 'Shared stations require alliance level 3+' }, 403);
  }

  // Only officers+ can build
  if (membership.role !== 'leader' && membership.role !== 'officer') {
    return c.json({ error: 'Only alliance leaders and officers can build shared stations' }, 403);
  }

  // Check station type is valid
  const buildCost = STATION_COSTS[stationType];
  if (buildCost === undefined) {
    return c.json({ error: `Invalid station type: ${stationType}` }, 400);
  }

  // Check treasury has enough
  const treasury = await getOrCreateTreasury(membership.allianceId);
  if (treasury.balance < buildCost) {
    return c.json({ error: `Insufficient treasury balance. Need ${buildCost.toLocaleString()}, have ${treasury.balance.toLocaleString()}` }, 400);
  }

  const newBalance = treasury.balance - buildCost;

  // Atomic: deduct from treasury, log transaction, create station
  const newStation = await db.transaction(async (tx) => {
    // Deduct from treasury
    await tx.update(allianceTreasury)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(allianceTreasury.allianceId, membership.allianceId));

    // Log transaction
    await tx.insert(allianceTreasuryTransactions).values({
      allianceId: membership.allianceId,
      playerId,
      delta: -buildCost,
      reason: 'station_build',
      balanceAfter: newBalance,
    });

    // Create station
    const [station] = await tx.insert(stations).values({
      ownerId: playerId,
      stationType,
      name,
      lat,
      lng,
      level: 1,
      capacity: 3,
      unitCount: 0,
      coverageRadius: 1000,
      allianceId: membership.allianceId,
    }).returning();

    return station;
  });

  // Log activity feed event
  void logAllianceActivity(membership.allianceId, playerId, 'station_built',
    `Built ${name} (${stationType.replace(/_/g, ' ')}) for ${buildCost.toLocaleString()} credits`);

  return c.json({
    station: {
      id: newStation.id,
      type: newStation.stationType,
      level: newStation.level,
      name: newStation.name,
      position: { lat: newStation.lat, lng: newStation.lng },
      allianceId: newStation.allianceId,
    },
    treasuryBalance: newBalance,
    costPaid: buildCost,
  }, 201);
});

// ── POST /api/alliances/shared-stations/:id/upgrade — upgrade from treasury ──
sharedStationsRouter.post('/:id/upgrade', async (c) => {
  const playerId = c.get('playerId');
  const stationId = c.req.param('id');

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Only officers+ can upgrade
  if (membership.role !== 'leader' && membership.role !== 'officer') {
    return c.json({ error: 'Only alliance leaders and officers can upgrade shared stations' }, 403);
  }

  // Find the station — must be alliance-owned
  const [station] = await db
    .select()
    .from(stations)
    .where(and(eq(stations.id, stationId), eq(stations.allianceId, membership.allianceId)))
    .limit(1);

  if (!station) return c.json({ error: 'Station not found or not alliance-owned' }, 404);

  // Check max level
  if (station.level >= 5) return c.json({ error: 'Station is already at max level' }, 400);

  const nextLevel = station.level + 1;
  const upgradeCost = UPGRADE_COSTS[nextLevel] ?? 0;

  // Check treasury
  const treasury = await getOrCreateTreasury(membership.allianceId);
  if (treasury.balance < upgradeCost) {
    return c.json({ error: `Insufficient treasury balance. Need ${upgradeCost.toLocaleString()}, have ${treasury.balance.toLocaleString()}` }, 400);
  }

  const newBalance = treasury.balance - upgradeCost;

  // Atomic: deduct from treasury, log transaction, upgrade station
  await db.transaction(async (tx) => {
    await tx.update(allianceTreasury)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(allianceTreasury.allianceId, membership.allianceId));

    await tx.insert(allianceTreasuryTransactions).values({
      allianceId: membership.allianceId,
      playerId,
      delta: -upgradeCost,
      reason: 'upgrade',
      refId: stationId,
      balanceAfter: newBalance,
    });

    await tx.update(stations)
      .set({ level: nextLevel })
      .where(eq(stations.id, stationId));
  });

  // Log activity feed event
  void logAllianceActivity(membership.allianceId, playerId, 'station_upgraded',
    `Upgraded ${station.name} from level ${station.level} to ${nextLevel} for ${upgradeCost.toLocaleString()} credits`);

  return c.json({
    stationId,
    previousLevel: station.level,
    newLevel: nextLevel,
    treasuryBalance: newBalance,
    costPaid: upgradeCost,
  });
});

// ── POST /api/alliances/shared-stations/:id/claim — claim as personal station ──
// The player pays the treasury the full build cost to make it their private station.
sharedStationsRouter.post('/:id/claim', async (c) => {
  const playerId = c.get('playerId');
  const stationId = c.req.param('id');

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Find the station — must be alliance-owned
  const [station] = await db
    .select()
    .from(stations)
    .where(and(eq(stations.id, stationId), eq(stations.allianceId, membership.allianceId)))
    .limit(1);

  if (!station) return c.json({ error: 'Station not found or not alliance-owned' }, 404);

  // Claim cost = full build cost of the station type
  const claimCost = STATION_COSTS[station.stationType] ?? 5000;

  // Treasury row must exist before the guarded credit below (created at
  // alliance/shared-station build time; this is an idempotent backstop).
  await getOrCreateTreasury(membership.allianceId);

  // Batch 1 (P1-M2): the WHOLE claim runs inside one transaction, and the
  // ownership transfer itself is the mutex: the station update matches only
  // while it is still alliance-owned, so a second concurrent claim finds
  // zero rows and fails instead of double-transferring. The player debit is
  // a guarded UPDATE (`credits >= claimCost`) in the same transaction, so a
  // double-claim can never double-spend either. The old code checked the
  // balance OUTSIDE the transaction and wrote absolute values for both legs.
  const claimed = await db.transaction(async (tx) => {
    const transferred = await tx.update(stations)
      .set({ allianceId: null, ownerId: playerId })
      .where(and(eq(stations.id, stationId), eq(stations.allianceId, membership.allianceId)))
      .returning({ id: stations.id });
    if (transferred.length === 0) return null;
    const debited = await tx.update(players)
      .set({ credits: sql`${players.credits} - ${claimCost}` })
      .where(and(eq(players.id, playerId), sql`${players.credits} >= ${claimCost}`))
      .returning({ credits: players.credits });
    if (debited.length === 0) return null;
    const credited = await tx.update(allianceTreasury)
      .set({ balance: sql`${allianceTreasury.balance} + ${claimCost}`, updatedAt: new Date() })
      .where(eq(allianceTreasury.allianceId, membership.allianceId))
      .returning({ balance: allianceTreasury.balance });
    if (credited.length === 0) return null;
    await tx.insert(allianceTreasuryTransactions).values({
      allianceId: membership.allianceId,
      playerId,
      delta: claimCost,
      reason: 'station_build',
      refId: stationId,
      balanceAfter: credited[0].balance,
    });
    return debited[0];
  });
  if (!claimed) {
    return c.json({ error: 'Station already claimed or insufficient credits' }, 409);
  }

  // Log activity feed event
  void logAllianceActivity(membership.allianceId, playerId, 'station_claimed',
    `Claimed ${station.name} (${station.stationType.replace(/_/g, ' ')}) for ${claimCost.toLocaleString()} credits`);

  return c.json({
    stationId,
    claimedBy: playerId,
    claimCost,
    playerCredits: claimed.credits,
  });
});

export { sharedStationsRouter };
