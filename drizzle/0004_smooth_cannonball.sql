CREATE TABLE "maintenance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"estimated_minutes" integer DEFAULT 60 NOT NULL,
	"required_skill_id" uuid,
	"assigned_employee_id" uuid,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_required_skill_id_skills_id_fk" FOREIGN KEY ("required_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_tasks_machine_date_idx" ON "maintenance_tasks" USING btree ("machine_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "maintenance_tasks_status_date_idx" ON "maintenance_tasks" USING btree ("status","scheduled_at");