# Architecture

## 1. Intention

KS Plastico Demo doit devenir la **source de vérité unique de l'usine**. Toute décision
d'architecture découle de trois exigences :

1. **Un chiffre affiché doit être explicable.** Il vient d'une donnée mesurée ou
   d'un calcul dont le code est lisible et testé.
2. **Une modification à impact réel exige une décision humaine tracée.**
3. **Le système doit accueillir sans réécriture** la télémétrie machine, un
   moteur d'ordonnancement et un modèle de langage.

## 2. Couches

```
┌──────────────────────────────────────────────────────────────┐
│ UI            src/app, src/components                        │
│               Server Components par défaut.                  │
│               Aucun calcul métier, aucun accès base.         │
├──────────────────────────────────────────────────────────────┤
│ Application   src/server/actions   (écriture)                │
│               src/server/services  (lecture composée)        │
│               Autorisation, transaction, audit, revalidation │
├──────────────────────────────────────────────────────────────┤
│ Domaine       src/server/domain                              │
│               Fonctions PURES. Aucune I/O, aucun import      │
│               de Next, de Drizzle ou de React.               │
├──────────────────────────────────────────────────────────────┤
│ Données       src/server/db (Drizzle + PostgreSQL)           │
├──────────────────────────────────────────────────────────────┤
│ Intégrations  src/server/ai, src/server/telemetry            │
│               Interfaces + implémentations remplaçables      │
└──────────────────────────────────────────────────────────────┘
```

Le domaine est le cœur : il ne connaît ni la base, ni le web. C'est ce qui rend
les règles testables en millisecondes et réutilisables par l'IA comme par l'UI.

### Modules de domaine

| Module           | Responsabilité                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `permissions.ts` | Catalogue RBAC, rôles, `can` / `canAny`                            |
| `health-score.ts`| Score de santé, sous-scores, explication des variations            |
| `inventory.ts`   | Disponible, réservation, projection de stock, suggestion d'achat   |
| `orders.ts`      | Progression, risque de retard, analyse de faisabilité              |
| `costing.ts`     | Prix de revient, rentabilité, impact financier d'un arrêt          |
| `machines.ts`    | TRS/OEE, classement des machines, optimisation des moules          |
| `staffing.ts`    | Habilitations, couverture d'équipe, mobilité inter-ateliers        |
| `math.ts`        | `clamp`, `round`, `safeDivide` — jamais de `NaN` en production     |

## 3. Le contexte usine

`src/server/services/factory-context.ts` construit **une seule photographie
structurée** de l'usine : production, ateliers, machines, commandes, stocks,
personnel, alertes, score de santé.

Cette photographie est consommée par :

- la Control Tower,
- les pages machines, production, stocks, analyse,
- **le copilote IA**.

Conséquence directe : l'IA et l'interface ne peuvent pas raconter deux histoires
différentes, puisqu'elles lisent le même objet. Le contexte est mémoïsé par
`React.cache` : plusieurs composants d'une même requête le partagent sans
requêter la base plusieurs fois.

## 4. Écriture : le chemin unique

```
Formulaire (client)
  → Server Action  ('use server')
      1. assertPermission / assertAnyPermission
      2. validation Zod du FormData
      3. lecture de l'état courant
      4. règle de domaine (fonction pure)
      5. écriture base
      6. recordAudit(...)
      7. revalidatePath(...)
  → nouveau rendu serveur
```

Aucune autre voie n'écrit en base. Les route handlers `api/` sont en **lecture
seule** (recherche, copilote) : le copilote ne peut structurellement pas
modifier l'usine.

## 5. Cycle recommandation → exécution

C'est la traduction technique de « l'IA recommande, l'humain décide » :

```
recommendations.status :
  proposed → simulated → approved | rejected → executed

approvals   : qui a décidé, quand, avec quelle justification
simulations : baseline vs projeté, probabilité de succès
audit_logs  : trace immuable de l'exécution
```

`decideRecommendation()` refuse d'exécuter une action dont le type est inconnu,
et refuse un basculement de machine si la compatibilité pièce/machine n'est pas
déclarée. Une recommandation approuvée mais inapplicable reste `approved` et le
message explique pourquoi elle n'a pas été appliquée.

## 6. Base de données

- PostgreSQL, accédé par Drizzle ORM.
- Migrations versionnées dans `drizzle/`, générées par `drizzle-kit`.
- Deux pilotes derrière la même API :
  - **PGlite** (défaut) : PostgreSQL embarqué en fichier, zéro installation ;
  - **node-postgres** dès qu'une `DATABASE_URL` est fournie.

Le même SQL, les mêmes migrations, le même dialecte dans les deux cas : le
développement local ne diverge pas de la production.

Séparation volontaire des natures de données (§44 du cahier des charges) :

| Nature      | Tables                                              | Volume      |
| ----------- | --------------------------------------------------- | ----------- |
| Métier      | commandes, produits, stocks, employés…              | faible      |
| Événements  | `machine_events`, `inventory_movements`, `audit_logs`| moyen       |
| Télémétrie  | `machine_telemetry`                                  | très élevé  |

La télémétrie n'est jamais jointe naïvement aux données métier : elle est lue
par plage temporelle indexée `(machine_id, recorded_at)`.

## 7. Performance

- Server Components : les tableaux volumineux ne traversent pas le réseau en JSON.
- Requêtes groupées : le contexte usine fait quelques requêtes larges plutôt que
  N+1 requêtes par ligne.
- Index sur tous les axes de lecture réels (statut, échéance, machine + date).
- `React.cache` pour la mémoïsation intra-requête.
- Les pages authentifiées sont `force-dynamic` : afficher un score de santé mis
  en cache serait un mensonge.

## 8. Points d'extension prévus

| Extension                       | Où brancher                                        |
| ------------------------------- | -------------------------------------------------- |
| Modèle de langage               | `src/server/ai/index.ts` — ajouter un `AiProvider` |
| Passerelle machine              | `src/server/telemetry/` — implémenter l'interface  |
| Ordonnanceur                    | `src/server/domain/machines.ts` + nouveau service   |
| Nouveau type d'action approuvée | `executeRecommendation()` — un `case` de plus       |
| Nouveau rôle                    | `src/server/domain/permissions.ts` uniquement       |
