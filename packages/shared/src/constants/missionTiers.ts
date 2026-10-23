// ============================================
// Dispatch HQ — Difficulty Tiers
// ============================================
// Maps a mission's numeric difficulty (1-10) to a labeled, color-coded
// tier used on mission cards, the Dispatch Board, and shift reports.

export type DifficultyTier = 'routine' | 'moderate' | 'serious' | 'critical';

export const DIFFICULTY_TIER_ORDER: Record<DifficultyTier, number> = {
  routine: 0,
  moderate: 1,
  serious: 2,
  critical: 3,
};

export const TIER_META: Record<DifficultyTier, { label: string; color: string; chipClass: string; icon: string }> = {
  // Text is -300 (not -400) for ≥ 7:1 contrast on the dark card surfaces, and
  // the chip fill is /15 so the badge reads as a defined pill, not a ghost tint.
  routine: { label: 'Routine', color: '#4ade80', chipClass: 'bg-green-500/15 text-green-300 border-green-500/40', icon: '🟢' },
  moderate: { label: 'Moderate', color: '#fbbf24', chipClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: '🟡' },
  serious: { label: 'Serious', color: '#fb923c', chipClass: 'bg-orange-500/15 text-orange-300 border-orange-500/40', icon: '🟠' },
  critical: { label: 'Critical', color: '#f87171', chipClass: 'bg-red-500/15 text-red-300 border-red-500/40', icon: '🔴' },
};

export function difficultyTierFor(difficulty: number): DifficultyTier {
  if (difficulty <= 3) return 'routine';
  if (difficulty <= 5) return 'moderate';
  if (difficulty <= 8) return 'serious';
  return 'critical';
}

export function tierOf(m: { difficulty: number }): DifficultyTier {
  return difficultyTierFor(m.difficulty);
}
