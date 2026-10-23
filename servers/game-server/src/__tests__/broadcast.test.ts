import { describe, it, expect } from 'vitest';
import { parseBroadcastKind, BROADCAST_KIND_LABELS } from '../routes/admin';

describe('parseBroadcastKind', () => {
  it('defaults to notice when absent or unknown', () => {
    expect(parseBroadcastKind(undefined)).toBe('notice');
    expect(parseBroadcastKind(null)).toBe('notice');
    expect(parseBroadcastKind('')).toBe('notice');
    expect(parseBroadcastKind('mega-blast')).toBe('notice');
    expect(parseBroadcastKind(42)).toBe('notice');
  });

  it('accepts only the three known kinds', () => {
    expect(parseBroadcastKind('psa')).toBe('psa');
    expect(parseBroadcastKind('notice')).toBe('notice');
    expect(parseBroadcastKind('message')).toBe('message');
    // Case-sensitive by design — the client sends lowercase kinds.
    expect(parseBroadcastKind('PSA')).toBe('notice');
  });
});

describe('BROADCAST_KIND_LABELS', () => {
  it('labels every kind for inbox/toast prefixes', () => {
    expect(BROADCAST_KIND_LABELS).toEqual({
      psa: 'PSA',
      notice: 'Notice',
      message: 'Message',
    });
  });
});
