# Simulateur de presses KS Plastico Demo

Application autonome qui simule `PR-59`, `PR-60` et `PR-61`. Elle continue à faire tourner les compteurs côté serveur lorsque la console web est fermée et envoie un lot de télémétrie à KS Plastico Demo toutes les cinq secondes. Chaque presse propose uniquement les moules déclarés compatibles dans KS Plastico Demo.

## Démarrage local

1. Copier `.env.example` vers `.env`.
2. Mettre le même secret dans `MACHINE_GATEWAY_SECRET` ici et dans l'environnement de l'application KS Plastico Demo.
3. Démarrer KS Plastico Demo à la racine avec `npm run dev`.
4. Dans ce dossier, lancer `npm start`.
5. Ouvrir `http://localhost:4100`.

Aucune installation n'est nécessaire : le simulateur utilise uniquement Node.js 20 ou supérieur.

## Déploiement séparé

Déployer ce dossier comme un petit service Node.js et définir :

- `APP_API_URL=https://votre-domaine.example/api/passerelle/telemetrie`
- `MACHINE_GATEWAY_SECRET=<secret partagé>`
- `SIMULATOR_PORT` si la plateforme n'injecte pas déjà `PORT`

Le service n'a besoin que d'un accès HTTPS sortant vers KS Plastico Demo. Le secret n'est jamais envoyé au navigateur du simulateur.

## Suppression

Supprimer le dossier `machine-simulator/`. L'application principale continue de fonctionner et reprend automatiquement sa télémétrie simulée interne lorsqu'aucun relevé récent n'est reçu.
