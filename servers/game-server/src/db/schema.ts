// ============================================
// Dispatch HQ — Database Schema (Drizzle ORM)
// ============================================
// Phase 3 adds server-side persistence for chat, leaderboard stats,
// achievements, and bug reports so no player data lives in browser
// localStorage.

import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, bigint, real, boolean, timestamp, jsonb, index, text, uniqueIndex } from 'drizzle-orm/pg-core';

// Players
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 30 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  credits: integer('credits').default(10000).notNull(),
  coins: integer('coins').default(0).notNull(),
  xp: bigint('xp', { mode: 'number' }).default(0).notNull(),
  level: integer('level').default(1).notNull(),
  isPremium: boolean('is_premium').default(false).notNull(),
  // Premium expiry drives the membership window (v0.31.0): isPremium stays the
  // fast boolean, recomputed from this timestamp; null = never a member.
  premiumExpiresAt: timestamp('premium_expires_at', { withTimezone: true }),
  homeLat: real('home_lat'),
  homeLng: real('home_lng'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastActive: timestamp('last_active', { withTimezone: true }).defaultNow().notNull(),
});

// Stations
export const stations = pgTable('stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => players.id).notNull(),
  stationType: varchar('station_type', { length: 50 }).notNull(),
  level: integer('level').default(1).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  capacity: integer('capacity').default(3).notNull(),
  unitCount: integer('unit_count').default(0).notNull(),
  coverageRadius: integer('coverage_radius').default(1000).notNull(),
  // Alliance ownership (v1.0 co-op endgame Phase 3): NULL = private station,
  // non-NULL = shared station owned by the alliance.
  allianceId: uuid('alliance_id').references(() => alliances.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_stations_owner').on(table.ownerId),
  index('idx_stations_location').on(table.lat, table.lng),
  index('idx_stations_alliance').on(table.allianceId),
]);

// Units
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => players.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  unitType: varchar('unit_type', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }),
  status: varchar('status', { length: 20 }).default('available').notNull(),
  lat: real('lat'),
  lng: real('lng'),
  heading: real('heading').default(0),
  speed: real('speed').default(0),
  eta: integer('eta'),
  missionId: uuid('mission_id'),
  trainingLevel: integer('training_level').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_units_owner').on(table.ownerId),
  index('idx_units_station').on(table.stationId),
  index('idx_units_status').on(table.status),
]);

// Missions (global pool, assigned units are stored per mission)
export const missions = pgTable('missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: varchar('template_id', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  category: varchar('category', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  poiType: varchar('poi_type', { length: 50 }),
  difficulty: integer('difficulty').notNull(),
  creditsReward: integer('credits_reward').notNull(),
  xpReward: integer('xp_reward').notNull(),
  requirements: jsonb('requirements').notNull(),
  assignedUnits: jsonb('assigned_units').default([]).notNull(),
  progress: integer('progress').default(0).notNull(),
  timeRemaining: integer('time_remaining').default(600).notNull(),
  totalTime: integer('total_time').default(600).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_missions_status').on(table.status),
  index('idx_missions_location').on(table.lat, table.lng),
]);

// Player settings — replaces browser localStorage for game preferences.
export const playerSettings = pgTable('player_settings', {
  playerId: uuid('player_id').primaryKey().references(() => players.id),
  settings: jsonb('settings').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Player save slots — replaces browser localStorage for save/load.
export const playerSaves = pgTable('player_saves', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  slotName: varchar('slot_name', { length: 50 }).notNull(),
  label: varchar('label', { length: 100 }),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_player_saves_player').on(table.playerId),
  uniqueIndex('idx_player_saves_slot').on(table.playerId, table.slotName),
]);

// Chat messages — persisted server-side for multiplayer chat history.
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').references(() => players.id),
  senderName: varchar('sender_name', { length: 100 }).notNull(),
  room: varchar('room', { length: 50 }).default('global').notNull(),
  type: varchar('type', { length: 20 }).default('user').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_chat_room_time').on(table.room, table.createdAt),
]);

