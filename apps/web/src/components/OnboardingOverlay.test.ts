import { describe, it, expect } from 'vitest';
import { clampTutorialStep, ONBOARDING_STEP_DONE, TUTORIAL_STEP_COUNT, tourPercent, shouldCelebrateTourStep } from './OnboardingOverlay';

// Onboarding tour position persistence (v0.22.x): the step index written to
// the store/save must survive corrupt or out-of-range input, and negative
// values always mean "tour done" so a reload never resurrects a finished tour.

describe('clampTutorialStep', () => {
  it('defaults missing/garbage input to the first step', () => {
    expect(clampTutorialStep(undefined)).toBe(0);
    expect(clampTutorialStep(null)).toBe(0);
    expect(clampTutorialStep(Number.NaN)).toBe(0);
    expect(clampTutorialStep(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('keeps valid mid-tour steps', () => {
    expect(clampTutorialStep(0)).toBe(0);
    expect(clampTutorialStep(5)).toBe(5);
    expect(clampTutorialStep(TUTORIAL_STEP_COUNT - 1)).toBe(TUTORIAL_STEP_COUNT - 1);
  });

  it('clamps out-of-range indices to the last step', () => {
    expect(clampTutorialStep(999)).toBe(TUTORIAL_STEP_COUNT - 1);
    expect(clampTutorialStep(5, 3)).toBe(2); // custom shorter tour (future-proofing)
  });

  it('maps any negative value to the DONE sentinel', () => {
    expect(clampTutorialStep(-1)).toBe(ONBOARDING_STEP_DONE);
    expect(clampTutorialStep(-42)).toBe(ONBOARDING_STEP_DONE);
  });
});

describe('tourPercent (progress ring fill)', () => {
  it('is 0% on the first step and 100% on the last', () => {
    expect(tourPercent(0, TUTORIAL_STEP_COUNT)).toBe(0);
    expect(tourPercent(TUTORIAL_STEP_COUNT - 1, TUTORIAL_STEP_COUNT)).toBe(100);
  });

  it('scales linearly through the tour', () => {
    // 11 steps → 10 gaps: step 5 is exactly halfway.
    expect(tourPercent(5, 11)).toBe(50);
    expect(tourPercent(2, 11)).toBe(20);
    expect(tourPercent(8, 11)).toBe(80);
  });

  it('clamps out-of-range and corrupt input', () => {
    expect(tourPercent(999, 11)).toBe(100);
    expect(tourPercent(-3, 11)).toBe(0);
    expect(tourPercent(Number.NaN, 11)).toBe(0);
  });

  it('treats a single-step tour as fully done', () => {
    expect(tourPercent(0, 1)).toBe(100);
    expect(tourPercent(0, 0)).toBe(100); // corrupt count
  });
});

describe('shouldCelebrateTourStep (confetti trigger)', () => {
  it('fires only when the ring first hits 100% (the final step)', () => {
    expect(shouldCelebrateTourStep(TUTORIAL_STEP_COUNT - 1, TUTORIAL_STEP_COUNT)).toBe(true);
    expect(shouldCelebrateTourStep(0, TUTORIAL_STEP_COUNT)).toBe(false);
    expect(shouldCelebrateTourStep(5, TUTORIAL_STEP_COUNT)).toBe(false);
  });

  it('fires on the last step regardless of tour length', () => {
    expect(shouldCelebrateTourStep(2, 3)).toBe(true);
    expect(shouldCelebrateTourStep(1, 3)).toBe(false);
  });
});
