// Dispatch HQ — Client-side achievement checks
// Calls the server award endpoint when local conditions are met.

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from '@/components/NotificationCenter';
import type { Mission } from '@dispatch-hq/shared';

type GameStoreState = ReturnType<typeof useGameStore.getState>;

interface AchievementDef {
  key: string;
  condition: (state: GameStoreState) => boolean;
}

const isCompletedMission = (m: Mission) => m.status === 'completed';

const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_dispatch', condition: (state) => state.missions.some(isCompletedMission) },
  { key: 'builder', condition: (state) => state.stations.length > 0 },
  { key: 'fleet_commander', condition: (state) => state.units.length >= 10 },
  { key: 'seasoned', condition: (state) => state.missions.filter(isCompletedMission).length >= 50 },
  // Ward expansion (v0.22.17) — the ER ward reaches level 3 after three
  // credits-bought upgrades (10 beds each). Counts the persistent ward level,
  // not the per-shift tally, so it can't be re-triggered after a shift resets.
  { key: 'ward_expander', condition: (state) => (state.hospital?.wardLevel ?? 0) >= 3 },
];

async function tryAward(key: string) {
  try {
    const res = await fetch(`/api/achievements/award/${key}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { success: false, error: await res.text() };
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function useAchievements(enabled: boolean) {
  const { addNotification } = useNotifications();
  const awarded = useRef<Set<string>>(new Set());
  const pending = useRef<Set<string>>(new Set());

  const triggerHash = useGameStore((s) => {
    const playerXp = s.player?.xp ?? 0;
    return s.missions.length + s.stations.length + s.units.length + playerXp + (s.hospital?.wardLevel ?? 0);
  });

  useEffect(() => {
    if (!enabled) return;
    const state = useGameStore.getState();

    for (const ach of ACHIEVEMENTS) {
      if (awarded.current.has(ach.key) || pending.current.has(ach.key)) continue;
      if (ach.condition(state)) {
        pending.current.add(ach.key);
        tryAward(ach.key).then((result: any) => {
          pending.current.delete(ach.key);
          if (result.success) {
            awarded.current.add(ach.key);
            if (!result.alreadyEarned) {
              addNotification({
                type: 'success',
                title: 'Achievement Unlocked',
                message: result.achievement?.name || ach.key,
                icon: result.achievement?.icon || '🏆',
                duration: 4000,
              });
            }
          }
        });
      }
    }
  }, [enabled, triggerHash]);
}
