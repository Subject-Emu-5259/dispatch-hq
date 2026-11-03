// ============================================
// Dispatch HQ — Tech Tree Data (side-effect free)
// Shared by the store, the TechTree UI, and runtime modifiers.
// ============================================

export type TechBranch = 'response' | 'efficiency' | 'technology' | 'training' | 'operations';

export interface TechNode {
  id: string;
  name: string;
  description: string;
  branch: TechBranch;
  tier: 1 | 2 | 3;
  cost: number;
  requires?: string[];
  effect: string;
  icon: string;
  applies: TechEffectKey;
}

export type TechEffectKey =
  | 'dispatch_speed'
  | 'multi_dispatch'
  | 'unit_cost'
  | 'station_cost'
  | 'mission_reward'
  | 'fog_reveal'
  | 'patrol_sight'
  | 'unit_effectiveness'
  | 'specialization'
  | 'elite_units'
  | 'scene_sizeup'
  | 'hazmat_team'
  | 'k9_unit';

export const TECH_TREE: TechNode[] = [
  // Response — faster response
  {
    id: 'r1', name: 'Fast Response', description: 'Reduce unit travel time by 15%', branch: 'response', tier: 1, cost: 5000,
    effect: '-15% travel time', icon: '⚡', applies: 'dispatch_speed',
  },
  {
    id: 'r2', name: 'Code 3 Priority', description: 'Reduce unit travel time by an additional 20%', branch: 'response', tier: 2, cost: 12000,
    requires: ['r1'], effect: '-20% travel time', icon: '🚨', applies: 'dispatch_speed',
  },
  {
    id: 'r3', name: 'Multi-Unit Dispatch', description: 'Dispatch up to 3 units to a single call', branch: 'response', tier: 3, cost: 25000,
    requires: ['r2'], effect: 'Up to 3 units per dispatch', icon: '🚁', applies: 'multi_dispatch',
  },

  // Efficiency — economy
  {
    id: 'e1', name: 'Fleet Procurement', description: 'Reduce new unit cost by 15%', branch: 'efficiency', tier: 1, cost: 4000,
    effect: '-15% unit cost', icon: '💰', applies: 'unit_cost',
  },
  {
    id: 'e2', name: 'Construction Grants', description: 'Reduce station build and upgrade costs by 20%', branch: 'efficiency', tier: 2, cost: 10000,
    requires: ['e1'], effect: '-20% build cost', icon: '🏗️', applies: 'station_cost',
  },
  {
    id: 'e3', name: 'Revenue Boost', description: 'Earn 25% more credits and XP from missions', branch: 'efficiency', tier: 3, cost: 22000,
    requires: ['e2'], effect: '+25% mission rewards', icon: '💎', applies: 'mission_reward',
  },

  // Technology — information
  {
    id: 't1', name: 'Advanced CAD', description: 'Incoming CAD calls show caller priority', branch: 'technology', tier: 1, cost: 6000,
    effect: 'Caller priority scoring', icon: '🖥️', applies: 'patrol_sight',
  },
  {
    id: 't2', name: 'Map Scanner', description: 'Fog of war reveals 40% faster', branch: 'technology', tier: 2, cost: 14000,
    requires: ['t1'], effect: '+40% reveal radius', icon: '📡', applies: 'fog_reveal',
  },
  {
    id: 't3', name: 'Drone Surveillance', description: 'Patrol units automatically report nearby incidents', branch: 'technology', tier: 3, cost: 30000,
    requires: ['t2'], effect: 'Patrol sight +50%', icon: '🤖', applies: 'patrol_sight',
  },

  // Training — unit quality
  {
    id: 'tr1', name: 'Basic Training', description: 'Units move 10% faster and clear scenes 10% quicker', branch: 'training', tier: 1, cost: 5500,
    effect: '+10% unit effectiveness', icon: '🎓', applies: 'unit_effectiveness',
  },
  {
    id: 'tr2', name: 'Specialization', description: 'Units on matching-incident types work 15% faster', branch: 'training', tier: 2, cost: 13000,
    requires: ['tr1'], effect: '+15% matching bonus', icon: '🔧', applies: 'specialization',
  },
  {
    id: 'tr3', name: 'Elite Squad', description: 'Unlock veteran unit upgrades for new purchases', branch: 'training', tier: 3, cost: 28000,
    requires: ['tr2'], effect: 'Veteran units (+20% stats)', icon: '⭐', applies: 'elite_units',
  },

  // Operations — Batch 3e expansion (audit feature 15). Three standalone
  // branch heads (no prerequisites): each is its own long-term goal, not a
  // chain — a commander can buy K9 before drone recon and vice versa.
  {
    id: 'op-drone', name: 'Drone Recon', description: 'Aerial scene size-up: units clear every call type 25% faster', branch: 'operations', tier: 1, cost: 16000,
    effect: '+25% clear speed (all calls)', icon: '🛸', applies: 'scene_sizeup',
  },
  {
    id: 'op-hazmat', name: 'Hazmat Team', description: 'A dedicated hazmat team: hazmat calls clear 30% faster', branch: 'operations', tier: 1, cost: 20000,
    effect: '+30% clear speed (hazmat)', icon: '☣️', applies: 'hazmat_team',
  },
  {
    id: 'op-k9', name: 'K9 Unit', description: 'A trained K9 unit: police calls clear 20% faster', branch: 'operations', tier: 1, cost: 18000,
    effect: '+20% clear speed (police)', icon: '🐕', applies: 'k9_unit',
  },
];

export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(TECH_TREE.map((t) => [t.id, t]));

/** Branch metadata for UI rendering. */
export const BRANCH_CONFIG: Record<TechBranch, { label: string; color: string; bg: string; border: string }> = {
  response: { label: 'Response Speed', color: 'text-dispatch-red', bg: 'bg-dispatch-red/20', border: 'border-dispatch-red/30' },
  efficiency: { label: 'Efficiency', color: 'text-dispatch-green', bg: 'bg-dispatch-green/20', border: 'border-dispatch-green/30' },
  technology: { label: 'Technology', color: 'text-dispatch-cyan', bg: 'bg-dispatch-cyan/20', border: 'border-dispatch-cyan/30' },
  training: { label: 'Training', color: 'text-dispatch-yellow', bg: 'bg-dispatch-yellow/20', border: 'border-dispatch-yellow/30' },
  operations: { label: 'Operations', color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30' },
};
