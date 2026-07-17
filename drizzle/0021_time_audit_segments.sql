CREATE TYPE "public"."time_audit_segment_kind" AS ENUM('removed', 'deflated');--> statement-breakpoint
CREATE TABLE "project_time_audit_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"reviewer_id" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"kind" time_audit_segment_kind NOT NULL,
	"deflated_percent" integer DEFAULT 100 NOT NULL,
	"reason" text NOT NULL,
	"deducted_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_audit_segments_range_valid" CHECK ("project_time_audit_segments"."end_at" > "project_time_audit_segments"."start_at"),
	CONSTRAINT "time_audit_segments_percent_valid" CHECK ("project_time_audit_segments"."deflated_percent" between 1 and 100),
	CONSTRAINT "time_audit_segments_deducted_non_negative" CHECK ("project_time_audit_segments"."deducted_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "project_time_audit_segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "project_time_audit_segments_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_audit_segments_project_id_idx" ON "project_time_audit_segments" USING btree ("project_id");