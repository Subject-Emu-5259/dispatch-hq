import { describe, it, expect } from 'vitest';
import {
  findNearestDispatchUnit, findNearestDispatchUnits, requiredServicesForMission,
  serviceCanAnswerMission, backupServicesFor, unitCommittedElsewhere, requirementGapReason,
  dispatchPlanParts, dispatchPlanLabel, findNearestBackupUnit, missingBackupServices,
  backupAssignedUnits, unitCanPatrol,
} from './dispatchLogic';
import type { Mission, Unit } from '@dispatch-hq/shared';

const mission = (category: Mission['category'], reqTypes: string[]): Mission => ({
  id: 'm1',
  templateId: 't1',
  name: 'Test call',
  description: 'A test incident',
  category,
  icon: '🚨',
  status: 'active',
  location: { lat: 35.05, lng: -90.06 },
  poiType: null,
  difficulty: 3,
  creditsReward: 100,
  xpReward: 10,
  requirements: reqTypes.map((unitType) => ({ unitType, count: 1, minTrainingLevel: 0 })),
  assignedUnits: [],
  progress: 0,
  timeRemaining: 300,
  totalTime: 300,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
});

const unit = (id: string, type: string, pos: { lat: number; lng: number }, over: Partial<Unit> = {}): Unit =>
  ({ id, type, name: `Unit ${id}`, status: 'available', position: pos, speed: 13.9, ...over }) as Unit;

// Mission sits at 35.05/-90.06. Near ≈ 1.5 km away, far ≈ 7 km away.
const NEAR = { lat: 35.04, lng: -90.05 };
const FAR = { lat: 35.0, lng: -90.0 };

describe('serviceCanAnswerMission — patrol intercept spotting (v0.22.12)', () => {
  it('lets a patrol unit spot missions of its own primary category', () => {
    expect(serviceCanAnswerMission('police', mission('police', ['patrol_car']))).toBe(true);
    expect(serviceCanAnswerMission('fire', mission('fire', ['engine']))).toBe(true);
    expect(serviceCanAnswerMission('ems', mission('ems', ['ambulance']))).toBe(true);
  });

  it('lets a unit spot a crossover mission its requirement covers', () => {
    // Fire-category scene that needs a police car for crowd control → police
    // patrol units can spot it.
    expect(serviceCanAnswerMission('police', mission('fire', ['engine', 'police_car']))).toBe(true);
    // Fire-category hazmat scene needing an ambulance → EMS can spot it.
    expect(serviceCanAnswerMission('ems', mission('fire', ['engine', 'ambulance']))).toBe(true);
  });

  it('never lets a unit spot an incident its service cannot crew', () => {
    // A fire scene with only fire requirements is not police-answerable — no
    // more "crowd control" flavor suggestions a police unit can't fulfill.
    expect(serviceCanAnswerMission('police', mission('fire', ['engine']))).toBe(false);
    expect(serviceCanAnswerMission('ems', mission('police', ['patrol_car']))).toBe(false);
    expect(serviceCanAnswerMission('fire', mission('ems', ['ambulance']))).toBe(false);
  });

  it('treats empty requirements as primary-category only', () => {
    expect(serviceCanAnswerMission('police', mission('police', []))).toBe(true);
    expect(serviceCanAnswerMission('fire', mission('police', []))).toBe(false);
  });
});

describe('backupServicesFor — patrol intercept needs-backup hint (v0.22.16)', () => {
  it('returns no backup when the unit\'s service fully covers the plan', () => {
    expect(backupServicesFor('police', mission('police', ['patrol_car']))).toEqual([]);
    expect(backupServicesFor('fire', mission('fire', ['engine']))).toEqual([]);
    expect(backupServicesFor('ems', mission('ems', ['ambulance']))).toEqual([]);
  });

  it('names the other department on a crossover mission the unit can crew', () => {
    // Fire scene needing a police car → a police unit can spot it but fire is
    // still required, so the intercept is a partial response.
    expect(backupServicesFor('police', mission('fire', ['engine', 'police_car']))).toEqual(['fire']);
    // Fire hazmat scene needing an ambulance → EMS spots, needs fire backup.
    expect(backupServicesFor('ems', mission('fire', ['engine', 'ambulance']))).toEqual(['fire']);
  });

  it('lists every uncrewed service when two others are required', () => {
    // Police-category accident needing both fire and EMS → police spots, needs
    // fire + EMS backup.
    expect(backupServicesFor('police', mission('police', ['police_car', 'engine', 'ambulance']))).toEqual(['fire', 'ems']);
  });

  it('returns empty when the unit cannot answer the mission at all', () => {
    expect(backupServicesFor('police', mission('fire', ['engine']))).toEqual([]);
    expect(backupServicesFor('fire', mission('ems', ['ambulance']))).toEqual([]);
  });
});

