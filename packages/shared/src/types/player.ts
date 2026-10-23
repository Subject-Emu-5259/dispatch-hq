// ============================================
// Dispatch HQ — Player Types
// ============================================

export interface Player {
  id: string;
  username: string;
  email: string;
  credits: number;
  coins: number;
  xp: number;
  level: number;
  isPremium: boolean;
  createdAt: string;
  lastActive: string;
}

export interface PlayerStats {
  playerId: string;
  missionsCompleted: number;
  missionsFailed: number;
  totalCreditsEarned: number;
  totalXpEarned: number;
  longestStreak: number;
}

export interface Alliance {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  level: number;
  totalXp: number;
  memberCount: number;
  createdAt: string;
}
