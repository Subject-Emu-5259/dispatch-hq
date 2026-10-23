import { describe, it, expect } from 'vitest';
import { LIVERIES, liveryFor } from './units';
import { STATION_THEMES, stationThemeFor } from './stations';

describe('liveries', () => {
  it('each service has at least one livery and fallback works', () => {
    for (const s of ['fire', 'police', 'ems'] as const) {
      expect(LIVERIES[s].length).toBeGreaterThan(0);
      expect(liveryFor(s, 'does-not-exist').id).toBe(LIVERIES[s][0].id);
      expect(liveryFor(s, undefined).id).toBe(LIVERIES[s][0].id);
    }
  });

  it('resolves a known livery', () => {
    expect(liveryFor('fire', 'lime').name).toBe('Lime');
    expect(liveryFor('police', 'midnight').markerColor).toBe('#1E3A8A');
    expect(liveryFor('ems', 'ambulance-yellow').markerColor).toBe('#CA8A04');
  });
});

describe('station themes', () => {
  it('has urban/suburban/county presets with a default fallback', () => {
    expect(STATION_THEMES.map((t) => t.id)).toEqual(['urban', 'suburban', 'county']);
    expect(stationThemeFor(undefined).id).toBe('urban');
    expect(stationThemeFor('county').name).toBe('County');
    expect(stationThemeFor('nope').id).toBe('urban');
  });
});
