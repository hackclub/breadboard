ALTER TABLE "project_submissions" ALTER COLUMN "hours_spent" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "project_submissions" ALTER COLUMN "approved_hours" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "hours_spent" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "override_hours_spent" SET DATA TYPE double precision;