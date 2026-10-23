import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStationBuildCost, getUnitMaxSpeedMph, getTravelTimeMultiplier, applyTravelTech } from './techTree';
import { useGameStore } from '@/stores/gameStore';

const { loadSettingsMock } = vi.hoisted(() => ({ loadSettingsMock: vi.fn() }));
vi.mock('@/utils/settings', () => ({ loadSettings: loadSettingsMock }));

beforeEach(() => {
  loadSettingsMock.mockReturnValue({ gameSpeed: 1 });
  useGameStore.setState({ techPurchased: new Set() });
});

const ALL_TRAVEL_TECH = new Set(['r1', 'r2', 'tr1']);

// Without any tech purchased, the e2 multiplier is 1, so these assertions
// isolate the partner-station discount math.
describe('getStationBuildCost', () => {
  it('charges full price for your own department stations at any level', () => {
    expect(getStationBuildCost('police_station', 'police', 1)).toBe(4000);
    expect(getStationBuildCost('police_station', 'police', 20)).toBe(4000);
  });

  it('charges full price for partner stations before the discount unlocks (L1-4)', () => {
    expect(getStationBuildCost('fire_station', 'police', 1)).toBe(5000);
    expect(getStationBuildCost('fire_station', 'police', 4)).toBe(5000);
    expect(getStationBuildCost('ems_station', 'police', 3)).toBe(4500);
  });

  it('discounts partner stations by level tier', () => {
    expect(getStationBuildCost('fire_station', 'police', 5)).toBe(4500);  // -10%
    expect(getStationBuildCost('fire_station', 'police', 10)).toBe(4000); // -20%
    expect(getStationBuildCost('fire_station', 'police', 15)).toBe(3250); // -35%
    expect(getStationBuildCost('fire_station', 'police', 20)).toBe(2500); // -50%
  });

  it('never discounts when no single-service city is active', () => {
    expect(getStationBuildCost('fire_station', null, 20)).toBe(5000);
  });

  it('returns 0 for an unknown station type', () => {
    expect(getStationBuildCost('mystery_station', 'police', 20)).toBe(0);
  });

  it('rounds discounted ems station costs', () => {
    // 4500 * 0.5 = 2250 exactly at L20; 4500 * 0.8 = 3600 at L10.
    expect(getStationBuildCost('ems_station', 'police', 20)).toBe(2250);
    expect(getStationBuildCost('ems_station', 'police', 10)).toBe(3600);
  });
});

describe('getUnitMaxSpeedMph', () => {
  it('quotes the raw spec at default game speed with no tech (13.9 m/s ≈ 31 mph)', () => {
    expect(getUnitMaxSpeedMph(13.9)).toBe(31);
  });

  it('scales with the game-speed setting', () => {
    loadSettingsMock.mockReturnValue({ gameSpeed: 2 });
    expect(getUnitMaxSpeedMph(13.9)).toBe(62);
  });

  it('scales with response-speed and travel tech (r1·r2·tr1 ≈ 1.63×)', () => {
    useGameStore.setState({ techPurchased: ALL_TRAVEL_TECH });
    expect(getUnitMaxSpeedMph(13.9)).toBe(51);
  });

  it('stacks game speed and travel tech (13.9 × 2 × 1.63 ≈ 102 mph)', () => {
    loadSettingsMock.mockReturnValue({ gameSpeed: 2 });
    useGameStore.setState({ techPurchased: ALL_TRAVEL_TECH });
    expect(getUnitMaxSpeedMph(13.9)).toBe(102);
  });

  it('clamps at the 150 mph shared cap', () => {
    loadSettingsMock.mockReturnValue({ gameSpeed: 2 });
    useGameStore.setState({ techPurchased: ALL_TRAVEL_TECH });
    expect(getUnitMaxSpeedMph(80)).toBe(150); // 80 m/s would exceed the cap
  });

  it('falls back to a sane floor for a missing/zero spec', () => {
    expect(getUnitMaxSpeedMph(0)).toBe(31);
    expect(getUnitMaxSpeedMph(NaN)).toBe(31);
  });
});

// ── City trait travel integration (v0.35.0) ────────────────────────────────

describe('getTravelTimeMultiplier — city trait', () => {
  it('returns baseline 1 with no city selected', () => {
    useGameStore.setState({ selectedCity: null });
    expect(getTravelTimeMultiplier()).toBe(1);
  });

  it('applies Paris travel time multiplier (1.12×)', () => {
    useGameStore.setState({
      selectedCity: { name: 'Paris', lat: 48.8566, lng: 2.3522 } as any,
      techPurchased: new Set(),
    });
    const mult = getTravelTimeMultiplier();
    expect(mult).toBeCloseTo(1.12, 2);
  });

  it('stacks Paris trait with travel tech (r1·r2·tr1 ≈ 0.612 × 1.12 ≈ 0.685)', () => {
    useGameStore.setState({
      selectedCity: { name: 'Paris', lat: 48.8566, lng: 2.3522 } as any,
      techPurchased: ALL_TRAVEL_TECH,
    });
    const mult = getTravelTimeMultiplier();
    // 0.85 * 0.80 * 0.90 = 0.612; * 1.12 = 0.68544
    expect(mult).toBeCloseTo(0.685, 2);
  });

  it('returns 1 for cities without a trait', () => {
    useGameStore.setState({
      selectedCity: { name: 'West Memphis', lat: 35.15, lng: -90.19 } as any,
      techPurchased: new Set(),
    });
    expect(getTravelTimeMultiplier()).toBe(1);
  });
});

describe('applyTravelTech — city trait response delta', () => {
  it('adds Paris response delta (+3s) to travel time', () => {
    useGameStore.setState({
      selectedCity: { name: 'Paris', lat: 48.8566, lng: 2.3522 } as any,
      techPurchased: new Set(),
    });
    // 100s base * 1.12 trait + 3s delta = 115
    expect(applyTravelTech(100)).toBe(115);
  });

  it('adds no delta for cities without a trait', () => {
    useGameStore.setState({
      selectedCity: { name: 'West Memphis', lat: 35.15, lng: -90.19 } as any,
      techPurchased: new Set(),
    });
    expect(applyTravelTech(100)).toBe(100);
  });

  it('never drops below 1 second', () => {
    useGameStore.setState({
      selectedCity: { name: 'Paris', lat: 48.8566, lng: 2.3522 } as any,
      techPurchased: new Set(),
    });
    expect(applyTravelTech(0)).toBe(3); // just the delta
  });
});
