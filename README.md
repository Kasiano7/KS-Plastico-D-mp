# KS Plastico Demo

Démonstration publique d'une application de pilotage d'usine de pièces
plastiques — production, machines, alertes, qualité, stocks, planning,
copilote IA — éditée par **KS Développement** et présentée sur son site
vitrine, dans la galerie « Nos applications ».

> **Données → Informations → Explications → Recommandations → Décisions**
>
> L'IA recommande. L'humain décide.

Toutes les données sont **fictives** : « Usine de démonstration », clients
« Constructeur poids lourds 1 à 5 », constructeurs de presses A, B et C.

Pile : Next.js 16 · React 19 · TypeScript strict · Tailwind CSS 4 ·
PostgreSQL (PGlite embarqué en local) · Drizzle ORM · Zod · jose · Vitest ·
Playwright.

---

## Démarrer en local

Le site vitrine KS utilise le port 3000 : la démonstration tourne sur le **3001**.

```bash
npm install
npm run dev -- -p 3001
```

Aucune base à installer : PostgreSQL embarqué (PGlite) est créé dans
`.data/pglite`, migré et rempli au premier démarrage.

- **Application normale** — http://localhost:3001 : connexion avec l'un des
  comptes `@demo.example` affichés sur l'écran de connexion (mot de passe
  commun dans `src/server/db/seed.ts`).
- **Mode démonstration** — créer `.env.local` avec `DEMO_MODE=true`, relancer,
  puis ouvrir http://localhost:3001/demo : aucune connexion.

Remettre la base locale à zéro : `npm run db:reset`.

### Tester l'intégration en iframe

`embed-test.html` (à la racine, jamais déployé) imite le site KS : bandeau,
démonstration en plein écran, boutons de largeur 1024 px / 1280 px / pleine.

- avec `next dev` : ouvrir le fichier directement (aucune CSP en développement) ;
- pour la vraie CSP `frame-ancestors`, il faut un build de production et une
  page servie depuis une origine autorisée :

```bash
npm run build
npx next start -p 3001
python -m http.server 3000 --bind ::
```

  (avec `DEMO_MODE=true` et un `AUTH_SECRET` quelconque dans `.env.local`),
  puis ouvrir http://localhost:3000/embed-test.html.

---

## Le mode démonstration (`DEMO_MODE=true`)

Désactivé, il ne change **rien** au fonctionnement normal.

### Accès

- `/demo` ouvre directement le tableau de bord, sans formulaire de connexion
  (pour l'opérateur, son accueil est « Mon poste »).
- **Changement d'utilisateur en haut à droite**, à la place du compte : un
  menu déroulant liste les 7 personnes de l'usine avec leur fonction (Anne
  Laurent — Direction, Jérôme Leroy — Responsable de production, Inès
  Garnier — Chef d'atelier, Hervé Morel — Responsable maintenance, Nathalie
  Colin — Responsable RH, Gilles Simon — Responsable stock, Paul Durand —
  Opérateur). Ce sont de vrais comptes du jeu de démonstration : leurs droits
  sont relus en base, comme pour une session normale (menus, pages, actions).
- Un bandeau « Démonstration · données fictives » reste visible en haut de
  chaque page ; sur « Accès refusé », il porte lui-même le menu des comptes.
- **Administration** : l'onglet reste visible, mais son contenu est grisé et
  inerte sous l'avertissement « Désactivé en mode démo » — personne ne peut
  modifier les accès.
- `/connexion`, `/mot-de-passe` et `/mon-compte` redirigent vers `/demo`.
  Aucune page ne renvoie vers `/connexion`.

### Identité sans cookie tiers

1. Rôle **Direction** par défaut, sans aucun cookie.
2. Le rôle choisi est mémorisé dans un cookie
   `demo_role` — `SameSite=None; Secure; HttpOnly; Partitioned` (CHIPS).
3. Si le navigateur refuse ce cookie, le proxy propage `?role=` (et
   `?embed=1`) de page en page : l'URL porte alors l'utilisateur choisi.

