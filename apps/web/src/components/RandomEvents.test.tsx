import { describe, it, expect } from 'vitest';
import { pruneExpiredEvents, type RandomEvent } from './RandomEvents';

const event = (over: Partial<RandomEvent> = {}): RandomEvent => ({
  id: 'storm',
  type: 'weather',
  name: 'Severe Thunderstorm',
  description: 'Heavy rain and lightning reducing visibility.',
  effect: '+30% response time',
  severity: 'negative',
  duration: 120,
  icon: '⛈️',
  ...over,
});

describe('pruneExpiredEvents — every event type auto-expires (v0.22.16)', () => {
  it('keeps an event inside its window', () => {
    const e = event({ startedAt: 0 });
    expect(pruneExpiredEvents([e], 119_999)).toHaveLength(1);
  });

  it('drops an event once its duration elapses', () => {
    const e = event({ startedAt: 0 });
    expect(pruneExpiredEvents([e], 120_000)).toHaveLength(0);
    expect(pruneExpiredEvents([e], 5 * 60_000)).toHaveLength(0);
  });

  it('expires non-weather events too (traffic, power, bonus — one lifecycle)', () => {
    const traffic = { ...event({ id: 'rush_hour', type: 'traffic' as const, duration: 150 }), startedAt: 0 };
    const blackout = { ...event({ id: 'power_outage', type: 'power_outage' as const, duration: 120 }), startedAt: 0 };
    expect(pruneExpiredEvents([traffic], 149_999)).toHaveLength(1);
    expect(pruneExpiredEvents([traffic], 150_000)).toHaveLength(0);
    expect(pruneExpiredEvents([blackout], 120_000)).toHaveLength(0);
  });

  it('expires a mixed pool at each event’s own boundary', () => {
    const storm = event({ startedAt: 0 }); // 120s
    const rushHour = { ...event({ id: 'rush_hour', type: 'traffic' as const, duration: 90 }), startedAt: 0 };
    // At 100s the storm is still up, the rush hour is gone.
    expect(pruneExpiredEvents([storm, rushHour], 100_000)).toHaveLength(1);
    // By 120s both are gone.
    expect(pruneExpiredEvents([storm, rushHour], 120_000)).toHaveLength(0);
  });

  it('defensively keeps an event without a spawn stamp', () => {
    expect(pruneExpiredEvents([event({ startedAt: undefined })], 10 * 60_000)).toHaveLength(1);
  });
});
