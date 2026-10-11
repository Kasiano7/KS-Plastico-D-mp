CREATE TABLE "machine_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"category" text DEFAULT 'autre' NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_base64" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_label" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_documents" ADD CONSTRAINT "machine_documents_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "machine_documents_machine_idx" ON "machine_documents" USING btree ("machine_id","uploaded_at");