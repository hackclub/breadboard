CREATE TYPE "public"."currency_transaction_type" AS ENUM('project_payout', 'shop_purchase', 'order_refund', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('shop', 'project_kit');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'being_fulfilled', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_event_type" AS ENUM('project_created', 'materials_submitted', 'materials_approved', 'materials_changes_requested', 'kit_order_created', 'kit_order_accepted', 'kit_sent', 'package_received', 'demo_submitted', 'demo_approved', 'demo_changes_requested', 'project_done', 'project_rejected', 'currency_awarded', 'admin_updated');--> statement-breakpoint
CREATE TYPE "public"."project_lifecycle_state" AS ENUM('draft', 'materials_submitted', 'materials_changes_requested', 'kit_approved', 'kit_fulfilling', 'kit_sent', 'package_received', 'building', 'demo_submitted', 'demo_changes_requested', 'done', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_material_type" AS ENUM('schematic', 'code', 'readme', 'screenshot', 'demo_video', 'extra_requirement');--> statement-breakpoint
CREATE TYPE "public"."project_requirement_phase" AS ENUM('materials_submission', 'demo_submission');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'materials_review', 'kit_approved', 'kit_fulfillment', 'kit_sent', 'building', 'demo_review', 'done', 'shipped', 'reviewed', 'paid_out', 'fulfilled', 'needs_changes', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."project_submission_status" AS ENUM('pending_review', 'pending_demo_review', 'approved', 'needs_changes', 'rejected', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."project_submission_type" AS ENUM('materials', 'demo');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('pending', 'approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'label_created', 'in_transit', 'delivered', 'failed', 'returned', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "currency_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text,
	"type" "currency_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer,
	"source_entity_type" text DEFAULT '' NOT NULL,
	"source_entity_id" text DEFAULT '' NOT NULL,
	"idempotency_key" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currency_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "editor_activity_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_sessions_seconds_non_negative" CHECK ("editor_activity_sessions"."active_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "editor_timelapse_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "kit_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kit_id" integer NOT NULL,
	"product_id" integer,
	"label" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_items_quantity_positive" CHECK ("kit_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kits_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_non_negative" CHECK ("order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"total_cost" integer DEFAULT 0 NOT NULL,
	"shipping_name" text DEFAULT '' NOT NULL,
	"shipping_line1" text DEFAULT '' NOT NULL,
	"shipping_line2" text DEFAULT '' NOT NULL,
	"shipping_city" text DEFAULT '' NOT NULL,
	"shipping_region" text DEFAULT '' NOT NULL,
	"shipping_postal_code" text DEFAULT '' NOT NULL,
	"shipping_country" text DEFAULT '' NOT NULL,
	"tracking_info" text,
	"admin_notes" text,
	"source" "order_source" DEFAULT 'shop' NOT NULL,
	"project_id" integer,
	"merge_group_id" text,
	"accepted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_cost_non_negative" CHECK ("orders"."total_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"sku" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text NOT NULL,
	"price" integer DEFAULT 1 NOT NULL,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_editor_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"editor_data" text NOT NULL,
	"reason" text DEFAULT 'autosave' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"actor_id" text,
	"type" "project_event_type" NOT NULL,
	"from_state" "project_lifecycle_state",
	"to_state" "project_lifecycle_state",
	"source_entity_type" text DEFAULT '' NOT NULL,
	"source_entity_id" text DEFAULT '' NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_journals" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"active_seconds_covered" integer DEFAULT 0 NOT NULL,
	"covers_from" timestamp with time zone,
	"covers_to" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_journals_active_seconds_non_negative" CHECK ("project_journals"."active_seconds_covered" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"type" "project_material_type" NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"text_value" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_participant_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_requirement_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase" "project_requirement_phase" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"material_type" "project_material_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_review_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"submission_id" integer NOT NULL,
	"reviewer_id" text,
	"decision" "review_decision" DEFAULT 'pending' NOT NULL,
	"approved_seconds" integer,
	"bread_amount" integer DEFAULT 0 NOT NULL,
	"public_comment" text DEFAULT '' NOT NULL,
	"internal_comment" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_reviews_bread_non_negative" CHECK ("project_reviews"."bread_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_shipping_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"line1" text DEFAULT '' NOT NULL,
	"line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_submission_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"material_id" integer,
	"type" "project_material_type" NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"text_value" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" "project_submission_status" DEFAULT 'pending_review' NOT NULL,
	"type" "project_submission_type" DEFAULT 'materials' NOT NULL,
	"submission_number" integer NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"playable_url" text DEFAULT '' NOT NULL,
	"demo_video_url" text DEFAULT '' NOT NULL,
	"code_url" text DEFAULT '' NOT NULL,
	"screenshot_url" text DEFAULT '' NOT NULL,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"hours_spent" integer DEFAULT 0 NOT NULL,
	"editor_version_number" integer,
	"approved_hours" integer,
	"internal_note" text DEFAULT '' NOT NULL,
	"user_comment" text DEFAULT '' NOT NULL,
	"bread_amount" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"source_session_id" integer,
	"journal_id" integer,
	"active_seconds" integer NOT NULL,
	"counted" boolean DEFAULT true NOT NULL,
	"counted_until_state" "project_lifecycle_state",
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_time_entries_seconds_positive" CHECK ("project_time_entries"."active_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"lifecycle_state" "project_lifecycle_state" DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT 'Untitled project' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"playable_url" text DEFAULT '' NOT NULL,
	"demo_video_url" text DEFAULT '' NOT NULL,
	"code_url" text DEFAULT '' NOT NULL,
	"screenshot_url" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"kit_type" text DEFAULT 'arduino' NOT NULL,
	"kit_id" integer,
	"hours_spent" integer DEFAULT 0 NOT NULL,
	"override_hours_spent" integer,
	"override_hours_spent_justification" text DEFAULT '' NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"bread_amount" integer DEFAULT 0 NOT NULL,
	"editor_data" text DEFAULT '' NOT NULL,
	"editor_last_saved_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"kit_approved_at" timestamp with time zone,
	"kit_order_id" integer,
	"shipment_id" integer,
	"kit_sent_at" timestamp with time zone,
	"package_received_at" timestamp with time zone,
	"demo_submitted_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"target_user_id" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"status" "shipment_status" NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"project_id" integer,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"carrier" text DEFAULT '' NOT NULL,
	"tracking_number" text DEFAULT '' NOT NULL,
	"tracking_url" text DEFAULT '' NOT NULL,
	"label_url" text DEFAULT '' NOT NULL,
	"raw_carrier_payload" jsonb,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"image" text,
	"slack_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"line1" text DEFAULT '' NOT NULL,
	"line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bread" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_bread_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_transactions" ADD CONSTRAINT "currency_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_transactions" ADD CONSTRAINT "currency_transactions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_activity_sessions" ADD CONSTRAINT "editor_activity_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_activity_sessions" ADD CONSTRAINT "editor_activity_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_timelapse_snapshots" ADD CONSTRAINT "editor_timelapse_snapshots_session_id_editor_activity_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."editor_activity_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_editor_versions" ADD CONSTRAINT "project_editor_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_editor_versions" ADD CONSTRAINT "project_editor_versions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_participant_profiles" ADD CONSTRAINT "project_participant_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_participant_profiles" ADD CONSTRAINT "project_participant_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_review_checks" ADD CONSTRAINT "project_review_checks_review_id_project_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."project_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_submission_id_project_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."project_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_shipping_addresses" ADD CONSTRAINT "project_shipping_addresses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_shipping_addresses" ADD CONSTRAINT "project_shipping_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submission_materials" ADD CONSTRAINT "project_submission_materials_submission_id_project_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."project_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submission_materials" ADD CONSTRAINT "project_submission_materials_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_source_session_id_editor_activity_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."editor_activity_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_journal_id_project_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."project_journals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notes" ADD CONSTRAINT "review_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notes" ADD CONSTRAINT "review_notes_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notes" ADD CONSTRAINT "review_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bread" ADD CONSTRAINT "user_bread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_idx" ON "cart_items" USING btree ("cart_id","product_id");--> statement-breakpoint
CREATE INDEX "currency_transactions_user_id_idx" ON "currency_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "currency_transactions_source_idx" ON "currency_transactions" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "activity_sessions_project_id_idx" ON "editor_activity_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "activity_sessions_user_id_idx" ON "editor_activity_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timelapse_snapshots_session_id_idx" ON "editor_timelapse_snapshots" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "kit_items_kit_id_idx" ON "kit_items" USING btree ("kit_id");--> statement-breakpoint
CREATE INDEX "kits_active_idx" ON "kits" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_product_idx" ON "order_items" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_source_project_idx" ON "orders" USING btree ("source","project_id");--> statement-breakpoint
CREATE INDEX "product_categories_active_idx" ON "product_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "project_editor_versions_project_id_idx" ON "project_editor_versions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_editor_versions_project_version_idx" ON "project_editor_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "project_events_project_id_idx" ON "project_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_events_type_idx" ON "project_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "project_events_created_at_idx" ON "project_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "project_journals_project_id_idx" ON "project_journals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_journals_user_id_idx" ON "project_journals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_materials_project_id_idx" ON "project_materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_materials_type_idx" ON "project_materials" USING btree ("project_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "project_profiles_project_user_idx" ON "project_participant_profiles" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_definitions_phase_key_idx" ON "project_requirement_definitions" USING btree ("phase","key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_review_checks_review_key_idx" ON "project_review_checks" USING btree ("review_id","key");--> statement-breakpoint
CREATE INDEX "project_reviews_project_id_idx" ON "project_reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_reviews_submission_id_idx" ON "project_reviews" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "project_reviews_decision_idx" ON "project_reviews" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "project_addresses_project_id_idx" ON "project_shipping_addresses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_addresses_active_idx" ON "project_shipping_addresses" USING btree ("project_id","active");--> statement-breakpoint
CREATE INDEX "submission_materials_submission_id_idx" ON "project_submission_materials" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_materials_type_idx" ON "project_submission_materials" USING btree ("submission_id","type");--> statement-breakpoint
CREATE INDEX "project_submissions_project_id_idx" ON "project_submissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_submissions_user_id_idx" ON "project_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_submissions_status_idx" ON "project_submissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_submissions_project_number_idx" ON "project_submissions" USING btree ("project_id","submission_number");--> statement-breakpoint
CREATE INDEX "project_time_entries_project_id_idx" ON "project_time_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_time_entries_user_id_idx" ON "project_time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_time_entries_journal_id_idx" ON "project_time_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_lifecycle_state_idx" ON "projects" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_id_idx" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_events_occurred_at_idx" ON "shipment_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "shipments_order_id_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_project_id_idx" ON "shipments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_user_id_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");