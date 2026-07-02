ALTER TABLE "projects" ADD COLUMN "hackatime_username" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hackatime_project_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hackatime_seconds" integer DEFAULT 0 NOT NULL;