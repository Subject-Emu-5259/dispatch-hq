CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500) NOT NULL,
	"icon" varchar(50) NOT NULL,
	"xp_bonus" integer DEFAULT 0 NOT NULL,
	"requirement_type" varchar(50) NOT NULL,
	"requirement_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "achievements_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "alliance_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" uuid NOT NULL,
	"player_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"summary" varchar(300) NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliance_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"message" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliance_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alliance_members" (
	"alliance_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliance_treasury" (
	"alliance_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliance_treasury_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(30) NOT NULL,
	"ref_id" uuid,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliance_unit_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" uuid NOT NULL,
	"lender_id" uuid NOT NULL,
	"borrower_id" uuid NOT NULL,
	"unit_type" varchar(50) NOT NULL,
	"unit_name" varchar(100),
	"duration_minutes" integer DEFAULT 120 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alliances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"tag" varchar(8),
	"leader_id" uuid NOT NULL,
	"invite_code" varchar(12) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"min_level" integer DEFAULT 1 NOT NULL,
	"recruiting" boolean DEFAULT false NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alliances_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid,
	"category" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"assignee" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"reader_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid,
	"sender_name" varchar(100) NOT NULL,
	"room" varchar(50) DEFAULT 'global' NOT NULL,
	"type" varchar(20) DEFAULT 'user' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"price_cents" integer NOT NULL,
	"coin_count" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coin_packs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(20) NOT NULL,
	"ref_id" uuid,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_login_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"coins_granted" integer NOT NULL,
	"is_premium" boolean NOT NULL,
	"claim_date" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_upgrade_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"merged" boolean DEFAULT false NOT NULL,
	"upgraded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"price_cents" integer NOT NULL,
	"credit_multiplier" real DEFAULT 1 NOT NULL,
	"training_speed_multiplier" real DEFAULT 1 NOT NULL,
	"perks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "membership_tiers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "mission_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"mission_type" varchar(60),
	"category" varchar(20),
	"response_time_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"category" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"poi_type" varchar(50),
	"difficulty" integer NOT NULL,
	"credits_reward" integer NOT NULL,
	"xp_reward" integer NOT NULL,
	"requirements" jsonb NOT NULL,
	"assigned_units" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"time_remaining" integer DEFAULT 600 NOT NULL,
	"total_time" integer DEFAULT 600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"item_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"provider" varchar(20) DEFAULT 'manual' NOT NULL,
	"provider_ref" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"slot_name" varchar(50) NOT NULL,
	"label" varchar(100),
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_settings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"missions_completed" integer DEFAULT 0 NOT NULL,
	"total_credits_earned" integer DEFAULT 0 NOT NULL,
	"best_response_time" integer DEFAULT 0 NOT NULL,
	"total_missions_failed" integer DEFAULT 0 NOT NULL,
	"mutual_aid_answered" integer DEFAULT 0 NOT NULL,
	"play_time_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(30) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"credits" integer DEFAULT 10000 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"premium_expires_at" timestamp with time zone,
	"home_lat" real,
	"home_lng" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username"),
	CONSTRAINT "players_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" varchar(100),
	"rewards" jsonb NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"level_at_redemption" integer DEFAULT 1 NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonal_contest_entries" (
	"event_id" varchar(50) NOT NULL,
	"player_id" uuid NOT NULL,
	"calls_cleared" integer DEFAULT 0 NOT NULL,
	"city_clears" integer DEFAULT 0 NOT NULL,
	"last_cleared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonal_contests" (
	"event_id" varchar(50) PRIMARY KEY NOT NULL,
	"winner_id" uuid,
	"awarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"city" varchar(100),
	"service" varchar(20),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"missions_completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"station_type" varchar(50) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"name" varchar(100) NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"capacity" integer DEFAULT 3 NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"coverage_radius" integer DEFAULT 1000 NOT NULL,
	"alliance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"unit_type" varchar(50) NOT NULL,
	"name" varchar(100),
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"lat" real,
	"lng" real,
	"heading" real DEFAULT 0,
	"speed" real DEFAULT 0,
	"eta" integer,
	"mission_id" uuid,
	"training_level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alliance_activity" ADD CONSTRAINT "alliance_activity_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_activity" ADD CONSTRAINT "alliance_activity_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_gifts" ADD CONSTRAINT "alliance_gifts_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_gifts" ADD CONSTRAINT "alliance_gifts_sender_id_players_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_gifts" ADD CONSTRAINT "alliance_gifts_receiver_id_players_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_join_requests" ADD CONSTRAINT "alliance_join_requests_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_join_requests" ADD CONSTRAINT "alliance_join_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_members" ADD CONSTRAINT "alliance_members_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_members" ADD CONSTRAINT "alliance_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_treasury" ADD CONSTRAINT "alliance_treasury_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_treasury_transactions" ADD CONSTRAINT "alliance_treasury_transactions_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_treasury_transactions" ADD CONSTRAINT "alliance_treasury_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_unit_loans" ADD CONSTRAINT "alliance_unit_loans_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_unit_loans" ADD CONSTRAINT "alliance_unit_loans_lender_id_players_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_unit_loans" ADD CONSTRAINT "alliance_unit_loans_borrower_id_players_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliances" ADD CONSTRAINT "alliances_leader_id_players_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_receipts" ADD CONSTRAINT "chat_message_receipts_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_receipts" ADD CONSTRAINT "chat_message_receipts_reader_id_players_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_players_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_login_bonuses" ADD CONSTRAINT "daily_login_bonuses_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_upgrade_audit" ADD CONSTRAINT "guest_upgrade_audit_guest_id_players_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_upgrade_audit" ADD CONSTRAINT "guest_upgrade_audit_account_id_players_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_recipient_id_players_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_stats" ADD CONSTRAINT "mission_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_saves" ADD CONSTRAINT "player_saves_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_id_promo_codes_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_contest_entries" ADD CONSTRAINT "seasonal_contest_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_contests" ADD CONSTRAINT "seasonal_contests_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_stats" ADD CONSTRAINT "session_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alliance_activity_alliance" ON "alliance_activity" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_alliance_activity_created" ON "alliance_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_alliance_gifts_alliance" ON "alliance_gifts" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_alliance_gifts_sender" ON "alliance_gifts" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_alliance_gifts_receiver" ON "alliance_gifts" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "idx_alliance_gifts_created" ON "alliance_gifts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_join_requests_alliance" ON "alliance_join_requests" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_join_requests_player" ON "alliance_join_requests" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_join_requests_pending" ON "alliance_join_requests" USING btree ("alliance_id","player_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_alliance_members_alliance" ON "alliance_members" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_alliance_members_player" ON "alliance_members" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alliance_members_unique" ON "alliance_members" USING btree ("alliance_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_treasury_tx_alliance" ON "alliance_treasury_transactions" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_treasury_tx_player" ON "alliance_treasury_transactions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_treasury_tx_created" ON "alliance_treasury_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_unit_loan_alliance" ON "alliance_unit_loans" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_unit_loan_lender" ON "alliance_unit_loans" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "idx_unit_loan_borrower" ON "alliance_unit_loans" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "idx_unit_loan_status" ON "alliance_unit_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_alliances_leader" ON "alliances" USING btree ("leader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alliances_invite_code" ON "alliances" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "idx_bug_reports_status" ON "bug_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bug_reports_player" ON "bug_reports" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_chat_receipts_message" ON "chat_message_receipts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_chat_receipts_reader" ON "chat_message_receipts" USING btree ("reader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_receipts_unique" ON "chat_message_receipts" USING btree ("message_id","reader_id");--> statement-breakpoint
CREATE INDEX "idx_chat_room_time" ON "chat_messages" USING btree ("room","created_at");--> statement-breakpoint
CREATE INDEX "idx_coin_tx_player" ON "coin_transactions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_coin_tx_time" ON "coin_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_daily_bonus_player" ON "daily_login_bonuses" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_bonus_unique" ON "daily_login_bonuses" USING btree ("player_id","claim_date");--> statement-breakpoint
CREATE INDEX "idx_upgrade_audit_guest" ON "guest_upgrade_audit" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_upgrade_audit_account" ON "guest_upgrade_audit" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_upgrade_audit_time" ON "guest_upgrade_audit" USING btree ("upgraded_at");--> statement-breakpoint
CREATE INDEX "idx_inbox_recipient" ON "inbox_messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "idx_inbox_recipient_read" ON "inbox_messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_mission_stats_created" ON "mission_stats" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mission_stats_player" ON "mission_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_missions_status" ON "missions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_missions_location" ON "missions" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "idx_orders_player" ON "orders" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_player_achievements_player" ON "player_achievements" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_player_achievements_unique" ON "player_achievements" USING btree ("player_id","achievement_id");--> statement-breakpoint
CREATE INDEX "idx_player_saves_player" ON "player_saves" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_player_saves_slot" ON "player_saves" USING btree ("player_id","slot_name");--> statement-breakpoint
CREATE INDEX "idx_player_stats_xp" ON "player_stats" USING btree ("missions_completed");--> statement-breakpoint
CREATE INDEX "idx_promo_codes_active" ON "promo_codes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_promo_redemptions_promo" ON "promo_redemptions" USING btree ("promo_id");--> statement-breakpoint
CREATE INDEX "idx_promo_redemptions_player" ON "promo_redemptions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_promo_redemptions_unique" ON "promo_redemptions" USING btree ("promo_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_seasonal_contest_entry" ON "seasonal_contest_entries" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_seasonal_contest_event" ON "seasonal_contest_entries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_session_stats_started" ON "session_stats" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_session_stats_player" ON "session_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_stations_owner" ON "stations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_stations_location" ON "stations" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "idx_stations_alliance" ON "stations" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_units_owner" ON "units" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_units_station" ON "units" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_units_status" ON "units" USING btree ("status");