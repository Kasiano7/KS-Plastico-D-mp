@AGENTS.md

# KS Plastico Demo

Application web interne de pilotage d'une usine de pièces plastiques techniques
destinées aux poids lourds.

L'objectif n'est **pas** de faire un ERP ni un dashboard industriel de plus,
mais de construire progressivement une intelligence d'usine :

> **Données → Informations → Explications → Recommandations → Décisions**

Règle produit fondamentale, valable partout dans le code :

> **L'IA recommande. L'humain décide.**

---

## Démarrage

```bash
npm install
npm run dev
```

Aucune base de données à installer : au premier démarrage, PostgreSQL embarqué
(PGlite) est créé dans `.data/pglite`, les migrations sont appliquées et le jeu
de démonstration est chargé automatiquement.

Comptes de démonstration — mot de passe commun `Demo-9b8d8-2kx8w` :

| Adresse                    | Rôle                     |
| -------------------------- | ------------------------ |
| `direction@demo.example`     | Direction (accès complet)|
| `production@demo.example`    | Responsable de production|
| `atelier@demo.example`       | Chef d'atelier (atelier B)|
| `maintenance@demo.example`   | Responsable maintenance  |
| `rh@demo.example`            | Responsable RH           |
| `stock@demo.example`         | Responsable stock        |
| `operateur@demo.example`     | Opérateur (poste simplifié)|

## Commandes utiles

| Commande               | Effet                                                |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Serveur de développement                              |
| `npm run build`        | Build de production (vérifie aussi les types)         |
| `npm run typecheck`    | `tsc --noEmit`                                        |
| `npm run lint`         | ESLint                                                |
| `npm test`             | Tests des règles métier (Vitest)                      |
| `npm run db:generate`  | Génère une migration à partir du schéma Drizzle       |
| `npm run db:seed`      | Charge le jeu de démonstration si la base est vide    |
| `npm run db:reset`     | **Destructif** — remet la base à zéro et la recharge  |

Pour utiliser un PostgreSQL classique, renseigner `DATABASE_URL` dans
`.env.local` (voir `.env.example`) : même dialecte, mêmes migrations.

---

## Architecture en une page

```
src/
├── app/                     Routes Next.js (App Router, Server Components)
│   ├── (app)/               Application authentifiée (layout + shell)
│   ├── connexion/           Authentification
│   └── api/                 Route handlers (recherche, copilote)
├── components/
│   ├── ui/                  Design system : primitives sans métier
│   ├── factory/             Composants métier (alertes, score, timeline…)
│   └── shell/               Sidebar, topbar, palette de commandes, copilote
├── config/                  Navigation (href ↔ permission)
├── data/                    Référentiels statiques écrits à la main
├── lib/                     Formatage, utilitaires purs
└── server/
    ├── db/                  Schéma Drizzle, client, seed
    │   └── fixtures/        Jeux de maquette — aucun chiffre mesuré
    ├── domain/              RÈGLES MÉTIER PURES (aucune I/O) + tests
    ├── services/            Orchestration : lecture composée, contexte usine
    ├── actions/             Server Actions = seules mutations autorisées
    ├── auth/                Session, RBAC, gardes serveur
    ├── ai/                  AiProvider, copilote
    └── telemetry/           MachineTelemetryProvider (simulé en V1)
```

Sens de dépendance, jamais l'inverse :

```
app → components → lib
app → server/actions → server/services → server/domain → (rien)
                    ↘ server/db
```

Documents détaillés :

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)
- [docs/INDUSTRIAL_INTEGRATION.md](docs/INDUSTRIAL_INTEGRATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)

---

## Règles à respecter impérativement

1. **Aucune logique métier dans le JSX.** Un calcul va dans `server/domain`,
   une composition de lectures dans `server/services`.
2. **Aucune mutation hors Server Action**, et chaque action commence par
   `assertPermission(...)` ou `assertAnyPermission(...)`.
3. **Aucune autorisation côté client.** Masquer un bouton n'est pas une
   sécurité : la page ET l'action revérifient toujours.
   Les droits effectifs viennent de la table `role_permissions`, pas du
   catalogue de code : ne jamais tester un code de rôle en dur (`role ===
   'operateur'`), toujours tester une permission.
4. **Aucun nombre inventé.** Tout chiffre affiché vient d'une mesure ou d'un
   calcul du domaine, et son origine (`measured` / `computed` / `estimated` /
   `forecast`) est affichée avec lui.
5. **L'argent est en centimes, en entiers.** Jamais de flottant monétaire.
6. **Les couleurs ont un sens** : `normal` 🟢, `info` 🟡, `warning` 🟠,
   `critical` 🔴. Le rouge est réservé au réellement critique. Une information
   ne repose jamais sur la couleur seule.
