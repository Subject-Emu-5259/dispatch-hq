import { describe, it, expect } from 'vitest';
import { chatLineMatchesFilter } from './chatFilter';
import type { ChatLineType } from './chatFilter';

// Every line type the feed can carry — 'user' is a real commander, the rest
// are system-style broadcasts (System, Dispatch, PSA, Notice, Dispatch HQ).
const HQ_TYPES: ChatLineType[] = ['system', 'dispatch', 'psa', 'notice', 'message'];

describe('chatLineMatchesFilter', () => {
  it("'all' shows every line — player and HQ alike", () => {
    for (const t of [...HQ_TYPES, 'user'] as ChatLineType[]) {
      expect(chatLineMatchesFilter(t, 'all')).toBe(true);
    }
  });

  it("'players' keeps only real player lines", () => {
    expect(chatLineMatchesFilter('user', 'players')).toBe(true);
    for (const t of HQ_TYPES) {
      expect(chatLineMatchesFilter(t, 'players')).toBe(false);
    }
  });

  it("'hq' keeps only system-style broadcasts", () => {
    expect(chatLineMatchesFilter('user', 'hq')).toBe(false);
    for (const t of HQ_TYPES) {
      expect(chatLineMatchesFilter(t, 'hq')).toBe(true);
    }
  });
});
