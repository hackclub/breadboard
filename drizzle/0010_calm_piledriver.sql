ALTER TABLE "projects" ADD COLUMN "project_type" text DEFAULT 'design' NOT NULL;--> statement-breakpoint
-- Existing off-platform submissions were build ships (gold bread, no kit).
UPDATE "projects" SET "project_type" = 'build' WHERE "submission_source" = 'manual';