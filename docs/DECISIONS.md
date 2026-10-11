# Décisions d'architecture

Chaque entrée : contexte, décision, conséquences. Les décisions ne sont pas
réécrites ; elles sont remplacées par une nouvelle entrée qui les supersède.

---

## ADR-001 — Next.js App Router avec Server Components par défaut

**Contexte.** L'application affiche des tableaux industriels volumineux à des
utilisateurs répartis entre bureaux et ateliers, sur des postes parfois anciens.

**Décision.** Next.js 16, App Router, Server Components par défaut. `'use client'`
uniquement quand une interaction navigateur l'exige (formulaires, tiroirs,
raccourcis clavier).

**Conséquences.** Les données ne traversent pas le réseau en JSON pour être
re-rendues ; l'autorisation est vérifiée là où les données sont lues ; le bundle
client reste réduit. En contrepartie, chaque composant interactif doit être
isolé explicitement.

---

## ADR-002 — Drizzle ORM plutôt qu'un ORM à runtime lourd

**Contexte.** Le modèle comporte une trentaine de tables et des requêtes
analytiques ; le schéma doit rester lisible et typé de bout en bout.

**Décision.** Drizzle ORM avec `drizzle-kit` pour des migrations SQL versionnées.

**Conséquences.** Le schéma TypeScript est la source de vérité ; les requêtes
restent proches du SQL et optimisables ; aucun moteur de requêtes opaque. Il
faut en revanche écrire soi-même les jointures complexes.

---

## ADR-003 — PGlite par défaut, PostgreSQL dès qu'une URL est fournie

**Contexte.** Le projet doit pouvoir être lancé immédiatement, sans installer ni
PostgreSQL ni Docker, tout en ciblant PostgreSQL en production.

**Décision.** `getDb()` choisit PGlite (PostgreSQL compilé en WebAssembly,
stocké dans `.data/pglite`) si `DATABASE_URL` est absente, sinon
`node-postgres`. Mêmes migrations, même dialecte.

**Conséquences.** `npm run dev` suffit ; le développement local ne diverge pas de
la production. Limite : PGlite est mono-processus, donc réservé au
développement et à la démonstration.

**Alternative écartée.** SQLite en développement : dialecte différent, donc
risque de divergence silencieuse.

---

## ADR-004 — Session signée ne contenant que l'identifiant

**Contexte.** Les droits doivent pouvoir être révoqués immédiatement.

**Décision.** Le cookie ne porte que `sub`. Rôle et permissions sont relus en
base à chaque requête, mémoïsés pour la durée de celle-ci.

**Conséquences.** Une révocation prend effet au rafraîchissement suivant, sans
attendre l'expiration d'un jeton. Coût : une requête supplémentaire par
requête HTTP, négligeable à l'échelle d'une usine.

**Alternative écartée.** Encoder les permissions dans le JWT : plus rapide, mais
un droit retiré resterait actif jusqu'à expiration.

---

## ADR-005 — Authentification maison plutôt qu'une bibliothèque généraliste

**Contexte.** Besoin réel : identifiant, mot de passe, un rôle, un périmètre
atelier. Aucun fournisseur externe, aucun SSO à ce stade.

**Décision.** `jose` pour la signature, `bcryptjs` pour le hachage, session
maison en une centaine de lignes lisibles.

**Conséquences.** Aucune abstraction à contourner, comportement entièrement
compris. À reconsidérer le jour où un SSO d'entreprise sera exigé.

---

## ADR-006 — L'argent est un entier en centimes

**Contexte.** Les impacts financiers sont additionnés, ventilés et comparés.

**Décision.** Toutes les valeurs monétaires sont des `integer` en centimes, en
base comme dans le domaine. Le formatage en euros n'existe qu'à l'affichage.

**Conséquences.** Aucune dérive d'arrondi, totaux exacts, comparaisons fiables.
Les colonnes s'appellent explicitement `*_cents`.

---

## ADR-007 — Domaine pur, sans I/O

**Contexte.** Les règles métier (réservation, risque, TRS, rentabilité) doivent
être vérifiables et réutilisables par l'UI comme par l'IA.

**Décision.** `src/server/domain/` ne contient que des fonctions pures. Aucun
import de Next, Drizzle ou React. Les services fournissent les données, le
domaine calcule.

**Conséquences.** 67 tests s'exécutent en moins d'une seconde sans base de
données. Le prix : les services doivent assembler les entrées explicitement.

---

## ADR-008 — Une seule photographie de l'usine, partagée avec l'IA

**Contexte.** Risque majeur : que le copilote et l'interface donnent deux
chiffres différents pour la même réalité.

**Décision.** `getFactoryContext()` construit un objet unique consommé par la
Control Tower, les pages de synthèse et le copilote. Mémoïsé par `React.cache`.

**Conséquences.** Cohérence garantie par construction. Le contexte doit rester
raisonnable en taille ; les vues très détaillées gardent leurs requêtes propres.

---

## ADR-009 — Aucune exécution sans ligne d'approbation

**Contexte.** « L'IA recommande, l'humain décide » doit être une propriété du
système, pas une intention.

**Décision.** Une recommandation ne peut passer à `executed` que si une ligne
`approvals` nominative existe. `executeRecommendation()` refuse tout type
d'action inconnu et revérifie les invariants métier (compatibilité
pièce/machine, existence des entités).

**Conséquences.** Ajouter un type d'action est explicite et revu. Une
recommandation approuvée mais inapplicable reste `approved`, avec un message
expliquant pourquoi.