### Intégration (`?embed=1`)

- `frame-ancestors 'self'` + `DEMO_ALLOWED_FRAME_ANCESTORS`
  (par défaut `https://www.ks-developpement.fr http://localhost:3000`) ;
  `X-Frame-Options` est retiré (il ne sait pas lister plusieurs origines).
  Le reste de la CSP est inchangé.
- Les liens sortants s'ouvrent dans un nouvel onglet ; pas de déconnexion ni
  de liens de compte (déjà absents en démonstration).
- Les préférences d'interface (thème, navigation repliée) passent en cookie
  partitionné quand l'application est encadrée.
- Utilisable à partir de **1024 px** de large ; lisible en dessous.

### Données vivantes

- Les dates du jeu de démonstration glissent jusqu'à aujourd'hui à chaque
  démarrage d'instance (`roll-demo-forward.ts`).
- Télémétrie : le fournisseur simulé côté serveur, déjà présent et
  déterministe (cadence ± 4 % chaque minute, page Machines rafraîchie
  automatiquement). Le `machine-simulator` n'est pas utilisé.
- **Chaque nuit à 03:00 UTC**, `/api/cron/demo-reset` réinitialise la base :
  le tableau de bord raconte la même histoire chaque matin, et ce que les
  visiteurs ont laissé (conversations du copilote, compteurs de débit) est
  effacé. **Verrou** : la réinitialisation refuse d'effacer une base qui
  contient un seul compte hors `@demo.example` — une `DATABASE_URL` pointant
  par erreur vers une base réelle n'est donc jamais vidée.

### Non-indexation

`robots.txt` en `Disallow: /`, en-tête `X-Robots-Tag: noindex, nofollow` sur
toutes les réponses (statiques comprises), balise meta `robots`.

---

## Actions désactivées en démonstration

Une garde centrale, `demoWriteRefusal()` (`src/server/demo/guard.ts`), est
appelée en tête de **chaque Server Action qui écrit** ; le test
`src/server/demo/__tests__/demo-guard.test.ts` échoue si une action mutante y
échappe. Les boutons restent visibles et affichent
**« Action désactivée dans la démonstration »**.

| Domaine | Actions refusées |
| --- | --- |
| Alertes et IA | approbation / refus d'une recommandation, prise en charge et clôture d'alerte, « Réévaluer maintenant » |
| Production | changement d'état, création et modification de machine, déclaration d'incident, ordres de fabrication, planning (glisser-déposer, affectation, retrait), palettes, événements qualité |
| Commandes et coûts | création, modification et priorité de commande, modèle de coût |
| Maintenance | planification, clôture et annulation de tâche, résolution d'incident |
| Personnel | création et modification de fiche, activation, absences, habilitations, compétences |
| Documents | dépôt et suppression de documents machine |
| Comptes et administration | connexion, double authentification, mot de passe, utilisateurs, rôles et permissions (page grisée), préférences et abonnements de notification |
| Routes API (403) | import de catalogue (analyse et confirmation), passerelle machines |

**Services coupés**, quelle que soit la configuration : e-mail (Resend), SMS
(Twilio), Web Push, IA distante (OpenAI / Azure — seul le moteur local
répond), passerelle machines, cron d'évaluation des alertes. **Aucun appel
sortant.**

**Reste disponible** (aucune écriture) : navigation, filtres, tris, recherche
globale (Ctrl+K), mémoire des incidents, export CSV de l'historique,
consultation des documents, copilote (moteur local, **10 questions par
minute et par IP**).

---

## Déployer sur Vercel — projet séparé

La démonstration est un **projet Vercel distinct**, avec **sa propre base**.
Elle ne doit jamais partager de base, de clé ni de compte de service avec une
instance réelle.

1. **Projet** — *Add New → Project*, importer le dépôt
   `Kasiano7/KS-Plastico-D-mp`. Framework : Next.js ; la commande de build
   vient de `package.json` (`next build --webpack`, nécessaire à PGlite en
   local et sans effet sur PostgreSQL).
