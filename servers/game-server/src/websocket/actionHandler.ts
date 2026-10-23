// ============================================
// Dispatch HQ — WebSocket Action Handler
// ============================================

import { eq, sql } from 'drizzle-orm';
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

async function buildStation(
  playerId: string,
  action: Extract<GameAction, { type: 'build_station' }>,
): Promise<{ result: ActionResult; changes: StateChange[] }> {
  const config = STATION_CONFIGS[action.stationType];
  if (!config) {
    return { result: { success: false, error: 'Invalid station type' }, changes: [] };
  }
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (playerRows.length === 0) {
    return { result: { success: false, error: 'Player not found' }, changes: [] };
  }
  const player = playerRows[0];
  if (player.credits < config.baseCost) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  const result = await db.insert(stations).values({
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
  const station = result[0];
  await db.update(players)
    .set({ credits: sql`${players.credits} - ${config.baseCost}` })
    .where(eq(players.id, playerId));
  const changes: StateChange[] = [
    { entity: 'station', id: station.id, changes: { created: station } },
    { entity: 'player', id: playerId, changes: { credits: player.credits - config.baseCost } },
  ];
  return { result: { success: true, data: { station } }, changes };
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
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  const player = playerRows[0];
  if (player.credits < levelConfig.cost) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  await db.update(stations)
    .set({
      level: nextLevel,
      capacity: levelConfig.capacity,
      coverageRadius: levelConfig.coverageRadius,
    })
    .where(eq(stations.id, station.id));
  await db.update(players)
    .set({ credits: sql`${players.credits} - ${levelConfig.cost}` })
    .where(eq(players.id, playerId));
  const changes: StateChange[] = [
    {
      entity: 'station',
      id: station.id,
      changes: { level: nextLevel, capacity: levelConfig.capacity, coverageRadius: levelConfig.coverageRadius },
    },
    { entity: 'player', id: playerId, changes: { credits: player.credits - levelConfig.cost } },
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
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  const player = playerRows[0];
  if (player.credits < unitConfig.cost) {
    return { result: { success: false, error: 'Insufficient credits' }, changes: [] };
  }
  const result = await db.insert(units).values({
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
  await db.update(stations)
    .set({ unitCount: sql`(SELECT COUNT(*) FROM ${units} WHERE station_id = ${action.stationId})` })
    .where(eq(stations.id, action.stationId));
  await db.update(players)
    .set({ credits: sql`${players.credits} - ${unitConfig.cost}` })
    .where(eq(players.id, playerId));
  const changes: StateChange[] = [
    { entity: 'unit', id: unit.id, changes: { created: unit } },
    { entity: 'station', id: station.id, changes: { unitCount: station.unitCount + 1 } },
    { entity: 'player', id: playerId, changes: { credits: player.credits - unitConfig.cost } },
  ];
  return { result: { success: true, data: { unit } }, changes };
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