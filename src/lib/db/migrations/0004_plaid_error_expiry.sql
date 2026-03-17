ALTER TABLE "plaid_connections" ADD COLUMN "error_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "plaid_connections" ADD COLUMN "error_retry_count" integer DEFAULT 0 NOT NULL;