// Chat read receipts — who confirmed delivery of a message, persisted so the
// sender's ✓✓ survives reloads and REST-fallback messages reconcile. One row
// per (message, reader); the unique index makes acks idempotent.
export const chatMessageReceipts = pgTable('chat_message_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').references(() => chatMessages.id).notNull(),
  readerId: uuid('reader_id').references(() => players.id).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_chat_receipts_message').on(table.messageId),
  index('idx_chat_receipts_reader').on(table.readerId),
  uniqueIndex('idx_chat_receipts_unique').on(table.messageId, table.readerId),
]);

// Achievements catalog.
export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 50 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  icon: varchar('icon', { length: 50 }).notNull(),
  xpBonus: integer('xp_bonus').default(0).notNull(),
  requirementType: varchar('requirement_type', { length: 50 }).notNull(),
  requirementValue: integer('requirement_value').default(1).notNull(),
});

// Player achievements progress.
export const playerAchievements = pgTable('player_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  achievementId: uuid('achievement_id').references(() => achievements.id).notNull(),
  earnedAt: timestamp('earned_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_player_achievements_player').on(table.playerId),
  uniqueIndex('idx_player_achievements_unique').on(table.playerId, table.achievementId),
]);

// Player stats for leaderboards and progression.
export const playerStats = pgTable('player_stats', {
  playerId: uuid('player_id').primaryKey().references(() => players.id),
  missionsCompleted: integer('missions_completed').default(0).notNull(),
  totalCreditsEarned: integer('total_credits_earned').default(0).notNull(),
  bestResponseTime: integer('best_response_time').default(0).notNull(),
  totalMissionsFailed: integer('total_missions_failed').default(0).notNull(),
  mutualAidAnswered: integer('mutual_aid_answered').default(0).notNull(),
  playTimeSeconds: integer('play_time_seconds').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_player_stats_xp').on(table.missionsCompleted),
]);

// Alliances — multiplayer guilds with shared map visibility + chat.
export const alliances = pgTable('alliances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 60 }).unique().notNull(),
  tag: varchar('tag', { length: 8 }),
  leaderId: uuid('leader_id').references(() => players.id).notNull(),
  inviteCode: varchar('invite_code', { length: 12 }).notNull(),
  // Public recruitment listing shown on the board.
  description: text('description').notNull().default(''),
  minLevel: integer('min_level').default(1).notNull(),
  recruiting: boolean('recruiting').default(false).notNull(),
  xp: bigint('xp', { mode: 'number' }).default(0).notNull(),
  level: integer('level').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_alliances_leader').on(table.leaderId),
  uniqueIndex('idx_alliances_invite_code').on(table.inviteCode),
]);

export const allianceJoinRequests = pgTable('alliance_join_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | approved | rejected
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_join_requests_alliance').on(table.allianceId),
  index('idx_join_requests_player').on(table.playerId),
  // One pending request per player per alliance; resolved rows may repeat.
  uniqueIndex('idx_join_requests_pending').on(table.allianceId, table.playerId).where(sql`status = 'pending'`),
]);

export const allianceMembers = pgTable('alliance_members', {
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  role: varchar('role', { length: 20 }).default('member').notNull(), // leader | officer | member
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_alliance_members_alliance').on(table.allianceId),
  index('idx_alliance_members_player').on(table.playerId),
  uniqueIndex('idx_alliance_members_unique').on(table.allianceId, table.playerId),
]);

