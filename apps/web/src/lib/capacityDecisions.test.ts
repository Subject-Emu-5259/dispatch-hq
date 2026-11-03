import { describe, it, expect } from 'vitest';
import {
  TIGHT_RATIO, DIVERSION_SATISFACTION_DELTA, TRANSFER_XP_FACTOR,
  capacityStatus, capacityFree, decideHospitalAdmission, decideJailBooking,
} from './capacityDecisions';

describe('capacityDecisions (Batch 3b)', () => {
  it('classifies open / tight / full and counts free capacity', () => {
    expect(TIGHT_RATIO).toBe(0.8);
    expect(capacityStatus(0, 40)).toBe('open');
    expect(capacityStatus(31, 40)).toBe('open');
    expect(capacityStatus(32, 40)).toBe('tight');
    expect(capacityStatus(40, 40)).toBe('full');
    expect(capacityStatus(45, 40)).toBe('full');
    expect(capacityStatus(0, 0)).toBe('full');
    expect(capacityFree(38, 40)).toBe(2);
    expect(capacityFree(45, 40)).toBe(0);
  });

  it('admits while beds are free, diverts at capacity with a satisfaction cost', () => {
    expect(decideHospitalAdmission(39, 40)).toEqual({ action: 'admit', bedsFree: 1, status: 'tight', satisfactionDelta: 0 });
    const diverted = decideHospitalAdmission(40, 40);
    expect(diverted.action).toBe('divert');
    expect(diverted.bedsFree).toBe(0);
    expect(diverted.satisfactionDelta).toBe(DIVERSION_SATISFACTION_DELTA);
    expect(DIVERSION_SATISFACTION_DELTA).toBe(-3);
  });

  it('books while cells are free, transfers at capacity at half progression credit', () => {
    expect(decideJailBooking(11, 12)).toEqual({ action: 'book', cellsFree: 1, status: 'tight', progressionFactor: 1 });
    const transferred = decideJailBooking(12, 12);
    expect(transferred.action).toBe('transfer');
    expect(transferred.progressionFactor).toBe(TRANSFER_XP_FACTOR);
    expect(TRANSFER_XP_FACTOR).toBe(0.5);
  });
});
