CREATE TABLE "editor_screen_evidence_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"image_key" text DEFAULT '' NOT NULL,
	"pixel_changed" boolean NOT NULL,
	"diff_score" integer DEFAULT 0 NOT NULL,
	"screen_width" integer DEFAULT 0 NOT NULL,
	"screen_height" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	CONSTRAINT "screen_evidence_diff_non_negative" CHECK ("editor_screen_evidence_frames"."diff_score" >= 0)
);
--> statement-breakpoint
ALTER TABLE "editor_screen_evidence_frames" ADD CONSTRAINT "editor_screen_evidence_frames_session_id_editor_activity_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."editor_activity_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_screen_evidence_frames" ADD CONSTRAINT "editor_screen_evidence_frames_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_screen_evidence_frames" ADD CONSTRAINT "editor_screen_evidence_frames_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screen_evidence_project_idx" ON "editor_screen_evidence_frames" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "screen_evidence_session_idx" ON "editor_screen_evidence_frames" USING btree ("session_id");