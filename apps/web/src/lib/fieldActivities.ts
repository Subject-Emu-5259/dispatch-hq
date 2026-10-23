// ============================================
// Dispatch HQ — Police Field Activities
// ============================================
// Officer-initiated police work that weaves radio traffic into real gameplay:
//   • Traffic stops from patrolling units (10-28 → record/warrant check)
//   • Suspect checks (10-65 → BOLO if a record matches)
//   • Warrant BOLO broadcasts
//   • High-speed chases (Code 3 pursuit → pursuit mission + backup dispatch)
//   • Backup requests (nearby same-service unit auto-dispatched)
//
// Every activity radios through the shared dialogue engine (real streets/zones
// via the active city context) AND mutates the game store — missions spawn,
// records get linked, units get dispatched. Nothing is pure flavor.

import type { DialogueMessage } from '@/lib/radioDialogueEngine';
import { statusCode, getUnitServiceType } from '@/lib/radioDialogueEngine';
import { broadcastRadioSequence } from '@/utils/radioEvents';
import { useGameStore } from '@/stores/gameStore';
import { zoneIdForPoint, patrolZonesForCity } from '@/lib/patrol/patrolZones';
import { streetsForZone, zoneNameForId } from '@/data/cityStreets';
import { buildMission, attachSuspectToMission } from '@/lib/spawn';
import { FIELD_ACTIVITY_TEMPLATES, type MissionTemplate } from '@dispatch-hq/shared';
import type { Unit, CriminalRecord, Mission } from '@dispatch-hq/shared';
import { dispatchUnitToMission } from '@/lib/dispatchLogic';

// ── Small helpers ──────────────────────────────────────────────────────────

function zoneIdFor(unit: Unit): string | null {
  if (!unit.position) return null;
  const st = useGameStore.getState();
  const zones = st.mapBounds ? patrolZonesForCity({ bounds: st.mapBounds, boundary: st.selectedCity?.boundary ?? null }) : null;
  return zones ? zoneIdForPoint(zones, unit.position) : null;
}

function roadFor(unit: Unit): string {
  const zid = zoneIdFor(unit);
  const pool = streetsForZone(zid);
  return pool[Math.floor(Math.random() * pool.length)];
}

function zoneNameFor(unit: Unit): string {
  return zoneNameForId(zoneIdFor(unit));
}

function line(
  from: string, to: string | 'all', text: string, type: DialogueMessage['type'],
  service: 'police' | 'fire' | 'ems', fromUnitId?: string, toUnitId?: string,
): DialogueMessage {
  return { from, to, text, type, service, fromUnitId, toUnitId };
}

const DISPATCH = 'Dispatch';

// ── Sequence builders ──────────────────────────────────────────────────────

/** 10-28 traffic stop: unit stops a vehicle, dispatch runs a record check. */
export function trafficStopSequence(unit: Unit, record: CriminalRecord | null): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const road = roadFor(unit);
  const zone = zoneNameFor(unit);
  const unitName = unit.name;
  const out: DialogueMessage[] = [
    line(unitName, DISPATCH, `10-28, traffic stop at ${road}, ${zone}.`, 'unit', svc, unit.id),
    line(DISPATCH, unitName, '10-28 received. Running plate and wants/warrants…', 'dispatch', svc, undefined, unit.id),
  ];
  if (record && record.warrantStatus === 'active') {
    out.push(line(
      DISPATCH, unitName,
      `Wants/warrants confirmed — ${record.firstName} ${record.lastName} has an active warrant. Hold subject, backup requested.`,
      'dispatch', svc, undefined, unit.id,
    ));
    out.push(line(unitName, DISPATCH, `10-4, holding subject at ${road}. ${statusCode(svc, 'request')}`, 'unit', svc, unit.id));
  } else {
    out.push(line(DISPATCH, unitName, 'No wants, no warrants. Clear the stop.', 'dispatch', svc, undefined, unit.id));
    out.push(line(unitName, DISPATCH, `${statusCode(svc, 'available')}, resuming patrol.`, 'unit', svc, unit.id));
  }
  return out;
}

