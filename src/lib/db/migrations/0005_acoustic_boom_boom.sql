CREATE TYPE "public"."tax_status" AS ENUM('taxable', 'tax_deferred', 'tax_free');--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "tax_status" "tax_status";
