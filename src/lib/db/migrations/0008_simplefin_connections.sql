CREATE TABLE "simplefin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"server_url" text NOT NULL,
	"label" text DEFAULT 'SimpleFIN' NOT NULL,
	"access_url_enc" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simplefin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"simplefin_account_id" text NOT NULL,
	"asset_id" uuid,
	"connection_name" text,
	"institution_name" text,
	"account_name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"balance" numeric(20, 2),
	"available_balance" numeric(20, 2),
	"balance_date" timestamp,
	"is_tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simplefin_connections" ADD CONSTRAINT "simplefin_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simplefin_accounts" ADD CONSTRAINT "simplefin_accounts_connection_id_simplefin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."simplefin_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simplefin_accounts" ADD CONSTRAINT "simplefin_accounts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "simplefin_account_connection_unique" ON "simplefin_accounts" ("connection_id","simplefin_account_id");
