// ============================================
// Unit profile tests (staged batch, Addition 8)
// ============================================
// Proves every profile field comes from tracked unit data: station join,
// veterancy rank/XP, certs/academy, crew readiness, shift clears, patrol
// summary — and that absent data renders as absent, never invented.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { buildUnitProfile } from './unitProfile';
import { UnitGlanceStrip } from '@/components/UnitGlanceStrip';
import { UnitCard } from '@/components/UnitPanel';
import { useGameStore } from '@/stores/gameStore';
import type { Unit, Station, Employee } from '@dispatch-hq/shared';

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u1', ownerId: 'o1', stationId: 's1', type: 'patrol_car', name: 'Unit 1',
  status: 'available', position: null, destination: null, heading: 0, speed: 16.4,
  eta: null, missionId: null, trainingLevel: 3, veterancyXp: 150,
  certs: ['driving'], academy: null, createdAt: new Date().toISOString(),
  crewIds: ['e1'], jurisdiction: 'city', ...over,
} as Unit);

const station = (over: Partial<Station> = {}): Station => ({
  id: 's1', name: 'Central Station', type: 'police', position: { lat: 35.15, lng: -90.05 },
  level: 1, units: [], employees: [], ...over,
} as unknown as Station);

const employee = (over: Partial<Employee> = {}): Employee => ({
  id: 'e1', stationId: 's1', name: 'Alex', role: 'Officer', service: 'police',
  level: 2, xp: 0, status: 'available', fatigue: 10, morale: 90, ...over,
} as Employee);

describe('buildUnitProfile', () => {
  it('derives station, rank, certs, readiness, and shift clears', () => {
    const p = buildUnitProfile(unit(), station(), 'police', 4, [employee()], 'full', 500);
    expect(p.stationName).toBe('Central Station');
    expect(p.service).toBe('police');
    expect(p.jurisdiction).toBe('city');
    expect(p.level).toBe(3);
    expect(p.rank).toBe('Veteran');
    expect(p.xpToNext).toBe(150); // 300 (Elite) − 150
    expect(p.certs).toEqual(['driving']);
    expect(p.academy).toBeNull();
    expect(p.readiness?.label).toBe('Fresh');
    expect(p.shiftClears).toBe(4);
    expect(p.crewSize).toBe(1);
  });

  it('reports absent data honestly', () => {
    const p = buildUnitProfile(unit({ stationId: 'missing', crewIds: [], certs: [], veterancyXp: 400 }), null, 'police', 0, [], 'full', 0);
    expect(p.stationName).toBe('Unassigned');
    expect(p.certs).toEqual([]);
    expect(p.readiness).toBeNull();
    expect(p.rank).toBe('Elite');
    expect(p.xpToNext).toBeNull(); // max rank
  });

  it('fatigue-off shows no readiness chip, never a fake one', () => {
    const p = buildUnitProfile(unit(), station(), 'police', 0, [employee({ fatigue: 95 })], 'off', 0);
    expect(p.readiness).toBeNull();
  });

  it('academy remaining time comes from the unit record + game clock', () => {
    const p = buildUnitProfile(
      unit({ academy: { course: 'driving', endsAtGameMin: 600 } }),
      station(), 'police', 0, [], 'full', 500,
    );
    expect(p.academy?.course).toBe('driving');
    expect(p.academy?.remainingGameMin).toBe(100);
  });

  it('patrol summary reflects mode + zone, or null when not patrolling', () => {
    expect(buildUnitProfile(unit(), station(), 'police', 0, [], 'full', 0).patrolSummary).toBeNull();
    const p = buildUnitProfile(unit({ patrolMode: 'zone', patrolAreaId: 'c' }), station(), 'police', 0, [], 'full', 0);
    expect(p.patrolSummary).toBe('zone · zone c');
  });
});

describe('UnitGlanceStrip rendering (size fix)', () => {
  it('renders service, station, level, rank, readiness, speed — and wraps', () => {
    const html = renderToStaticMarkup(
      React.createElement(UnitGlanceStrip, {
        service: 'police', serviceLabel: 'Patrol Car', stationName: 'Central Station',
        level: 3, rank: 'Veteran', xpToNext: 150,
        readiness: { label: 'Fresh', pct: 98 }, speedMph: 42,
      }),
    );
    expect(html).toContain('Patrol Car');
    expect(html).toContain('Central Station');
    expect(html).toContain('Lv 3');
    expect(html).toContain('VETERAN');
    expect(html).toContain('Fresh');
    expect(html).toContain('42 mph');
    // The sizing fix itself: the strip wraps instead of overflowing.
    expect(html).toContain('flex-wrap');
  });
});

describe('UnitCard rendering (redesign + sizing)', () => {
  it('renders the header + glance strip with p-3 card padding (SSR)', () => {
    const html = renderToStaticMarkup(React.createElement(UnitCard, { unit: unit() }));
    expect(html).toContain('Unit 1');
    expect(html).toContain('AVAILABLE');
    expect(html).toContain('VETERAN');
    // Card padding is p-3 (was p-2) — the cramped-card fix, proven from
    // the rendered root class, not from source text.
    expect(html).toContain('rounded-lg p-3 border');
  });

  it('client render joins the station + crew readiness from the store', async () => {
    // SSR (above) uses zustand's initial snapshot, so store-joined fields
    // are proven with a real client render instead — the way the game
    // actually runs.
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    useGameStore.setState({
      units: [unit()],
      stations: [station({ employees: [employee()] })],
      missions: [],
    } as never);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(UnitCard, { unit: unit() }));
    });
    expect(container.innerHTML).toContain('Central Station');
    expect(container.innerHTML).toContain('Fresh');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
