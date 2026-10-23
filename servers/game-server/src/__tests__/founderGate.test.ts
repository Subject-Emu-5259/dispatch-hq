import { describe, it, expect, beforeEach } from 'vitest';
import { config, isAdminEmail, canAccessAlliances } from '../config';

// Founder/admin gating guard: the Admin Console and admin routes must only
// ever be reachable by the founder email (and any explicit ADMIN_EMAILS).
describe('Founder / Admin gate', () => {
  const FOUNDER = config.founderEmail;

  beforeEach(() => {
    // Ensure the test is deterministic regardless of any ADMIN_EMAILS in the
    // environment: the founder must ALWAYS be in the allow-list.
    expect(config.adminEmails).toContain(FOUNDER.toLowerCase());
  });

  it('allows the founder email (case-insensitive)', () => {
    expect(isAdminEmail(FOUNDER)).toBe(true);
    expect(isAdminEmail(FOUNDER.toUpperCase())).toBe(true);
    expect(isAdminEmail(`  ${FOUNDER}  `)).toBe(true);
  });

  it('denies non-admin emails', () => {
    expect(isAdminEmail('notthefounder@gmail.com')).toBe(false);
    expect(isAdminEmail('deandrewh25@gmail.com')).toBe(false); // one digit off
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('denies emails that merely contain the founder address', () => {
    expect(isAdminEmail(`not${FOUNDER}`)).toBe(false);
    expect(isAdminEmail(`prefix+${FOUNDER}`)).toBe(false);
  });

  it('grants any explicit ADMIN_EMAILS entries', () => {
    // The env may or may not set ADMIN_EMAILS; every entry that IS set must pass.
    const extra = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const email of extra) {
      expect(isAdminEmail(email)).toBe(true);
    }
  });

  it('never grants the founder by accident via a guest/dev email', () => {
    expect(isAdminEmail('commander@dispatchhq.game')).toBe(false);
    expect(isAdminEmail('guest_123@dispatchhq.game')).toBe(false);
  });
});

describe('canAccessAlliances (Level 10 gate with founder bypass)', () => {
  const FOUNDER = config.founderEmail;

  it('allows the founder at any level', () => {
    expect(canAccessAlliances(FOUNDER, 1)).toBe(true);
    expect(canAccessAlliances(FOUNDER, 9)).toBe(true);
    expect(canAccessAlliances(FOUNDER, 0)).toBe(true);
  });

  it('locks everyone else below level 10', () => {
    expect(canAccessAlliances('player@example.com', 9)).toBe(false);
    expect(canAccessAlliances('player@example.com', 0)).toBe(false);
  });

  it('email only matters for the bypass — level gates everyone else', () => {
    expect(canAccessAlliances(null, 15)).toBe(true);
    expect(canAccessAlliances('', 20)).toBe(true);
  });

  it('unlocks at level 10 and above for regular players', () => {
    expect(canAccessAlliances('player@example.com', 10)).toBe(true);
    expect(canAccessAlliances('player@example.com', 12)).toBe(true);
  });

  it('does not treat lookalike emails as founder', () => {
    expect(canAccessAlliances(`not${FOUNDER}`, 1)).toBe(false);
    expect(canAccessAlliances(`${FOUNDER}x`, 5)).toBe(false);
  });
});