/** 10-65 suspicious-person check against the records pool. */
export function suspectCheckSequence(unit: Unit, record: CriminalRecord | null): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const road = roadFor(unit);
  const unitName = unit.name;
  const out: DialogueMessage[] = [
    line(unitName, DISPATCH, `10-65, suspicious subject at ${road}. Running a check.`, 'unit', svc, unit.id),
    line(DISPATCH, unitName, '10-4, running subject…', 'dispatch', svc, undefined, unit.id),
  ];
  if (record && record.warrantStatus === 'active') {
    out.push(line(
      DISPATCH, unitName,
      `Be advised — subject matches ${record.firstName} ${record.lastName}, active warrant, ${record.riskLevel} risk. Detain and confirm.`,
      'dispatch', svc, undefined, unit.id,
    ));
  } else {
    out.push(line(DISPATCH, unitName, 'No record match. Clear.', 'dispatch', svc, undefined, unit.id));
  }
  return out;
}

/** Citywide BOLO broadcast for an active warrant. */
export function warrantBoloSequence(record: CriminalRecord): DialogueMessage[] {
  const svc: 'police' | 'fire' | 'ems' = 'police';
  const charges = (record.charges ?? []).slice(0, 2).join(', ');
  return [
    line(DISPATCH, 'all', `BOLO — ${record.firstName} ${record.lastName}, DOB ${record.dateOfBirth}, last known ${record.address}. Active warrant, ${record.riskLevel} risk. Charges: ${charges}.`, 'broadcast', svc),
    line(DISPATCH, 'all', 'Use caution. Confirm identity before contact.', 'broadcast', svc),
  ];
}

/** High-speed pursuit: Code 3 chase, backup called. */
export function pursuitSequence(unit: Unit, backup: Unit | null): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const road = roadFor(unit);
  const unitName = unit.name;
  const out: DialogueMessage[] = [
    line(unitName, DISPATCH, `Code 3! Pursuit on ${road}, ${zoneNameFor(unit)}. Vehicle refusing to stop!`, 'unit', svc, unit.id),
    line(DISPATCH, 'all', `All units — pursuit in progress on ${road}. Backup requested.`, 'broadcast', svc),
  ];
  if (backup) {
    out.push(line(DISPATCH, backup.name, `${backup.name}, intercept the pursuit on ${road}.`, 'dispatch', svc, undefined, backup.id));
    out.push(line(backup.name, DISPATCH, `${statusCode(svc, 'en_route')}, moving to intercept.`, 'unit', svc, backup.id));
  }
  out.push(line(unitName, DISPATCH, `Maintaining visual, ${statusCode(svc, 'en_route')} speed on ${road}.`, 'unit', svc, unit.id));
  return out;
}

// ── Live chase phase ──────────────────────────────────────────────────────
// Once a pursuit mission is active, the lead unit radios periodic position
// updates (turns, speeds, road changes) so the chase reads as a live event
// instead of a static mission card. Updates continue until the mission is
// resolved or removed, then a closing report closes the loop.

/** How often the lead unit radios a chase update (ms of real time). */
export const PURSUIT_UPDATE_INTERVAL_MS = 10000;

interface ActivePursuit {
  unitId: string;
  lastUpdateAt: number;
  updateCount: number;
  direction: 'north' | 'south' | 'east' | 'west';
}

const activePursuits = new Map<string, ActivePursuit>();

/** Chase speed flavor (mph) — a pursuit implies speeding, so it never reads
 * slower than 55 mph and ramps up as the chase continues. */
function chaseSpeedMph(p: ActivePursuit, unit: Unit): number {
  const measured = unit.currentSpeed && unit.currentSpeed > 5
    ? Math.round(unit.currentSpeed * 2.237) // m/s → mph
    : 0;
  const base = Math.max(55, measured);
  return Math.min(110, base + p.updateCount * 4);
}

const CHASE_ACTIONS = [
  'just cut hard across three lanes',
  'is threading through traffic',
  'blew through a red light',
  'took a sharp left',
  'is hugging the shoulder',
  'just jumped the curb onto the sidewalk',
  'is weaving between cars',
  'took the service road',
  'just doubled back',
  'is gunning it down the straightaway',
];

const CHASE_TURNS = ['hard left', 'sharp right', 'sudden U-turn', 'quick lane change'];

const DIRECTIONS: ActivePursuit['direction'][] = ['north', 'south', 'east', 'west'];

