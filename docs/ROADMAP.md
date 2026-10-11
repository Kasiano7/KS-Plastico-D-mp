# Roadmap

## Les sept niveaux de maturité

| Niveau | Nom          | Question à laquelle l'usine sait répondre     | État        |
| ------ | ------------ | --------------------------------------------- | ----------- |
| 1      | Numériser    | Où est l'information ?                        | ✅ Phase 1  |
| 2      | Centraliser  | Tout parle-t-il de la même chose ?             | ✅ Phase 1  |
| 3      | Automatiser  | Les calculs se font-ils tout seuls ?           | 🟡 Partiel  |
| 4      | Comprendre   | Pourquoi ce chiffre ?                          | 🟡 Partiel  |
| 5      | Anticiper    | Que va-t-il se passer ?                        | 🟠 Amorcé   |
| 6      | Simuler      | Et si je faisais autrement ?                   | 🟠 Amorcé   |
| 7      | Recommander  | Que dois-je faire ?                            | 🟠 Amorcé   |

---

## Phase 0 — Fondations ✅

Architecture, modèle de données, design system, RBAC, routes, documentation.

## Phase 1 — Shell + Control Tower ✅

- Authentification, session signée, 7 rôles, 31 permissions vérifiées serveur.
- Sidebar repliable, barre supérieure, recherche globale, palette `Ctrl+K`,
  thème clair et sombre.
- Control Tower : les quatre questions, score de santé, résumé opérationnel,
  ateliers, commandes à risque, état des machines.
- Centre d'alertes complet : cause, conséquences, impact, recommandation,
  simulation, approbation, **exécution réelle**, audit.
- Pages métier alimentées par les données seed : machines et fiche machine,
  commandes et fiche commande, création avec réservation, stocks et stock
  prédictif, planning 7 jours, personnel, catalogue, qualité, fournisseurs,
  analyse, historique, administration.
- Poste opérateur : ordre en cours, fin de palette avec QR, déclaration de problème.
- Copilote IA hors ligne raisonnant sur le contexte usine.
- 67 tests de règles métier.

---

## Phase 2 — Planning interactif et ordonnancement

**Objectif : le planning devient l'outil de travail quotidien.**

- Glisser-déposer sur le Gantt, avec **toutes** les validations côté serveur
  (compatibilité pièce/machine, moule disponible, capacité, personnel).
- Détection automatique et continue des regroupements de moules, avec gain
  chiffré en heures, en pièces et en euros.
- Verrouillage optimiste pour éviter deux réordonnancements concurrents.
- Vues jour / semaine / mois, filtres par atelier et par commande.
- Charge personnel superposée à la charge machine.

## Phase 3 — Moteur de recommandations permanent

**Objectif : les alertes naissent des données, pas du seed.**

- Tâche périodique évaluant en continu : arrêts, ruptures projetées, commandes à
  risque, habilitations à échéance, dérives de cadence.
- Génération automatique des alertes avec impact financier calculé.
- Recommandations produites par le domaine, simulées avant proposition.
- Déduplication et regroupement des alertes récurrentes.
- Notifications par rôle, avec accusé de prise en charge.

## Phase 4 — Terrain et traçabilité complète

**Objectif : le papier disparaît de l'atelier.**

- Scan QR réel (caméra) sur tablette et smartphone.
- Mode hors ligne pour le poste opérateur, avec file d'attente de synchronisation.
- Déclaration qualité au poste, photo à l'appui.
- Étiquettes de palette imprimables.
- Bons de livraison et préparation d'expédition.

## Phase 5 — Télémétrie machine réelle

**Objectif : la cadence n'est plus déclarée, elle est mesurée.**

- Passerelle locale sécurisée, OPC UA ou Euromap.
- Ingestion par lots, idempotente, avec tampon hors ligne.
- Dérivation automatique des événements machine.
- TRS en temps réel, détection d'arrêt sans intervention humaine.
- Élagage et agrégation des séries temporelles.

## Phase 6 — Intelligence avancée

**Objectif : anticiper au lieu de constater.**

- Fournisseur LLM branché derrière `AiProvider`, contexte structuré.
- Moteur what-if généralisé : « et si je déplaçais cette commande ? ».
- Prévision de cadence par référence et par machine à partir de l'historique.
- Maintenance prédictive fondée sur les cycles et les incidents.
- Analyse de rentabilité par client, par famille et par période.

## Phase 7 — Ouverture

- API pour l'ERP comptable et les EDI clients.
- Portail client : suivi de commande en lecture seule.
- Application mobile dédiée aux responsables.
- Tableaux de bord configurables par rôle.

---

## Dette technique assumée

| Sujet                                             | Quand la traiter |
| ------------------------------------------------- | ---------------- |
| Alertes et recommandations amorcées par le seed   | Phase 3          |
| Capacité machine estimée à 45 % de disponibilité  | Phase 2          |
| Pas de tests end-to-end                           | Phase 2          |
| Limitation de débit absente                       | Avant production |
| Modèle de coût unique, non versionné par période  | Phase 6          |
| Ordre de fabrication créé manuellement            | Phase 2          |
