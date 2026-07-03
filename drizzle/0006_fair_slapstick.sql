CREATE TABLE "project_timelapses" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"lapse_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"playback_url" text DEFAULT '' NOT NULL,
	"thumbnail_url" text DEFAULT '' NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"hackatime_project" text DEFAULT '' NOT NULL,
	"recorded_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lapse_access_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lapse_refresh_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lapse_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lapse_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_timelapses" ADD CONSTRAINT "project_timelapses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_timelapses" ADD CONSTRAINT "project_timelapses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_timelapses_project_lapse_idx" ON "project_timelapses" USING btree ("project_id","lapse_id");--> statement-breakpoint
CREATE INDEX "project_timelapses_project_id_idx" ON "project_timelapses" USING btree ("project_id");