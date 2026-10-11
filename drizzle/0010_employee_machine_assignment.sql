ALTER TABLE "employees" ADD COLUMN "assigned_machine_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_assigned_machine_id_machines_id_fk" FOREIGN KEY ("assigned_machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "employees" e
SET "assigned_machine_id" = last_run.machine_id
FROM (
  SELECT DISTINCT ON (operator_id) operator_id, machine_id
  FROM production_runs
  WHERE operator_id IS NOT NULL
  ORDER BY operator_id, started_at DESC
) last_run
WHERE e.id = last_run.operator_id;