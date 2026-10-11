--> Rôles administrables : le code de rôle cesse d'être un enum figé, afin que
--> la direction puisse créer ses propres rôles depuis l'administration.

ALTER TABLE "roles" ALTER COLUMN "code" SET DATA TYPE text USING "code"::text;--> statement-breakpoint

--> La valeur par défaut textuelle doit être retirée avant la conversion de type.
ALTER TABLE "roles" ALTER COLUMN "rank" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "rank" SET DATA TYPE integer USING "rank"::integer;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "rank" SET DEFAULT 0;--> statement-breakpoint

ALTER TABLE "roles" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

--> Les rôles déjà présents sont ceux livrés avec l'application.
UPDATE "roles" SET "is_system" = true;--> statement-breakpoint

DROP TYPE "public"."role_code";
