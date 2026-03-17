ALTER TYPE "public"."provider_type" ADD VALUE IF NOT EXISTS 'plaid';--> statement-breakpoint
CREATE TABLE "plaid_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"item_id" text NOT NULL,
	"consent_expiration" timestamp,
	"error_code" text,
	"error_message" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_connections_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"plaid_account_id" text NOT NULL,
	"asset_id" uuid,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"mask" text,
	"current_balance" numeric(20, 2),
	"available_balance" numeric(20, 2),
	"iso_currency_code" text DEFAULT 'USD',
	"is_tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_accounts_plaid_account_id_unique" UNIQUE("plaid_account_id")
);
--> statement-breakpoint
ALTER TABLE "plaid_connections" ADD CONSTRAINT "plaid_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_connection_id_plaid_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."plaid_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
