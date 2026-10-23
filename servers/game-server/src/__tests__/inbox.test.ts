import { describe, it, expect } from 'vitest';
import { parseInboxLimit, sanitizeInboxMessage } from '../routes/inbox';

describe('parseInboxLimit', () => {
  it('defaults to 50 when absent or unparsable', () => {
    expect(parseInboxLimit(undefined)).toBe(50);
    expect(parseInboxLimit(null)).toBe(50);
    expect(parseInboxLimit('abc')).toBe(50);
    expect(parseInboxLimit('0')).toBe(50);
  });

  it('clamps into the safe 1..200 range', () => {
    expect(parseInboxLimit('200')).toBe(200);
    expect(parseInboxLimit('999')).toBe(200);
    expect(parseInboxLimit('1')).toBe(1);
    expect(parseInboxLimit('-5')).toBe(1); // negative → floor of the safe range
  });
});

describe('sanitizeInboxMessage', () => {
  it('trims and bounds the title and body', () => {
    const out = sanitizeInboxMessage('  Citywide Notice  ', '  Servers update tonight  ');
    expect(out).toEqual({ title: 'Citywide Notice', body: 'Servers update tonight' });
    expect(sanitizeInboxMessage('x'.repeat(300), 'y'.repeat(5000))).toEqual({
      title: 'x'.repeat(120),
      body: 'y'.repeat(2000),
    });
  });

  it('rejects empty title or body', () => {
    expect(sanitizeInboxMessage('', 'body')).toBeNull();
    expect(sanitizeInboxMessage('title', '   ')).toBeNull();
    expect(sanitizeInboxMessage(undefined, undefined)).toBeNull();
    expect(sanitizeInboxMessage(null, 'body')).toBeNull();
  });

  it('coerces non-string inputs via String()', () => {
    expect(sanitizeInboxMessage(42, 'body')).toEqual({ title: '42', body: 'body' });
  });
});