describe('missingBackupServices — popup needs-backup dimming (v0.22.17)', () => {
  it('returns empty when the candidate crew covers the whole plan', () => {
    const crew = [unit('p1', 'patrol_car', NEAR), unit('f1', 'engine', NEAR)];
    expect(missingBackupServices(crew, mission('police', ['patrol_car', 'engine']))).toEqual([]);
  });

  it('names every department the candidate set does not cover', () => {
    // Police accident needing fire + EMS — only a patrol car is in the crew.
    const crew = [unit('p1', 'patrol_car', NEAR)];
    expect(missingBackupServices(crew, mission('police', ['police_car', 'engine', 'ambulance']))).toEqual(['fire', 'ems']);
  });

  it('is empty when the mission needs only the primary service', () => {
    expect(missingBackupServices([unit('p1', 'patrol_car', NEAR)], mission('police', ['patrol_car']))).toEqual([]);
    expect(missingBackupServices([unit('p1', 'patrol_car', NEAR)], mission('police', []))).toEqual([]);
    // An empty crew covers nothing — the primary service itself is missing.
    expect(missingBackupServices([], mission('police', []))).toEqual(['police']);
  });
});

describe('findNearestBackupUnit — intercept backup pre-dispatch (v0.22.17)', () => {
  it('returns the nearest dispatchable partner unit of the service', () => {
    const near = unit('fire1', 'engine', NEAR);
    const far = unit('fire2', 'engine', FAR);
    expect(findNearestBackupUnit([far, near], 'fire', mission('police', ['engine']))).toBe(near);
  });

  it('ignores other services, busy units, and units in training', () => {
    const wrong = unit('ems1', 'ambulance', NEAR);
    const busy = unit('fire1', 'engine', NEAR, { status: 'en_route', missionId: 'other' });
    const training = unit('fire2', 'engine', NEAR, { trainingEndsAt: Date.now() + 60_000 });
    const ready = unit('fire3', 'engine', NEAR);
    expect(findNearestBackupUnit([wrong, busy, training, ready], 'fire', mission('police', ['engine']))).toBe(ready);
  });

  it('accepts returning and patrolling units like the quick-dispatch picker', () => {
    const returning = unit('fire1', 'engine', NEAR, { status: 'returning' });
    const patrolling = unit('fire2', 'engine', FAR, { status: 'patrolling' });
    expect(findNearestBackupUnit([patrolling, returning], 'fire', mission('police', ['engine']))).toBe(returning);
  });

  it('returns null when no dispatchable partner exists', () => {
    expect(findNearestBackupUnit([unit('fire1', 'engine', NEAR, { status: 'en_route' })], 'fire', mission('police', ['engine']))).toBeNull();
    expect(findNearestBackupUnit([], 'fire', mission('police', ['engine']))).toBeNull();
  });
});

