INSERT INTO "mold_machines" ("mold_id", "machine_id")
SELECT mold."id", machine."id"
FROM (
  VALUES
    ('PR-59', 'MOU-112'),
    ('PR-59', 'MOU-118'),
    ('PR-60', 'MOU-203'),
    ('PR-60', 'MOU-247'),
    ('PR-61', 'MOU-045'),
    ('PR-61', 'MOU-046')
) AS compatibility("machine_code", "mold_reference")
INNER JOIN "machines" AS machine ON machine."code" = compatibility."machine_code"
INNER JOIN "molds" AS mold ON mold."reference" = compatibility."mold_reference"
ON CONFLICT ("mold_id", "machine_id") DO NOTHING;
