import { describe, it, expect } from 'vitest';
import { SEASONAL_WINDOWS, SEASONAL_WINDOW_LABELS, windowActive, windowEnded, parseClearKind } from '../routes/seasonal';

const july = SEASONAL_WINDOWS.find((w) => w.id === 'independence-day')!;
const christmas = SEASONAL_WINDOWS.find((w) => w.id === 'christmas')!;

describe('seasonal windows', () => {
  it('mirrors the client windows (independence-day + christmas)', () => {
    expect(SEASONAL_WINDOWS.length).toBe(2);
    expect(july.start).toEqual({ month: 7, day: 1 });
    expect(july.end).toEqual({ month: 7, day: 6 });
    expect(christmas.start).toEqual({ month: 12, day: 24 });
    expect(christmas.end).toEqual({ month: 12, day: 26 });
  });

  it('windowActive is true only inside the inclusive window (UTC)', () => {
    expect(windowActive(july, new Date(Date.UTC(2026, 6, 1)))).toBe(true); // first day
    expect(windowActive(july, new Date(Date.UTC(2026, 6, 4)))).toBe(true);
    expect(windowActive(july, new Date(Date.UTC(2026, 6, 6)))).toBe(true); // last day
    expect(windowActive(july, new Date(Date.UTC(2026, 6, 7)))).toBe(false);
    expect(windowActive(july, new Date(Date.UTC(2026, 5, 30)))).toBe(false);
  });

  it('windowEnded flips only after the last day passes', () => {
    expect(windowEnded(july, new Date(Date.UTC(2026, 6, 6)))).toBe(false);
    expect(windowEnded(july, new Date(Date.UTC(2026, 6, 7)))).toBe(true);
    expect(windowEnded(christmas, new Date(Date.UTC(2026, 11, 27)))).toBe(true);
  });
});

describe('seasonal window labels (admin console)', () => {
  it('every window has a human label so the admin view never falls back to a raw id', () => {
    for (const w of SEASONAL_WINDOWS) {
      const label = SEASONAL_WINDOW_LABELS[w.id];
      expect(label).toBeTruthy();
      expect(label?.length).toBeGreaterThan(3);
    }
  });

  it('labels mirror the client SEASONAL_EVENTS names', () => {
    expect(SEASONAL_WINDOW_LABELS['independence-day']).toBe('Fourth of July');
    expect(SEASONAL_WINDOW_LABELS['christmas']).toBe('Christmas Holiday');
  });
});

describe('parseClearKind', () => {
  it('routes an explicit city clear to the city column', () => {
    expect(parseClearKind('city')).toBe('city');
  });

  it('defaults everything else to a manual player clear', () => {
    expect(parseClearKind(undefined)).toBe('player');
    expect(parseClearKind('player')).toBe('player');
    expect(parseClearKind('')).toBe('player');
    expect(parseClearKind('CITY')).toBe('player'); // exact match only
    expect(parseClearKind({ kind: 'city' })).toBe('player'); // unparsed body
    expect(parseClearKind(42)).toBe('player');
  });
});