/**
 * One live chase update from the lead unit — a turn, speed, or road change.
 * Rotates through flavors (bump via updateCount) so consecutive updates differ.
 */
export function pursuitUpdateSequence(unit: Unit, p: ActivePursuit): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const speed = chaseSpeedMph(p, unit);
  const road = roadFor(unit);
  const flavor = p.updateCount % 3 === 0 ? 'turn' : p.updateCount % 3 === 1 ? 'speed' : 'road';
  const out: DialogueMessage[] = [];

  if (flavor === 'turn') {
    const turn = CHASE_TURNS[p.updateCount % CHASE_TURNS.length];
    out.push(line(unit.name, DISPATCH, `He ${CHASE_ACTIONS[p.updateCount % CHASE_ACTIONS.length]} at ${road}.`, 'unit', svc, unit.id));
    out.push(line(unit.name, DISPATCH, `Now heading ${p.direction} on ${road} — staying on him, ${speed} mph.`, 'unit', svc, unit.id));
  } else if (flavor === 'speed') {
    out.push(line(unit.name, DISPATCH, `Speed check — we're at ${speed} mph on ${road}${p.updateCount > 1 ? ', he keeps pulling away' : ''}.`, 'unit', svc, unit.id));
    out.push(line(DISPATCH, unit.name, `10-4, maintain visual${p.updateCount > 1 ? '. Units closing on intercept' : ''}.`, 'dispatch', svc, undefined, unit.id));
  } else {
    const turn = CHASE_TURNS[p.updateCount % CHASE_TURNS.length];
    out.push(line(unit.name, DISPATCH, `Road change — ${turn} onto ${road}, heading ${p.direction}.`, 'unit', svc, unit.id));
    out.push(line(unit.name, DISPATCH, `Still Code 3, ${speed} mph${p.updateCount > 1 ? ' — he keeps pushing, closing the gap' : ''}.`, 'unit', svc, unit.id));
  }
  return out;
}

/** Final chase report once the pursuit mission resolves or is removed. */
export function pursuitEndSequence(unit: Unit, reason: 'resolved' | 'removed'): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const road = roadFor(unit);
  return [
    line(unit.name, DISPATCH, `Pursuit ${reason === 'resolved' ? 'terminated — suspect in custody' : 'called off'} at ${road}, ${zoneNameFor(unit)}.`, 'unit', svc, unit.id),
    line(DISPATCH, 'all', `All units — ${reason === 'resolved' ? 'pursuit resolved, Code 4' : 'pursuit called off, resume normal patrol'}.`, 'broadcast', svc),
  ];
}

/** Register a pursuit mission's lead unit so the chase phase can broadcast. */
export function startPursuitTracking(missionId: string, unit: Unit): void {
  const p: ActivePursuit = {
    unitId: unit.id,
    lastUpdateAt: Date.now(),
    updateCount: 0,
    direction: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
  };
  activePursuits.set(missionId, p);
}

/** Forget a pursuit (mission resolved / city changed / new game). */
export function endPursuitTracking(missionId: string): void {
  activePursuits.delete(missionId);
}

export function clearPursuitTracking(): void {
  activePursuits.clear();
}

export function activePursuitCount(): number {
  return activePursuits.size;
}

/** Mission statuses in which the chase is still live (any in-flight state). */
const CHASE_LIVE_STATUSES = new Set(['active', 'dispatching', 'en_route', 'on_scene', 'in_progress', 'completing']);

/**
 * Advance live chase radio. Called every game-loop tick from App.tsx.
 * - While the pursuit mission is in-flight, the lead unit radios updates
 *   roughly every PURSUIT_UPDATE_INTERVAL_MS (real time).
 * - When the mission resolves (completed → "terminated, suspect in custody";
 *   failed/expired → "called off") or disappears entirely, a closing report is
 *   broadcast and the pursuit is dropped. If both mission and unit are gone
 *   (e.g. a fresh campaign), tracking is dropped silently — no stale radio.
 */
