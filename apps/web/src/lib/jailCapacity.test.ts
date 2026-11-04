import { describe, expect, it } from 'vitest';
import { BASE_JAIL_CAPACITY, jailCapacity, jailOccupancy, bookInmate } from './jailCapacity';
import { buildCriminalRecord } from './justice';

const stations = (perks: string[][]) => perks.map((perks) => ({ perks }));
const inmates = (n: number, status: 'booking' | 'held' | 'released' | 'transferred' = 'held') =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, status }));

describe('jailCapacity', () => {
  it('is the base plus each police Jail Capacity perk (+8)', () => {
    expect(jailCapacity(stations([]))).toBe(BASE_JAIL_CAPACITY);
    expect(jailCapacity(stations([['jail_capacity']]))).toBe(BASE_JAIL_CAPACITY + 8);
    expect(jailCapacity(stations([['jail_capacity'], ['jail_capacity']]))).toBe(BASE_JAIL_CAPACITY + 16);
    // A non-capacity perk is neutral.
    expect(jailCapacity(stations([['patrol_presence']]))).toBe(BASE_JAIL_CAPACITY);
  });
});

describe('jailOccupancy', () => {
  it('counts only inmates physically in the jail (released and transferred excluded)', () => {
    expect(jailOccupancy(inmates(3))).toBe(3);
    expect(jailOccupancy([...inmates(2), ...inmates(2, 'released')])).toBe(2);
    // Staged batch fix: transferred inmates are out-of-county, not in a
    // cell. The old expectation (1) encoded the bug — a transferred inmate
    // held a cell forever, so a full jail could never drain.
    expect(jailOccupancy(inmates(1, 'transferred'))).toBe(0);
    expect(jailOccupancy([])).toBe(0);
  });
});

describe('bookInmate', () => {
  const record = buildCriminalRecord('Memphis', 'TN');

  it('books normally while under capacity', () => {
    const { inmate, transferred } = bookInmate(record, 'Memphis', stations([]), inmates(BASE_JAIL_CAPACITY - 1));
    expect(transferred).toBe(false);
    expect(inmate.status).toBe('booking');
  });

  it('transfers the booking when the jail is full', () => {
    const { inmate, transferred } = bookInmate(record, 'Memphis', stations([]), inmates(BASE_JAIL_CAPACITY));
    expect(transferred).toBe(true);
    expect(inmate.status).toBe('transferred');
  });

  it('respects the perk-raised cap (12 base + 8 = 20)', () => {
    const withPerk = stations([['jail_capacity']]);
    expect(bookInmate(record, 'Memphis', withPerk, inmates(BASE_JAIL_CAPACITY)).transferred).toBe(false);
    expect(bookInmate(record, 'Memphis', withPerk, inmates(BASE_JAIL_CAPACITY + 8)).transferred).toBe(true);
  });
});
