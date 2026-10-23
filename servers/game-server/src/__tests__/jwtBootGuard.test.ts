import { describe, it, expect } from 'vitest';
import {
  DEV_JWT_FALLBACK,
  jwtSecretIsPinned,
  assertJwtPinned,
} from '../config';

// Boot-time session-secret guard (v0.22.18): mirrors the deploy.sh pre-flight —
// an unset/empty JWT_SECRET, or one still holding the literal dev fallback,
// must refuse to start so a misconfigured local run fails loudly instead of
// minting tokens signed with a publicly-known secret.
describe('jwtSecretIsPinned', () => {
  it('rejects a missing or empty secret', () => {
    expect(jwtSecretIsPinned(undefined)).toBe(false);
    expect(jwtSecretIsPinned(null)).toBe(false);
    expect(jwtSecretIsPinned('')).toBe(false);
  });

  it('rejects the literal dev fallback even when explicitly set', () => {
    expect(jwtSecretIsPinned(DEV_JWT_FALLBACK)).toBe(false);
  });

  it('accepts any real non-empty secret', () => {
    expect(jwtSecretIsPinned('a-real-production-secret-0123456789abcdef')).toBe(true);
    expect(jwtSecretIsPinned(' ')).toBe(true); // whitespace is technically set — garbage, but not the fallback
  });
});

describe('assertJwtPinned boot guard', () => {
  it('throws at startup when the secret is not pinned', () => {
    expect(() => assertJwtPinned(false)).toThrow(/JWT_SECRET is missing, empty, or still the dev fallback/);
    expect(() => assertJwtPinned(false)).toThrow(/refusing to start/);
  });

  it('passes when the secret is pinned', () => {
    expect(() => assertJwtPinned(true)).not.toThrow();
  });

  it('passes under vitest (NODE_ENV=test) so tests can boot config directly', () => {
    expect(() => assertJwtPinned(false, { isTest: true })).not.toThrow();
  });

  it('passes with the explicit local escape hatch ALLOW_DEV_JWT_SECRET=1', () => {
    expect(() => assertJwtPinned(false, { allowDev: true })).not.toThrow();
  });

  it('still throws when the escape hatch is used in production', () => {
    expect(() => assertJwtPinned(false, { isTest: false, allowDev: false })).toThrow();
  });
});