describe('unitCommittedElsewhere — duplicate-dispatch guard (v0.22.12)', () => {
  const missions = [
    { id: 'm_active', status: 'en_route' as const },
    { id: 'm_done', status: 'completed' as const },
    { id: 'm_failed', status: 'failed' as const },
  ];

  it('is free for units without an assignment or already on THIS mission', () => {
    expect(unitCommittedElsewhere(unit('u1', 'ambulance', NEAR), 'm_target', missions)).toBe(false);
    expect(unitCommittedElsewhere(unit('u1', 'ambulance', NEAR, { missionId: 'm_target' }), 'm_target', missions)).toBe(false);
    expect(unitCommittedElsewhere(undefined, 'm_target', missions)).toBe(false);
  });

  it('refuses a unit committed to a different ACTIVE mission', () => {
    const u = unit('u1', 'ambulance', NEAR, { missionId: 'm_active', status: 'en_route' });
    expect(unitCommittedElsewhere(u, 'm_target', missions)).toBe(true);
  });

  it('ignores stale ids pointing at completed or failed missions', () => {
    // Expired calls can leave a missionId behind — that must not lock the unit out.
    const done = unit('u1', 'ambulance', NEAR, { missionId: 'm_done' });
    const failed = unit('u2', 'ambulance', NEAR, { missionId: 'm_failed' });
    expect(unitCommittedElsewhere(done, 'm_target', missions)).toBe(false);
    expect(unitCommittedElsewhere(failed, 'm_target', missions)).toBe(false);
  });
});

describe('requirementGapReason — "say why" hint (v0.22.12)', () => {
  it('returns null when candidates cover every requirement', () => {
    const candidates = [unit('e1', 'engine', NEAR), unit('e2', 'engine', NEAR)];
    expect(requirementGapReason([...candidates], mission('fire', ['engine', 'engine']), candidates)).toBeNull();
  });

  it('names the busy unit when the gap is caused by another call', () => {
    const busyEngine = unit('e9', 'engine', NEAR, { name: 'Engine 9', status: 'en_route', missionId: 'm_other' });
    const candidates = [unit('p1', 'patrol_car', NEAR)];
    const reason = requirementGapReason([...candidates, busyEngine], mission('police', ['engine']), candidates);
    expect(reason).toContain('Engine 9');
    expect(reason).toContain('already on another call');
  });

  it('falls back to "none available" when no matching unit exists at all', () => {
    const reason = requirementGapReason([unit('p1', 'patrol_car', NEAR)], mission('police', ['engine']), [unit('p1', 'patrol_car', NEAR)]);
    expect(reason).toContain('no engine available');
  });

  it('reports the first unmet requirement', () => {
    const reason = requirementGapReason([], mission('fire', ['engine', 'ambulance']), []);
    expect(reason).toContain('engine');
  });
});

describe('findNearestDispatchUnit', () => {
  it('returns null when no units are available', () => {
    expect(findNearestDispatchUnit([], mission('police', ['patrol_car']))).toBeNull();
    const busy = [unit('u1', 'patrol_car', NEAR, { status: 'en_route' })];
    expect(findNearestDispatchUnit(busy, mission('police', ['patrol_car']))).toBeNull();
  });

  it('picks the nearest requirement-matching unit', () => {
    const units = [
      unit('near', 'patrol_car', NEAR),
      unit('far', 'patrol_car', FAR),
    ];
    expect(findNearestDispatchUnit(units, mission('police', ['patrol_car']))?.id).toBe('near');
  });

  it('prefers a requirement match over a closer service-only unit', () => {
    const units = [
      // swat_van matches the police service but not the patrol_car requirement
      unit('closer', 'swat_van', NEAR),
      unit('farther', 'patrol_car', FAR),
    ];
    expect(findNearestDispatchUnit(units, mission('police', ['patrol_car']))?.id).toBe('farther');
  });

  it('falls back to a service-matching unit when no requirement matches', () => {
    const units = [
      unit('k9', 'k9_unit', NEAR),
      unit('ambulance', 'ambulance', FAR), // wrong service — never picked for a police call
    ];
    const picked = findNearestDispatchUnit(units, mission('police', ['patrol_car']));
    expect(picked?.id).toBe('k9');
  });

  it('falls back to any available unit when nothing matches service either', () => {
    const units = [unit('ambulance', 'ambulance', FAR)];
    expect(findNearestDispatchUnit(units, mission('police', ['patrol_car']))?.id).toBe('ambulance');
  });

  it('skips units still in training', () => {
    const units = [
      unit('training', 'patrol_car', NEAR, { trainingEndsAt: Date.now() + 60_000 }),
      unit('ready', 'patrol_car', FAR),
    ];
    expect(findNearestDispatchUnit(units, mission('police', ['patrol_car']))?.id).toBe('ready');
  });

  it('routes ems and fire calls to their own services', () => {
    const units = [
      unit('patrol', 'patrol_car', NEAR),
      unit('medic', 'ambulance', FAR),
      unit('engine', 'engine', FAR),
    ];
    expect(findNearestDispatchUnit(units, mission('ems', ['ambulance']))?.id).toBe('medic');
    expect(findNearestDispatchUnit(units, mission('fire', ['engine']))?.id).toBe('engine');
  });

  it('ignores units without a position', () => {
    const units = [unit('stationed', 'patrol_car', NEAR, { position: null as unknown as { lat: number; lng: number } })];
    expect(findNearestDispatchUnit(units, mission('police', ['patrol_car']))).toBeNull();
  });
});

