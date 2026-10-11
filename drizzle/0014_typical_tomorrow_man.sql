CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"company_id" text DEFAULT 'demo' NOT NULL,
	"provider" text NOT NULL,
	"default_model" text NOT NULL,
	"model_used" text NOT NULL,
	"model_tier" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_micros_usd" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"escalated_to_sol" boolean DEFAULT false NOT NULL,
	"escalation_reason" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE INDEX "ai_usage_logs_requested_idx" ON "ai_usage_logs" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_company_idx" ON "ai_usage_logs" USING btree ("company_id","requested_at");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_user_idx" ON "ai_usage_logs" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_tier_idx" ON "ai_usage_logs" USING btree ("model_tier","requested_at");