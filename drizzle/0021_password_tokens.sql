CREATE TYPE "public"."password_token_purpose" AS ENUM('invitation', 'reset');--> statement-breakpoint
CREATE TABLE "password_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "password_token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_tokens_hash_idx" ON "password_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_tokens_user_idx" ON "password_tokens" USING btree ("user_id");