import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseVersion } from './versionCheck';

describe('parseVersion', () => {
  it('parses clean x.y.z versions', () => {
    expect(parseVersion('0.21.2')).toEqual([0, 21, 2]);
    expect(parseVersion('0.22.0')).toEqual([0, 22, 0]);
    expect(parseVersion('1.0.0')).toEqual([1, 0, 0]);
  });

  it('tolerates a leading v and extra segments', () => {
    expect(parseVersion('v0.21.2')).toEqual([0, 21, 2]);
    expect(parseVersion('0.21.2.1')).toEqual([0, 21, 2, 1]);
  });

  it('falls back to 0 for malformed segments', () => {
    expect(parseVersion('')).toEqual([]);
    expect(parseVersion('abc')).toEqual([0]);
    expect(parseVersion('0.x.2')).toEqual([0, 0, 2]);
  });
});

describe('isNewerVersion', () => {
  it('detects newer, equal, and older versions', () => {
    expect(isNewerVersion('0.22.0', '0.21.2')).toBe(true);
    expect(isNewerVersion('0.21.2', '0.21.2')).toBe(false);
    expect(isNewerVersion('0.21.2', '0.22.0')).toBe(false);
  });

  it('compares by major then minor then patch, not string order', () => {
    expect(isNewerVersion('0.22.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.999.0')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
  });

  it('treats missing trailing segments as zero', () => {
    expect(isNewerVersion('0.22', '0.21.9')).toBe(true);
    expect(isNewerVersion('0.22', '0.22.0')).toBe(false);
    expect(isNewerVersion('0.22.1', '0.22')).toBe(true);
  });

  it('never treats malformed versions as newer', () => {
    expect(isNewerVersion('', '0.21.2')).toBe(false);
    expect(isNewerVersion('abc', '0.21.2')).toBe(false);
    expect(isNewerVersion('0.21.2', '')).toBe(false);
  });

  it('handles a leading v on either side', () => {
    expect(isNewerVersion('v0.22.0', '0.21.2')).toBe(true);
    expect(isNewerVersion('0.22.0', 'v0.21.2')).toBe(true);
  });
});
