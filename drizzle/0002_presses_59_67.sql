INSERT INTO "machines" (
  "code",
  "name",
  "workshop_id",
  "tonnage",
  "manufacturer",
  "status",
  "status_since",
  "hourly_cost_cents",
  "daily_capacity_hours"
)
SELECT
  press."code",
  press."name",
  workshop."id",
  0,
  'Constructeur presses C',
  'idle'::"machine_status",
  now(),
  0,
  21
FROM (
  VALUES
    ('PR-59', 'Presse 59'),
    ('PR-60', 'Presse 60'),
    ('PR-61', 'Presse 61'),
    ('PR-62', 'Presse 62'),
    ('PR-63', 'Presse 63'),
    ('PR-64', 'Presse 64'),
    ('PR-65', 'Presse 65'),
    ('PR-66', 'Presse 66'),
    ('PR-67', 'Presse 67')
) AS press("code", "name")
CROSS JOIN "workshops" AS workshop
WHERE workshop."code" = 'B'
ON CONFLICT ("code") DO UPDATE
SET "workshop_id" = EXCLUDED."workshop_id";
