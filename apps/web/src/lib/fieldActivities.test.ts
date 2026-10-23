// ============================================
// Dispatch HQ — Police Field Activities Tests
// ============================================

import { describe, expect, it } from 'vitest';
import {
  trafficStopSequence,
  suspectCheckSequence,
  warrantBoloSequence,
  pursuitSequence,
  backupRequestSequence,
  shouldEscalate,
  pursuitUpdateSequence,
  pursuitEndSequence,
  startPursuitTracking,
  endPursuitTracking,
  clearPursuitTracking,
  tickPursuitRadio,
  activePursuitCount,
  PURSUIT_UPDATE_INTERVAL_MS,
} from './fieldActivities';
import { useGameStore } from '@/stores/gameStore';
import type { Unit, CriminalRecord, Mission } from '@dispatch-hq/shared';

const POLICE_UNIT: Unit = {
  id: 'u1',
  ownerId: 'p1',
  stationId: 's1',
  type: 'patrol_car',
  name: 'Unit 1',
  status: 'patrolling',
  position: { lat: 35.1461, lng: -90.1845 },
  destination: null,
  heading: 0,
  speed: 13.9,
  eta: null,
  missionId: null,
  trainingLevel: 1,
  createdAt: new Date().toISOString(),
};

const BACKUP_UNIT: Unit = { ...POLICE_UNIT, id: 'u2', name: 'Unit 2' };

const WARRANT_RECORD: CriminalRecord = {
  id: 'r1',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '01/01/1990',
  heightIn: 66,
  weightLb: 150,
  citizenship: 'US',
  address: '123 Main St',
  city: 'West Memphis',
  state: 'AR',
  photoSeed: 'seed-1',
  riskLevel: 'high',
  warrantStatus: 'active',
  knownAliases: [],
  charges: ['Robbery', 'Burglary'],
  arrestCount: 2,
  notes: 'Repeat offender',
};

const CLEAN_RECORD: CriminalRecord = {
  ...WARRANT_RECORD,
  id: 'r2',
  firstName: 'John',
  lastName: 'Smith',
  warrantStatus: 'none',
  riskLevel: 'low',
};

describe('trafficStopSequence', () => {
  it('escalates when the subject has an active warrant', () => {
    const seq = trafficStopSequence(POLICE_UNIT, WARRANT_RECORD);
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('10-28');
    expect(text).toContain('active warrant');
    expect(text).toContain('backup requested');
    expect(seq[seq.length - 1].text).toContain('10-4');
  });

  it('clears the stop when the subject is clean', () => {
    const seq = trafficStopSequence(POLICE_UNIT, CLEAN_RECORD);
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('No wants, no warrants');
    expect(seq[seq.length - 1].text).toContain('resuming patrol');
  });

  it('handles a missing record', () => {
    const seq = trafficStopSequence(POLICE_UNIT, null);
    expect(seq[0].text).toContain('10-28');
    expect(seq.map((m) => m.text).join(' ')).toContain('No wants');
  });
});

describe('suspectCheckSequence', () => {
  it('flags a warrant match', () => {
    const seq = suspectCheckSequence(POLICE_UNIT, WARRANT_RECORD);
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('10-65');
    expect(text).toContain('active warrant');
  });

  it('clears with no match', () => {
    const seq = suspectCheckSequence(POLICE_UNIT, null);
    expect(seq.map((m) => m.text).join(' ')).toContain('No record match');
  });
});

describe('warrantBoloSequence', () => {
  it('broadcasts BOLO details to all units', () => {
    const seq = warrantBoloSequence(WARRANT_RECORD);
    expect(seq[0].type).toBe('broadcast');
    expect(seq[0].to).toBe('all');
    expect(seq[0].text).toContain('BOLO');
    expect(seq[0].text).toContain('Jane Doe');
  });
});

