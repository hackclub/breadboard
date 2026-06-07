ALTER TABLE "projects" ADD COLUMN "editor_data" text DEFAULT '' NOT NULL;
ALTER TABLE "projects" ADD COLUMN "editor_last_saved_at" timestamp with time zone;

CREATE TABLE "project_editor_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "version_number" integer NOT NULL,
  "editor_data" text NOT NULL,
  "reason" text DEFAULT 'autosave' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "project_editor_versions" ADD CONSTRAINT "project_editor_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "project_editor_versions" ADD CONSTRAINT "project_editor_versions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "project_editor_versions_project_id_idx" ON "project_editor_versions" USING btree ("project_id");
CREATE UNIQUE INDEX "project_editor_versions_project_version_idx" ON "project_editor_versions" USING btree ("project_id", "version_number");