// ── Alliance Treasury (v1.0 co-op endgame) ──────────────────────────────────
// Shared credit pool that all alliance members can contribute to and spend from.
// Phase 1: deposit/withdraw with daily caps, full transaction log.
export const allianceTreasury = pgTable('alliance_treasury', {
  allianceId: uuid('alliance_id').primaryKey().references(() => alliances.id),
  balance: integer('balance').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const allianceTreasuryTransactions = pgTable('alliance_treasury_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  delta: integer('delta').notNull(), // + deposited, - withdrawn
  reason: varchar('reason', { length: 30 }).notNull(), // deposit|withdraw|station_build|unit_purchase|upgrade|gift
  refId: uuid('ref_id'), // station/unit id for build/purchase
  balanceAfter: integer('balance_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_treasury_tx_alliance').on(table.allianceId),
  index('idx_treasury_tx_player').on(table.playerId),
  index('idx_treasury_tx_created').on(table.createdAt),
]);

// ── Alliance Credit Gifting (v1.0 co-op endgame Phase 2) ──────────────────
// One-time credit transfers between alliance members. Rate-limited,
// daily-cap enforced, all gifts logged.
export const allianceGifts = pgTable('alliance_gifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  senderId: uuid('sender_id').references(() => players.id).notNull(),
  receiverId: uuid('receiver_id').references(() => players.id).notNull(),
  amount: integer('amount').notNull(),
  message: varchar('message', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_alliance_gifts_alliance').on(table.allianceId),
  index('idx_alliance_gifts_sender').on(table.senderId),
  index('idx_alliance_gifts_receiver').on(table.receiverId),
  index('idx_alliance_gifts_created').on(table.createdAt),
]);

// Promo codes — founder-created codes that grant XP/credits/coins/levels.
// Redemption is recorded per player so each code is a one-time claim.
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).unique().notNull(),
  label: varchar('label', { length: 100 }),
  // Rewards granted on redemption: { xp?, credits?, coins?, level? }
  rewards: jsonb('rewards').notNull(),
  maxUses: integer('max_uses').default(1).notNull(),
  usedCount: integer('used_count').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => players.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_promo_codes_active').on(table.active),
]);

export const promoRedemptions = pgTable('promo_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promoId: uuid('promo_id').references(() => promoCodes.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  // The player's level when they claimed the code (audited in the Admin Console).
  levelAtRedemption: integer('level_at_redemption').default(1).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_promo_redemptions_promo').on(table.promoId),
  index('idx_promo_redemptions_player').on(table.playerId),
  uniqueIndex('idx_promo_redemptions_unique').on(table.promoId, table.playerId),
]);

// Bug reports submitted from the in-game bug reporter.
// Triage fields (status/assignee) are managed by the founder in the Admin
// Console; the public "known issues" list surfaces investigating/fixed ones.
export const bugReports = pgTable('bug_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id),
  category: varchar('category', { length: 50 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 20 }).default('new').notNull(), // new | investigating | fixed
  assignee: varchar('assignee', { length: 100 }),
  notes: text('notes'), // team notes shared back with the reporting player
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_bug_reports_status').on(table.status),
  index('idx_bug_reports_player').on(table.playerId),
]);

// Guest → account upgrade audit — one immutable row per upgrade so accidental
// merges are traceable in the Admin Console. Both FKs point at real players
// (the guest shell row is kept, so guestId stays valid forever). This table is
// deliberately NOT in UPGRADE_REKEY: re-keying would destroy the audit trail.
export const guestUpgradeAudit = pgTable('guest_upgrade_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').references(() => players.id).notNull(),
  accountId: uuid('account_id').references(() => players.id).notNull(),
  merged: boolean('merged').default(false).notNull(),
  upgradedAt: timestamp('upgraded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_upgrade_audit_guest').on(table.guestId),
  index('idx_upgrade_audit_account').on(table.accountId),
  index('idx_upgrade_audit_time').on(table.upgradedAt),
]);

// Seasonal leaderboard contest (v0.21.1): calls cleared per player per holiday
// window, plus the per-event winner record (awarded once when the window ends).
export const seasonalContestEntries = pgTable('seasonal_contest_entries', {
  eventId: varchar('event_id', { length: 50 }).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  // Manual clears (player dispatched + resolved) and CPU-handled clears are
  // tracked separately (v0.22.x) so "city clears" are visible as their own
  // stat instead of merging into the player's tally. Contest ranking uses the
  // total (manual + city) so single-service cities don't stall the event.
  callsCleared: integer('calls_cleared').default(0).notNull(),
  cityClears: integer('city_clears').default(0).notNull(),
  lastClearedAt: timestamp('last_cleared_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_seasonal_contest_entry').on(table.eventId, table.playerId),
  index('idx_seasonal_contest_event').on(table.eventId),
]);