2. **Région des fonctions** — *Settings → Functions → Function Region* :
   Paris (`cdg1`) ou Francfort (`fra1`), au plus près de la base.
3. **Base de données** — *Storage → Create Database → Neon (Postgres)*, région
   **Europe** (Francfort, `aws-eu-central-1`), puis *Connect* au projet :
   `DATABASE_URL` est injectée. Au premier démarrage, les migrations sont
   appliquées et le jeu de démonstration chargé automatiquement.
4. **Variables d'environnement** — voir le tableau ci-dessous, pour
   l'environnement *Production* (et *Preview* si besoin). `DEMO_MODE` est lu
   **au build** (en-têtes, métadonnées) : le définir avant le premier
   déploiement, et redéployer après toute modification.
5. **Déployer**, puis vérifier :
   ```bash
   curl -I https://<domaine-de-la-demo>/demo
   ```
   → `307` vers `/`, `x-robots-tag: noindex, nofollow`,
   `frame-ancestors 'self' https://www.ks-developpement.fr …`, et **pas** de
   `X-Frame-Options`.
6. **Cron** — `vercel.json` déclare déjà `/api/cron/demo-reset` (03:00 UTC)
   et `/api/cron/evaluate-alerts` (neutralisé en démonstration). Vercel
   envoie `Authorization: Bearer <CRON_SECRET>` : la variable doit exister.
   Le plan Hobby autorise des crons quotidiens ; vérifier la limite du nombre
   de crons de l'offre souscrite.
7. **Site vitrine** — intégrer :
   ```html
   <iframe
     src="https://<domaine-de-la-demo>/demo?embed=1"
     title="Démonstration — pilotage d'usine"
     allow="clipboard-write"
     style="width:100%;height:100%;border:0"
   ></iframe>
   ```
   et, sur mobile (sous 1024 px), ouvrir plutôt la démonstration dans un
   nouvel onglet. Si le site est aussi servi sans `www` (sans redirection),
   ajouter cette origine à `DEMO_ALLOWED_FRAME_ANCESTORS`.

### Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DEMO_MODE` | **oui** (`true`) | Active le mode démonstration. Ne jamais l'activer sur une instance qui pilote une vraie usine. |
| `DATABASE_URL` | **oui** sur Vercel | Base Neon **dédiée**, en Europe. PGlite n'est utilisable qu'en local. |
| `AUTH_SECRET` | **oui** | Secret de signature des sessions (64 caractères hexadécimaux) : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Aucune session n'est émise en démonstration, mais l'application l'exige en production dès qu'une session est manipulée. |
| `CRON_SECRET` | **oui** | Protège `/api/cron/demo-reset` (réinitialisation nocturne). Même commande de génération, valeur distincte. |
| `DEMO_ALLOWED_FRAME_ANCESTORS` | non | Origines autorisées à intégrer la démonstration, séparées par des virgules ou des espaces. Défaut : `https://www.ks-developpement.fr http://localhost:3000`. Chaque origine est validée (`http(s)://hôte[:port]`) ; une valeur invalide est ignorée. |
| `NEXT_PUBLIC_APP_URL` | non | URL publique, utilisée dans les liens d'e-mail (aucun e-mail ne part en démonstration). |
| `APP_AUTO_MIGRATE`, `APP_AUTO_SEED` | non | Laisser absentes : migrations et amorçage automatiques. |

**À ne pas définir** sur la démonstration — elles seraient de toute façon
ignorées : `OPENAI_*`, `AZURE_OPENAI_*`, `RESEND_EMAIL_API_KEY`,
`NOTIFICATION_EMAIL_FROM`, `TWILIO_*`, `WEB_PUSH_VAPID_*`,
`MACHINE_GATEWAY_SECRET`.

---

## Limites connues

