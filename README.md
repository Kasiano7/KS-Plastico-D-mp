# KS Plastico Demo

Pilotage temps réel d'une usine de pièces plastiques techniques pour poids lourds.

> **Données → Informations → Explications → Recommandations → Décisions**
>
> L'IA recommande. L'humain décide.

## Démarrer

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000. Aucune base de données à installer : PostgreSQL
embarqué (PGlite) est créé au premier démarrage, migré et rempli d'un jeu de
démonstration cohérent.

Se connecter avec `direction@demo.example` / `Demo-9b8d8-2kx8w`. La liste complète des
comptes de démonstration est affichée sur l'écran de connexion.

## Ce que l'on voit en dix secondes

L'écran d'accueil répond aux quatre questions d'un directeur :

1. **Comment va mon usine ?** — score de santé et sous-scores expliqués
2. **Qu'est-ce qui ne va pas ?** — centre d'alertes hiérarchisé
3. **Combien cela me coûte ?** — impact financier de chaque problème
4. **Que dois-je faire ?** — recommandations à valider

## Commandes

| Commande              | Effet                                              |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | Serveur de développement                            |
| `npm run build`       | Build de production                                 |
| `npm test`            | Tests des règles métier                             |
| `npm run typecheck`   | Vérification des types                              |
| `npm run lint`        | ESLint                                              |
| `npm run db:reset`    | **Destructif** — réinitialise et recharge la base   |

## PostgreSQL classique

Renseigner `DATABASE_URL` dans `.env.local` (voir `.env.example`). Mêmes
migrations, même dialecte. `AUTH_SECRET` est obligatoire en production.

## Copilote IA et import du catalogue

Le moteur local reste disponible sans service externe. Pour activer les questions
libres et la lecture de photos, renseigner soit `OPENAI_API_KEY`, soit l'ensemble
des variables `AZURE_OPENAI_*` décrites dans `.env.example`.

L'écran `/catalogue/import` accepte XLSX, CSV, JPG, PNG et WEBP. Il prépare les
références, bloque les doublons et demande toujours une validation humaine avant
l'écriture en base. Les fichiers sont traités en mémoire et ne sont pas conservés
par KS Plastico Demo.

## Pile technique

Next.js 16 · React 19 · TypeScript strict · Tailwind CSS v4 · PostgreSQL ·
Drizzle ORM · Zod · jose · Vitest

## Simulateur de presses

Le dossier [`machine-simulator/`](machine-simulator/) contient une application
Node.js autonome pour piloter trois presses virtuelles, injecter des arrêts et
des défauts, puis transmettre la télémétrie à KS Plastico Demo. Il peut être déployé ou
supprimé indépendamment de l'application principale.

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
