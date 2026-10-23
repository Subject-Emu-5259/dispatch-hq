// ============================================
// Dispatch HQ — Seasonal Events (v0.21.0)
// ============================================
// Limited-time themed windows keyed to real calendar dates. While an event is
// live the city gets a banner, boosted callout types spawn more often, rewards
// are multiplied, and clearing calls earns a seasonal badge. The same
// date-window engine drives every holiday, so adding one is a data change.

export interface SeasonalEvent {
  id: string;
  name: string;
  icon: string;
  /** Inclusive calendar window (UTC), month 1-12 / day 1-31. */
  window: { start: { month: number; day: number }; end: { month: number; day: number } };
  /** Template ids that roll more often during the event. */
  boostedTemplates: string[];
  /** Credits/XP multiplier for calls cleared during the event. */
  rewardMult: number;
  /** Badge granted for clearing any call during the event (server-created on first award). */
  badge: { key: string; name: string; description: string; icon: string };
}

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: 'independence-day',
    name: 'Fourth of July',
    icon: '🎆',
    window: { start: { month: 7, day: 1 }, end: { month: 7, day: 6 } },
    boostedTemplates: ['room_fire', 'wildfire', 'building_collapse'],
    rewardMult: 1.5,
    badge: {
      key: 'seasonal_4th_of_july',
      name: 'Liberty Responder',
      description: 'Answered calls during the Fourth of July celebration.',
      icon: '🎆',
    },
  },
  {
    id: 'christmas',
    name: 'Christmas Holiday',
    icon: '🎄',
    window: { start: { month: 12, day: 24 }, end: { month: 12, day: 26 } },
    boostedTemplates: ['room_fire', 'medical_call'],
    rewardMult: 1.5,
    badge: {
      key: 'seasonal_christmas',
      name: 'Holiday Hero',
      description: 'Kept the city safe through Christmas Eve and Day.',
      icon: '🎄',
    },
  },
];

function dayKey(month: number, day: number): number {
  return month * 100 + day;
}

export type SeasonalStatus = 'live' | 'ended' | 'upcoming';

/** Where a window sits relative to `now` (UTC): live, ended, or upcoming. */
export function seasonalStatus(ev: SeasonalEvent, now: Date = new Date()): SeasonalStatus {
  const today = dayKey(now.getUTCMonth() + 1, now.getUTCDate());
  const start = dayKey(ev.window.start.month, ev.window.start.day);
  const end = dayKey(ev.window.end.month, ev.window.end.day);
  if (today < start) return 'upcoming';
  if (today <= end) return 'live';
  return 'ended';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 1 – Jul 6" style label for a window. */
export function seasonalWindowLabel(ev: SeasonalEvent): string {
  const s = ev.window.start;
  const e = ev.window.end;
  if (s.month === e.month && s.day === e.day) return `${MONTHS[s.month - 1]} ${s.day}`;
  if (s.month === e.month) return `${MONTHS[s.month - 1]} ${s.day} – ${e.day}`;
  return `${MONTHS[s.month - 1]} ${s.day} – ${MONTHS[e.month - 1]} ${e.day}`;
}

/**
 * Time remaining in a live window (UTC), e.g. "2 days left" or "9 hours left".
 * Returns null when the window is not currently live (upcoming or ended).
 * Windows never cross a year boundary in the current calendar, so the end
 * date resolves against the year of `now`.
 */
export function seasonalTimeLeft(ev: SeasonalEvent, now: Date = new Date()): string | null {
  if (seasonalStatus(ev, now) !== 'live') return null;
  // The window is inclusive through the end day — count down to its last instant.
  const end = Date.UTC(now.getUTCFullYear(), ev.window.end.month - 1, ev.window.end.day, 23, 59, 59, 999);
  const diffMs = end - now.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.ceil(diffMs / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  const days = Math.ceil(diffMs / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/**
 * The event the leaderboard should show: the live one, else the most recently
 * ended one (standings stay visible ~10 days after), else the next upcoming.
 */
export function relevantSeasonalEvent(now: Date = new Date()): SeasonalEvent | null {
  const today = dayKey(now.getUTCMonth() + 1, now.getUTCDate());
  const live = SEASONAL_EVENTS.find((ev) => seasonalStatus(ev, now) === 'live') ?? null;
  if (live) return live;
  const recent = SEASONAL_EVENTS
    .map((ev) => ({ ev, endKey: dayKey(ev.window.end.month, ev.window.end.day) }))
    .filter(({ ev, endKey }) => seasonalStatus(ev, now) === 'ended' && today - endKey <= 10)
    .sort((a, b) => b.endKey - a.endKey)[0]?.ev ?? null;
  if (recent) return recent;
  return SEASONAL_EVENTS
    .map((ev) => ({ ev, startKey: dayKey(ev.window.start.month, ev.window.start.day) }))
    .filter(({ startKey }) => startKey > today)
    .sort((a, b) => a.startKey - b.startKey)[0]?.ev ?? null;
}

/** The event whose window contains `now` (UTC), or null when none is live. */
export function activeSeasonalEvent(now: Date = new Date()): SeasonalEvent | null {
  const today = dayKey(now.getUTCMonth() + 1, now.getUTCDate());
  for (const ev of SEASONAL_EVENTS) {
    const start = dayKey(ev.window.start.month, ev.window.start.day);
    const end = dayKey(ev.window.end.month, ev.window.end.day);
    if (today >= start && today <= end) return ev;
  }
  return null;
}

/** Reward multiplier during a live seasonal event (1.0 otherwise). */
export function seasonalRewardMult(now: Date = new Date()): number {
  return activeSeasonalEvent(now)?.rewardMult ?? 1;
}

/** Boost a template pick during a live event — 35% of boosted types roll. */
export function seasonalBoostedPick<T extends { id: string }>(
  candidates: T[],
  now: Date = new Date(),
): T | null {
  const ev = activeSeasonalEvent(now);
  if (!ev || candidates.length === 0) return null;
  const boosted = candidates.filter((c) => ev.boostedTemplates.includes(c.id));
  if (boosted.length === 0) return null;
  if (Math.random() > 0.35) return null;
  return boosted[Math.floor(Math.random() * boosted.length)];
}