describe('findNearestDispatchUnits', () => {
  const reqMission = (reqs: { unitType: string; count: number }[]) => ({
    ...mission('police', reqs.map((r) => r.unitType)),
    requirements: reqs.map((r) => ({ unitType: r.unitType, count: r.count, minTrainingLevel: 0 })),
  });

  it('fills requirement counts with the nearest units of each type', () => {
    const units = [
      unit('p1', 'patrol_car', NEAR),
      unit('p2', 'patrol_car', FAR),
      unit('p3', 'patrol_car', { lat: 35.02, lng: -90.03 }), // mid
    ];
    const ids = findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 2 }]), 2).map((u) => u.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('p1');
    expect(ids[1]).toBe('p3');
  });

  it('caps the selection at the dispatch limit even when more units qualify', () => {
    const units = [
      unit('p1', 'patrol_car', NEAR),
      unit('p2', 'patrol_car', FAR),
    ];
    // maxUnits = 1 → only the single nearest requirement-filling unit.
    expect(findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 2 }]), 1).map((u) => u.id)).toEqual(['p1']);
  });

  it('picks one of each required type before doubling up', () => {
    const units = [
      unit('c1', 'patrol_car', NEAR),
      unit('k1', 'k9_unit', FAR),
      unit('c2', 'patrol_car', { lat: 35.02, lng: -90.03 }),
    ];
    const ids = findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }, { unitType: 'k9_unit', count: 1 }]), 2).map((u) => u.id);
    expect(ids.sort()).toEqual(['c1', 'k1']);
  });

  it('tops up with nearest service units after requirements are filled', () => {
    const units = [
      unit('c1', 'patrol_car', NEAR),
      unit('c2', 'patrol_car', { lat: 35.02, lng: -90.03 }),
      unit('swat', 'swat_van', FAR),
      unit('amb', 'ambulance', { lat: 35.03, lng: -90.04 }), // wrong service
    ];
    const ids = findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3).map((u) => u.id);
    // c1 (requirement) + c2 and swat (police service) — ambulance never joins a police call before service units.
    expect(ids).toEqual(['c1', 'c2', 'swat']);
  });

  it('returns empty for a zero budget or no available units', () => {
    expect(findNearestDispatchUnits([], reqMission([{ unitType: 'patrol_car', count: 1 }]), 3)).toEqual([]);
    const busy = [unit('p1', 'patrol_car', NEAR, { status: 'en_route' })];
    expect(findNearestDispatchUnits(busy, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3)).toEqual([]);
    expect(findNearestDispatchUnits([unit('p1', 'patrol_car', NEAR)], reqMission([{ unitType: 'patrol_car', count: 1 }]), 0)).toEqual([]);
  });

  it('never picks a unit that is still training', () => {
    const units = [
      unit('training', 'patrol_car', NEAR, { trainingEndsAt: Date.now() + 60_000 }),
      unit('ready', 'patrol_car', FAR),
    ];
    expect(findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3).map((u) => u.id)).toEqual(['ready']);
  });

  it('re-routes returning units (the v0.22.6 popup-vs-board mismatch)', () => {
    // The Dispatch Board treats a returning unit as ready; the map popup used
    // to demand strict 'available' and said "No available units" instead.
    const units = [unit('home', 'patrol_car', NEAR, { status: 'returning' })];
    expect(findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3).map((u) => u.id)).toEqual(['home']);
  });

  it('re-routes patrolling units too', () => {
    const units = [unit('beat', 'patrol_car', NEAR, { status: 'patrolling', patrolRouteId: 'r1' })];
    expect(findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3).map((u) => u.id)).toEqual(['beat']);
  });

  it('still excludes a returning/patrolling unit that is in training', () => {
    const units = [
      unit('t1', 'patrol_car', NEAR, { status: 'returning', trainingEndsAt: Date.now() + 60_000 }),
      unit('t2', 'patrol_car', FAR, { status: 'patrolling', patrolRouteId: 'r1', trainingEndsAt: Date.now() + 60_000 }),
    ];
    expect(findNearestDispatchUnits(units, reqMission([{ unitType: 'patrol_car', count: 1 }]), 3)).toEqual([]);
  });

  // ── Cross-service requirements (v0.22.10 fix) ─────────────────────────────
  // vehicle_accident is a police/traffic call that needs a FIRE engine for
  // extraction; hazmat_medical is a fire call that needs an EMS ambulance.

  it('picks a crossover requirement unit over a closer own-service unit', () => {
    const units = [
      unit('near_patrol', 'patrol_car', NEAR),
      unit('far_engine', 'engine', FAR), // fire unit required by the traffic call
    ];
    const ids = findNearestDispatchUnits(units, mission('traffic', ['engine']), 2).map((u) => u.id);
    expect(ids[0]).toBe('far_engine'); // requirement first, distance second
    expect(ids).toContain('near_patrol'); // own-service top-up still offered
  });

  it('tops up with requirement-service units (not only the primary service)', () => {
    const units = [
      unit('medic', 'ambulance', NEAR),   // EMS unit required by the hazmat call
      unit('engine', 'engine', { lat: 35.02, lng: -90.03 }), // fire (primary) top-up
      unit('patrol', 'patrol_car', FAR),  // police — never offered for hazmat
    ];
    const ids = findNearestDispatchUnits(units, mission('hazmat', ['ambulance']), 3).map((u) => u.id);
    expect(ids).toContain('medic');
    expect(ids).toContain('engine');
    expect(ids).not.toContain('patrol');
  });

  it('never offers a wrong-service unit when nothing can answer', () => {
    // Fire call needing an engine, but only an ambulance exists in the city:
    // the ambulance used to be offered as a "last resort" — now the surface
    // shows the truthful no-units state instead.
    const units = [unit('ambulance', 'ambulance', NEAR)];
    expect(findNearestDispatchUnits(units, mission('fire', ['engine']), 2)).toEqual([]);
    // A requirement-less EMS call with only a patrol car available: same rule.
    const units2 = [unit('patrol', 'patrol_car', NEAR)];
    expect(findNearestDispatchUnits(units2, mission('ems', []), 2)).toEqual([]);
  });
});

