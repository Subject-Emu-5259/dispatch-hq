// ============================================
// Crime depth + fire/EMS parity tests (staged batch, Addition 6)
// ============================================
// Proves in real behavior (not template existence alone):
//  • every new template sits in its service pool, anchors to the POI class
//    Dre asked for (home→residential, shop→commercial/retail), and is
//    fieldable by a real fleet at the level its difficulty requires;
//  • gang templates carry a real gangId and gang activity derives from
//    records/missions/history (never invented);
//  • traffic-stop outcomes resolve from the linked record's warrant state;
//  • suspect linking + gang stamping mutate the real store.

import { describe, it, expect } from 'vitest';
import {
  getMissionsForService,
  GANGS,
  gangById,
  type MissionTemplate,
  type Unit,
} from '@dispatch-hq/shared';
import { canFieldTemplate, attachSuspectToMission, stampGangAffiliation } from './spawn';
import { findAnchorPoi, type Poi } from './pois';
import { resolveTrafficStopOutcome } from './trafficStops';
import { gangActivitySummary } from './gangs';
import { useGameStore } from '@/stores/gameStore';
import type { CriminalRecord } from '@dispatch-hq/shared';

// Standard mid-game fleet: every unit type the new templates require.
const FLEET: Pick<Unit, 'type' | 'trainingLevel'>[] = [
  { type: 'patrol_car', trainingLevel: 2 },
  { type: 'patrol_car', trainingLevel: 2 },
  { type: 'swat_van', trainingLevel: 2 },
  { type: 'engine', trainingLevel: 2 },
  { type: 'engine', trainingLevel: 2 },
  { type: 'ladder', trainingLevel: 2 },
  { type: 'ambulance', trainingLevel: 2 },
  { type: 'paramedic_unit', trainingLevel: 2 },
];

const NEW_POLICE = ['home_burglary', 'home_invasion', 'shoplifting', 'smash_and_grab', 'street_mugging', 'street_assault', 'vandalism_spree', 'gang_drive_by', 'gang_turf_dispute', 'gang_extortion', 'dui_roadside_stop', 'warrant_traffic_stop'];
const NEW_FIRE = ['apartment_fire', 'electrical_fire', 'chemical_plant_fire'];
const NEW_EMS = ['mental_health_crisis', 'assault_victim_care', 'workplace_injury'];

function templateIn(pool: MissionTemplate[], id: string): MissionTemplate {
  const t = pool.find((x) => x.id === id);
  expect(t, `${id} missing from pool`).toBeDefined();
  return t!;
}

describe('new templates: pools, POI classes, fieldability', () => {
  it('police crime/traffic templates are in the police pool and fieldable', () => {
    const pool = getMissionsForService('police');
    for (const id of NEW_POLICE) {
      const t = templateIn(pool, id);
      expect(canFieldTemplate(t, FLEET, 10), `${id} not fieldable`).toBe(true);
    }
  });

  it('fire templates are in the fire pool and fieldable', () => {
    const pool = getMissionsForService('fire');
    for (const id of NEW_FIRE) {
      const t = templateIn(pool, id);
      expect(canFieldTemplate(t, FLEET, 10), `${id} not fieldable`).toBe(true);
    }
  });

  it('EMS templates are in the EMS pool and fieldable', () => {
    const pool = getMissionsForService('ems');
    for (const id of NEW_EMS) {
      const t = templateIn(pool, id);
      expect(canFieldTemplate(t, FLEET, 10), `${id} not fieldable`).toBe(true);
    }
  });

  it('home crime wants residential POIs, shopping crime wants commercial/retail', () => {
    const pool = getMissionsForService('police');
    expect(templateIn(pool, 'home_burglary').poiTypes).toContain('residential');
    expect(templateIn(pool, 'home_invasion').poiTypes).toContain('residential');
    expect(templateIn(pool, 'shoplifting').poiTypes).toEqual(expect.arrayContaining(['commercial', 'retail']));
    expect(templateIn(pool, 'smash_and_grab').poiTypes).toEqual(expect.arrayContaining(['commercial', 'retail']));
  });

  it('gang templates carry a defined gang; non-gang templates carry none', () => {
    const pool = getMissionsForService('police');
    expect(gangById(templateIn(pool, 'gang_drive_by').gangId)?.name).toBe('Iron Vipers');
    expect(gangById(templateIn(pool, 'gang_turf_dispute').gangId)?.name).toBe('Blackwood Crew');
    expect(gangById(templateIn(pool, 'gang_extortion').gangId)?.name).toBe('Copper Kings');
    expect(templateIn(pool, 'home_burglary').gangId).toBeUndefined();
    expect(GANGS.map((g) => g.id)).toEqual(['iron_vipers', 'blackwood_crew', 'copper_kings']);
  });
});

