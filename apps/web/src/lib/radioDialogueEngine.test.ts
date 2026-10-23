import { describe, it, expect } from 'vitest';
import type { Mission, Unit } from '@dispatch-hq/shared';
import { setRadioCityContext, isAirliftMission } from '@/lib/radioDialogueEngine';
import {
  assignmentSequence, airliftSequence, statusReport, backupDispatchSequence,
} from '@/lib/radioDialogueEngine.lazy';
import { makePoi } from '@/lib/pois';

const CITY = {
  name: 'West Memphis, AR',
  bounds: [[35.08, -90.25], [35.21, -90.10]] as [[number, number], [number, number]],
};

function unit(over: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', name: 'Engine 1', type: 'engine', service: 'fire', status: 'en_route',
    position: { lat: 35.15, lng: -90.18 }, stationId: 's1', missionId: 'm1',
    destination: null, waypoints: undefined, eta: null, speed: 13.9,
    training: 1, livery: 'default', postMissionBehavior: 'return',
    ...over,
  } as Unit;
}

function mission(poiId?: string): Mission {
  return {
    id: 'm1', templateId: 't1', name: 'Structure Fire', description: 'Fire at a building',
    category: 'fire', icon: '🔥', status: 'active', location: { lat: 35.15, lng: -90.18 },
    poiType: poiId ? 'school' : null, poiId, difficulty: 3, creditsReward: 400, xpReward: 40,
    requirements: [], assignedUnits: ['u1'], progress: 0, timeRemaining: 300, totalTime: 300,
    createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(),
  };
}

describe('POI-aware radio dialogue (v0.22.10)', () => {
  it('names the anchored POI in dispatch traffic', () => {
    // Player-placed landmark (v0.22.12) — the same fixture the game uses.
    const school = makePoi('school', { lat: 35.15, lng: -90.18 }, CITY);
    setRadioCityContext(null, CITY.name, [school]);
    const seq = assignmentSequence(unit(), mission(school.id), [], [mission(school.id)]);
    const texts = seq.map((m) => m.text).join(' ');
    // The dispatch order / ack / rolling lines all embed {call}, which now
    // reads "<mission name> at <POI name>".
    expect(texts).toContain('at ' + school.name);
    expect(texts).toContain(mission(school.id).name);
  });

  it('keeps generic callouts when the mission is not POI-anchored', () => {
    const school = makePoi('school', { lat: 35.15, lng: -90.18 }, CITY);
    setRadioCityContext(null, CITY.name, [school]);
    const seq = assignmentSequence(unit(), mission(), [], [mission()]);
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toContain(mission().name);
    expect(texts).not.toMatch(/at .+ \(School\)/);
  });

  it('does not reference POIs when the city context carries none', () => {
    const school = makePoi('school', { lat: 35.15, lng: -90.18 }, CITY);
    setRadioCityContext(null, CITY.name, []);
    const seq = assignmentSequence(unit(), mission(school.id), [], [mission(school.id)]);
    // No POI list → falls back to the plain callout name.
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toContain(mission(school.id).name);
    expect(texts).not.toContain(school.name);
  });
});

describe('air-ambulance dialogue (v0.22.18)', () => {
  const airMission = (): Mission => ({
    ...mission(),
    templateId: 'remote_rescue_airlift',
    name: 'Remote Rescue',
    category: 'ems',
  });
  const medevac = () => unit({ id: 'a1', name: 'Medevac 1', type: 'ambulance' });

  it('recognizes the airlift-capable templates', () => {
    expect(isAirliftMission({ templateId: 'remote_rescue_airlift' })).toBe(true);
    expect(isAirliftMission({ templateId: 'highway_trauma_airlift' })).toBe(true);
    expect(isAirliftMission({ templateId: 'medical_call' })).toBe(false);
    expect(isAirliftMission(null)).toBe(false);
    expect(isAirliftMission(undefined)).toBe(false);
  });

  it('assignmentSequence speaks airborne when a helipad exists', () => {
    const seq = assignmentSequence(medevac(), airMission(), [], [airMission()], 'Air Pad 1');
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toContain('Air Pad 1');
    expect(texts).toContain('Medevac 1');
    // Dispatch order is unambiguously an air request.
    expect(texts).toMatch(/air ambulance|airlift|rotor service/);
    expect(texts).toMatch(/blades turning|airborne|flight ETA|lifting off|cruising altitude|flight line|from the air/);
  });

  it('assignmentSequence stays road-flavored without a helipad', () => {
    const seq = assignmentSequence(medevac(), airMission(), [], [airMission()]);
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).not.toContain('Air Pad 1');
    expect(texts).not.toMatch(/air ambulance|airlift requested/);
  });

  it('airliftSequence names the pad and the airborne flight', () => {
    const seq = airliftSequence(medevac(), airMission(), 'Air Pad 1', [], [airMission()]);
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toContain('Air Pad 1');
    expect(texts).toContain('Medevac 1');
    expect(texts).toMatch(/air ambulance|airlift|rotor service/);
  });

  it('statusReport reports airborne for a flying airlift unit', () => {
    const flying = medevac();
    flying.status = 'en_route';
    const report = statusReport(flying, [], [airMission()], 'Air Pad 1');
    const texts = report.map((m) => m.text).join(' ');
    expect(texts).toMatch(/airborne|flight ETA|cruising altitude|from the air|flight line/);
  });

  it('statusReport stays road-flavored without a helipad', () => {
    const flying = medevac();
    flying.status = 'en_route';
    const report = statusReport(flying, [], [airMission()]);
    const texts = report.map((m) => m.text).join(' ');
    expect(texts).not.toMatch(/airborne|flight ETA|cruising altitude|from the air/);
  });
});

describe('backup pre-dispatch radio (v0.22.18)', () => {
  const airMission = (): Mission => ({
    ...mission(),
    templateId: 'remote_rescue_airlift',
    name: 'Remote Rescue',
    category: 'ems',
  });
  const medevac = () => unit({ id: 'a1', name: 'Medevac 1', type: 'ambulance' });

  it('names the backup unit, the call, and the departments joining it', () => {
    // A police patrol spots a fire scene that also needs EMS — the fire engine
    // is the backup unit being auto-dispatched.
    const fireUnit = unit({ id: 'u2', name: 'Engine 1', type: 'engine' });
    const seq = backupDispatchSequence(fireUnit, mission(), [], [mission()], ['Police', 'EMS']);
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toMatch(/backup requested|requesting backup/i);
    expect(texts).toMatch(/Engine 1/);
    expect(texts).toMatch(/police \+ ems/i);
    // Dispatch order + ack + rolling — same shape as every other assignment.
    const types = seq.map((m) => m.type);
    expect(types[0]).toBe('dispatch');
    expect(seq.length).toBeGreaterThanOrEqual(3);
  });

  it('speaks airborne when the backup is an airlift callout with a helipad', () => {
    const seq = backupDispatchSequence(medevac(), airMission(), [], [airMission()], ['Police'], 'Air Pad 1');
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toMatch(/air ambulance|airlift|rotor service/);
    expect(texts).toContain('Air Pad 1');
  });

  it('names only one department when a single service backs up the call', () => {
    const policeUnit = unit({ id: 'u3', name: 'Patrol 7', type: 'patrol_car' });
    const seq = backupDispatchSequence(policeUnit, mission(), [], [mission()], ['Fire']);
    const texts = seq.map((m) => m.text).join(' ');
    expect(texts).toMatch(/backup requested|requesting backup/i);
    expect(texts).toMatch(/fire/);
    expect(texts).not.toContain(' + ');

  });
});