describe('pursuitSequence', () => {
  it('calls Code 3 and requests backup', () => {
    const seq = pursuitSequence(POLICE_UNIT, BACKUP_UNIT);
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('Code 3');
    expect(text).toContain('Backup requested');
  });

  it('includes the backup unit intercept when one is available', () => {
    const seq = pursuitSequence(POLICE_UNIT, BACKUP_UNIT);
    expect(seq.some((m) => m.text.includes('Unit 2'))).toBe(true);
  });

  it('works without a backup unit', () => {
    const seq = pursuitSequence(POLICE_UNIT, null);
    expect(seq[0].text).toContain('Code 3');
    expect(seq.length).toBeGreaterThanOrEqual(3);
  });
});

describe('chase phase — pursuitUpdateSequence', () => {
  const unit: Unit = { ...POLICE_UNIT };

  it('radios a live position update from the lead unit', () => {
    const seq = pursuitUpdateSequence(unit, { unitId: unit.id, lastUpdateAt: 0, updateCount: 1, direction: 'east' });
    expect(seq.length).toBeGreaterThanOrEqual(2);
    expect(seq[0].from).toBe('Unit 1');
    expect(seq[0].type).toBe('unit');
    expect(seq[0].text).toMatch(/mph|heading|Road change|Speed check/);
  });

  it('rotates through turn / speed / road-change flavors as the chase runs', () => {
    const seq1 = pursuitUpdateSequence(unit, { unitId: unit.id, lastUpdateAt: 0, updateCount: 1, direction: 'north' });
    const seq2 = pursuitUpdateSequence(unit, { unitId: unit.id, lastUpdateAt: 0, updateCount: 2, direction: 'south' });
    const seq3 = pursuitUpdateSequence(unit, { unitId: unit.id, lastUpdateAt: 0, updateCount: 3, direction: 'west' });
    const t1 = seq1.map((m) => m.text).join(' ');
    const t2 = seq2.map((m) => m.text).join(' ');
    const t3 = seq3.map((m) => m.text).join(' ');
    expect([t1, t2, t3].map((t) => /mph|heading|Road change|Speed check|Code 3/.test(t)).filter(Boolean).length).toBe(3);
  });
});

describe('chase phase — pursuitEndSequence', () => {
  it('reports a resolved pursuit (suspect in custody)', () => {
    const seq = pursuitEndSequence(POLICE_UNIT, 'resolved');
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('terminated');
    expect(text).toContain('suspect in custody');
    expect(seq.some((m) => m.text.includes('Code 4'))).toBe(true);
  });

  it('reports a called-off pursuit when the mission disappears', () => {
    const seq = pursuitEndSequence(POLICE_UNIT, 'removed');
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('called off');
    expect(seq.some((m) => m.type === 'broadcast')).toBe(true);
  });
});

describe('chase phase — tracking lifecycle', () => {
  it('tracks and forgets pursuits', () => {
    expect(activePursuitCount()).toBe(0);
    startPursuitTracking('m1', POLICE_UNIT);
    expect(activePursuitCount()).toBe(1);
    endPursuitTracking('m1');
    expect(activePursuitCount()).toBe(0);
  });

  it('keeps a stable update interval constant', () => {
    expect(PURSUIT_UPDATE_INTERVAL_MS).toBeGreaterThan(0);
  });
});

