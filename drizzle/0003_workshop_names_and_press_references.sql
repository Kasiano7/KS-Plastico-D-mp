UPDATE "workshops"
SET
  "name" = CASE "code"
    WHEN 'A' THEN 'Atelier PU'
    WHEN 'B' THEN 'Atelier Injection'
    WHEN 'C' THEN 'Montage / expédition'
    ELSE "name"
  END,
  "description" = CASE "code"
    WHEN 'A' THEN 'Préparation et transformation des pièces PU avant finition.'
    WHEN 'B' THEN 'Presses de moulage des pièces plastiques techniques de moyen et grand format.'
    WHEN 'C' THEN 'Finition, assemblage, contrôle final, emballage et préparation des expéditions.'
    ELSE "description"
  END
WHERE "code" IN ('A', 'B', 'C');
--> statement-breakpoint

UPDATE "machines"
SET
  "manufacturer" = CASE "code"
    WHEN 'PR-59' THEN 'Constructeur presses A'
    WHEN 'PR-60' THEN 'Constructeur presses A'
    WHEN 'PR-61' THEN 'Constructeur presses C'
    WHEN 'PR-62' THEN 'Constructeur presses C'
    WHEN 'PR-63' THEN 'Constructeur presses C'
    WHEN 'PR-64' THEN 'Constructeur presses C'
    WHEN 'PR-65' THEN 'Constructeur presses B'
    WHEN 'PR-66' THEN 'Constructeur presses B'
    WHEN 'PR-67' THEN 'Constructeur presses A'
    ELSE "manufacturer"
  END,
  "model" = CASE "code"
    WHEN 'PR-59' THEN 'A-SY 1000 servo'
    WHEN 'PR-60' THEN 'A-MU 1500'
    WHEN 'PR-61' THEN NULL
    WHEN 'PR-62' THEN NULL
    WHEN 'PR-63' THEN NULL
    WHEN 'PR-64' THEN NULL
    WHEN 'PR-65' THEN 'B-650S'
    WHEN 'PR-66' THEN 'B-850SW'
    WHEN 'PR-67' THEN 'A-SY multi 1500'
    ELSE "model"
  END,
  "tonnage" = CASE "code"
    WHEN 'PR-59' THEN 1000
    WHEN 'PR-60' THEN 1500
    WHEN 'PR-61' THEN 0
    WHEN 'PR-62' THEN 0
    WHEN 'PR-63' THEN 0
    WHEN 'PR-64' THEN 0
    WHEN 'PR-65' THEN 650
    WHEN 'PR-66' THEN 850
    WHEN 'PR-67' THEN 1500
    ELSE "tonnage"
  END
WHERE "code" BETWEEN 'PR-59' AND 'PR-67';
--> statement-breakpoint

UPDATE "alerts"
SET "title" = 'Atelier Injection sous son objectif de production'
WHERE "title" = 'Atelier B sous son objectif de production';
