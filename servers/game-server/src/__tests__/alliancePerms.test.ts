import { describe, it, expect } from 'vitest';
import { generateInviteCode, canManageMember, validateJoinRequest } from '../routes/alliances';

describe('generateInviteCode', () => {
  it('produces uppercase alphanumeric codes of the requested length', () => {
    const code = generateInviteCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/); // alphabet excludes 0/1/O/I
  });

  it('produces varied codes across calls', () => {
    const seen = new Set(Array.from({ length: 40 }, () => generateInviteCode(8)));
    expect(seen.size).toBeGreaterThan(30);
  });
});

describe('canManageMember', () => {
  it('leader can kick and re-role anyone except themselves', () => {
    expect(canManageMember('leader', 'member', false)).toEqual({ canKick: true, canSetRole: true });
    expect(canManageMember('leader', 'officer', false)).toEqual({ canKick: true, canSetRole: true });
    expect(canManageMember('leader', 'leader', true)).toEqual({ canKick: false, canSetRole: false });
  });

  it('officer can kick members only, never change roles', () => {
    expect(canManageMember('officer', 'member', false)).toEqual({ canKick: true, canSetRole: false });
    expect(canManageMember('officer', 'officer', false)).toEqual({ canKick: false, canSetRole: false });
    expect(canManageMember('officer', 'leader', false)).toEqual({ canKick: false, canSetRole: false });
  });

  it('member has no management rights', () => {
    expect(canManageMember('member', 'member', false)).toEqual({ canKick: false, canSetRole: false });
    expect(canManageMember('member', 'leader', false)).toEqual({ canKick: false, canSetRole: false });
  });
});

describe('validateJoinRequest', () => {
  const base = { playerLevel: 5, minLevel: 1, recruiting: true, memberCount: 2, memberCap: 5, alreadyMember: false };

  it('allows a valid request', () => {
    expect(validateJoinRequest(base)).toBeNull();
  });

  it('rejects when already a member', () => {
    expect(validateJoinRequest({ ...base, alreadyMember: true })).toBe('You are already in this alliance');
  });

  it('rejects alliances that are not recruiting', () => {
    expect(validateJoinRequest({ ...base, recruiting: false })).toBe('This alliance is not currently recruiting');
  });

  it('enforces the listing min-level requirement', () => {
    expect(validateJoinRequest({ ...base, minLevel: 6 })).toBe('This alliance requires Level 6');
    expect(validateJoinRequest({ ...base, minLevel: 5 })).toBeNull(); // exactly at the requirement
  });

  it('rejects when the roster is at the member cap', () => {
    expect(validateJoinRequest({ ...base, memberCount: 5 })).toBe('This alliance is full right now');
  });
});
