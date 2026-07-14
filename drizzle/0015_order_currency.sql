CREATE TYPE "public"."bread_currency" AS ENUM('bread', 'gold');--> statement-breakpoint
ALTER TABLE "currency_transactions" ADD COLUMN "currency" "bread_currency" DEFAULT 'bread' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" "bread_currency" DEFAULT 'bread' NOT NULL;--> statement-breakpoint
UPDATE "currency_transactions" SET "currency" = 'gold' WHERE "note" IN ('Build approved (gold bread)', 'Project paid out (gold bread)');