describe('chase phase — tickPursuitRadio', () => {
  const mission: Mission = {
    id: 'm1',
    templateId: 'police_pursuit',
    name: 'High-Speed Pursuit',
    description: 'A fleeing vehicle is refusing to stop.',
    category: 'police',
    icon: '🏎️',
    status: 'active',
    location: { lat: 35.1461, lng: -90.1845 },
    poiType: 'road',
    difficulty: 3,
    creditsReward: 260,
    xpReward: 55,
    requirements: [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: 150,
    totalTime: 150,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 150_000).toISOString(),
    priority: 'high',
  };

  const capture = () => {
    const events: any[] = [];
    const onMsg = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('radio-message', onMsg as EventListener);
    return {
      events,
      stop: () => window.removeEventListener('radio-message', onMsg as EventListener),
    };
  };

  it('broadcasts chase updates while the pursuit is active, then a closing report', () => {
    const { events, stop } = capture();
    try {
      useGameStore.setState({ missions: [mission], units: [POLICE_UNIT], mapBounds: [[35.0, -90.4], [35.3, -90.0]] as [[number, number], [number, number]] });
      startPursuitTracking('m1', POLICE_UNIT);
      expect(activePursuitCount()).toBe(1);

      // Force an update by jumping past the interval.
      tickPursuitRadio(Date.now() + PURSUIT_UPDATE_INTERVAL_MS + 100);
      expect(events.some((e) => e.sequence && e.sequence[0].text.match(/mph|heading|Road change|Speed check/))).toBe(true);
      expect(activePursuitCount()).toBe(1);

      // Resolve the mission → closing report + tracking dropped.
      useGameStore.setState({ missions: [{ ...mission, status: 'completed' }] });
      tickPursuitRadio(Date.now());
      expect(events.some((e) => e.sequence && e.sequence.some((m: any) => m.text.includes('terminated')))).toBe(true);
      expect(activePursuitCount()).toBe(0);
    } finally {
      stop();
      clearPursuitTracking();
      useGameStore.setState({ missions: [], units: [], mapBounds: null });
    }
  });

  it('calls off the chase when the mission is removed entirely', () => {
    const { events, stop } = capture();
    try {
      useGameStore.setState({ missions: [mission], units: [POLICE_UNIT] });
      startPursuitTracking('m1', POLICE_UNIT);
      useGameStore.setState({ missions: [] });
      tickPursuitRadio(Date.now());
      expect(events.some((e) => e.sequence && e.sequence.some((m: any) => m.text.includes('called off')))).toBe(true);
      expect(activePursuitCount()).toBe(0);
    } finally {
      stop();
      clearPursuitTracking();
      useGameStore.setState({ missions: [], units: [], mapBounds: null });
    }
  });

  it('calls off a failed pursuit instead of reporting a capture', () => {
    const { events, stop } = capture();
    try {
      useGameStore.setState({ missions: [mission], units: [POLICE_UNIT] });
      startPursuitTracking('m1', POLICE_UNIT);
      useGameStore.setState({ missions: [{ ...mission, status: 'failed' }] });
      tickPursuitRadio(Date.now());
      const texts = events.flatMap((e) => (e.sequence ?? []).map((m: any) => m.text));
      expect(texts.some((t) => t.includes('called off'))).toBe(true);
      expect(texts.some((t) => t.includes('suspect in custody'))).toBe(false);
      expect(activePursuitCount()).toBe(0);
    } finally {
      stop();
      clearPursuitTracking();
      useGameStore.setState({ missions: [], units: [], mapBounds: null });
    }
  });

  it('drops tracking silently when a fresh campaign wipes both mission and unit', () => {
    const { events, stop } = capture();
    try {
      useGameStore.setState({ missions: [mission], units: [POLICE_UNIT] });
      startPursuitTracking('m1', POLICE_UNIT);
      useGameStore.setState({ missions: [], units: [] });
      tickPursuitRadio(Date.now());
      expect(events.length).toBe(0);
      expect(activePursuitCount()).toBe(0);
    } finally {
      stop();
      clearPursuitTracking();
      useGameStore.setState({ missions: [], units: [], mapBounds: null });
    }
  });
});

describe('backupRequestSequence', () => {
  it('routes a backup unit to the requesting unit', () => {
    const seq = backupRequestSequence(POLICE_UNIT, BACKUP_UNIT);
    const text = seq.map((m) => m.text).join(' ');
    expect(text).toContain('Requesting backup');
    expect(text).toContain('Unit 2');
    expect(text).toContain('en route');
  });
});

describe('shouldEscalate', () => {
  it('never escalates a clean low-risk subject when the roll is high', () => {
    expect(shouldEscalate(CLEAN_RECORD, () => 0.99)).toBe(false);
  });

  it('escalates a violent subject on a low roll', () => {
    expect(shouldEscalate({ ...WARRANT_RECORD, riskLevel: 'violent' }, () => 0.01)).toBe(true);
  });

  it('high-risk subjects escalate more often than low-risk', () => {
    const high = shouldEscalate({ ...WARRANT_RECORD, riskLevel: 'high' }, () => 0.3);
    const low = shouldEscalate({ ...WARRANT_RECORD, riskLevel: 'low' }, () => 0.3);
    expect(high).toBe(true);
    expect(low).toBe(false);
  });
});