7. **Server Components par défaut.** `'use client'` uniquement quand une
   interaction navigateur l'exige.
8. **Toute mutation écrit au journal d'audit** via `recordAudit`.
9. **Le navigateur ne parle jamais à une machine industrielle.** Voir
   `docs/INDUSTRIAL_INTEGRATION.md`.
10. **Le jeu de démonstration raconte une histoire cohérente.** Ne pas y
    introduire de valeurs aléatoires indépendantes : une presse arrêtée doit
    réellement bloquer un ordre, qui bloque réellement une commande.
11. **Toute Server Action qui écrit commence par la garde démo** :
    `const refused = demoWriteRefusal(); if (refused) return refused;`
    (`src/server/demo/guard.ts`), avant même l'autorisation. Le test
    `demo-guard.test.ts` échoue sinon. Un route handler qui écrit appelle
    `demoWriteRefusalResponse()`. Tout nouveau service sortant (e-mail, SMS,
    IA distante…) doit être coupé quand `isDemoMode()` est vrai.

---

## Mode démonstration publique

Cette copie est la démonstration publique **KS Plastico Demo**, intégrée en
iframe au site vitrine KS Développement. `DEMO_MODE=true` : accès par `/demo`
sans connexion, sélecteur de point de vue (rôles réels), écritures refusées,
services externes coupés, base réinitialisée chaque nuit. Hors de ce mode,
l'application fonctionne normalement. Détails, déploiement et limites :
[README.md](README.md).

---

## État actuel (fin de phase 1)

### Opérationnel

- Authentification, session signée, RBAC serveur résolu en base.
- Administration des rôles : création, modification de la matrice de
  permissions, suppression, affectation aux utilisateurs — avec garde-fous
  contre le verrouillage (`/administration/roles`).
- Control Tower : score de santé calculé, résumé opérationnel, centre d'alertes.
- Alertes : problème → cause → conséquences → impact → recommandation →
  simulation → approbation → **exécution réelle** → audit.
- Parc machines : cartes visuelles (vue d'ensemble, liste, analyse, connexions),
  filtres, courbe d'activité 24 h.
- Fiche machine en neuf onglets — vue d'ensemble, production, cycles, arrêts,
  qualité, consommation, documents, maintenance, historique — avec timeline de
  la journée, TRS, changement d'état et déclaration d'incident.
- Historique machine : journal d'alarmes filtrable (recherche, période, type,
  sévérité, filtres rapides), pagination, tiroir de détail avec corrélation des
  alarmes et impact production, export CSV.
- Commandes : liste, fiche, analyse de faisabilité, création avec réservation
  de stock immédiate.
- Stocks : niveaux, réservations, mouvements, stock prédictif, besoins d'achat.
- Planning : ordonnancement 7 jours par machine, détection de regroupement de moules.
- Personnel : effectifs, compétences, habilitations à échéance, « qui puis-je déplacer ? ».
- Catalogue : pièces, moules, matières, prix de revient calculé, rentabilité.
- Qualité, fournisseurs, analyse/KPI, historique et traçabilité, administration.
- Poste opérateur : ordre en cours, fin de palette avec QR, déclaration de problème.
- Copilote IA : questions ouvertes, explications « pourquoi », mémoire de l'usine.
- Recherche globale et palette de commandes (Ctrl+K).
- Thème clair et sombre partageant la même identité.

### Simulé, volontairement

- Télémétrie machine (`SimulatedTelemetryProvider`) — aucune presse connectée.
- Signaux process (`SimulatedProcessSignalsProvider`) — pressions, températures
  et consommations dérivées de façon déterministe de l'état réel de la presse.
  Affichés avec l'origine « Estimé », jamais « Mesuré ».
- Journal d'alarmes automate (`SimulatedAlarmLogProvider`) — codes E-/I-,
  corrélation des alarmes filles, reproductible pour une machine donnée.
- Copilote (`DemoAiProvider`) — aucun modèle distant, raisonnement déterministe
  sur les données réelles.

Ces trois fournisseurs partagent la même forme d'interface qu'une passerelle
réelle : brancher OPC UA / EUROMAP 77 consistera à fournir une autre
implémentation, sans toucher aux pages ni aux services métier.

### Reste à construire

Voir [docs/ROADMAP.md](docs/ROADMAP.md). Prochaine phase recommandée :
planning interactif (glisser-déposer avec validation serveur) et moteur de
recommandations généré en continu plutôt qu'amorcé par le seed.
