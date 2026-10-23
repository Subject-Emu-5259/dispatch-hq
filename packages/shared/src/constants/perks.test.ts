import { describe, it, expect } from 'vitest';
import {
  PERK_SLOT_LEVELS,
  STATION_PERKS,
  perksForStationType,
  hasPerk,
  perkSlotsForLevel,
  nextPerkSlotLevel,
  availablePerkChoices,
  perkAdjustedRadius,
  capacityBonusFor,
  stationRewardMultiplier,
} from './perks';

describe('station perks — definitions', () => {
  it('defines 3 fire perks and 4 police/EMS perks', () => {
    expect(perksForStationType('fire_station')).toHaveLength(3);
    expect(perksForStationType('police_station')).toHaveLength(4);
    expect(perksForStationType('ems_station')).toHaveLength(4);
  });

  it('every station type has one radius, one reward, and one economy perk', () => {
    const economyByType = {
      fire_station: 'training_discount',
      police_station: 'hire_discount',
      ems_station: 'training_discount',
    } as const;
    for (const type of ['fire_station', 'police_station', 'ems_station'] as const) {
      const kinds = perksForStationType(type).map((p) => p.kind);
      expect(kinds).toContain('radius');
      expect(kinds).toContain('reward');
      expect(kinds).toContain(economyByType[type]);
    }
  });

  it('police and EMS carry their capacity perk', () => {
    expect(perksForStationType('police_station').some((p) => p.kind === 'jail_capacity')).toBe(true);
    expect(perksForStationType('ems_station').some((p) => p.kind === 'hospital_beds')).toBe(true);
    expect(perksForStationType('fire_station').some((p) => p.kind === 'jail_capacity' || p.kind === 'hospital_beds')).toBe(false);
  });

  it('perk ids are unique', () => {
    const ids = STATION_PERKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('station perks — capacity bonus aggregation', () => {
  it('sums the matching perk value across stations', () => {
    const stations = [
      { perks: ['jail_capacity'] },
      { perks: ['hospital_ward'] },
      { perks: ['jail_capacity', 'hospital_ward'] },
    ];
    expect(capacityBonusFor(stations, 'jail_capacity')).toBe(16); // 8 + 8
    expect(capacityBonusFor(stations, 'hospital_beds')).toBe(10); // 5 + 5
  });

  it('returns 0 when no station owns the kind (and for unknown ids)', () => {
    expect(capacityBonusFor([{ perks: ['patrol_presence'] }], 'jail_capacity')).toBe(0);
    expect(capacityBonusFor([], 'hospital_beds')).toBe(0);
    expect(capacityBonusFor([{ perks: ['not_a_perk'] }], 'jail_capacity')).toBe(0);
  });

  it('ignores missing perks arrays', () => {
    expect(capacityBonusFor([{} as { perks: string[] }], 'jail_capacity')).toBe(0);
  });
});

describe('station perks — slot progression', () => {
  it('awards slots at levels 2, 3, and 5 only', () => {
    expect(PERK_SLOT_LEVELS).toEqual([2, 3, 5]);
    expect(perkSlotsForLevel(1)).toBe(0);
    expect(perkSlotsForLevel(2)).toBe(1);
    expect(perkSlotsForLevel(4)).toBe(2);
    expect(perkSlotsForLevel(5)).toBe(3);
    expect(perkSlotsForLevel(20)).toBe(3);
  });

  it('nextPerkSlotLevel reports the next unfilled slot', () => {
    expect(nextPerkSlotLevel({ level: 1, perks: [] })).toBeNull();
    expect(nextPerkSlotLevel({ level: 2, perks: [] })).toBe(2);
    expect(nextPerkSlotLevel({ level: 3, perks: ['fire_suppression'] })).toBe(3);
    expect(nextPerkSlotLevel({ level: 5, perks: ['a', 'b'] })).toBe(5);
    expect(nextPerkSlotLevel({ level: 5, perks: ['a', 'b', 'c'] })).toBeNull();
  });

  it('only offers choices at an earned, unfilled slot', () => {
    const station = { type: 'fire_station' as const, perks: [] as string[], level: 1 };
    expect(availablePerkChoices(station)).toHaveLength(0);

    const atLevel2 = { ...station, level: 2 };
    const choices = availablePerkChoices(atLevel2);
    expect(choices.map((p) => p.id)).toEqual(['fire_response_radius', 'fire_suppression', 'training_hall']);

    // One pick per slot level: after choosing at 2, the next slot opens at 3.
    const afterPick = { ...atLevel2, perks: ['fire_suppression'] };
    expect(availablePerkChoices(afterPick)).toHaveLength(0);
    const atLevel3 = { ...afterPick, level: 3 };
    expect(availablePerkChoices(atLevel3).map((p) => p.id)).toEqual(['fire_response_radius', 'training_hall']);
  });
});

describe('station perks — radius', () => {
  it('bumps coverage radius by +15% when the radius perk is owned', () => {
    expect(perkAdjustedRadius(10, { perks: [] })).toBe(10);
    expect(perkAdjustedRadius(10, { perks: ['fire_response_radius'] })).toBe(12);
    expect(perkAdjustedRadius(7, { perks: ['police_response_radius'] })).toBe(8); // 8.05 → rounds
  });

  it('hasPerk detects owned perks', () => {
    expect(hasPerk({ perks: ['fire_suppression'] }, 'fire_suppression')).toBe(true);
    expect(hasPerk({ perks: [] }, 'fire_suppression')).toBe(false);
    expect(hasPerk({ perks: undefined }, 'fire_suppression')).toBe(false);
  });
});

describe('station perks — reward multiplier', () => {
  const byId = (pairs: [string, string][]): Record<string, string> =>
    Object.fromEntries(pairs);

  it('returns 1 when no station owns the matching reward perk', () => {
    const stations = [{ id: 's1', perks: ['training_hall'] }];
    const mult = stationRewardMultiplier(stations, ['u1'], byId([['u1', 's1']]), 'fire');
    expect(mult).toBe(1);
  });

  it('applies +10% when the clearing station owns its service reward perk', () => {
    const stations = [{ id: 's1', perks: ['fire_suppression'] }];
    const mult = stationRewardMultiplier(stations, ['u1'], byId([['u1', 's1']]), 'fire');
    expect(mult).toBe(1.1);
  });

  it('matches the reward perk to the mission service (police ≠ fire)', () => {
    const stations = [{ id: 's1', perks: ['fire_suppression'] }];
    const police = stationRewardMultiplier(stations, ['u1'], byId([['u1', 's1']]), 'police');
    expect(police).toBe(1);
    const fire = stationRewardMultiplier(stations, ['u1'], byId([['u1', 's1']]), 'hazmat');
    expect(fire).toBe(1.1);
  });

  it('ignores units from stations that do not own the perk', () => {
    const stations = [
      { id: 's1', perks: ['patrol_presence'] },
      { id: 's2', perks: [] },
    ];
    const mixed = stationRewardMultiplier(stations, ['u1', 'u2'], byId([['u1', 's2'], ['u2', 's2']]), 'police');
    expect(mixed).toBe(1);
  });

  it('caps the mixed-fleet bonus at +30%', () => {
    const stations = [
      { id: 's1', perks: ['patrol_presence'] },
      { id: 's2', perks: ['patrol_presence'] },
      { id: 's3', perks: ['patrol_presence'] },
      { id: 's4', perks: ['patrol_presence'] },
    ];
    const mult = stationRewardMultiplier(
      stations,
      ['u1', 'u2', 'u3', 'u4'],
      byId([['u1', 's1'], ['u2', 's2'], ['u3', 's3'], ['u4', 's4']]),
      'police',
    );
    expect(mult).toBe(1.3);
  });

  it('returns 1 for missions with no assigned units', () => {
    const stations = [{ id: 's1', perks: ['community_care'] }];
    expect(stationRewardMultiplier(stations, [], {}, 'ems')).toBe(1);
  });
});
