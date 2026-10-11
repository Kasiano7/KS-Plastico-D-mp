INSERT INTO "product_machines" ("product_id", "machine_id", "units_per_hour", "is_preferred")
SELECT product."id", machine."id", compatibility."units_per_hour", false
FROM (
  VALUES
    ('PR-59', 'BAV-450', 112.0),
    ('PR-59', 'SUP-BAT-12', 138.0),
    ('PR-60', 'PDR-780', 26.6),
    ('PR-60', 'COIF-220', 130.0),
    ('PR-61', 'GB-2E-001', 30.0),
    ('PR-61', 'GB-3E-001', 24.8)
) AS compatibility("machine_code", "product_reference", "units_per_hour")
INNER JOIN "machines" AS machine ON machine."code" = compatibility."machine_code"
INNER JOIN "products" AS product ON product."reference" = compatibility."product_reference"
ON CONFLICT ("product_id", "machine_id") DO NOTHING;
