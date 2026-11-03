CREATE TABLE "station_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"alliance_id" uuid NOT NULL,
	"lessee_id" uuid NOT NULL,
	"term_days" integer NOT NULL,
	"revenue_share_pct" integer NOT NULL,
	"upfront_fee" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "station_leases" ADD CONSTRAINT "station_leases_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_leases" ADD CONSTRAINT "station_leases_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_leases" ADD CONSTRAINT "station_leases_lessee_id_players_id_fk" FOREIGN KEY ("lessee_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_station_leases_station" ON "station_leases" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_station_leases_alliance" ON "station_leases" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "idx_station_leases_lessee" ON "station_leases" USING btree ("lessee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_station_leases_one_active" ON "station_leases" USING btree ("station_id") WHERE status = 'active';