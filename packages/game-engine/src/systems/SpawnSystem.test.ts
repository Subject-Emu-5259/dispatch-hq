import { describe, it, expect } from 'vitest';
import { SpawnSystem } from './SpawnSystem';
import { FIRE_MISSIONS, MISSION_SPAWN_CONFIG } from '@dispatch-hq/shared';

describe('SpawnSystem', () => {
  describe('selectTemplate', () => {
    it('returns a mission template from FIRE_MISSIONS', () => {
      const template = SpawnSystem.selectTemplate(1);
      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.difficulty).toBeDefined();
      expect(template.baseCredits).toBeGreaterThan(0);
    });

    it('only returns missions within difficulty range for low region level', () => {
      for (let i = 0; i < 100; i++) {
        const template = SpawnSystem.selectTemplate(1);
        expect(template.difficulty).toBeLessThanOrEqual(4); // regionLevel 1 -> difficulty <= 1+3
      }
    });

    it('returns harder missions at higher region levels', () => {
      const level1Results = new Set<string>();
      const level10Results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        level1Results.add(SpawnSystem.selectTemplate(1).id);
        level10Results.add(SpawnSystem.selectTemplate(10).id);
      }
      expect(level10Results.size).toBeGreaterThanOrEqual(level1Results.size);
    });

    it('always returns a template even at region level 0', () => {
      const template = SpawnSystem.selectTemplate(0);
      expect(template).toBeDefined();
    });

    it('default parameter uses regionLevel 1', () => {
      const template = SpawnSystem.selectTemplate();
      expect(template).toBeDefined();
      expect(template.difficulty).toBeLessThanOrEqual(4);
    });
  });

  describe('generateLocation', () => {
    it('returns a GeoPoint near the center', () => {
      const center = { lat: 40.7128, lng: -74.006 };
      const loc = SpawnSystem.generateLocation(center, 5);
      expect(loc.lat).toBeCloseTo(center.lat, 1);
      expect(loc.lng).toBeCloseTo(center.lng, 1);
    });

    it('stays within the radius approximately', () => {
      const center = { lat: 40.7128, lng: -74.006 };
      for (let i = 0; i < 50; i++) {
        const loc = SpawnSystem.generateLocation(center, 5);
        expect(Math.abs(loc.lat - center.lat)).toBeLessThan(0.05);
      }
    });

    it('uses default radius of 5km', () => {
      const center = { lat: 0, lng: 0 };
      const loc = SpawnSystem.generateLocation(center);
      expect(loc).toBeDefined();
      expect(typeof loc.lat).toBe('number');
      expect(typeof loc.lng).toBe('number');
    });
  });

  describe('shouldSpawn', () => {
    it('returns false when at max active missions', () => {
      expect(SpawnSystem.shouldSpawn(MISSION_SPAWN_CONFIG.maxActiveMissions)).toBe(false);
    });

    it('returns false when above max active missions', () => {
      expect(SpawnSystem.shouldSpawn(MISSION_SPAWN_CONFIG.maxActiveMissions + 10)).toBe(false);
    });

    it('eventually returns true when below max (probabilistic)', () => {
      let gotTrue = false;
      for (let i = 0; i < 1000; i++) {
        if (SpawnSystem.shouldSpawn(0, true)) {
          gotTrue = true;
          break;
        }
      }
      expect(gotTrue).toBe(true);
    });

    it('urban rate spawns more frequently than suburban', () => {
      let urbanTrue = 0;
      let suburbanTrue = 0;
      const trials = 10000;
      for (let i = 0; i < trials; i++) {
        if (SpawnSystem.shouldSpawn(0, true)) urbanTrue++;
        if (SpawnSystem.shouldSpawn(0, false)) suburbanTrue++;
      }
      expect(urbanTrue).toBeGreaterThan(suburbanTrue * 2);
    });
  });
});