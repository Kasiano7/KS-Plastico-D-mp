# Architecture IA

## Règle fondatrice

> **L'IA recommande. L'humain décide.**

Elle n'est pas seulement écrite dans l'interface : elle est appliquée par la
structure du code. Le copilote est accessible en **lecture seule** ; toute
modification passe par le cycle recommandation → simulation → approbation →
exécution → audit.

## Séparation lecture / modification

| L'IA peut librement                          | L'IA ne peut jamais                          |
| -------------------------------------------- | -------------------------------------------- |
| analyser, comparer, détecter, rechercher     | modifier le planning                         |
| expliquer un écart et le ventiler par cause  | déplacer une commande                        |
| calculer un impact, projeter un stock        | affecter un opérateur                        |
| proposer une action et la simuler            | déclencher un achat                          |

Techniquement : `POST /api/copilote` ne fait qu'appeler `askFactory()`. Le
provider distant choisit ensuite des outils de lecture explicitement exposés
pour la session. Aucune écriture n'est atteignable depuis ce chemin.

## Composants

```
GPT-5.6 Terra             toujours appelé en premier
    │  tool calling ciblé, sans photographie globale dans le prompt
    ▼
AiToolRegistry            ai/tools.ts
    │  permissions effectives + périmètre atelier + minimisation
    ▼
Services / domaine        factory-context.ts + calculs déterministes
    │
    ├─ réponse Terra si fiable
    └─ GPT-5.6 Sol si Terra demande une analyse complexe et passe les garde-fous
    ▼
AiAnswer                  réponse contractuelle
    │  summary · facts[origin] · breakdown · actions · confidence · sources
    ▼
UI                        CopilotPanel (tiroir) · CopilotConsole (page /ia)

RecommendationEngine      recommandations persistées, alimentées par le domaine
SimulationEngine          simulations attachées, baseline vs projeté
```

## Le contrat `AiAnswer`

C'est le point central de l'architecture : quel que soit le fournisseur, la
réponse doit contenir

- `summary` — une à quatre phrases lisibles telles quelles ;
- `facts[]` — chaque fait avec son **origine** :
  `measured` · `computed` · `estimated` · `forecast` ;
- `breakdown[]` — la ventilation « pourquoi » quand la question porte sur une cause ;
- `actions[]` — des liens vers l'application, jamais des mutations ;
- `confidence` — 0 à 1 ;
- `sources[]` — les données mobilisées.

Un fournisseur incapable de justifier un chiffre ne doit pas le produire.

## Fournisseur de démonstration

`DemoAiProvider` n'est pas un faux chatbot : il raisonne réellement sur le
contexte usine construit depuis la base. Aucun chiffre n'est inventé.

Intentions reconnues :

| Intention      | Déclencheurs                              | Réponse                                    |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| `overview`     | « comment va l'usine »                    | Score, production, ateliers, risques        |
| `why_workshop` | « pourquoi … atelier … objectif »         | Écart ventilé par cause, en minutes perdues |
| `orders`       | commande, retard, livraison, `#1234`      | Risque, avancement, palettes, reste à faire |
| `inventory`    | stock, palette, rupture, matière          | Physique, réservé, disponible, couverture   |
| `machines`     | presse, arrêt, TRS, défaut                | État, durée, TRS, production du jour        |
| `staffing`     | personnel, absence, habilitation, déplacer| Effectif, absences, habilitations à échéance|
| `financial`    | coût, impact, euro, marge                 | Impact cumulé, poste le plus lourd          |
| `memory`       | « déjà rencontré », incident similaire    | Recherche dans les incidents historisés     |

L'intention `financial` respecte le RBAC : sans `finance:read`, le copilote
refuse explicitement plutôt que de masquer discrètement.

## Fonction « pourquoi ? »

L'application ne se contente pas d'afficher `Atelier B : 72 %`. Elle répond :

```
Atelier B est à 72 % de son objectif, soit 580 pièces manquantes.
L'écart s'explique principalement par les arrêts machines (2 h 06 perdues).

Pourquoi
  Arrêts machines                    69 %  · 2 h 06
  Changements de série et réglages   31 %  · 57 min
```

Les pourcentages sont pondérés par le **temps réellement perdu**, lu dans
`machine_events`. Ce ne sont pas des poids arbitraires.

## Mémoire de l'usine

Les incidents conservent symptôme, cause racine, solution appliquée et
mots-clés. Le copilote y recherche par mots significatifs :

> — Avons-nous déjà rencontré ce problème d'alimentation matière ?
> — Oui. INC-2025-104, il y a 300 jours : lot de PP présentant un taux de fines
>   trop élevé, provoquant un pontage dans la trémie. Solution appliquée :
>   changement de lot, nettoyage de trémie, pose d'un vibreur.

C'est la fonction qui conserve le savoir industriel au-delà des départs.

## Pseudonymisation IA (« AI Privacy Layer »)

> OpenAI ne doit connaître que ce dont il a strictement besoin pour effectuer
> son analyse. Ni le nom, ni le prénom, ni le matricule d'un salarié — qui
> reste un identifiant permanent interne — ne lui sont transmis.

