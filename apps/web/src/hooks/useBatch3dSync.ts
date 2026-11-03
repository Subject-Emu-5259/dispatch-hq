// ============================================
// Dispatch HQ — Batch 3d live sync (challenges + fog exploration)
// ============================================
// Called once from App while playing. Watches store transitions (not
// parser existence) and feeds real events into the pure Batch 3d modules:
// mission dispatch / outcome / aid answers -> challenges; unit travel +
// stations + missions -> fog reveal. Everything it writes is persisted
// by the normal save blob (challenges + fogRevealed fields).

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import {
  recordDispatch, recordMissionOutcome, recordAidAnswers, rolloverChallengeState,
} from '@/lib/challenges';
import { fogZonesForCenter, newlyRevealedZones } from '@/lib/fogExploration';
import type { MissionStatus } from '@dispatch-hq/shared';

const DISPATCHED_STATUSES: MissionStatus[] = ['dispatching', 'en_route', 'on_scene', 'in_progress', 'completing'];

export function useBatch3dSync(enabled: boolean): void {
  const missions = useGameStore((s) => s.missions);
  const units = useGameStore((s) => s.units);
  const stations = useGameStore((s) => s.stations);
  const careerAid = useGameStore((s) => s.career.mutualAidAnswered);
  const prevMissions = useRef<Record<string, MissionStatus>>({});
  const prevDispatched = useRef<Set<string>>(new Set());

  // Challenge events from mission transitions.
  useEffect(() => {
    if (!enabled) return;
    const store = useGameStore.getState();
    let challenges = rolloverChallengeState(store.challenges);
    let changed = challenges !== store.challenges;
    const seen: Record<string, MissionStatus> = {};
    const dispatched = new Set(prevDispatched.current);
    for (const m of missions) {
      seen[m.id] = m.status;
      const was = prevMissions.current[m.id];
      if (was !== m.status) {
        if (DISPATCHED_STATUSES.includes(m.status) && !dispatched.has(m.id)) {
          dispatched.add(m.id);
          challenges = recordDispatch(challenges);
          changed = true;
        }
        if (m.status === 'completed') {
          challenges = recordMissionOutcome(challenges, true);
          changed = true;
        } else if (m.status === 'failed' || m.status === 'expired') {
          challenges = recordMissionOutcome(challenges, false);
          changed = true;
        }
      }
    }
    prevMissions.current = seen;
    prevDispatched.current = dispatched;
    if (changed) store.setChallenges(challenges);
  }, [missions, enabled]);

  // Aid answers via the career counter (delta-only, baselined on first sync).
  useEffect(() => {
    if (!enabled) return;
    const store = useGameStore.getState();
    const next = recordAidAnswers(store.challenges, careerAid);
    if (next !== store.challenges) store.setChallenges(next);
  }, [careerAid, enabled]);

  // Fog reveal from the live travel trail (unit positions + stations + missions).
  useEffect(() => {
    if (!enabled) return;
    const store = useGameStore.getState();
    const city = store.selectedCity;
    if (!city) return;
    const zones = fogZonesForCenter([city.lat, city.lng]);
    const points = [
      ...stations.map((s) => ({ lat: s.position.lat, lng: s.position.lng })),
      ...missions.map((m) => ({ lat: m.location.lat, lng: m.location.lng })),
      ...units.filter((u) => u.position).map((u) => ({ lat: u.position!.lat, lng: u.position!.lng })),
    ];
    if (points.length === 0) return;
    const fresh = newlyRevealedZones(zones, store.fogRevealed, points);
    if (fresh.length > 0) store.setFogRevealed([...store.fogRevealed, ...fresh]);
  }, [units, stations, missions, enabled]);
}