export const seasonalContests = pgTable('seasonal_contests', {
  eventId: varchar('event_id', { length: 50 }).primaryKey(),
  winnerId: uuid('winner_id').references(() => players.id),
  awardedAt: timestamp('awarded_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Player inbox — persistent messages (v0.22.x). Unlike transient WebSocket
// notifications, these live in the DB so every player (including offline ones)
// receives admin broadcasts and any future system mail. readAt NULL = unread.
export const inboxMessages = pgTable('inbox_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').references(() => players.id).notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_inbox_recipient').on(table.recipientId),
  index('idx_inbox_recipient_read').on(table.recipientId, table.readAt),
]);

// Opt-in session analytics (v0.24.0) — privacy-safe, counts only, no PII.
// One row per play session, written only when the player has opted in
// (analyticsEnabled). city/service are names, duration + mission count are
// integers — nothing that identifies the player beyond their account id.
export const sessionStats = pgTable('session_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  city: varchar('city', { length: 100 }),
  service: varchar('service', { length: 20 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
  missionsCompleted: integer('missions_completed').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_session_stats_started').on(table.startedAt),
  index('idx_session_stats_player').on(table.playerId),
]);

// Opt-in per-mission analytics (v0.24.0) — one row per cleared call, written
// only when the player has opted in (analyticsEnabled). missionType is the
// template id, category is fire/traffic/rescue/hazmat/police/ems, and
// responseTimeSeconds is the dispatch→on-scene first-response time. Counts
// and durations only — nothing identifies the player beyond their account id.
export const missionStats = pgTable('mission_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  missionType: varchar('mission_type', { length: 60 }),
  category: varchar('category', { length: 20 }),
  responseTimeSeconds: integer('response_time_seconds').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_mission_stats_created').on(table.createdAt),
  index('idx_mission_stats_player').on(table.playerId),
]);

// ── Membership & coins monetization (v0.31.0) ────────────────────────────────

// Catalog of membership tiers (one row at launch; the table is future-proofing).
export const membershipTiers = pgTable('membership_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 40 }).unique().notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  creditMultiplier: real('credit_multiplier').default(1).notNull(),
  trainingSpeedMultiplier: real('training_speed_multiplier').default(1).notNull(),
  perks: jsonb('perks').default([]).notNull(),
  active: boolean('active').default(true).notNull(),
});

// Catalog of coin packs (seeded at boot; five rows).
export const coinPacks = pgTable('coin_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 40 }).unique().notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  coinCount: integer('coin_count').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
});

// Purchase ledger — every membership order and coin-pack order.
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  kind: varchar('kind', { length: 20 }).notNull(), // membership | coin_pack
  itemId: uuid('item_id').notNull(),
  priceCents: integer('price_cents').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending|paid|fulfilled|refunded|failed
  provider: varchar('provider', { length: 20 }).default('manual').notNull(),
  providerRef: varchar('provider_ref', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
}, (table) => [
  index('idx_orders_player').on(table.playerId),
  index('idx_orders_status').on(table.status),
]);

// Coin transaction ledger — every delta (purchase, spend, promo, admin, refund)
// so the coin economy is auditable end-to-end (never just mutate players.coins).
export const coinTransactions = pgTable('coin_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  delta: integer('delta').notNull(), // +100 purchase, -12 spend
  reason: varchar('reason', { length: 20 }).notNull(), // purchase|spend|promo|admin|refund
  refId: uuid('ref_id'),
  balanceAfter: integer('balance_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_coin_tx_player').on(table.playerId),
  index('idx_coin_tx_time').on(table.createdAt),
]);

