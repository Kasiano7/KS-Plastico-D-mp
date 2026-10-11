# Intégration industrielle

## Règle absolue

> **Le navigateur ne communique JAMAIS directement avec une machine
> industrielle. Aucune presse n'est exposée sur Internet.**

Toute donnée machine transite par une passerelle locale, puis par le backend.
Cette règle n'est pas négociable : elle protège l'outil de production.

## Chaîne cible

```
Presse (constructeurs A, B, C…)
      │  protocole industriel : OPC UA, Euromap 63/77, MQTT, contact sec
      ▼
Passerelle locale sécurisée            ← dans l'usine, réseau isolé
      │  agrégation, tampon hors ligne, normalisation
      │  HTTPS sortant + secret dédié à la passerelle
      ▼
API KS Plastico Demo  (ingestion, écriture seule)
      ▼
PostgreSQL   machine_telemetry · machine_events
      ▼
Application  timeline, TRS, alertes
      ▼
IA           contexte usine
```

Points structurants :

- Le réseau machine reste **isolé**. Seule la passerelle a un accès sortant.
- La connexion est **sortante** : aucun port entrant ouvert côté usine.
- La passerelle **tamponne** : une coupure réseau ne perd pas de production.
- Elle **normalise** : le backend ne connaît pas les dialectes constructeurs.

## Abstraction en place

`src/server/telemetry/provider.ts` définit :

```ts
interface MachineTelemetryProvider {
  read(machineId: string): Promise<TelemetryReading | null>;
  readMany(machineIds: readonly string[]): Promise<TelemetryReading[]>;
}
```

Deux implémentations coexistent :

- `DatabaseTelemetryProvider` lit les relevés récents reçus par la route
  `POST /api/passerelle/telemetrie` ;
- `SimulatedTelemetryProvider` ne se connecte à rien et sert automatiquement de
  secours pour les machines sans relevé récent.

Le fournisseur simulé dérive ses valeurs des données de l'application (état
machine, ordre en cours, cadence planifiée) avec une variation déterministe de
±4 %. Le fournisseur de passerelle considère par défaut une source hors ligne
après 30 secondes, délai configurable avec
`MACHINE_TELEMETRY_MAX_AGE_SECONDS`.

L'interface est consommée par la fiche machine (`/machines/[id]`, encart
« Télémétrie »). Brancher une passerelle ne touchera ni cette page ni les
services métier : seule `getTelemetryProvider()` changera.

## Deux natures de données

| Nature       | Table               | Fréquence      | Usage                          |
| ------------ | ------------------- | -------------- | ------------------------------ |
| Événement    | `machine_events`    | à chaque état  | Timeline, disponibilité, alertes|
| Télémétrie   | `machine_telemetry` | seconde/minute | Cadence, temps de cycle, TRS   |

La télémétrie n'est **jamais** modélisée comme de la donnée CRUD : elle est lue
par plage temporelle indexée `(machine_id, recorded_at)`, agrégée, puis élaguée.
Les données métier ne dépendent pas de sa disponibilité.

## API de passerelle disponible

La route `POST /api/passerelle/telemetrie` est authentifiée par le secret
`MACHINE_GATEWAY_SECRET`, distinct des comptes utilisateurs. Elle :

- accepte des lots de 1 à 50 relevés, avec un maximum de 64 Kio ;
- rejette les horodatages décalés de plus de cinq minutes ;
- déduplique sur `(machine_id, recorded_at)` ;
- alimente `machine_telemetry`, les compteurs de l'ordre en cours et les
  changements d'état de `machine_events` ;
- transforme un nouvel arrêt brutal en incident, alerte et notifications.

Le dossier autonome `machine-simulator/` implémente une passerelle de
démonstration pour les presses `PR-59`, `PR-60` et `PR-61`. La passerelle peut
également sélectionner le moule monté parmi les compatibilités déclarées dans
`mold_machines` ; le backend refuse toute association incompatible.

## Ce qui n'est pas fait, volontairement

- Client OPC UA réel.
- Connexions réelles aux presses des constructeurs A, B et C.
- Maintenance prédictive.
- Ordonnancement autonome.

Les interfaces et le modèle de données les accueillent ; les implémentations
viendront lorsque la passerelle physique existera.

## Sécurité de la passerelle

- Secret dédié, révocable, distinct des sessions utilisateur.
- TLS obligatoire, certificat vérifié.
- Aucun ordre descendant vers la machine en V1 : la passerelle **lit**.
- Journalisation des lots ingérés (horodatage, machine, volume).
- Tout écart de format est rejeté et tracé, jamais deviné.
