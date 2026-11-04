// ============================================
// Mission card detail tests (staged batch, Addition 9)
// ============================================
// Proves the crime-card detail row derives from the mission record:
// type, severity, place, gang link, escalation, responding units — and
// that absent data yields no chip, never a guess. A render test proves
// the chips actually reach the collapsed card.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { buildMissionCardDetail } from './missionCardDetail';
import { MissionCard } from '@/components/MissionCard';
import { NotificationProvider } from '@/components/NotificationCenter';
import type { Mission } from '@dispatch-hq/shared';

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1', templateId: 'gang_drive_by', name: 'Gang Drive-By', description: 'Shots fired',
  category: 'police', icon: '🚗', status: 'active',
  location: { lat: 35.15, lng: -90.05 }, poiType: 'commercial', difficulty: 6,
  creditsReward: 520, xpReward: 105, requirements: [], assignedUnits: ['u1', 'u2'],
  progress: 0, timeRemaining: 240, totalTime: 240,
  createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(),
  priority: 'high', gangId: 'iron_vipers', escalations: 1, ...over,
} as Mission);

describe('buildMissionCardDetail', () => {
  it('derives every detail-row field from the mission record', () => {
    const d = buildMissionCardDetail(mission());
    expect(d.categoryLabel).toBe('Police');
    expect(d.priority).toBe('high');
    expect(d.poiLabel).toBe('Commercial');
    expect(d.gangName).toBe('Iron Vipers');
    expect(d.escalated).toBe(true);
    expect(d.respondingCount).toBe(2);
  });

  it('placed-POI types resolve through POI_TYPE_META labels', () => {
    expect(buildMissionCardDetail(mission({ poiType: 'mall' })).poiLabel).toBe('Shopping Mall');
  });

  it('absent data yields no chip, never a guess', () => {
    const d = buildMissionCardDetail(mission({
      priority: undefined, poiType: null, gangId: undefined, escalations: 0, assignedUnits: [],
    }));
    expect(d.priority).toBeNull();
    expect(d.poiLabel).toBeNull();
    expect(d.gangName).toBeNull();
    expect(d.escalated).toBe(false);
    expect(d.respondingCount).toBe(0);
  });

  it('unknown gang ids and unknown POI values show nothing', () => {
    const d = buildMissionCardDetail(mission({ gangId: 'not_a_gang', poiType: 'bogus' }));
    expect(d.gangName).toBeNull();
    expect(d.poiLabel).toBeNull();
  });
});

describe('MissionCard rendering (detail row)', () => {
  it('renders the detail chips on the collapsed card', () => {
    const html = renderToStaticMarkup(
      React.createElement(NotificationProvider, null,
        React.createElement(MissionCard, { mission: mission(), index: 0 })),
    );
    expect(html).toContain('Police');
    expect(html).toContain('high priority');
    expect(html).toContain('Commercial');
    expect(html).toContain('Iron Vipers');
    expect(html).toContain('Escalated');
    expect(html).toContain('2 units responding');
  });
});