describe('requiredServicesForMission', () => {
  it('includes the primary service and every requirement service', () => {
    expect(requiredServicesForMission(mission('traffic', ['engine'])).sort()).toEqual(['fire', 'police']);
    expect(requiredServicesForMission(mission('hazmat', ['ambulance'])).sort()).toEqual(['ems', 'fire']);
  });

  it('is just the primary service when requirements match it or are empty', () => {
    expect(requiredServicesForMission(mission('ems', ['ambulance']))).toEqual(['ems']);
    expect(requiredServicesForMission(mission('police', ['patrol_car']))).toEqual(['police']);
    expect(requiredServicesForMission(mission('fire', []))).toEqual(['fire']);
  });
});

describe('dispatchPlanParts — per-mission dispatch plan line (v0.22.13)', () => {
  it('names the primary service by its required unit when there is one', () => {
    expect(dispatchPlanLabel(mission('fire', ['engine']))).toBe('Fire engine');
    expect(dispatchPlanLabel(mission('ems', ['ambulance']))).toBe('EMS ambulance');
    expect(dispatchPlanLabel(mission('police', ['patrol_car']))).toBe('Police patrol car');
  });

  it('falls back to the service name when the primary has no unit requirement', () => {
    expect(dispatchPlanLabel(mission('police', []))).toBe('Police');
    expect(dispatchPlanLabel(mission('fire', []))).toBe('Fire');
    expect(dispatchPlanLabel(mission('ems', []))).toBe('EMS');
  });

  it('names every cross-service requirement so the crossover need is visible', () => {
    // Fire scene needing an ambulance → "Fire engine + EMS".
    expect(dispatchPlanLabel(mission('fire', ['engine', 'ambulance']))).toBe('Fire engine + EMS');
    // Traffic accident (police) needing a fire engine for extraction → "Police + Fire".
    expect(dispatchPlanLabel(mission('traffic', ['engine']))).toBe('Police + Fire');
    // Hazmat (fire) needing an ambulance → "Fire + EMS".
    expect(dispatchPlanLabel(mission('hazmat', ['ambulance']))).toBe('Fire + EMS');
  });

  it('marks requirement parts as crossover and the primary as not', () => {
    const parts = dispatchPlanParts(mission('fire', ['engine', 'ambulance']));
    expect(parts[0]).toMatchObject({ label: 'Fire engine', service: 'fire', crossover: false });
    expect(parts[1]).toMatchObject({ label: 'EMS', service: 'ems', crossover: true });
  });

  it('dedupes repeated requirement types of the same service', () => {
    // Two engines + an ambulance still reads as one engine part + EMS.
    const m = mission('fire', ['engine', 'engine', 'ambulance']);
    expect(dispatchPlanLabel(m)).toBe('Fire engine + EMS');
  });
});