Le matricule (`employees.matricule`) continue d'être utilisé normalement
partout dans l'application et la base : cette couche ne le remplace pas, elle
en interdit seulement la sortie vers un fournisseur IA distant.

```
Question / historique (noms réels possibles)
        │
        ▼
domain/ai-privacy.ts        redactConversation() — alias temporaire par
                             salarié, régénéré à CHAQUE appel OpenAI
        │
        ▼
ai/tools.ts                 outils déjà pseudonymisés par construction
                             (aucun champ interdit exposé) + scrubForbiddenFields
                             en filet de sécurité sur chaque résultat d'outil
        │
        ▼
OpenAI                      ne voit que OPERATOR_A, OPERATOR_B… et les
                             indicateurs autorisés (production, arrêts,
                             atelier, équipe…)
        │
        ▼
restoreAnswerIdentities()   remplace les alias par l'identité locale dans
                             la réponse, uniquement côté serveur
        │
        ▼
Interface utilisateur       affiche les vrais noms — jamais vus par OpenAI
```

Composants :

- `server/domain/ai-privacy.ts` — module **pur**, testé indépendamment de la
  base et du fournisseur IA : génération d'alias (`createAliasMap`),
  rédaction/restauration de texte (`redactText` / `restoreText` /
  `redactConversation`), filet de sécurité par liste noire de champs
  (`scrubForbiddenFields`).
- `server/services/employee-directory.ts` — répertoire minimal (id,
  matricule, prénom, nom) utilisé uniquement pour détecter une mention de
  salarié dans un texte libre, indépendamment des permissions de l'appelant :
  une identité doit être protégée même si l'utilisateur n'a pas `hr:read`.
- `ai/tools.ts` → `get_operator_production` — production, rebuts et arrêts du
  jour par salarié, chaque ligne pseudonymisée avec l'alias de la requête en
  cours. Réservé à `hr:read` **et** `production:read` : l'IA n'a jamais plus
  de droits que l'utilisateur qui l'interroge (§ permissions ci-dessous).
- `ai/openai-provider.ts` — construit un alias temporaire par salarié avant
  chaque appel Terra/Sol, l'applique à la question, à l'historique relu en
  base et aux résultats d'outils, puis restaure les identités locales dans la
  réponse avant de la renvoyer. L'`aliasMap` ne vit qu'en mémoire, le temps
  d'une requête : jamais journalisée, jamais renvoyée au navigateur.

Deux appels sur les mêmes salariés obtiennent des alias différents (l'ordre
d'attribution est mélangé à chaque appel) : OpenAI ne peut pas corréler deux
requêtes via un alias resté stable. Les identifiants techniques (`employeeId`,
`operatorId`) sont eux aussi retenus par `scrubForbiddenFields`, pour la même
raison — un UUID stable serait un identifiant permanent comme un autre.

`server/services/ai-conversations.ts` reste la mémoire de référence : les
messages y sont stockés avec les vrais noms tapés par l'utilisateur (base
européenne sécurisée), la pseudonymisation ne s'applique qu'au moment de
renvoyer ce contenu à OpenAI, jamais au stockage local.

## Orchestration Terra → Sol

`OpenAiProvider` utilise la Responses API. Terra dispose des outils autorisés
et renvoie, en plus de la réponse publique, une évaluation interne structurée :
fiabilité, confiance, complexité et raison d'escalade. Cette évaluation n'est
jamais envoyée au navigateur.

`decideSolEscalation()` applique ensuite les invariants :

- aucune route par mots-clés ;
- aucune escalade pour une donnée manquante ;
- complexité `high` ou `expert` obligatoire ;
- seuil de confiance configurable ;
- plafond de part Sol sur les dernières requêtes ;
- Sol reçoit les résultats d'outils déjà collectés et ne les rappelle pas.

Le moteur de démonstration est conservé. En production configurée, son usage
après un échec distant exige `AI_DEMO_FALLBACK_ENABLED=true` ; sinon l'API
retourne une indisponibilité propre sans affecter le reste de l'application.

## Sécurité, Europe et observabilité

- `OPENAI_API_KEY` et les appels OpenAI restent exclusivement côté serveur.
- `OPENAI_BASE_URL=https://eu.api.openai.com/v1` permet de cibler un projet
  OpenAI éligible à la résidence et au processing européens.
- Les outils non autorisés ne sont pas exposés au modèle et refusent aussi une
  exécution directe ; le périmètre atelier est appliqué aux résultats.
- `ai_usage_logs` conserve uniquement les métadonnées d'usage (aucun prompt ni
  résultat métier) : modèle, tokens, coût estimé, latence, outils, escalade,
  raison technique et succès.

## Ce qui n'est volontairement pas fait en V1

- Prédiction par apprentissage automatique.
- Ordonnancement autonome.
- Moteur what-if généralisé (seules des simulations attachées existent).
- Achats automatiques : un besoin d'achat est une proposition, jamais une commande.
