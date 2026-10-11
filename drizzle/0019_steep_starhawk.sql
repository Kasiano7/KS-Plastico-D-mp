CREATE TABLE "machine_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_base64" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_label" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_photo_id_machine_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."machine_photos"("id") ON DELETE set null ON UPDATE no action;