/**
 * Mémoire des pannes — rapprochement d'incidents.
 *
 * Une usine réapprend chaque panne. Le diagnostic qui a pris quatre heures en
 * octobre est refait en mars, parce que personne ne se souvient qu'il a déjà
 * eu lieu — alors que l'incident, sa cause racine et sa solution sont dans la
 * base depuis le premier jour.
 *
 * Ce module rapproche un symptôme en cours de saisie des incidents passés.
 * Volontairement **sans modèle** : un rapprochement par recouvrement de mots
 * est explicable mot à mot, ce qui est la condition pour qu'un régleur le
 * conteste. « On vous propose ça parce que le mot *pontage* revient » se
 * discute ; « 0,87 de similarité » ne se discute pas.
 */

export type IncidentRecord = {
  id: string;
  reference: string;
  symptom: string;
  rootCause: string | null;
  resolution: string | null;
  tags: string[] | null;
  machineId: string | null;
  machineName: string | null;
  downtimeMinutes: number;
  occurredAt: Date;
};

export type SimilarIncident = {
  incident: IncidentRecord;
  /** Mots qui ont motivé le rapprochement — affichés, pas cachés. */
  matchedTerms: string[];
  /** L'incident concerne la même machine que celle en cours de déclaration. */
  sameMachine: boolean;
};

/**
 * Mots trop fréquents pour distinguer quoi que ce soit dans un signalement.
 * Sans ce filtre, « la presse ne démarre plus » se rapprocherait de tout
 * incident contenant « presse ».
 */
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'au', 'aux',
  'sur', 'sous', 'dans', 'avec', 'sans', 'pour', 'par', 'plus', 'pas', 'ne', 'que',
  'qui', 'est', 'sont', 'ete', 'etre', 'il', 'elle', 'on', 'se', 'son', 'sa', 'ses',
  'ce', 'cet', 'cette', 'en', 'y', 'depuis', 'apres', 'avant', 'tres', 'trop',
  'machine', 'presse', 'probleme', 'panne', 'defaut',
]);

/** Un mot de trois lettres ou moins ne porte pas de sens technique utile. */
const MIN_TERM_LENGTH = 4;

/**
 * Normalise un texte en mots signifiants : minuscules, sans accents, sans
 * ponctuation. « Pontage matière » et « pontage de la matiere » donnent le
 * même ensemble.
 */
export function significantTerms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/);

  return new Set(
    words.filter((word) => word.length >= MIN_TERM_LENGTH && !STOPWORDS.has(word)),
  );
}

/** Nombre minimal de mots communs pour qu'un rapprochement ait du sens. */
const MIN_SHARED_TERMS = 1;

export type SearchOptions = {
  /** Machine concernée par la déclaration en cours, si elle est connue. */
  machineId?: string | null;
  limit?: number;
};

/**
 * Incidents passés ressemblant au symptôme décrit.
 *
 * Le classement suit trois critères, dans cet ordre :
 *
 *   1. le nombre de mots communs — c'est la ressemblance elle-même ;
 *   2. la même machine — une panne déjà vue *sur cette presse* vaut mieux
 *      qu'une panne semblable ailleurs ;
 *   3. la date, le plus récent d'abord — un diagnostic de l'an dernier peut
 *      porter sur un équipement depuis remplacé.
 *
 * Un incident sans cause racine **ni** solution est écarté : le proposer
 * ferait perdre du temps sans rien apprendre.
 */
export function findSimilarIncidents(
  symptom: string,
  incidents: readonly IncidentRecord[],
  options: SearchOptions = {},
): SimilarIncident[] {
  const query = significantTerms(symptom);
  if (query.size === 0) return [];

  const limit = options.limit ?? 3;

  const scored = incidents
    .filter((incident) => incident.rootCause !== null || incident.resolution !== null)
    .map((incident) => {
      const haystack = significantTerms(
        [incident.symptom, ...(incident.tags ?? [])].join(' '),
      );
      const matchedTerms = [...query].filter((term) => haystack.has(term));

      return {
        incident,
        matchedTerms,
        sameMachine:
          options.machineId != null && incident.machineId === options.machineId,
      };
    })
    .filter((entry) => entry.matchedTerms.length >= MIN_SHARED_TERMS);

  scored.sort(
    (a, b) =>
      b.matchedTerms.length - a.matchedTerms.length ||
      Number(b.sameMachine) - Number(a.sameMachine) ||
      b.incident.occurredAt.getTime() - a.incident.occurredAt.getTime(),
  );

  return scored.slice(0, Math.max(limit, 0));
}
