// ============================================
// Dispatch HQ — Alliance Levels & Perks
// ============================================
// Shared XP → level ladder with level-based perks: member caps, map reveal
// radius (how far allied units appear beyond your viewport), and a commander
// bonus (multiplier on mission rewards while in an alliance). Pure mapping —
// no state. The server stores `alliances.xp` + `alliances.level` and
// recomputes level on credit via these helpers.

/** Player level required to create/join an alliance. The founder is exempt. */
export const ALLIANCE_MIN_LEVEL = 10;

export interface AlliancePerkLevel {
  level: number;
  /** Cumulative XP required to REACH this level. */
  xpThreshold: number;
  /** Max members allowed at this level (leader + officers + members). */
  memberCap: number;
  /** Extra radius (km) allied units/stations are visible beyond your viewport. */
  revealKm: number;
  /** Credit/XP multiplier applied to mission rewards while allied. */
  commanderBonus: number;
  icon: string;
}

export const ALLIANCE_LEVELS: AlliancePerkLevel[] = [
  { level: 1, xpThreshold: 0,     memberCap: 5,  revealKm: 0,   commanderBonus: 1.0,  icon: '🌱' },
  { level: 2, xpThreshold: 2000,  memberCap: 8,  revealKm: 3,   commanderBonus: 1.05, icon: '🛡️' },
  { level: 3, xpThreshold: 6000,  memberCap: 12, revealKm: 6,   commanderBonus: 1.1,  icon: '⚔️' },
  { level: 4, xpThreshold: 14000, memberCap: 16, revealKm: 10,  commanderBonus: 1.15, icon: '🏰' },
  { level: 5, xpThreshold: 26000, memberCap: 20, revealKm: 15,  commanderBonus: 1.2,  icon: '👑' },
];

/** Highest level whose threshold the XP has reached (clamped to the ladder). */
export function allianceLevelFor(xp: number): AlliancePerkLevel {
  let best = ALLIANCE_LEVELS[0];
  for (const l of ALLIANCE_LEVELS) if (xp >= l.xpThreshold) best = l;
  return best;
}

/** The next level up, or null when already maxed. */
export function nextAllianceLevel(xp: number): AlliancePerkLevel | null {
  return ALLIANCE_LEVELS.find((l) => l.xpThreshold > xp) ?? null;
}

export function allianceMemberCap(xp: number): number {
  return allianceLevelFor(xp).memberCap;
}

export function allianceRevealKm(xp: number): number {
  return allianceLevelFor(xp).revealKm;
}

export function allianceCommanderBonus(xp: number): number {
  return allianceLevelFor(xp).commanderBonus;
}

/** Fraction (0..1) of the way from the current level to the next threshold. */
export function allianceProgress(xp: number): number {
  const cur = allianceLevelFor(xp);
  const next = nextAllianceLevel(xp);
  if (!next) return 1;
  const span = next.xpThreshold - cur.xpThreshold;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (xp - cur.xpThreshold) / span));
}
