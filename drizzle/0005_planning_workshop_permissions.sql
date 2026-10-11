--> La création et la modification du planning sont réservées par défaut aux chefs d'atelier.
--> La matrice d'administration reste la source de vérité et permet de modifier ce choix ensuite.
DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "permissions"."code" = 'planning:write'
  AND "roles"."code" <> 'chef_atelier';--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."code" = 'chef_atelier'
  AND "permissions"."code" = 'planning:write'
ON CONFLICT DO NOTHING;
