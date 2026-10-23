import { describe, it, expect } from 'vitest';
import { formatTimer } from './timeFormat';

describe('formatTimer', () => {
  it('formats whole minutes and seconds', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(5)).toBe('0:05');
    expect(formatTimer(90)).toBe('1:30');
    expect(formatTimer(3661)).toBe('61:01');
  });

  it('cels fractional seconds instead of rendering decimals (the ETA bug)', () => {
    // Weather speed multipliers produce fractional ETAs like 14.5 — these must
    // render as a clean clock, never "0:14.5".
    expect(formatTimer(14.5)).toBe('0:15');
    expect(formatTimer(14.1)).toBe('0:15');
    expect(formatTimer(59.9)).toBe('1:00');
    expect(formatTimer(0.4)).toBe('0:01');
  });

  it('guards invalid and negative input', () => {
    expect(formatTimer(Number.NaN)).toBe('--:--');
    expect(formatTimer(Number.POSITIVE_INFINITY)).toBe('--:--');
    expect(formatTimer(-3)).toBe('--:--');
  });

  it('compact mode renders sub-minute values as "Xs"', () => {
    expect(formatTimer(45, { compact: true })).toBe('45s');
    expect(formatTimer(59.9, { compact: true })).toBe('1:00');
    expect(formatTimer(90, { compact: true })).toBe('1:30');
  });
});
