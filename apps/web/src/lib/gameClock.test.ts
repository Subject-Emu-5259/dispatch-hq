import { describe, it, expect } from 'vitest';
import { hourOfDay, isNight, clockLabel, NIGHT_SPAWN_MODIFIER } from './gameClock';

describe('gameClock', () => {
  it('derives hour and night from minutes', () => {
    expect(hourOfDay(0)).toBe(0);
    expect(hourOfDay(30 * 13)).toBe(13); // 13h in (30 game min per real min)
    expect(isNight(0)).toBe(true);
    expect(isNight(30 * 12)).toBe(false); // noon
    expect(NIGHT_SPAWN_MODIFIER).toBe(0.7);
  });

  it('treats late evening as night', () => {
    expect(isNight(30 * 21)).toBe(true); // 21:00
    expect(isNight(30 * 5)).toBe(true);  // 05:00 still night
    expect(isNight(30 * 6)).toBe(false); // 06:00 dawn
  });

  it('formats labels', () => {
    expect(clockLabel(30 * 7 + 15)).toBe('07:15');
    expect(clockLabel(30 * 23 + 59)).toMatch(/^\d{2}:\d{2}$/);
    expect(clockLabel(0)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('wraps past 24h', () => {
    expect(hourOfDay(30 * 24)).toBe(0); // next day, midnight
    expect(hourOfDay(30 * 25)).toBe(1);
  });
});
