ALTER TABLE "dashboard_pins" RENAME TO "lenses";--> statement-breakpoint
ALTER TABLE "lenses" DROP CONSTRAINT "dashboard_pins_portfolio_id_portfolios_id_fk";
--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "is_pinned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lenses" ADD CONSTRAINT "lenses_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;