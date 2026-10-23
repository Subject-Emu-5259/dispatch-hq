import { describe, it, expect } from 'vitest';
import {
  CPU_UNIT_NAME,
  cpuWorkSeconds,
  cpuMutualAidPayout,
  isPartnerAgencyCall,
  partnerAgencyServices,
  cityAnswersCall,
  serviceHasUnits,
  emsAirliftEligible,
  adaptAirliftTemplate,
  partnerCallAnswerable,
} from './cpuMutualAid';

describe('cpuWorkSeconds', () => {
  it('scales with difficulty between a 30s floor and a 75s cap', () => {
    expect(cpuWorkSeconds(1)).toBe(30);   // 20 + 6 → clamped to floor
    expect(cpuWorkSeconds(5)).toBe(50);   // 20 + 30
    expect(cpuWorkSeconds(10)).toBe(75);  // 20 + 60 → clamped to cap
  });

  it('respects game speed', () => {
    expect(cpuWorkSeconds(5, 2)).toBe(25);  // half the real time
    expect(cpuWorkSeconds(5, 0.5)).toBe(100); // slower game, longer wall time
  });
});

describe('cpuMutualAidPayout', () => {
  it('pays 10% of the credit reward', () => {
    expect(cpuMutualAidPayout(5000)).toBe(500);
    expect(cpuMutualAidPayout(3200)).toBe(320);
  });

  it('never pays below the 50-credit floor', () => {
    expect(cpuMutualAidPayout(400)).toBe(50);
    expect(cpuMutualAidPayout(250)).toBe(50);
    expect(cpuMutualAidPayout(100)).toBe(50);
  });
});

describe('isPartnerAgencyCall', () => {
  it('flags cross-service calls', () => {
    expect(isPartnerAgencyCall({ category: 'fire' }, 'police')).toBe(true);
    expect(isPartnerAgencyCall({ category: 'ems' }, 'police')).toBe(true);
  });

  it('never flags the player\'s own department', () => {
    expect(isPartnerAgencyCall({ category: 'police' }, 'police')).toBe(false);
    expect(isPartnerAgencyCall({ category: 'traffic' }, 'police')).toBe(false);
  });

  it('returns false when no single-service city is active', () => {
    expect(isPartnerAgencyCall({ category: 'fire' }, null)).toBe(false);
  });
});

describe('partnerAgencyServices', () => {
  const stations = (types: string[]) => types.map((type) => ({ type }));

  it('returns the services the player owns a partner station for', () => {
    expect(partnerAgencyServices(stations(['police_station', 'fire_station']), 'police', false)).toEqual(['fire']);
    expect(partnerAgencyServices(stations(['police_station', 'ems_station']), 'police', false)).toEqual(['ems']);
  });

  it('prefers the built partner station over CPU coverage', () => {
    // fire station built + CPU aid on → only fire (the answerable one) spawns.
    expect(partnerAgencyServices(stations(['police_station', 'fire_station']), 'police', true)).toEqual(['fire']);
  });

  it('falls back to every other service when CPU aid is on and no partner station exists', () => {
    expect(partnerAgencyServices(stations(['police_station']), 'police', true)).toEqual(['fire', 'ems']);
    expect(partnerAgencyServices(stations(['fire_station']), 'fire', true)).toEqual(['police', 'ems']);
  });

  it('returns nothing when nothing could answer the calls', () => {
    // No partner station, no CPU aid → spawning calls would strand them.
    expect(partnerAgencyServices(stations(['police_station']), 'police', false)).toEqual([]);
    // Own-department stations only ever count as partners for OTHER services.
    expect(partnerAgencyServices(stations(['police_station', 'fire_station', 'ems_station']), 'police', false)).toEqual(['fire', 'ems']);
  });

  it('returns nothing outside a single-service city', () => {
    expect(partnerAgencyServices(stations(['fire_station']), null, true)).toEqual([]);
  });

  it('citySim (v0.22.8) lets cross-service calls spawn with no partner station and CPU aid off', () => {
    // No partner station, CPU aid off — but simulated incidents on → the city
    // spawns (and resolves) other departments' calls so the city feels alive.
    expect(partnerAgencyServices(stations(['police_station']), 'police', false, true)).toEqual(['fire', 'ems']);
    expect(partnerAgencyServices(stations(['fire_station']), 'fire', false, true)).toEqual(['police', 'ems']);
  });

  it('a built partner station still beats citySim (its calls are answerable, +25%)', () => {
    // fire station built + citySim on → only fire spawns (never stolen by the CPU).
    expect(partnerAgencyServices(stations(['police_station', 'fire_station']), 'police', false, true)).toEqual(['fire']);
  });

  it('citySim off behaves exactly like before', () => {
    expect(partnerAgencyServices(stations(['police_station']), 'police', false, false)).toEqual([]);
    expect(partnerAgencyServices(stations(['police_station']), 'police', true, false)).toEqual(['fire', 'ems']);
  });
});

