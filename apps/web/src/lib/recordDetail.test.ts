// ============================================
// Criminal record detail tests (staged batch, Addition 7)
// ============================================
// Proves the detailed view joins the record to the game's own stored
// data — no invented fields: linked mission, latest jail row + court
// disposition, gang affiliation, statute lines, computed sentence/bail.

import { describe, it, expect } from 'vitest';
import { buildRecordDetail, dispositionFor } from './recordDetail';
import type { CriminalRecord, Inmate, Mission } from '@dispatch-hq/shared';

const record = (over: Partial<CriminalRecord> = {}): CriminalRecord => ({
  id: 'rec_1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '01/01/1990',
  heightIn: 66, weightLb: 140, citizenship: 'USA', address: '1 Main St',
  city: 'West Memphis', state: 'AR', photoSeed: 'rec_1', riskLevel: 'high',
  warrantStatus: 'active', knownAliases: [], charges: ['Robbery'],
  arrestCount: 2, notes: '', ...over,
});

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1', templateId: 'robbery', name: 'Armed Robbery', description: '',
  category: 'police', icon: '💰', status: 'on_scene',
  location: { lat: 35.15, lng: -90.05 }, poiType: 'commercial', difficulty: 6,
  creditsReward: 500, xpReward: 100, requirements: [], assignedUnits: [],
  progress: 50, timeRemaining: 120, totalTime: 240,
  createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(),
  ...over,
} as Mission);

const inmate = (over: Partial<Inmate> = {}): Inmate => ({
  id: 'in1', recordId: 'rec_1', firstName: 'Jane', lastName: 'Doe',
  dateOfBirth: '01/01/1990', photoSeed: 'rec_1', charges: ['Robbery'],
  sentenceDays: 90, bookingNumber: 'B-100', bookingTime: 1000,
  cellBlock: 'A', bailAmount: 5000, status: 'held', riskLevel: 'high',
  bookedByJurisdiction: 'county', ...over,
});

describe('buildRecordDetail', () => {
  it('joins the linked mission, latest jail row, and disposition', () => {
    const d = buildRecordDetail(
      record({ missionId: 'm1' }),
      [mission(), mission({ id: 'm2', name: 'Other Call' })],
      [inmate(), inmate({ id: 'in2', bookingTime: 2000, status: 'awaiting_trial', verdict: 'pending' })],
    );
    expect(d.linkedMission?.name).toBe('Armed Robbery');
    expect(d.linkedMission?.status).toBe('on_scene');
    // Latest by bookingTime wins, not first in the array.
    expect(d.inmate?.id).toBe('in2');
    expect(d.inmate?.status).toBe('awaiting_trial');
    expect(d.disposition).toBe('Court: hearing pending');
  });

  it('reports honestly when nothing is linked or booked', () => {
    const d = buildRecordDetail(record(), [], []);
    expect(d.linkedMission).toBeNull();
    expect(d.inmate).toBeNull();
    expect(d.disposition).toBe('No court case on file');
  });

  it('shows the gang only when the record itself carries one', () => {
    expect(buildRecordDetail(record(), [], []).gang).toBeNull();
    const d = buildRecordDetail(record({ gangId: 'iron_vipers' }), [], []);
    expect(d.gang?.name).toBe('Iron Vipers');
    // An unknown gang id is not invented into a label.
    expect(buildRecordDetail(record({ gangId: 'not_a_gang' }), [], []).gang).toBeNull();
  });

  it('renders statute lines per charge and a computed sentence/bail', () => {
    const d = buildRecordDetail(record(), [], []);
    expect(d.chargeLines).toHaveLength(1);
    expect(d.chargeLines[0].charge).toBe('Robbery');
    expect(d.chargeLines[0].statute?.code).toMatch(/^DHQ-/);
    expect(d.computed).not.toBeNull();
    expect(d.computed!.sentenceDays).toBeGreaterThan(0);
    expect(d.computed!.bailAmount).toBeGreaterThan(0);
  });

  it('unknown charges yield no statute and no computed sentence', () => {
    const d = buildRecordDetail(record({ charges: ['Made Up Charge'] }), [], []);
    expect(d.chargeLines[0].statute).toBeNull();
    expect(d.computed).toBeNull();
  });

  it('dispositions follow the inmate row, not a guess', () => {
    expect(dispositionFor(inmate({ status: 'transferred' }))).toContain('Transferred');
    expect(dispositionFor(inmate({ verdict: 'guilty' }))).toContain('guilty');
    expect(dispositionFor(inmate({ verdict: 'dismissed' }))).toContain('dismissed');
    expect(dispositionFor(inmate({ status: 'released' }))).toContain('Released');
  });
});
