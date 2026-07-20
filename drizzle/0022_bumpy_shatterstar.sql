ALTER TABLE "project_time_audit_segments" DROP CONSTRAINT "time_audit_segments_range_valid";--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ALTER COLUMN "start_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ALTER COLUMN "end_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD COLUMN "timelapse_id" integer;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD COLUMN "start_seconds" integer;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD COLUMN "end_seconds" integer;--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "project_time_audit_segments_timelapse_id_project_timelapses_id_fk" FOREIGN KEY ("timelapse_id") REFERENCES "public"."project_timelapses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_audit_segments_timelapse_id_idx" ON "project_time_audit_segments" USING btree ("timelapse_id");--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "time_audit_segments_source_valid" CHECK (("project_time_audit_segments"."timelapse_id" is null and "project_time_audit_segments"."start_at" is not null and "project_time_audit_segments"."end_at" is not null)
        or ("project_time_audit_segments"."timelapse_id" is not null and "project_time_audit_segments"."start_seconds" is not null and "project_time_audit_segments"."end_seconds" is not null));--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "time_audit_segments_video_range_valid" CHECK ("project_time_audit_segments"."start_seconds" is null or ("project_time_audit_segments"."start_seconds" >= 0 and "project_time_audit_segments"."end_seconds" > "project_time_audit_segments"."start_seconds"));--> statement-breakpoint
ALTER TABLE "project_time_audit_segments" ADD CONSTRAINT "time_audit_segments_range_valid" CHECK ("project_time_audit_segments"."start_at" is null or "project_time_audit_segments"."end_at" > "project_time_audit_segments"."start_at");