export function tickPursuitRadio(nowMs: number): void {
  const st = useGameStore.getState();
  for (const [missionId, p] of activePursuits) {
    const mission = st.missions.find((m) => m.id === missionId);
    const unit = st.units.find((u) => u.id === p.unitId);

    // State reset (new game): nothing left to chase — drop silently.
    if (!mission && !unit) {
      activePursuits.delete(missionId);
      continue;
    }

    // Unit vanished mid-chase → nothing to radio from; drop silently.
    if (!unit) {
      activePursuits.delete(missionId);
      continue;
    }

    // Mission removed while the unit is still around → called off.
    if (!mission) {
      broadcastRadioSequence(pursuitEndSequence(unit, 'removed'));
      activePursuits.delete(missionId);
      continue;
    }

    // Chase is still hot → periodic updates.
    if (CHASE_LIVE_STATUSES.has(mission.status)) {
      if (nowMs - p.lastUpdateAt >= PURSUIT_UPDATE_INTERVAL_MS) {
        p.lastUpdateAt = nowMs;
        p.updateCount += 1;
        p.direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        broadcastRadioSequence(pursuitUpdateSequence(unit, p));
      }
      continue;
    }

    // Terminal state → closing report (captured on completion, called off on
    // failure/expiry).
    const resolved = mission.status === 'completed';
    broadcastRadioSequence(pursuitEndSequence(unit, resolved ? 'resolved' : 'removed'));
    activePursuits.delete(missionId);
  }
}

