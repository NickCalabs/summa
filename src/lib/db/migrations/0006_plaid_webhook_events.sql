CREATE TABLE "plaid_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" text NOT NULL,
	"webhook_type" text NOT NULL,
	"webhook_code" text NOT NULL,
	"webhook_iat" integer NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_webhook_event_key_idx" ON "plaid_webhook_events" ("item_id","webhook_type","webhook_code","webhook_iat");