- **Cookies partitionnés (CHIPS)** : acceptés dans une iframe intersite par
  Chrome et Edge ; Firefox cloisonne de toute façon les cookies tiers. Safari
  et les navigateurs qui bloquent tous les cookies tiers les refusent : la
  démonstration fonctionne alors grâce à `?role=` dans l'URL, mais le thème et
  l'état replié de la navigation ne sont pas conservés d'une page à l'autre.
- **Point de vue dans l'URL** : en repli, le rôle est visible dans l'adresse ;
  le retirer ramène au rôle Direction.
- **Comptes partagés** : tous les visiteurs utilisent les mêmes comptes de
  démonstration. Les conversations du copilote sont enregistrées (pour les
  questions de suivi) jusqu'à la réinitialisation nocturne ; un fil n'est
  lisible qu'avec son identifiant aléatoire, détenu par le navigateur.
- **Réinitialisation nocturne** : quelques secondes d'erreurs possibles pour
  un visiteur connecté à 03:00 UTC.
- **Mobile** : lisible, mais conçu pour 1024 px et plus — le site KS ouvre la
  démonstration dans un nouvel onglet sur mobile.
- **CSP** : appliquée par le build de production uniquement. Avec `next dev`,
  n'importe quelle origine peut encadrer l'application (comportement
  d'origine du projet).
- **Limite de débit du copilote** : par adresse IP (`X-Forwarded-For`, fiable
  derrière Vercel).
- **Tests e2e** : `e2e/personnel.spec.ts` nettoie directement la base et
  n'est exécuté qu'avec PostgreSQL (`DATABASE_URL`) ; avec PGlite, il est
  sauté (le fichier est déjà ouvert par le serveur).
- **Préexistant** : avertissement d'hydratation (formulaire imbriqué) sur
  `/administration` (message en console uniquement ; la page est grisée en démonstration) ; vulnérabilités
  signalées par `npm audit` sur des dépendances, non traitées ici.

---

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev -- -p 3001` | Serveur de développement |
| `npm run build` | Build de production (vérifie aussi les types) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires et règles métier (Vitest) |
| `npx playwright test` | Tests de bout en bout : projet `app` (port 3001) et projet `demo` (port 3002, `DEMO_MODE=true`, base et build séparés) |
| `npm run db:reset` | **Destructif** — réinitialise et recharge la base |

## Où vit le mode démonstration

| Fichier | Rôle |
| --- | --- |
| `src/config/demo.ts` | Constantes : rôles, paramètres, chemins redirigés, origines autorisées |
| `src/server/demo/proxy.ts` | Résolution du point de vue, cookies, propagation d'URL, redirections, `robots.txt` |
| `src/server/demo/guard.ts` | Garde centrale des écritures |
| `src/server/demo/identity.ts` | Rôle et affichage intégré de la requête courante |
| `src/server/demo/reset.ts` + `src/app/api/cron/demo-reset/` | Réinitialisation nocturne |
| `src/components/shell/demo-bar.tsx` | Bandeau de démonstration |
| `src/components/shell/demo-account-switcher.tsx` + `src/server/demo/accounts.ts` | Menu de changement d'utilisateur (en haut à droite) |
| `src/app/(app)/administration/layout.tsx` | Administration grisée en démonstration |
| `src/components/shell/embed-link-policy.tsx` | Liens sortants en nouvel onglet (`?embed=1`) |
| `docs/captures/` | Captures de l'intégration (iframe, rôles, 1024 px, mobile) |

## Documentation

`CLAUDE.md` pour prendre le projet en main, puis `docs/` :
[architecture](docs/ARCHITECTURE.md) ·
[modèle de données](docs/DATA_MODEL.md) ·
[design system](docs/DESIGN_SYSTEM.md) ·
[IA](docs/AI_ARCHITECTURE.md) ·
[intégration industrielle](docs/INDUSTRIAL_INTEGRATION.md) ·
[sécurité](docs/SECURITY.md) ·
[roadmap](docs/ROADMAP.md) ·
[décisions](docs/DECISIONS.md)
