DROP INDEX "project_timelapses_project_lapse_idx";--> statement-breakpoint
ALTER TABLE "project_timelapses" ADD COLUMN "journal_entry_id" integer;--> statement-breakpoint
ALTER TABLE "project_timelapses" ADD CONSTRAINT "project_timelapses_journal_entry_id_project_journals_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."project_journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_timelapses_user_lapse_idx" ON "project_timelapses" USING btree ("user_id","lapse_id");--> statement-breakpoint
CREATE INDEX "project_timelapses_journal_entry_idx" ON "project_timelapses" USING btree ("journal_entry_id");