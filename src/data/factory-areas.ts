/**
 * Référentiel statique des zones de l'usine.
 *
 * `src/data/` ne contient que des **constantes métier écrites à la main** —
 * ce qui ne vient ni d'une base, ni d'un calcul, et ne change qu'avec l'usine
 * elle-même. Une lecture composée va dans `server/services/`, une maquette
 * dans `server/db/fixtures/`. Cette distinction n'existait pas : le dossier
 * mélangeait les trois.
 */

export type FactoryArea = {
  slug: string;
  label: string;
  shortLabel: string;
  kind: 'production' | 'support';
  sourceWorkshopCode?: 'A' | 'B' | 'C';
  description: string;
  missions: string[];
};

/**
 * Correspondance entre les zones visibles sur le plan et les ateliers suivis
 * par la base de démonstration.
 */
export const FACTORY_AREAS: FactoryArea[] = [
  {
    slug: 'injection',
    label: 'Atelier Injection',
    shortLabel: 'Injection',
    kind: 'production',
    sourceWorkshopCode: 'B',
    description:
      'Zone de moulage dédiée aux pièces plastiques techniques de moyen et grand format.',
    missions: [
      'Préparer les moules et régler les presses avant le lancement des séries.',
      'Produire les garde-boues, passages de roue et pièces techniques associées.',
      'Contrôler les paramètres de moulage, les rebuts et la cadence de chaque ordre.',
    ],
  },
  {
    slug: 'pu',
    label: 'Atelier PU',
    shortLabel: 'PU',
    kind: 'production',
    sourceWorkshopCode: 'A',
    description:
      'Zone de préparation et de transformation des pièces PU avant leur passage en finition.',
    missions: [
      'Préparer les matières et sécuriser les dosages nécessaires aux fabrications.',
      'Piloter les cycles de production et les changements de série.',
      'Effectuer le contrôle intermédiaire avant transfert vers le montage.',
    ],
  },
  {
    slug: 'montage-expedition',
    label: 'Montage / expédition',
    shortLabel: 'Montage / expédition',
    kind: 'production',
    sourceWorkshopCode: 'C',
    description:
      'Zone de finition, d’assemblage, de contrôle final, d’emballage et de préparation des expéditions.',
    missions: [
      'Réaliser les opérations de finition et d’assemblage prévues sur les gammes.',
      'Effectuer le contrôle final et isoler les produits non conformes.',
      'Conditionner, identifier et préparer les commandes pour leur expédition.',
    ],
  },
  {
    slug: 'bureau',
    label: 'Bureau',
    shortLabel: 'Bureau',
    kind: 'support',
    description:
      'Zone de pilotage administratif regroupant la planification, les achats, le suivi client et la direction.',
    missions: [
      'Planifier les ordres de fabrication et suivre les échéances clients.',
      'Coordonner les achats, les approvisionnements et la documentation qualité.',
      'Analyser les indicateurs de l’usine et arbitrer les priorités opérationnelles.',
    ],
  },
  {
    slug: 'vestiaire-refectoire',
    label: 'Vestiaire et réfectoire',
    shortLabel: 'Vestiaire et réfectoire',
    kind: 'support',
    description:
      'Espace collectif consacré à l’accueil des équipes, aux changements de tenue et aux temps de pause.',
    missions: [
      'Mettre à disposition des espaces propres et séparés pour les changements de tenue.',
      'Accueillir les équipes pendant les pauses et les relèves de poste.',
      'Contribuer aux conditions de travail, à l’hygiène et à la sécurité du personnel.',
    ],
  },
];

export function getFactoryArea(slug: string): FactoryArea | undefined {
  return FACTORY_AREAS.find((area) => area.slug === slug);
}

export function getFactoryAreaByWorkshopCode(code: string): FactoryArea | undefined {
  return FACTORY_AREAS.find((area) => area.sourceWorkshopCode === code);
}