describe('cityAnswersCall (v0.22.8 simulated cross-service incidents)', () => {
  const stations = (types: string[]) => types.map((type) => ({ type }));

  it('CPU aid on → the city answers every cross-service call', () => {
    expect(cityAnswersCall({ category: 'fire' }, stations(['police_station']), 'police', true, false)).toBe(true);
  });

  it('citySim answers only departments the player owns NO station for', () => {
    // Police player, no fire station → a fire call is city-resolved.
    expect(cityAnswersCall({ category: 'fire' }, stations(['police_station']), 'police', false, true)).toBe(true);
    // Fire station built → the call stays answerable by the player (+25%).
    expect(cityAnswersCall({ category: 'fire' }, stations(['police_station', 'fire_station']), 'police', false, true)).toBe(false);
  });

  it('never answers the player\'s own department', () => {
    expect(cityAnswersCall({ category: 'police' }, stations(['police_station']), 'police', false, true)).toBe(false);
    expect(cityAnswersCall({ category: 'police' }, stations(['police_station']), 'police', true, true)).toBe(false);
  });

  it('returns false outside a single-service city or when nothing is enabled', () => {
    expect(cityAnswersCall({ category: 'fire' }, stations(['police_station']), null, false, true)).toBe(false);
    expect(cityAnswersCall({ category: 'fire' }, stations(['police_station']), 'police', false, false)).toBe(false);
  });
});

describe('CPU_UNIT_NAME', () => {
  it('has a plausible unit name per department', () => {
    expect(CPU_UNIT_NAME.fire).toMatch(/Engine|Ladder|Truck/);
    expect(CPU_UNIT_NAME.police).toMatch(/Unit|Patrol|Car/);
    expect(CPU_UNIT_NAME.ems).toMatch(/Ambulance|Medic|Rescue/);
  });
});

describe('airlift adaptation (v0.22.18)', () => {
  const units = (types: string[]) => types.map((type) => ({ type }));
  const EMS_POOL = [
    { id: 'remote_rescue_airlift' },
    { id: 'highway_trauma_airlift' },
    { id: 'medical_call' },
    { id: 'stroke_response' },
    { id: 'food_poisoning' },
  ];

  it('emsAirliftEligible needs BOTH an EMS unit and the helipad', () => {
    expect(emsAirliftEligible(units(['ambulance']), { id: 'pad' })).toBe(true);
    expect(emsAirliftEligible(units(['ambulance']), null)).toBe(false);
    expect(emsAirliftEligible(units(['patrol_car']), { id: 'pad' })).toBe(false);
    expect(emsAirliftEligible(units([]), null)).toBe(false);
  });

  it('reschedules an airlift template away when the city cannot run airlifts', () => {
    const out = adaptAirliftTemplate({ id: 'remote_rescue_airlift' }, EMS_POOL, false);
    expect(out.id).not.toBe('remote_rescue_airlift');
    expect(out.id).not.toBe('highway_trauma_airlift');
    expect(['medical_call', 'stroke_response', 'food_poisoning']).toContain(out.id);
  });

  it('keeps the airlift callout when the city is airlift-ready', () => {
    expect(adaptAirliftTemplate({ id: 'remote_rescue_airlift' }, EMS_POOL, true).id).toBe('remote_rescue_airlift');
    expect(adaptAirliftTemplate({ id: 'highway_trauma_airlift' }, EMS_POOL, true).id).toBe('highway_trauma_airlift');
  });

  it('never touches non-airlift templates', () => {
    expect(adaptAirliftTemplate({ id: 'medical_call' }, EMS_POOL, false).id).toBe('medical_call');
    expect(adaptAirliftTemplate({ id: 'stroke_response' }, EMS_POOL, true).id).toBe('stroke_response');
  });

  it('falls back to the original template if the pool has no road-answerable EMS calls', () => {
    expect(adaptAirliftTemplate({ id: 'remote_rescue_airlift' }, [{ id: 'remote_rescue_airlift' }], false).id).toBe('remote_rescue_airlift');
  });
});

describe('partnerCallAnswerable (v0.22.18 spawn gate)', () => {
  const units = (types: string[]) => types.map((type) => ({ type }));

  it('spawns when the player has units for the department', () => {
    expect(partnerCallAnswerable('ems', units(['ambulance']), false, false)).toBe(true);
    expect(partnerCallAnswerable('fire', units(['engine']), false, false)).toBe(true);
  });

  it('spawns without units when the CPU city will resolve the call', () => {
    expect(partnerCallAnswerable('ems', units(['patrol_car']), true, false)).toBe(true);
    expect(partnerCallAnswerable('ems', units(['patrol_car']), false, true)).toBe(true);
  });

  it('refuses to spawn an unanswerable call (no units, no CPU resolution)', () => {
    // The leak: police city with an EMS station but no EMS crews or helipad.
    expect(partnerCallAnswerable('ems', units(['patrol_car']), false, false)).toBe(false);
    expect(partnerCallAnswerable('fire', units(['patrol_car']), false, false)).toBe(false);
  });
});
