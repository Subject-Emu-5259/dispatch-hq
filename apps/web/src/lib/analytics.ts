// ============================================
// Dispatch HQ — Opt-in session analytics (v0.24.0)
// ============================================
// Privacy-safe: counts only, no PII, off by default. When `analyticsEnabled`
// is false (the default) every helper here no-ops and the client makes zero
// analytics calls. A session is one continuous span of gameplay: started when
// the campaign screen opens, ended when it closes (or the tab unloads). The
// single flush at end carries start time, duration, city, service, the
// completed-mission count, and a CAPPED per-mission sample (type, category,
// response time) — still no per-event traffic.

import { loadSettings } from '@/utils/settings';
import { API_BASE, sendAnalyticsSession, type AnalyticsMissionRecord } from '@/lib/apiClient';

let startedAt: number | null = null;
let completed = 0;
let city: string | null = null;
let service: string | null = null;
// Per-mission sample, capped so a very long session's flush can't balloon.
// `completed` stays the authoritative count; this is the bounded detail.
let missionRecords: AnalyticsMissionRecord[] = [];
const MAX_MISSION_RECORDS = 200;

export function analyticsEnabled(): boolean {
  return loadSettings().analyticsEnabled === true;
}

export function analyticsSessionStart(c: string | null, s: string | null): void {
  if (!analyticsEnabled()) {
    startedAt = null;
    return;
  }
  startedAt = Date.now();
  completed = 0;
  city = c;
  service = s;
  missionRecords = [];
}

export function analyticsMissionCompleted(
  missionType: string,
  category: string,
  responseTimeSeconds: number,
): void {
  if (startedAt === null) return;
  completed += 1;
  if (missionRecords.length < MAX_MISSION_RECORDS) {
    missionRecords.push({
      missionType,
      category,
      responseTimeSeconds: Math.max(0, Math.round(Number(responseTimeSeconds) || 0)),
    });
  }
}

function snapshot(): {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  missionsCompleted: number;
  city: string | null;
  service: string | null;
  missions: AnalyticsMissionRecord[];
} | null {
  if (startedAt === null) return null;
  const s = startedAt;
  const endedAt = Date.now();
  startedAt = null;
  const missions = missionRecords;
  missionRecords = [];
  return {
    startedAt: new Date(s).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSeconds: Math.max(0, Math.round((endedAt - s) / 1000)),
    missionsCompleted: completed,
    city,
    service,
    missions,
  };
}

/** Flush the current session over the normal API path (best-effort). */
export async function analyticsSessionEnd(): Promise<void> {
  if (!analyticsEnabled()) return;
  const payload = snapshot();
  if (!payload) return;
  completed = 0;
  await sendAnalyticsSession(payload);
}

// Flush on unload/reload so a session isn't lost when the tab closes. The
// keepalive fetch survives page teardown; cookies ride along same-origin.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!analyticsEnabled()) return;
    const payload = snapshot();
    if (!payload) return;
    completed = 0;
    fetch(`${API_BASE}/analytics/session`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  });
}
