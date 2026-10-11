# Design system

Objectif : une interface qui donne immédiatement l'impression d'un logiciel
professionnel haut de gamme — par la clarté et la hiérarchie, jamais par des
effets visuels.

## Principes

1. **Une couleur = une information.** Aucune teinte décorative.
2. **L'interface respire.** L'espace blanc fait partie de la lecture.
3. **La typographie porte la hiérarchie**, pas les bordures ni les fonds.
4. **Les chiffres s'alignent** (`.tabular`) : un tableau industriel se lit en
   colonne.
5. **Une même identité en clair et en sombre.** Ce sont deux éclairages du même
   objet, pas deux thèmes.
6. **Jamais la couleur seule.** Chaque badge de statut porte aussi un symbole.

## Jetons

Définis dans `src/app/globals.css`, exposés à Tailwind v4 via `@theme inline`.
Le mode sombre est piloté par la classe `.dark` sur `<html>`, elle-même résolue
côté serveur depuis un cookie — donc sans scintillement ni script bloquant.

### Surfaces

| Jeton                  | Clair     | Sombre    | Usage                        |
| ---------------------- | --------- | --------- | ---------------------------- |
| `bg-canvas`            | `#f4f6f8` | `#0a0f16` | Fond de page                 |
| `bg-surface`           | `#ffffff` | `#111a24` | Cartes                       |
| `bg-surface-sunken`    | `#f8fafc` | `#0d141d` | Zones en retrait, en-têtes   |
| `border-line`          | `#e3e8ee` | `#1e2b39` | Trait standard               |
| `border-line-strong`   | `#cfd7e0` | `#2c3d4f` | Champs de saisie             |

### Texte

| Jeton           | Usage                                    |
| --------------- | ---------------------------------------- |
| `text-fg`       | Contenu principal                        |
| `text-fg-muted` | Contenu secondaire, libellés             |
| `text-fg-subtle`| Métadonnées, unités, horodatages         |

### Marque

| Jeton         | Clair     | Sombre    | Usage                              |
| ------------- | --------- | --------- | ---------------------------------- |
| `bg-navy`     | `#0e2a47` | `#0b1b2c` | Sidebar, avatar, panneau de marque |
| `text-brand`  | `#2563eb` | `#4f8bff` | Accent, actions primaires, IA      |
| `bg-brand-soft`| `#e8effd`| `#16273f` | Fond d'accent                      |

### Statuts

Quatre niveaux, jamais plus :

| Niveau     | Symbole | Clair     | Sens                                  |
| ---------- | ------- | --------- | ------------------------------------- |
| `normal`   | ●       | `#0f9d6f` | Conforme, dans les objectifs          |
| `info`     | ◆       | `#b78103` | À surveiller, information             |
| `warning`  | ▲       | `#d9701a` | Risque, action à prévoir              |
| `critical` | ■       | `#d13b3b` | Problème réellement bloquant          |

Correspondances métier, appliquées uniformément :

| Domaine       | normal        | info        | warning              | critical           |
| ------------- | ------------- | ----------- | -------------------- | ------------------ |
| Score santé   | ≥ 85          | 70–84       | 55–69                | < 55               |
| Risque retard | < 10 %        | 10–19 %     | 20–59 %              | ≥ 60 %             |
| Machine       | Production    | Disponible  | Réglage, moule, maint.| Arrêt, défaut     |
| Stock         | Au-dessus     | Sous seuil  | Rupture ≤ 3 j        | Rupture ≤ 1 j      |

Ces seuils vivent dans le domaine (`healthSeverity`, `riskSeverity`,
`machineSeverity`), pas dans les composants.

### Élévation et rayons

Ombres volontairement discrètes (`--shadow-xs` à `--shadow-lg`). Deux rayons
seulement : `--radius-card` (14 px) et `--radius-control` (10 px).

## Primitives — `src/components/ui/primitives.tsx`

`Card`, `CardHeader`, `CardBody`, `CardFooter`, `PageHeader`, `SectionTitle`,
`StatusBadge`, `Badge`, `StatusDot`, `Button`, `ButtonLink`, `buttonClass`,
`Field`, `Input`, `Select`, `Textarea`, `Table`, `Th`, `Td`, `Tr`, `Progress`,
`Skeleton`, `EmptyState`, `DataOrigin`.

`DataOrigin` mérite une mention : il affiche si un chiffre est **mesuré**,
**calculé**, **estimé** ou **prévisionnel**. Une estimation ne doit jamais être
lue comme une mesure.

## Composants métier — `src/components/factory/`

| Composant             | Rôle                                                       |
| --------------------- | ---------------------------------------------------------- |
| `FactoryHealthScore`  | Arc de score, sous-scores, explication de la variation      |
| `MetricCard`          | Tuile du résumé opérationnel                                |
| `AlertCard`           | Chaîne complète problème → décision, avec formulaires       |
| `Timeline`            | Journée machine : barre proportionnelle + liste horodatée   |
| `MachineStatusForm`   | Changement d'état (mutation réelle)                         |
| `IncidentForm`        | Déclaration d'incident (mémoire de l'usine)                 |

## Mise en page

| Élément          | Règle                                                       |
| ---------------- | ----------------------------------------------------------- |
| Sidebar          | 228 px dépliée, 68 px repliée ; préférence en cookie         |
| Barre supérieure | 64 px, translucide, collante                                 |
| Contenu          | `max-w-[1400px]`, gouttière 16 px mobile / 24 px bureau      |
| Grilles          | 12 colonnes à partir de `xl`, empilées en dessous            |

## Responsive — trois expériences distinctes

| Contexte    | Cible                              | Adaptation                                   |
| ----------- | ---------------------------------- | -------------------------------------------- |
| Bureau      | Direction, responsables            | Tableaux denses, planning, analyses           |
| Tablette    | Chefs d'atelier, opérateurs        | Sidebar en tiroir, cibles tactiles élargies   |
| Smartphone  | Consultation, scan, déclaration    | Poste opérateur dédié, deux actions plein écran |

Les tableaux de bureau **ne sont pas compressés** sur mobile : l'opérateur a sa
propre interface (`/poste`), conçue pour ses gestes réels.

## Mouvement

Uniquement quand il aide : ouverture d'alerte (`animate-fade-up`, 220 ms),
transition de sidebar (200 ms), pulsation réservée au critique. Tout est
neutralisé sous `prefers-reduced-motion`.

## Accessibilité

- Navigation clavier complète ; `Ctrl+K` ouvre la recherche, `Ctrl+I` le copilote.
- `:focus-visible` visible partout, contour `--brand`.
- Chaque champ a un `<label>` associé ; chaque icône seule a un `aria-label`.
- `Progress` expose `role="progressbar"` et ses bornes.
- Cibles tactiles ≥ 44 px sur les écrans d'atelier.
- Contrastes vérifiés dans les deux thèmes ; le statut est toujours doublé d'un
  symbole et d'un libellé.
