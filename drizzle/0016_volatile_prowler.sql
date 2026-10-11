CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_buckets_key_window_idx" ON "rate_limit_buckets" USING btree ("bucket_key","window_start");