# Modèle de données

PostgreSQL. Schéma Drizzle dans `src/server/db/schema/`, migrations versionnées
dans `drizzle/`.

## Conventions

- Clés primaires `uuid` générées par la base (`gen_random_uuid()`).
- Horodatages `timestamptz`, toujours en UTC ; l'affichage force `Europe/Paris`.
- **Montants en centimes, en `integer`.** Aucun flottant monétaire.
- Enums PostgreSQL centralisés dans `schema/enums.ts` : une seule source pour la
  base, le domaine et l'UI.
- Nommage : tables et colonnes en `snake_case`, propriétés TypeScript en
  `camelCase`.

## Cartographie

### Identité et droits — `schema/identity.ts`

| Table              | Rôle                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `roles`            | Rôles métier ; `code` en texte libre, `is_system` protège ceux livrés    |
| `permissions`      | Catalogue `domaine:action`                                              |
| `role_permissions` | Matrice rôle ↔ permission — **source de vérité des droits**             |
| `users`            | Compte, rôle, périmètre atelier, lien vers un salarié                   |

`roles.code` est volontairement du **texte** et non un enum : un enum figerait
la liste des rôles dans le schéma, alors que la direction les administre depuis
`/administration/roles`.

Le catalogue de code (`domain/permissions.ts`) définit les permissions que
l'application sait vérifier et la configuration initiale des rôles livrés. À
l'exécution, les droits sont lus dans `role_permissions` à chaque requête.

### Usine — `schema/factory.ts`

| Table               | Rôle                                                        |
| ------------------- | ----------------------------------------------------------- |
| `workshops`         | Ateliers, objectif journalier en pièces                     |
| `machines`          | Presses : atelier, tonnage, état, moule monté, coût horaire |
| `machine_events`    | Journal d'état — reconstitue la journée à la minute (§30)   |
| `machine_telemetry` | Relevés haute fréquence, séparés du métier                  |
| `molds`             | Moules : empreintes, durée de changement, emplacement       |
| `mold_machines`     | Compatibilité moule ↔ machine                               |
| `materials`         | Matières et coût au kilogramme                              |
| `products`          | Pièces : cycle, poids, pièces/palette, coût, prix           |
| `product_machines`  | Compatibilité pièce ↔ machine **avec sa cadence propre**    |
| `cost_models`       | Énergie, main-d'œuvre, frais généraux, consommables         |

`product_machines` est la table qui rend le planning possible : une pièce ne peut
être planifiée que sur une machine listée, à la cadence qui y est déclarée.

### Ventes — `schema/sales.ts`

| Table             | Rôle                                                        |
| ----------------- | ----------------------------------------------------------- |
| `customers`       | Clients et délai contractuel                                |
| `customer_orders` | Commande : numéro métier, priorité, échéance, statut        |
| `order_lines`     | Ligne : quantité, **réservé**, **produit**, prix unitaire   |

`reservedUnits` et `producedUnits` portent à eux seuls l'avancement : c'est
`computeOrderProgress` qui en déduit palettes prêtes et pourcentage.

### Fabrication — `schema/manufacturing.ts`

| Table               | Rôle                                                       |
| ------------------- | ---------------------------------------------------------- |
| `production_orders` | Ordre de fabrication : machine, moule, créneau, cadence    |
| `production_runs`   | Session de production (équipe, opérateur, arrêts)          |
| `pallets`           | Palette physique tracée : pièce, lot, machine, commande    |

L'ordre de fabrication est le pont entre la commande client et la machine :
c'est l'objet du planning et l'écran de l'opérateur.

### Stocks — `schema/inventory.ts`

| Table                     | Rôle                                                |
| ------------------------- | --------------------------------------------------- |
| `suppliers`               | Fournisseurs, délai, fiabilité                      |
| `inventory_items`         | Article : physique, réservé, sécurité, point de commande |
| `inventory_movements`     | Historique signé de tout mouvement                  |
| `inventory_reservations`  | Réservation ferme au profit d'une commande          |
| `purchase_requirements`   | Besoin d'achat détecté — proposition, jamais commande |

Familles couvertes : produits finis, matières, palettes, caisses, composants,
consommables, outillage, pièces détachées.

**Invariant central** : `disponible = physique − réservé − stock de sécurité`.
Une quantité réservée n'est plus promettable à une autre commande.

### Personnel — `schema/hr.ts`

| Table             | Rôle                                                    |
| ----------------- | ------------------------------------------------------- |
| `employees`       | Salarié : atelier, poste, équipe, coût horaire          |
| `skills`          | Compétences métier                                      |
| `employee_skills` | Niveau 1 à 4 par compétence                             |
| `qualifications`  | Habilitations à date de validité (SST, CACES…)          |
| `trainings`       | Formations planifiées                                   |
| `absences`        | Absences avec période et motif                          |

### Intelligence — `schema/intelligence.ts`

| Table              | Rôle                                                            |
| ------------------ | --------------------------------------------------------------- |
| `quality_events`   | Rebuts par motif, lot, machine — alimente TRS et coûts          |
| `incidents`        | **Mémoire de l'usine** : symptôme, cause racine, solution, tags |
| `alerts`           | Problème + cause + conséquences + impact + contexte             |
| `recommendations`  | Action proposée, gain attendu, confiance, statut                |
| `simulations`      | Baseline vs projeté, probabilité de succès                      |
| `approvals`        | Décision humaine nominative et justifiée                        |
| `audit_logs`       | Qui, quand, quoi, avant, après, pourquoi                        |
| `notifications`    | Diffusion par utilisateur ou par rôle                           |
| `health_snapshots` | Historique du score, pour expliquer les variations              |

## Traçabilité d'une pièce

Le parcours de référence est intégralement reconstituable :

```
customer_orders (#5842)
  └─ order_lines           quantité, réservé, produit
       ├─ inventory_reservations → inventory_items (stock promis)
       └─ production_orders (OF-2411)
            ├─ machines (Presse 64) ─ machine_events (timeline)
            ├─ molds (MOU-045)
            ├─ production_runs (opérateur, équipe)
            ├─ quality_events (rebuts, lot)
            └─ pallets (code QR, lot, quantité, heure)
                 └─ inventory_movements (entrée en stock)
```

Depuis un code QR de palette, on remonte à la pièce, au lot, à la machine, à
l'opérateur, à l'ordre de fabrication et à la commande client.

## Index

Posés sur les axes de lecture réels, pas systématiquement :

- `machine_events (machine_id, started_at)` — reconstitution de journée
- `machine_telemetry (machine_id, recorded_at)` — séries temporelles
- `production_orders (machine_id, planned_start_at)` — planning
- `customer_orders (due_at)`, `(status)` — commandes à risque
- `inventory_movements (item_id, occurred_at)` — historique article
- `alerts (status, severity)` — centre d'alertes
- `audit_logs (entity_type, entity_id)`, `(occurred_at)` — traçabilité

## Faire évoluer le schéma

```bash
# 1. modifier src/server/db/schema/*.ts
npm run db:generate      # génère drizzle/NNNN_*.sql
npm run db:reset         # en développement uniquement (destructif)
```

Les migrations sont appliquées automatiquement au démarrage. En production,
`APP_AUTO_MIGRATE=false` permet de les piloter depuis la chaîne de
déploiement.
