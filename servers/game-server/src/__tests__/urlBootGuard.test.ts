import { describe, it, expect, vi } from 'vitest';
import {
  DEV_DATABASE_FALLBACK,
  DEV_REDIS_FALLBACK,
  databaseUrlIsPinned,
  redisUrlIsPinned,
  assertDatabaseUrlPinned,
  assertRedisUrlPinned,
} from '../config';

// Boot-time data-store guards (v0.22.19): mirror the JWT guard so a
// misconfigured deploy can't boot against the wrong database. DATABASE_URL is
// a HARD STOP (wrong DB = data integrity); REDIS_URL is a LOUD WARNING
// (Redis deliberately degrades to in-memory fanout when absent).

describe('databaseUrlIsPinned', () => {
  it('rejects a missing or empty URL', () => {
    expect(databaseUrlIsPinned(undefined)).toBe(false);
    expect(databaseUrlIsPinned(null)).toBe(false);
    expect(databaseUrlIsPinned('')).toBe(false);
  });

  it('rejects the literal dev fallback even when explicitly set', () => {
    expect(databaseUrlIsPinned(DEV_DATABASE_FALLBACK)).toBe(false);
  });

  it('accepts any real non-empty URL', () => {
    expect(databaseUrlIsPinned('postgresql://dispatch:realpass@db.internal:5432/dispatch_hq')).toBe(true);
  });
});

describe('redisUrlIsPinned', () => {
  it('rejects a missing or empty URL', () => {
    expect(redisUrlIsPinned(undefined)).toBe(false);
    expect(redisUrlIsPinned(null)).toBe(false);
    expect(redisUrlIsPinned('')).toBe(false);
  });

  it('rejects the literal dev fallback even when explicitly set', () => {
    expect(redisUrlIsPinned(DEV_REDIS_FALLBACK)).toBe(false);
    expect(redisUrlIsPinned('redis://127.0.0.1:6379')).toBe(true); // explicit non-fallback loopback is pinned (deliberate)
  });

  it('accepts any real non-empty URL', () => {
    expect(redisUrlIsPinned('redis://redis.internal:6379')).toBe(true);
  });
});

describe('assertDatabaseUrlPinned boot guard', () => {
  it('throws at startup when the URL is not pinned', () => {
    expect(() => assertDatabaseUrlPinned(false)).toThrow(/DATABASE_URL is missing, empty, or still the local-dev fallback/);
    expect(() => assertDatabaseUrlPinned(false)).toThrow(/refusing to start/);
  });

  it('passes when the URL is pinned', () => {
    expect(() => assertDatabaseUrlPinned(true)).not.toThrow();
  });

  it('passes under vitest (NODE_ENV=test) so tests can boot config directly', () => {
    expect(() => assertDatabaseUrlPinned(false, { isTest: true })).not.toThrow();
  });

  it('passes with the explicit local escape hatch ALLOW_DEV_DATABASE_URL=1', () => {
    expect(() => assertDatabaseUrlPinned(false, { allowDev: true })).not.toThrow();
  });

  it('still throws when the escape hatch is used in production', () => {
    expect(() => assertDatabaseUrlPinned(false, { isTest: false, allowDev: false })).toThrow();
  });
});

describe('assertRedisUrlPinned boot guard', () => {
  it('warns loudly instead of refusing to boot when Redis is unpinned', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = assertRedisUrlPinned(false, { isTest: false, allowDev: false });
      expect(result).toBe(false);
      expect(err).toHaveBeenCalledTimes(1);
      expect(err.mock.calls[0]?.[0]).toMatch(/REDIS_URL is missing, empty, or still the local-dev fallback/);
    } finally {
      err.mockRestore();
    }
  });

  it('reports pinned without warning', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(assertRedisUrlPinned(true)).toBe(true);
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it('silences the warning under vitest (NODE_ENV=test)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(assertRedisUrlPinned(false, { isTest: true })).toBe(false);
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it('silences the warning with the explicit local escape hatch ALLOW_DEV_REDIS_URL=1', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(assertRedisUrlPinned(false, { allowDev: true })).toBe(false);
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});
