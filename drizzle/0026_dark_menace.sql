ALTER TABLE "project_submissions" ADD COLUMN "repo_commit_sha" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD COLUMN "repo_diff" jsonb;