describe('unitCanPatrol — EMS airlift patrol gating (v0.22.18)', () => {
  const pad = { id: 'helipad_west_memphis' };

  it('police units can always patrol', () => {
    expect(unitCanPatrol('patrol_car', null)).toBe(true);
    expect(unitCanPatrol('patrol_car', pad)).toBe(true);
    expect(unitCanPatrol('k9_unit', undefined)).toBe(true);
  });

  it('EMS units patrol only once the helipad exists', () => {
    expect(unitCanPatrol('ambulance', pad)).toBe(true);
    expect(unitCanPatrol('paramedic_unit', pad)).toBe(true);
    expect(unitCanPatrol('ambulance', null)).toBe(false);
    expect(unitCanPatrol('paramedic_unit', undefined)).toBe(false);
  });

  it('fire rigs never roam beats — they answer from stations', () => {
    expect(unitCanPatrol('engine', pad)).toBe(false);
    expect(unitCanPatrol('ladder', null)).toBe(false);
  });

  // Note: getUnitServiceType defaults unknown types to police (the system-wide
  // behavior for legacy/ambiguous unit types), so unitCanPatrol inherits it.
  // Real units always carry a valid type; there is no missing-type case.
});

describe('backupAssignedUnits — board "Backup en route" chip (v0.22.18)', () => {
  it('flags a partner-department unit the intercept pre-dispatched', () => {
    // Fire scene needing EMS: an engine (primary) + an ambulance (backup).
    const m = mission('fire', ['engine', 'ambulance']);
    const assigned = [
      unit('e1', 'engine', NEAR),
      unit('a1', 'ambulance', NEAR),
    ];
    const backup = backupAssignedUnits(assigned, m);
    expect(backup.map(u => u.id)).toEqual(['a1']);
  });

  it('flags nothing when all assigned units are the primary service', () => {
    const m = mission('police', ['patrol_car']);
    const assigned = [unit('p1', 'patrol_car', NEAR)];
    expect(backupAssignedUnits(assigned, m)).toEqual([]);
  });

  it('ignores units whose service is not required by the mission', () => {
    // Fire scene (no police requirement): a police SUV on scene is a stray,
    // not a labeled backup.
    const m = mission('fire', ['engine']);
    const assigned = [unit('p1', 'police_suv', NEAR)];
    expect(backupAssignedUnits(assigned, m)).toEqual([]);
  });

  it('flags multiple backup departments on a multi-service call', () => {
    // Police + EMS both backing a fire scene.
    const m = mission('fire', ['engine', 'patrol_car', 'ambulance']);
    const assigned = [
      unit('e1', 'engine', NEAR),
      unit('p1', 'patrol_car', NEAR),
      unit('a1', 'ambulance', NEAR),
    ];
    expect(backupAssignedUnits(assigned, m).map(u => u.id).sort()).toEqual(['a1', 'p1']);
  });
});
