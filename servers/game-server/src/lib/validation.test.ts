import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidUsername,
  isValidPassword,
  fieldTooLong,
} from './validation';

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('deandrewh26@gmail.com')).toBe(true);
    expect(isValidEmail('user+tag@sub.domain.co')).toBe(true);
    expect(isValidEmail('  padded@example.com  ')).toBe(true);
  });

  it('rejects junk and malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('x@y.z')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('rejects oversized emails before the DB varchar(255) does', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('isValidUsername', () => {
  it('accepts normal and guest-style names', () => {
    expect(isValidUsername('DispatchPro')).toBe(true);
    expect(isValidUsername('Guest_b9ec92a529c13456')).toBe(true);
    expect(isValidUsername('Fire Chief')).toBe(true);
    expect(isValidUsername('  Commander X  ')).toBe(true);
  });

  it('rejects too short, too long, and bad characters', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('')).toBe(false);
    expect(isValidUsername('x'.repeat(31))).toBe(false);
    expect(isValidUsername('has\ttab')).toBe(false);
    expect(isValidUsername('1bad!char')).toBe(false);
    expect(isValidUsername('ok<tag>')).toBe(false);
    expect(isValidUsername(42)).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('accepts 6-128 char passwords', () => {
    expect(isValidPassword('secret')).toBe(true);
    expect(isValidPassword('a'.repeat(128))).toBe(true);
  });

  it('rejects short and absurdly long passwords', () => {
    expect(isValidPassword('abcde')).toBe(false);
    expect(isValidPassword('')).toBe(false);
    expect(isValidPassword('a'.repeat(129))).toBe(false);
    expect(isValidPassword(null)).toBe(false);
  });
});

describe('fieldTooLong', () => {
  it('flags strings past the cap, ignores non-strings', () => {
    expect(fieldTooLong('short', 10)).toBe(false);
    expect(fieldTooLong('a'.repeat(11), 10)).toBe(true);
    expect(fieldTooLong(123, 10)).toBe(false);
    expect(fieldTooLong(null, 10)).toBe(false);
  });
});
