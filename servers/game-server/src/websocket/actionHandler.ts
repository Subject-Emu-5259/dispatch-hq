// ============================================
// Dispatch HQ — WebSocket Action Handler
// ============================================

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, stations, units } from '../db/schema';
import { STATION_CONFIGS, STATION_LEVELS, UNIT_CONFIGS } from '@dispatch-hq/shared';
import type { GameAction, ActionResult, StateChange } from '@dispatch-hq/shared';

export async function handleAction(
  playerId: string,
  action: GameAction,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  try {
    switch (action.type) {
      case 'build_station':
        return await buildStation(playerId, action);
      case 'upgrade_station':
        return await upgradeStation(playerId, action);
      case 'buy_unit':
        return await buyUnit(playerId, action);
      case 'dispatch_unit':
        return await dispatchUnit(playerId, action);
      case 'recall_unit':
        return await recallUnit(playerId, action);
      default:
        return {
          result: { success: false, error: `Unknown action type: ${(action as { type: string }).type}` },
          changes: [],
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { result: { success: false, error: message }, changes: [] };
  }
}

// Batch 1 (P1-M2): this path is currently DEAD from the client (no
// `type: 'action'` sender exists — it is hardened, NOT wired back up), but
// the old shape was a free-unit bug waiting to happen: the station/unit was
// INSERTED before the debit, and the debit was an unguarded relative update
// after a JS balance check, so a crash between insert and debit (or two
// concurrent actions) minted free assets or drove credits negative. Every
// money action below is now ONE transaction: guarded debit FIRST
// (`credits >= cost` in the WHERE clause, affected rows as the verdict),
// then the asset insert/update. A failed debit rolls everything back.
async function buildStation(
  playerId: string,
  action: Extract<GameAction, { type: 'build_station' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const config = STATION_CONFIGS[action.stationType];
  if (!config) {
    return { result: { success: false, error: 'Invalid station type' }, changes: [] };
  }
  const done = await db.transaction(async (tx) => {
    const debited = await tx.update(players)
      .set({ credits: sql`${players.credits} - ${config.baseCost}` })
      .where(and(eq(players.id, playerId), sql`${players.credits} >= ${config.baseCost}`))
      .returning({ credits: players.credits });
    if (debited.length === 0) return null;
    const result = await tx.insert(stations).values({
      ownerId: playerId,
      stationType: action.stationType,
      name: `${config.name} ${Date.now().toString().slice(-4)}`,
      lat: action.position.lat,
      lng: action.position.lng,
      level: 1,
      capacity: config.baseCapacity,
      unitCount: 0,
      coverageRadius: STATION_LEVELS[0].coverageRadius,
    }).returning();
    return { station: result[0], credits: debited[0].credits };
  });
  if (!done) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  const changes: StateChange[] = [
    { entity: 'station', id: done.station.id, changes: { created: done.station } },
    { entity: 'player', id: playerId, changes: { credits: done.credits } },
  ];
  return { result: { success: true, data: { station: done.station } }, changes };
}

async function upgradeStation(
  playerId: string,
  action: Extract<GameAction, { type: 'upgrade_station' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const rows = await db.select().from(stations).where(eq(stations.id, action.stationId)).limit(1);
  if (rows.length === 0) {
    return { result: { success: false, error: 'Station not found' }, changes: [] };
  }
  const station = rows[0];
  if (station.ownerId !== playerId) {
    return { result: { success: false, error: 'Not owner' }, changes: [] };
  }
  const nextLevel = station.level + 1;
  const levelConfig = STATION_LEVELS.find((l) => l.level === nextLevel);
  if (!levelConfig) {
    return { result: { success: false, error: 'Station already at max level' }, changes: [] };
  }
  const done = await db.transaction(async (tx) => {
    const debited = await tx.update(players)
      .set({ credits: sql`${players.credits} - ${levelConfig.cost}` })
      .where(and(eq(players.id, playerId), sql`${players.credits} >= ${levelConfig.cost}`))
      .returning({ credits: players.credits });
    if (debited.length === 0) return null;
    await tx.update(stations)
      .set({
        level: nextLevel,
        capacity: levelConfig.capacity,
        coverageRadius: levelConfig.coverageRadius,
      })
      .where(eq(stations.id, station.id));
    return debited[0].credits;
  });
  if (done === null) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  const changes: StateChange[] = [
    {
      entity: 'station',
      id: station.id,
      changes: { level: nextLevel, capacity: levelConfig.capacity, coverageRadius: levelConfig.coverageRadius },
    },
    { entity: 'player', id: playerId, changes: { credits: done } },
  ];
  return { result: { success: true, data: { stationId: station.id, level: nextLevel } }, changes };
}

async function buyUnit(
  playerId: string,
  action: Extract<GameAction, { type: 'buy_unit' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const unitConfig = UNIT_CONFIGS[action.unitType];
  if (!unitConfig) {
    return { result: { success: false, error: 'Invalid unit type' }, changes: [] };
  }
  const stationRows = await db.select().from(stations).where(eq(stations.id, action.stationId)).limit(1);
  if (stationRows.length === 0) {
    return { result: { success: false, error: 'Station not found' }, changes: [] };
  }
  const station = stationRows[0];
  if (station.ownerId !== playerId) {
    return { result: { success: false, error: 'Not owner' }, changes: [] };
  }
  if (station.unitCount >= station.capacity) {
    return { result: { success: false, error: 'Station at capacity' }, changes: [] };
  }
  const done = await db.transaction(async (tx) => {
    const debited = await tx.update(players)
      .set({ credits: sql`${players.credits} - ${unitConfig.cost}` })
      .where(and(eq(players.id, playerId), sql`${players.credits} >= ${unitConfig.cost}`))
      .returning({ credits: players.credits });
    if (debited.length === 0) return null;
    const result = await tx.insert(units).values({
      ownerId: playerId,
      stationId: action.stationId,
      unitType: action.unitType,
      name: unitConfig.name,
      status: 'available',
      heading: 0,
      speed: 0,
      trainingLevel: 1,
    }).returning();
    const unit = result[0];
    await tx.update(stations)
      .set({ unitCount: sql`(SELECT COUNT(*) FROM ${units} WHERE station_id = ${action.stationId})` })
      .where(eq(stations.id, action.stationId));
    return { unit, credits: debited[0].credits };
  });
  if (!done) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  const changes: StateChange[] = [
    { entity: 'unit', id: done.unit.id, changes: { created: done.unit } },
    { entity: 'station', id: station.id, changes: { unitCount: station.unitCount + 1 } },
    { entity: 'player', id: playerId, changes: { credits: done.credits } },
  ];
  return { result: { success: true, data: { unit: done.unit } }, changes };
}

async function dispatchUnit(
  playerId: string,
  action: Extract<GameAction, { type: 'dispatch_unit' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const rows = await db.select().from(units).where(eq(units.id, action.unitId)).limit(1);
  if (rows.length === 0) {
    return { result: { success: false, error: 'Unit not found' }, changes: [] };
  }
  const unit = rows[0];
  if (unit.ownerId !== playerId) {
    return { result: { success: false, error: 'Not owner' }, changes: [] };
  }
  if (unit.status !== 'available') {
    return { result: { success: false, error: `Unit is ${unit.status}` }, changes: [] };
  }
  await db.update(units)
    .set({ status: 'dispatched', missionId: action.missionId })
    .where(eq(units.id, unit.id));
  const changes: StateChange[] = [
    { entity: 'unit', id: unit.id, changes: { status: 'dispatched', missionId: action.missionId } },
  ];
  return { result: { success: true, data: { unitId: unit.id } }, changes };
}

async function recallUnit(
  playerId: string,
  action: Extract<GameAction, { type: 'recall_unit' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const rows = await db.select().from(units).where(eq(units.id, action.unitId)).limit(1);
  if (rows.length === 0) {
    return { result: { success: false, error: 'Unit not found' }, changes: [] };
  }
  const unit = rows[0];
  if (unit.ownerId !== playerId) {
    return { result: { success: false, error: 'Not owner' }, changes: [] };
  }
  await db.update(units)
    .set({ status: 'available', missionId: null })
    .where(eq(units.id, unit.id));
  const changes: StateChange[] = [
    { entity: 'unit', id: unit.id, changes: { status: 'available', missionId: null } },
  ];
  return { result: { success: true, data: { unitId: unit.id } }, changes };
}