---

## ADR-010 — Quatre niveaux de sévérité, définis dans le domaine

**Contexte.** Le rouge doit rester rare pour rester crédible.

**Décision.** `normal` / `info` / `warning` / `critical`. Les seuils vivent dans
le domaine (`healthSeverity`, `riskSeverity`, `machineSeverity`), jamais dans les
composants. Chaque badge porte aussi un symbole.

**Conséquences.** Impossible d'avoir deux oranges différents ; l'information ne
dépend jamais de la couleur seule. Changer un seuil se fait à un seul endroit.

---

## ADR-011 — Thème résolu côté serveur depuis un cookie

**Contexte.** Le script bloquant habituel provoque un avertissement React et
mélange rendu serveur et rendu client.

**Décision.** La classe `dark` est posée par le layout racine d'après un cookie ;
la bascule écrit le cookie et applique la classe immédiatement.

**Conséquences.** Aucun scintillement, aucune divergence d'hydratation, aucun
script inline. Le thème par défaut est le thème clair, conformément au cahier
des charges.

---

## ADR-012 — Toute mutation passe par une Server Action

**Contexte.** Il faut un point de contrôle unique pour l'autorisation, la
validation et l'audit.

**Décision.** Les écritures sont exclusivement des Server Actions. Les route
handlers `api/` sont en lecture seule.

**Conséquences.** Le copilote IA n'a structurellement aucun chemin vers une
mutation. Chaque action suit la même séquence : autoriser, valider, lire,
calculer, écrire, auditer, revalider.

---

## ADR-013 — Le jeu de démonstration raconte une histoire

**Contexte.** Des nombres aléatoires indépendants rendraient l'application
incompréhensible et masqueraient les incohérences.

**Décision.** Le seed construit une situation causale : la Presse 64 est
réellement arrêtée, cet arrêt suspend réellement l'OF-2411, qui appartient
réellement à la commande #5842, dont le risque est **recalculé** à partir de la
capacité restante.

**Conséquences.** Les alertes seed ne figent plus de pourcentage : le chiffre
affiché est toujours recalculé, il ne peut donc pas devenir faux. Contrepartie :
modifier le seed demande de vérifier la cohérence de l'ensemble.

---

## ADR-015 — Les rôles sont administrables, les permissions viennent de la base

**Contexte.** Les 7 rôles livrés étaient figés à deux endroits : un enum
PostgreSQL sur `roles.code`, et une table `ROLE_PERMISSIONS` en TypeScript qui
servait de source de vérité à l'exécution. La direction ne pouvait donc ni créer
un rôle, ni ajuster un périmètre, sans redéploiement.

**Décision.**

1. `roles.code` devient du texte libre ; l'enum `role_code` est supprimé.
2. Les rôles portent `is_system` : les rôles livrés restent modifiables mais ne
   peuvent être ni supprimés ni renommés techniquement.
3. À l'exécution, les permissions sont lues dans `role_permissions` à chaque
   requête. `ROLE_PERMISSIONS` en code ne définit plus que la **configuration
   initiale** chargée par le seed.
4. `SessionUser.role` devient `string` : plus aucune logique applicative ne peut
   dépendre d'une liste fermée de rôles.

**Conséquences.** Un rôle créé dans l'interface est immédiatement opposable :
navigation, pages et actions serveur le respectent sans redéploiement. Une
permission retirée prend effet à la navigation suivante. Coût : une requête
supplémentaire par requête HTTP, mémoïsée pour la durée de celle-ci.

Effet de bord assumé : les tests de rôle par code littéral disparaissent. La
redirection de l'opérateur vers son poste teste désormais les permissions
(`workstation:use` sans `dashboard:read`), ce qui vaut aussi pour un rôle créé
sur mesure.

---

## ADR-016 — Les garde-fous d'administration sont des règles de domaine

**Contexte.** Rendre les rôles modifiables crée un risque nouveau et sérieux :
se verrouiller hors de l'application. Un clic malheureux sur `admin:write`
suffirait à rendre l'administration inaccessible à tout le monde,
définitivement.

**Décision.** Les protections vivent dans `src/server/domain/roles.ts`, en
fonctions pures testées, et non dans l'interface :

- on ne peut pas retirer l'administration à son propre rôle ;
- une modification ne peut pas laisser l'application sans **aucun rôle
  administrateur occupé par au moins un utilisateur actif** ;
- un rôle système ne peut être ni supprimé ni renommé techniquement ;
- un rôle encore attribué ne peut pas être supprimé ;
- un changement de rôle utilisateur est soumis aux mêmes règles.

**Conséquences.** Les mêmes règles s'appliquent quelle que soit la voie
d'entrée, l'interface n'a plus qu'à afficher les refus. Un rôle administrateur
sans utilisateur n'est délibérément **pas** compté comme filet de sécurité : un
droit que personne ne porte ne protège de rien.

---

## ADR-014 — Les ruptures ne concernent que ce qui s'achète

**Contexte.** Projeter une rupture sur un produit fini produisait des alertes
massives et fausses : un produit fini se réapprovisionne par la production.

**Décision.** La projection de rupture ne s'applique qu'aux articles achetés
(matières, palettes, caisses, consommables, outillage, pièces détachées). Pour
les produits finis, le manque est traité comme un risque de retard de commande.

**Conséquences.** Le score « stocks » redevient lisible, et l'alerte palettes —
le vrai problème logistique — n'est plus noyée.
