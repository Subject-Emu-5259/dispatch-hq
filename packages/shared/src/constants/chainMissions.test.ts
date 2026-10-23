import { describe, it, expect } from 'vitest';
import { CHAIN_DEFINITIONS, chainForId, nextStage, FIRE_MISSIONS, POLICE_MISSIONS, EMS_MISSIONS } from './missions';

const KNOWN_TEMPLATE_IDS = new Set([
  ...FIRE_MISSIONS.map((t) => t.id),
  ...POLICE_MISSIONS.map((t) => t.id),
  ...EMS_MISSIONS.map((t) => t.id),
]);

describe('chain missions', () => {
  it('fire chain escalates fire -> hazmat -> rescue', () => {
    const def = chainForId('fire_chain');
    expect(def).not.toBeNull();
    expect(def!.stages.map((s) => s.templateId)).toContain('room_fire');
    expect(nextStage(def!, 1)!.templateId).toBe('gas_leak');
    expect(nextStage(def!, 3)).toBeNull();
  });

  it('every stage templateId resolves to a real template', () => {
    for (const def of CHAIN_DEFINITIONS) {
      for (const stage of def.stages) {
        expect(KNOWN_TEMPLATE_IDS.has(stage.templateId)).toBe(true);
      }
    }
  });

  it('every stage service is a valid service', () => {
    for (const def of CHAIN_DEFINITIONS) {
      for (const stage of def.stages) {
        expect(['fire', 'police', 'ems']).toContain(stage.service);
      }
    }
  });

  it('chains have at least 2 stages', () => {
    for (const def of CHAIN_DEFINITIONS) {
      expect(def.stages.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('chemical spill chain escalates fuel_spill -> hazmat_medical -> factory_fire', () => {
    const def = chainForId('chemical_chain');
    expect(def).not.toBeNull();
    expect(def!.stages.map((s) => s.templateId)).toEqual(['fuel_spill', 'hazmat_medical', 'factory_fire']);
    expect(def!.stages.map((s) => s.service)).toEqual(['fire', 'ems', 'fire']);
    expect(nextStage(def!, 1)!.templateId).toBe('hazmat_medical');
    expect(nextStage(def!, 3)).toBeNull();
  });

  it('mass transit chain escalates bus_crash -> multi_victim -> hazmat_medical (all EMS)', () => {
    const def = chainForId('mci_chain');
    expect(def).not.toBeNull();
    expect(def!.stages.map((s) => s.templateId)).toEqual(['bus_crash', 'multi_victim', 'hazmat_medical']);
    expect(def!.stages.map((s) => s.service)).toEqual(['ems', 'ems', 'ems']);
    expect(nextStage(def!, 1)!.templateId).toBe('multi_victim');
    expect(nextStage(def!, 2)!.templateId).toBe('hazmat_medical');
    expect(nextStage(def!, 3)).toBeNull();
  });

  it('chainForId returns null for unknown ids', () => {
    expect(chainForId('nope')).toBeNull();
  });

  it('nextStage returns the following stage (1-based)', () => {
    const def = chainForId('police_chain');
    expect(def).not.toBeNull();
    expect(nextStage(def!, 1)!.templateId).toBe(def!.stages[1].templateId);
    expect(nextStage(def!, def!.stages.length)).toBeNull();
  });
});
