import { describe, it, expect } from 'vitest';
import { deriveSavePreview, sanitizeSlot } from '../routes/saves';

describe('sanitizeSlot', () => {
  it('normalizes a plain string slot', () => {
    expect(sanitizeSlot('  Slot 1 ')).toBe('slot 1');
  });

  it('coerces a numeric slot instead of crashing', () => {
    // Regression: a numeric slot used to throw `slot.trim is not a function`
    // and 400 every save request. (v0.17.6 production error log.)
    expect(sanitizeSlot(1)).toBe('1');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizeSlot(undefined)).toBe('');
    expect(sanitizeSlot(null)).toBe('');
  });

  it('caps at 50 chars', () => {
    expect(sanitizeSlot('a'.repeat(80))).toBe('a'.repeat(50));
  });
});

describe('deriveSavePreview', () => {
  it('extracts the headline values from a v7 save payload', () => {
    const preview = deriveSavePreview({
      player: { level: 12, credits: 34500, xp: 800 },
      selectedCity: { name: 'West Memphis' },
      selectedService: 'police',
      career: { missionsCompleted: 47 },
      gameMinutes: 540,
    });
    expect(preview).toEqual({
      level: 12,
      credits: 34500,
      xp: 800,
      city: 'West Memphis',
      service: 'police',
      missionsCompleted: 47,
      gameMinutes: 540,
      // v0.22.x: no tour marker in a legacy payload → treated as done.
      onboardingStep: -1,
    });
  });

  it('degrades to defaults for empty or malformed payloads', () => {
    expect(deriveSavePreview(null)).toEqual({
      level: 1, credits: 0, xp: 0,
      city: null, service: null, missionsCompleted: 0, gameMinutes: 0,
      onboardingStep: -1,
    });
    expect(deriveSavePreview({ player: { level: 'nope' }, selectedCity: 42 })).toMatchObject({
      level: 1,
      credits: 0,
      city: null,
    });
  });

  it('keeps finite numbers and rejects NaN/Infinity', () => {
    const preview = deriveSavePreview({ player: { credits: Infinity }, gameMinutes: NaN });
    expect(preview.credits).toBe(0);
    expect(preview.gameMinutes).toBe(0);
  });

  it('returns null city when the name is blank', () => {
    expect(deriveSavePreview({ selectedCity: { name: '' } }).city).toBeNull();
  });

  it('carries the saved tour step into the preview (Continue-card chip)', () => {
    expect(deriveSavePreview({ onboardingStep: 4 }).onboardingStep).toBe(4);
    expect(deriveSavePreview({ onboardingStep: 0 }).onboardingStep).toBe(0);
    // Corrupt / non-finite values degrade to the done sentinel, never to 0.
    expect(deriveSavePreview({ onboardingStep: 'x' }).onboardingStep).toBe(-1);
    expect(deriveSavePreview({ onboardingStep: Number.NaN }).onboardingStep).toBe(-1);
  });
});