describe('POI anchoring (the home/shop tie-in)', () => {
  const home: Poi = { id: 'p1', type: 'residential', name: 'Maple House', position: { lat: 35.15, lng: -90.05 }, buckets: ['residential'] } as unknown as Poi;
  const shop: Poi = { id: 'p2', type: 'commercial', name: 'Corner Store', position: { lat: 35.151, lng: -90.051 }, buckets: ['commercial', 'retail'] } as unknown as Poi;
  const near = { lat: 35.1505, lng: -90.0505 };

  it('a home crime anchors to the residential POI, not the shop', () => {
    expect(findAnchorPoi([home, shop], near, ['residential'])?.id).toBe('p1');
  });

  it('a shop crime anchors to the commercial POI, not the house', () => {
    expect(findAnchorPoi([home, shop], near, ['commercial', 'retail'])?.id).toBe('p2');
  });

  it('with no matching POI there is no anchor (street point stands)', () => {
    expect(findAnchorPoi([home, shop], near, ['warehouse'])).toBeNull();
    expect(findAnchorPoi([], near, ['residential'])).toBeNull();
  });

  it('road-only traffic templates never anchor, even next to a road POI', () => {
    const road = { id: 'p3', type: 'road', name: 'Main St', position: near, buckets: ['road'] } as unknown as Poi;
    expect(findAnchorPoi([road], near, ['road', 'highway'])).toBeNull();
  });
});

describe('traffic-stop outcomes', () => {
  it('an active warrant resolves to arrest, naming the subject', () => {
    const r = resolveTrafficStopOutcome({ warrantStatus: 'active', firstName: 'Jane', lastName: 'Doe' });
    expect(r.outcome).toBe('arrest');
    expect(r.reason).toContain('Jane Doe');
  });

  it('no warrant resolves to citation or warning by the roll', () => {
    expect(resolveTrafficStopOutcome(null, () => 0.1).outcome).toBe('citation');
    expect(resolveTrafficStopOutcome(null, () => 0.9).outcome).toBe('warning');
    expect(resolveTrafficStopOutcome({ warrantStatus: 'none', firstName: 'A', lastName: 'B' }, () => 0.1).outcome).toBe('citation');
  });
});

describe('gang activity derivation', () => {
  it('counts only real affiliated records, live missions, and cleared history', () => {
    const summary = gangActivitySummary(
      [{ gangId: 'iron_vipers' }, { gangId: 'iron_vipers' }, {}, { gangId: 'copper_kings' }],
      [{ gangId: 'iron_vipers' }, {}],
      [{ gangId: 'iron_vipers', cleared: true }, { gangId: 'iron_vipers', cleared: false }, { gangId: 'blackwood_crew', cleared: true }],
    );
    const vipers = summary.find((s) => s.gang.id === 'iron_vipers')!;
    expect(vipers.affiliatedRecords).toBe(2);
    expect(vipers.liveIncidents).toBe(1);
    expect(vipers.clearedIncidents).toBe(1);
    const blackwood = summary.find((s) => s.gang.id === 'blackwood_crew')!;
    expect(blackwood.affiliatedRecords).toBe(0);
    expect(blackwood.clearedIncidents).toBe(1);
  });
});

describe('suspect linking + gang stamping in the real store', () => {
  const rec = (id: string): CriminalRecord => ({
    id, firstName: 'Test', lastName: id, dateOfBirth: '01/01/1990', heightIn: 70,
    weightLb: 180, citizenship: 'USA', address: '1 Main St', city: 'West Memphis',
    state: 'AR', photoSeed: id, riskLevel: 'low', warrantStatus: 'none',
    knownAliases: [], charges: [], arrestCount: 0, notes: '',
  });

  it('a gang mission links a suspect and stamps the gang on that record', () => {
    const records = Array.from({ length: 30 }, (_, i) => rec(`r${i}`));
    useGameStore.setState({ criminalRecords: records });
    const linkedId = attachSuspectToMission({ id: 'm-gang', category: 'police' });
    expect(linkedId).not.toBeNull();
    const before = useGameStore.getState().criminalRecords.find((r) => r.id === linkedId)!;
    expect(before.missionId).toBe('m-gang');
    expect(before.warrantStatus).toBe('active');
    stampGangAffiliation('m-gang', 'iron_vipers');
    const after = useGameStore.getState().criminalRecords.find((r) => r.id === linkedId)!;
    expect(after.gangId).toBe('iron_vipers');
    // No other record was stamped.
    expect(useGameStore.getState().criminalRecords.filter((r) => r.gangId === 'iron_vipers')).toHaveLength(1);
  });

  it('stamping a mission with no linked record is a no-op', () => {
    useGameStore.setState({ criminalRecords: Array.from({ length: 30 }, (_, i) => rec(`s${i}`)) });
    expect(() => stampGangAffiliation('m-none', 'iron_vipers')).not.toThrow();
    expect(useGameStore.getState().criminalRecords.some((r) => r.gangId)).toBe(false);
  });
});
