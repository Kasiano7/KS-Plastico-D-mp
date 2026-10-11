ALTER TABLE "health_snapshots" ADD COLUMN "produced_units" integer;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD COLUMN "target_units" integer;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD COLUMN "late_orders" integer;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD COLUMN "downtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD COLUMN "downtime_cost_cents" integer;