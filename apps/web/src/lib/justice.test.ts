// Sentence auto-release harness — the mission-count rule's pure helpers.
// Eligibility (held + guilty only) lives in the App completion hook, not
// here; these tests pin the counting rule itself.
import { describe, it, expect } from 'vitest';
import { serveDay, sentenceServed, buildInmateFromRecord } from './justice';

const inmate = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  sentenceDays: 10,
  status: 'held',
  verdict: 'guilty',
  ...over,
}) as any;

describe('justice sentence auto-release', () => {
  it('serveDay increments daysServed and defaults absent to 0', () => {
    expect(serveDay(inmate({})).daysServed).toBe(1);
    expect(serveDay(inmate({ daysServed: 5 })).daysServed).toBe(6);
    expect(serveDay(inmate({ daysServed: 9 })).daysServed).toBe(10);
  });

  it('serveDay does not mutate the input', () => {
    const before = inmate({ daysServed: 3 });
    const after = serveDay(before);
    expect(before.daysServed).toBe(3);
    expect(after.daysServed).toBe(4);
  });

  it('sentenceServed only at or past the full sentence', () => {
    expect(sentenceServed(inmate({ daysServed: 0 }))).toBe(false);
    expect(sentenceServed(inmate({ daysServed: 9 }))).toBe(false);
    expect(sentenceServed(inmate({ daysServed: 10 }))).toBe(true);
    expect(sentenceServed(inmate({ daysServed: 11 }))).toBe(true);
  });

  it('a 0-day sentence is served on the first day served', () => {
    const served = serveDay(inmate({ sentenceDays: 0 }));
    expect(served.daysServed).toBe(1);
    expect(sentenceServed(served)).toBe(true);
  });

  it('a full sentence plays out over exactly sentenceDays clears', () => {
    let current = inmate({ sentenceDays: 3, daysServed: 0 });
    for (let day = 1; day <= 3; day++) {
      current = serveDay(current);
      expect(sentenceServed(current)).toBe(day === 3);
    }
  });

  it('new bookings start at 0 days served', () => {
    const record = {
      id: 'r1', firstName: 'Test', lastName: 'Subject', dateOfBirth: '01/01/1990',
      photoSeed: 'seed', charges: ['Petty theft'], riskLevel: 'low',
    } as any;
    const built = buildInmateFromRecord(record, 'Memphis');
    expect(built.daysServed).toBe(0);
    expect(built.status).toBe('booking');
    expect(built.verdict).toBe('pending');
  });
});