// Daily login bonus (v0.44.0) — one row per player per day, recording the
// coins granted. Idempotent: the unique index on (playerId, claimDate) makes
// double-claims a no-op. Commander members get 5 coins; free players get 2.
export const dailyLoginBonuses = pgTable('daily_login_bonuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  coinsGranted: integer('coins_granted').notNull(),
  isPremium: boolean('is_premium').notNull(), // snapshot at claim time
  claimDate: varchar('claim_date', { length: 10 }).notNull(), // 'YYYY-MM-DD' UTC
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_daily_bonus_player').on(table.playerId),
  uniqueIndex('idx_daily_bonus_unique').on(table.playerId, table.claimDate),
]);

// Alliance unit loans (v0.49.0) — Phase 4 of the v1.0 co-op endgame.
// Alliance members can temporarily lend units to each other. The lender's
// unit is locked during the loan; the borrower gets a stats copy.
export const allianceUnitLoans = pgTable('alliance_unit_loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  lenderId: uuid('lender_id').references(() => players.id).notNull(),
  borrowerId: uuid('borrower_id').references(() => players.id).notNull(),
  unitType: varchar('unit_type', { length: 50 }).notNull(),
  unitName: varchar('unit_name', { length: 100 }),
  durationMinutes: integer('duration_minutes').default(120).notNull(), // 2h default
  status: varchar('status', { length: 20 }).default('active').notNull(), // active|returned|expired|recalled
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_unit_loan_alliance').on(table.allianceId),
  index('idx_unit_loan_lender').on(table.lenderId),
  index('idx_unit_loan_borrower').on(table.borrowerId),
  index('idx_unit_loan_status').on(table.status),
]);

// ── Alliance Activity Feed (v1.0 co-op endgame Phase 5) ─────────────────────
// Unified timeline of alliance resource events: treasury, gifts, stations,
// loans. Every event type inserts a row here so the feed component can
// render a single reverse-chronological timeline.
export const allianceActivity = pgTable('alliance_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').references(() => alliances.id).notNull(),
  playerId: uuid('player_id').references(() => players.id),
  eventType: varchar('event_type', { length: 40 }).notNull(),
  // e.g. 'treasury_deposit', 'treasury_withdraw', 'gift_sent', 'gift_received',
  //       'station_built', 'station_upgraded', 'station_claimed',
  //       'loan_created', 'loan_returned', 'loan_recalled', 'loan_expired'
  summary: varchar('summary', { length: 300 }).notNull(),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_alliance_activity_alliance').on(table.allianceId),
  index('idx_alliance_activity_created').on(table.createdAt),
]);

// ── Player Grant Ledger (Batch 1, P1-M3 fix) ───────────────────────────────
// Server-side delivery record for every DB-side grant (promo redemption,
// admin grant). The old delivery path — the /me poll computing
// `DB credits − last-saved baseline` — silently swallowed grants whenever the
// player's saved campaign total already exceeded the DB row (the normal case
// for any established player). The ledger replaces it: a grant is recorded in
// the SAME transaction that moves the DB row, and the client delivers it by
// ledger id (deduped client-side + acked server-side), so it arrives exactly
// once regardless of the saved total. `deliveredAt` is set by the ack
// endpoint; undelivered rows are what GET /api/player/grants/pending returns.
// (source, ref) is unique so a retried redeem/grant can never record twice:
// promo rows use ref = the promo_redemptions id, admin rows a fresh uuid.
export const playerGrants = pgTable('player_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  source: varchar('source', { length: 20 }).notNull(),
  ref: varchar('ref', { length: 64 }).notNull(),
  credits: integer('credits').default(0).notNull(),
  coins: integer('coins').default(0).notNull(),
  xp: bigint('xp', { mode: 'number' }).default(0).notNull(),
  level: integer('level').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (table) => [
  index('idx_player_grants_player').on(table.playerId),
  index('idx_player_grants_pending').on(table.playerId, table.deliveredAt),
  uniqueIndex('idx_player_grants_source_ref').on(table.playerId, table.source, table.ref),
]);
