CREATE TABLE "player_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"ref" varchar(64) NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "player_grants" ADD CONSTRAINT "player_grants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_player_grants_player" ON "player_grants" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_player_grants_pending" ON "player_grants" USING btree ("player_id","delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_player_grants_source_ref" ON "player_grants" USING btree ("player_id","source","ref");