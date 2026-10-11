CREATE TYPE "public"."absence_type" AS ENUM('holiday', 'sick_leave', 'training', 'unpaid', 'other');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'acknowledged', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('measured', 'computed', 'estimated', 'forecast');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'investigating', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."inventory_kind" AS ENUM('finished_good', 'raw_material', 'pallet', 'crate', 'component', 'consumable', 'tooling', 'spare_part');--> statement-breakpoint
CREATE TYPE "public"."machine_event_type" AS ENUM('production_start', 'production_end', 'stop', 'setup', 'mold_change', 'fault', 'maintenance', 'restart');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('production', 'setup', 'mold_change', 'stopped', 'fault', 'maintenance', 'idle');--> statement-breakpoint
CREATE TYPE "public"."mold_status" AS ENUM('available', 'mounted', 'maintenance', 'retired');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('inbound', 'outbound', 'transfer', 'consumption', 'adjustment', 'production_output');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'in_production', 'ready', 'shipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pallet_status" AS ENUM('in_progress', 'completed', 'in_stock', 'allocated', 'shipped');--> statement-breakpoint
CREATE TYPE "public"."production_order_status" AS ENUM('planned', 'released', 'running', 'paused', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."qualification_kind" AS ENUM('sst', 'caces', 'electrical', 'forklift', 'machine', 'safety', 'other');--> statement-breakpoint
CREATE TYPE "public"."quality_defect" AS ENUM('appearance', 'dimension', 'material', 'shrinkage', 'burn', 'flash', 'contamination', 'other');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('proposed', 'simulated', 'approved', 'rejected', 'executed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."role_code" AS ENUM('direction', 'responsable_production', 'chef_atelier', 'responsable_maintenance', 'responsable_rh', 'responsable_stock', 'operateur');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('normal', 'info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."shift" AS ENUM('morning', 'afternoon', 'night');--> statement-breakpoint
CREATE TYPE "public"."telemetry_source" AS ENUM('simulated', 'gateway', 'manual');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"domain" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "role_code" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rank" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role_id" uuid NOT NULL,
	"workshop_id" uuid,
	"employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"energy_cents_per_hour" integer DEFAULT 0 NOT NULL,
	"labor_cents_per_hour" integer DEFAULT 0 NOT NULL,
	"overhead_cents_per_hour" integer DEFAULT 0 NOT NULL,
	"consumables_cents_per_hour" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_models_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "machine_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"type" "machine_event_type" NOT NULL,
	"status" "machine_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer,
	"reason" text,
	"production_order_id" uuid,
	"source" "telemetry_source" DEFAULT 'simulated' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "machine_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"cycle_time_seconds" real,
	"parts_produced" integer DEFAULT 0 NOT NULL,
	"parts_rejected" integer DEFAULT 0 NOT NULL,
	"availability_pct" real,
	"performance_pct" real,
	"quality_pct" real,
	"source" "telemetry_source" DEFAULT 'simulated' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"workshop_id" uuid NOT NULL,
	"tonnage" integer DEFAULT 0 NOT NULL,
	"manufacturer" text,
	"model" text,
	"status" "machine_status" DEFAULT 'idle' NOT NULL,
	"status_since" timestamp with time zone DEFAULT now() NOT NULL,
	"current_mold_id" uuid,
	"hourly_cost_cents" integer DEFAULT 0 NOT NULL,
	"daily_capacity_hours" real DEFAULT 21 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machines_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"family" text NOT NULL,
	"color" text,
	"cost_cents_per_kg" integer DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	CONSTRAINT "materials_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "mold_machines" (
	"mold_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	CONSTRAINT "mold_machines_mold_id_machine_id_pk" PRIMARY KEY("mold_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "molds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"status" "mold_status" DEFAULT 'available' NOT NULL,
	"location" text,
	"cavities" integer DEFAULT 1 NOT NULL,
	"changeover_minutes" integer DEFAULT 180 NOT NULL,
	"cycles_since_maintenance" integer DEFAULT 0 NOT NULL,
	"maintenance_every_cycles" integer DEFAULT 200000 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "molds_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "product_machines" (
	"product_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"units_per_hour" real NOT NULL,
	"is_preferred" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_machines_product_id_machine_id_pk" PRIMARY KEY("product_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"family" text NOT NULL,
	"customer_id" uuid,
	"material_id" uuid,
	"mold_id" uuid,
	"image_url" text,
	"description" text,
	"weight_grams" integer DEFAULT 0 NOT NULL,
	"dimensions_mm" text,
	"cycle_time_seconds" real DEFAULT 60 NOT NULL,
	"units_per_pallet" integer DEFAULT 100 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"daily_target_units" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshops_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'confirmed' NOT NULL,
	"priority" "order_priority" DEFAULT 'normal' NOT NULL,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"shipped_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"contact_email" text,
	"lead_time_days" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_units" integer NOT NULL,
	"reserved_units" integer DEFAULT 0 NOT NULL,
	"produced_units" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_id" uuid NOT NULL,
	"production_order_id" uuid,
	"customer_order_id" uuid,
	"machine_id" uuid,
	"operator_id" uuid,
	"status" "pallet_status" DEFAULT 'in_progress' NOT NULL,
	"quantity_units" integer DEFAULT 0 NOT NULL,
	"lot_number" text,
	"location" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pallets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"order_line_id" uuid,
	"customer_order_id" uuid,
	"product_id" uuid NOT NULL,
	"machine_id" uuid,
	"mold_id" uuid,
	"status" "production_order_status" DEFAULT 'planned' NOT NULL,
	"quantity_units" integer NOT NULL,
	"produced_units" integer DEFAULT 0 NOT NULL,
	"rejected_units" integer DEFAULT 0 NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"planned_units_per_hour" real NOT NULL,
	"requires_mold_change" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"operator_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"good_units" integer DEFAULT 0 NOT NULL,
	"rejected_units" integer DEFAULT 0 NOT NULL,
	"downtime_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"kind" "inventory_kind" NOT NULL,
	"unit" text DEFAULT 'u' NOT NULL,
	"product_id" uuid,
	"supplier_id" uuid,
	"location" text,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"safety_stock" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"average_daily_consumption" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reference" text,
	"customer_order_id" uuid,
	"user_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"customer_order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid,
	"severity" "severity" DEFAULT 'warning' NOT NULL,
	"required_quantity" integer NOT NULL,
	"recommended_quantity" integer NOT NULL,
	"order_by_at" timestamp with time zone NOT NULL,
	"projected_shortage_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"contact_email" text,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"reliability_pct" integer DEFAULT 95 NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "absence_type" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "employee_skills" (
	"employee_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "employee_skills_employee_id_skill_id_pk" PRIMARY KEY("employee_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricule" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"workshop_id" uuid,
	"job_title" text NOT NULL,
	"shift" "shift" DEFAULT 'morning' NOT NULL,
	"hired_at" timestamp with time zone,
	"hourly_cost_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employees_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "qualification_kind" NOT NULL,
	"label" text NOT NULL,
	"obtained_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alert_lead_days" integer DEFAULT 90 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	CONSTRAINT "skills_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"is_mandatory" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"probable_cause" text,
	"consequences" text,
	"impact_cents" integer DEFAULT 0 NOT NULL,
	"impact_origin" "data_origin" DEFAULT 'estimated' NOT NULL,
	"machine_id" uuid,
	"workshop_id" uuid,
	"customer_order_id" uuid,
	"incident_id" uuid,
	"context" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"justification" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"entity_label" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"justification" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"global_score" integer NOT NULL,
	"production_score" integer NOT NULL,
	"inventory_score" integer NOT NULL,
	"machine_score" integer NOT NULL,
	"planning_score" integer NOT NULL,
	"quality_score" integer NOT NULL,
	"staff_score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"severity" "severity" DEFAULT 'warning' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"machine_id" uuid,
	"workshop_id" uuid,
	"production_order_id" uuid,
	"symptom" text NOT NULL,
	"root_cause" text,
	"resolution" text,
	"tags" text[],
	"downtime_minutes" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"declared_by" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "incidents_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"role_code" text,
	"severity" "severity" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid,
	"machine_id" uuid,
	"defect" "quality_defect" NOT NULL,
	"rejected_units" integer NOT NULL,
	"lot_number" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment" text,
	"declared_by" uuid
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid,
	"status" "recommendation_status" DEFAULT 'proposed' NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"action" jsonb NOT NULL,
	"expected_gain_cents" integer DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"origin" "data_origin" DEFAULT 'computed' NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid,
	"scenario" text NOT NULL,
	"success_probability" real NOT NULL,
	"baseline" jsonb NOT NULL,
	"projected" jsonb NOT NULL,
	"delta_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_events" ADD CONSTRAINT "machine_events_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_telemetry" ADD CONSTRAINT "machine_telemetry_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_current_mold_id_molds_id_fk" FOREIGN KEY ("current_mold_id") REFERENCES "public"."molds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mold_machines" ADD CONSTRAINT "mold_machines_mold_id_molds_id_fk" FOREIGN KEY ("mold_id") REFERENCES "public"."molds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mold_machines" ADD CONSTRAINT "mold_machines_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_machines" ADD CONSTRAINT "product_machines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_machines" ADD CONSTRAINT "product_machines_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_mold_id_molds_id_fk" FOREIGN KEY ("mold_id") REFERENCES "public"."molds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_customer_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_mold_id_molds_id_fk" FOREIGN KEY ("mold_id") REFERENCES "public"."molds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requirements" ADD CONSTRAINT "purchase_requirements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requirements" ADD CONSTRAINT "purchase_requirements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_events" ADD CONSTRAINT "quality_events_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_events" ADD CONSTRAINT "quality_events_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "machine_events_machine_start_idx" ON "machine_events" USING btree ("machine_id","started_at");--> statement-breakpoint
CREATE INDEX "machine_events_type_idx" ON "machine_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "machine_telemetry_machine_time_idx" ON "machine_telemetry" USING btree ("machine_id","recorded_at");--> statement-breakpoint
CREATE INDEX "machines_workshop_idx" ON "machines" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "machines_status_idx" ON "machines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "molds_status_idx" ON "molds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_family_idx" ON "products" USING btree ("family");--> statement-breakpoint
CREATE INDEX "products_customer_idx" ON "products" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_orders_status_idx" ON "customer_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_orders_due_idx" ON "customer_orders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "customer_orders_customer_idx" ON "customer_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_product_idx" ON "order_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "pallets_status_idx" ON "pallets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pallets_order_idx" ON "pallets" USING btree ("customer_order_id");--> statement-breakpoint
CREATE INDEX "pallets_product_idx" ON "pallets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "production_orders_machine_start_idx" ON "production_orders" USING btree ("machine_id","planned_start_at");--> statement-breakpoint
CREATE INDEX "production_orders_status_idx" ON "production_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_orders_customer_order_idx" ON "production_orders" USING btree ("customer_order_id");--> statement-breakpoint
CREATE INDEX "production_runs_order_idx" ON "production_runs" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "inventory_items_kind_idx" ON "inventory_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "inventory_items_product_idx" ON "inventory_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_time_idx" ON "inventory_movements" USING btree ("item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "inventory_reservations_item_idx" ON "inventory_reservations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_idx" ON "inventory_reservations" USING btree ("customer_order_id");--> statement-breakpoint
CREATE INDEX "purchase_requirements_item_idx" ON "purchase_requirements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "absences_employee_time_idx" ON "absences" USING btree ("employee_id","starts_at");--> statement-breakpoint
CREATE INDEX "employees_workshop_idx" ON "employees" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "employees_shift_idx" ON "employees" USING btree ("shift");--> statement-breakpoint
CREATE INDEX "qualifications_expiry_idx" ON "qualifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "alerts_status_severity_idx" ON "alerts" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "alerts_detected_idx" ON "alerts" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "approvals_recommendation_idx" ON "approvals" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_time_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "health_snapshots_time_idx" ON "health_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "incidents_machine_time_idx" ON "incidents" USING btree ("machine_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "quality_events_machine_time_idx" ON "quality_events" USING btree ("machine_id","detected_at");--> statement-breakpoint
CREATE INDEX "quality_events_defect_idx" ON "quality_events" USING btree ("defect");--> statement-breakpoint
CREATE INDEX "recommendations_status_idx" ON "recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recommendations_alert_idx" ON "recommendations" USING btree ("alert_id");