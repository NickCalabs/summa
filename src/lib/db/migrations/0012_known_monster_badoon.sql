ALTER TYPE "public"."provider_type" ADD VALUE 'coinbase';--> statement-breakpoint
CREATE TABLE "coinbase_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT 'Coinbase' NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_secret_enc" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coinbase_connections" ADD CONSTRAINT "coinbase_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;