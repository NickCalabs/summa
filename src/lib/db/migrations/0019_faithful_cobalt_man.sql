ALTER TABLE "asset_snapshots" ADD COLUMN "value_in_btc" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "total_assets_in_btc" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "total_debts_in_btc" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "net_worth_in_btc" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "cash_on_hand_in_btc" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "investable_in_btc" numeric(28, 10);