CREATE TYPE "public"."asset_criticality" AS ENUM('vital', 'important', 'normal');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('machine', 'press_pu', 'compressor', 'chiller', 'conveyor', 'air_reel', 'access', 'door', 'lighting', 'hvac', 'heating', 'electrical', 'robotics', 'logistics', 'building', 'utility', 'safety', 'other');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "asset_type" NOT NULL,
	"criticality" "asset_criticality" DEFAULT 'normal' NOT NULL,
	"workshop_id" uuid,
	"location" text,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"commissioned_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_type_idx" ON "assets" USING btree ("type","is_active");--> statement-breakpoint
CREATE INDEX "assets_workshop_idx" ON "assets" USING btree ("workshop_id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_asset_id_unique" UNIQUE("asset_id");--> statement-breakpoint
-- Remplissage : chaque presse existante reçoit son actif.
--
-- Fait ici et non dans un script applicatif : une base migrée doit être
-- cohérente à la fin de la migration, pas après un démarrage supplémentaire.
-- Sans cela, toute lecture jointe sur `assets` perdrait les presses.
INSERT INTO "assets" ("code", "name", "type", "criticality", "workshop_id", "manufacturer", "model", "serial_number", "is_active")
SELECT
  m."code",
  m."name",
  'machine'::"asset_type",
  -- Une presse à l'arrêt bloque un ordre de fabrication : rien de plus vital
  -- dans une usine d'injection.
  'vital'::"asset_criticality",
  m."workshop_id",
  m."manufacturer",
  m."model",
  m."serial_number",
  m."is_active"
FROM "machines" m
WHERE m."asset_id" IS NULL;
--> statement-breakpoint
UPDATE "machines" m
SET "asset_id" = a."id"
FROM "assets" a
WHERE a."code" = m."code" AND m."asset_id" IS NULL;