/** Backup request from a unit already working a call. */
export function backupRequestSequence(unit: Unit, backup: Unit): DialogueMessage[] {
  const svc = getUnitServiceType(unit.type) as 'police' | 'fire' | 'ems';
  const road = roadFor(unit);
  const out: DialogueMessage[] = [
    line(unit.name, DISPATCH, `Requesting backup at ${road}, ${zoneNameFor(unit)}. ${statusCode(svc, 'request')}`, 'unit', svc, unit.id),
    line(DISPATCH, backup.name, `${backup.name}, respond backup to ${unit.name} at ${road}.`, 'dispatch', svc, undefined, backup.id),
    line(backup.name, DISPATCH, `${statusCode(svc, 'en_route')}, en route. ETA 2 minutes.`, 'unit', svc, backup.id),
  ];
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────

const TEMPLATE_BY_ID = new Map<string, MissionTemplate>(FIELD_ACTIVITY_TEMPLATES.map((t) => [t.id, t]));

/** Pick a random unlinked record from the pool. */
function pickRecord(): CriminalRecord | null {
  const st = useGameStore.getState();
  const pool = st.criminalRecords.filter((r) => !r.missionId);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Does this stopped/checked subject escalate to a warrant? High-risk subjects
 * are far more likely to have wants; unlinked pool records start clean, so the
 * escalation mirrors attachSuspectToMission (which flips warrantStatus active
 * when a call links a subject) instead of requiring pre-seeded warrants.
 * Exported for tests — injectable RNG keeps it deterministic.
 */
export function shouldEscalate(record: CriminalRecord, rand: () => number = Math.random): boolean {
  const base =
    record.riskLevel === 'violent' ? 0.55 :
    record.riskLevel === 'high' ? 0.4 :
    record.riskLevel === 'medium' ? 0.24 : 0.12;
  return rand() < base;
}

/**
 * Run one random police field activity. Called on an interval from App.tsx.
 * Returns a label of what happened (for the caller's notification), or null.
 */
export async function runPoliceFieldActivity(): Promise<string | null> {
  const st = useGameStore.getState();
  if (st.selectedService !== 'police') return null;
  const patrolling = st.units.filter((u) => u.status === 'patrolling' && getUnitServiceType(u.type) === 'police' && u.position);
  if (patrolling.length === 0) return null;
  const unit = patrolling[Math.floor(Math.random() * patrolling.length)];

  // Weighted roll: stops and checks are common; pursuits and BOLOs rarer.
  const roll = Math.random();
  try {
    if (roll < 0.38) {
      // Traffic stop — escalate to a warrant service when the subject has wants.
      const record = pickRecord();
      if (record && shouldEscalate(record)) {
        broadcastRadioSequence(trafficStopSequence(unit, { ...record, warrantStatus: 'active' }));
        await spawnWarrantMission(unit, record);
        return 'Traffic stop → active warrant, mission created';
      }
      broadcastRadioSequence(trafficStopSequence(unit, record));
      return record ? 'Traffic stop, clean' : 'Traffic stop, no record';
    }

    if (roll < 0.62) {
      // Suspect check — BOLO + mission when the subject matches a warrant profile.
      const record = pickRecord();
      if (record && shouldEscalate(record)) {
        broadcastRadioSequence(suspectCheckSequence(unit, { ...record, warrantStatus: 'active' }));
        await spawnWarrantMission(unit, record);
        return 'Suspect check → warrant match, mission created';
      }
      broadcastRadioSequence(suspectCheckSequence(unit, record));
      return record ? 'Suspect check, clean' : 'Suspect check, no match';
    }

    if (roll < 0.78) {
      // Citywide warrant BOLO — based on a real (high-risk) record.
      const record = pickRecord();
      if (record && record.riskLevel !== 'low') {
        broadcastRadioSequence(warrantBoloSequence({ ...record, warrantStatus: 'active' }));
        return `BOLO issued for ${record.firstName} ${record.lastName}`;
      }
      return null;
    }

    if (roll < 0.9) {
      // High-speed pursuit → pursuit mission + backup dispatch.
      const mission = await spawnPursuitMission(unit);
      if (!mission) return null;
      const backup = findNearestBackup(unit, st.units);
      broadcastRadioSequence(pursuitSequence(unit, backup));
      if (backup) await dispatchUnitToMission(backup.id, mission);
      return 'High-speed pursuit started';
    }

    // Backup request from a unit already on a call.
    return await runBackupRequest();
  } catch (err) {
    console.warn('Field activity failed:', err);
    return null;
  }
}

async function spawnWarrantMission(unit: Unit, record: CriminalRecord): Promise<void> {
  const st = useGameStore.getState();
  if (!st.selectedCity || st.missions.length >= 25) return;
  const template = TEMPLATE_BY_ID.get('warrant_service');
  if (!template) return;
  const mission = await buildMission('police', st.selectedCity, {
    template,
    origin: unit.position ?? undefined,
    originDescription: `wants/warrants check by ${unit.name}`,
    level: st.player?.level ?? 1,
    skipSuspect: true,
  });
  st.addMission(mission);
  st.linkCriminalRecordToMission(record.id, mission.id);
  st.updateCriminalRecord(record.id, { warrantStatus: 'active' });
}

async function spawnPursuitMission(unit: Unit): Promise<Mission | null> {
  const st = useGameStore.getState();
  if (!st.selectedCity || st.missions.length >= 25) return null;
  const template = TEMPLATE_BY_ID.get('police_pursuit');
  if (!template) return null;
  const mission = await buildMission('police', st.selectedCity, {
    template,
    origin: unit.position ?? undefined,
    originDescription: `initiated by ${unit.name}`,
    level: st.player?.level ?? 1,
  });
  st.addMission(mission);
  attachSuspectToMission(mission);
  // Live chase phase: the initiating unit becomes the lead and radios periodic
  // position updates until the pursuit mission resolves.
  startPursuitTracking(mission.id, unit);
  return mission;
}

/** Nearest available same-service unit (for backup/pursuit intercept). */
function findNearestBackup(unit: Unit, units: Unit[]): Unit | null {
  const svc = getUnitServiceType(unit.type);
  const candidates = units.filter(
    (u) => u.id !== unit.id && u.status === 'available' && u.position && getUnitServiceType(u.type) === svc,
  );
  if (candidates.length === 0) return null;
  const dist = (u: Unit) => {
    const dLat = u.position!.lat - unit.position!.lat;
    const dLng = u.position!.lng - unit.position!.lng;
    return dLat * dLat + dLng * dLng;
  };
  return candidates.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
}

/** Backup request: a unit on a call gets the nearest available unit dispatched. */
async function runBackupRequest(): Promise<string | null> {
  const st = useGameStore.getState();
  const onCall = st.units.find(
    (u) => (u.status === 'on_scene' || u.status === 'en_route') && u.missionId && u.position,
  );
  if (!onCall) return null;
  const backup = findNearestBackup(onCall, st.units);
  if (!backup) return null;
  const mission = st.missions.find((m) => m.id === onCall.missionId);
  if (!mission) return null;
  broadcastRadioSequence(backupRequestSequence(onCall, backup));
  await dispatchUnitToMission(backup.id, mission);
  return `Backup sent: ${backup.name} → ${onCall.name}`;
}
