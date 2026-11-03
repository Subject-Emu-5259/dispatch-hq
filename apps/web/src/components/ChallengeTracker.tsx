// ============================================
// Dispatch HQ — Challenge Tracker (Batch 3d)
// ============================================
// Renders beside the daily-bonus banner (MainMenu) and in PauseScreen.
// Claiming applies XP always; coins only when coinRewards is true (main
// edition, via the local save-blob economy — the Reddit edition passes
// false and stays XP-only, never touching money).

import { useGameStore } from '@/stores/gameStore';
import { DAILY_CHALLENGES, WEEKLY_CHALLENGES, challengeProgress, claimChallenge } from '@/lib/challenges';
import { playClick } from '@/utils/sound';

export function ChallengeTracker({ coinRewards }: { coinRewards: boolean }) {
  const challenges = useGameStore((s) => s.challenges);
  const player = useGameStore((s) => s.player);

  function handleClaim(scope: 'daily' | 'weekly', id: string) {
    playClick();
    const store = useGameStore.getState();
    const res = claimChallenge(store.challenges, scope, id, coinRewards);
    if ('error' in res) return;
    store.setChallenges(res.state);
    const p = store.player;
    if (p) {
      store.updatePlayer({
        xp: p.xp + res.xp,
        ...(res.coins > 0 ? { coins: p.coins + res.coins } : {}),
      });
    }
  }

  const renderRow = (def: (typeof DAILY_CHALLENGES)[number]) => {
    const prog = challengeProgress(challenges, def);
    const pct = Math.min(100, Math.round((prog.progress / def.target) * 100));
    return (
      <div key={def.id} className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-300 font-medium truncate">{def.title}</span>
            <span className="text-gray-400 shrink-0 ml-2">{Math.min(prog.progress, def.target)}/{def.target}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-0.5">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 truncate">{def.description}</p>
        </div>
        {prog.completed && !prog.claimed && (
          <button
            onClick={() => handleClaim(def.scope, def.id)}
            disabled={!player}
            className="shrink-0 px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold hover:bg-amber-500/30 disabled:opacity-40"
          >
            Claim +{def.xp} XP{coinRewards && def.coins > 0 ? ` +${def.coins} coins` : ''}
          </button>
        )}
        {prog.claimed && <span className="text-[11px] text-green-400 shrink-0">✓ Claimed</span>}
      </div>
    );
  };

  return (
    <div className="w-full rounded-xl bg-gray-900/60 border border-gray-700/40 px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-bold text-white">📋 Daily Challenges{challenges.streak > 0 ? ` · 🔥 ${challenges.streak} streak` : ''}</p>
      <div className="space-y-2">{DAILY_CHALLENGES.map(renderRow)}</div>
      <p className="text-[11px] font-bold text-white pt-1 border-t border-gray-800">🗓️ Weekly Challenges</p>
      <div className="space-y-2">{WEEKLY_CHALLENGES.map(renderRow)}</div>
    </div>
  );
}
