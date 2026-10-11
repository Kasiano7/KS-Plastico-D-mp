import { describe, expect, it } from 'vitest';
import { findSimilarIncidents, significantTerms, type IncidentRecord } from '../incident-memory';

const incident = (
  overrides: Partial<IncidentRecord> & Pick<IncidentRecord, 'id' | 'symptom'>,
): IncidentRecord => ({
  reference: overrides.id,
  rootCause: 'Cause connue',
  resolution: 'Solution appliquée',
  tags: null,
  machineId: null,
  machineName: null,
  downtimeMinutes: 60,
  occurredAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('significantTerms', () => {
  it('ignore accents, casse et ponctuation', () => {
    // « Pontage matière » et « pontage de la matiere » doivent se rejoindre.
    expect(significantTerms('Pontage matière !')).toEqual(
      significantTerms('pontage de la matiere'),
    );
  });

  it('écarte les mots vides et les mots trop courts', () => {
    const terms = significantTerms('la vis de dosage ne tourne plus');

    expect(terms.has('dosage')).toBe(true);
    expect(terms.has('tourne')).toBe(true);
    expect(terms.has('vis')).toBe(false); // trois lettres
    expect(terms.has('plus')).toBe(false); // mot vide
  });

  it('écarte le vocabulaire trop courant pour distinguer', () => {
    // Sans ce filtre, tout signalement contenant « presse » se rapprocherait
    // de tous les autres.
    const terms = significantTerms('probleme sur la presse, defaut machine');

    expect(terms.size).toBe(0);
  });
});

describe('findSimilarIncidents', () => {
  const passe = [
    incident({
      id: 'INC-1',
      symptom: 'Pontage matière dans la trémie et patinage de la vis de dosage',
      machineId: 'PR-64',
      occurredAt: new Date('2025-10-01T00:00:00Z'),
    }),
    incident({
      id: 'INC-2',
      symptom: 'Température fourreau instable, régulation défaillante',
      machineId: 'PR-52',
      occurredAt: new Date('2025-11-01T00:00:00Z'),
    }),
    incident({
      id: 'INC-3',
      symptom: 'Pontage matière trémie',
      machineId: 'PR-52',
      occurredAt: new Date('2026-02-01T00:00:00Z'),
    }),
  ];

  it('retrouve les incidents partageant le vocabulaire du symptôme', () => {
    const result = findSimilarIncidents('pontage dans la trémie', passe);

    // INC-1 et INC-3 partagent les deux mêmes mots ; INC-2 n'en partage aucun.
    expect(result.map((row) => row.incident.id).sort()).toEqual(['INC-1', 'INC-3']);
  });

  it('départage deux incidents équivalents par le plus récent', () => {
    // Un diagnostic ancien peut porter sur un équipement depuis remplacé.
    const result = findSimilarIncidents('pontage dans la trémie', passe);

    expect(result[0].incident.id).toBe('INC-3');
  });

  it('expose les mots qui ont motivé le rapprochement', () => {
    // C'est la condition pour qu'un régleur puisse contester la proposition.
    const [first] = findSimilarIncidents('pontage trémie', passe);

    expect(first.matchedTerms.sort()).toEqual(['pontage', 'tremie']);
  });

  it('classe d’abord par nombre de mots communs', () => {
    const result = findSimilarIncidents('pontage matière trémie dosage', passe);

    // INC-1 partage quatre mots, INC-3 trois.
    expect(result[0].incident.id).toBe('INC-1');
  });

  it('privilégie la même machine à ressemblance égale', () => {
    const result = findSimilarIncidents('pontage matière trémie', passe, {
      machineId: 'PR-52',
    });

    expect(result[0].incident.id).toBe('INC-3');
    expect(result[0].sameMachine).toBe(true);
  });

  it('écarte un incident sans cause ni solution', () => {
    // Le proposer ferait perdre du temps sans rien apprendre.
    const muet = incident({
      id: 'INC-VIDE',
      symptom: 'Pontage matière trémie',
      rootCause: null,
      resolution: null,
    });

    expect(findSimilarIncidents('pontage trémie', [muet])).toEqual([]);
  });

  it('accepte un incident dont seule la solution est connue', () => {
    const partiel = incident({
      id: 'INC-PART',
      symptom: 'Pontage matière trémie',
      rootCause: null,
      resolution: 'Nettoyage de la trémie',
    });

    expect(findSimilarIncidents('pontage trémie', [partiel])).toHaveLength(1);
  });

  it('exploite les mots-clés autant que le symptôme', () => {
    const tague = incident({
      id: 'INC-TAG',
      symptom: 'Arrêt inattendu',
      tags: ['hydraulique', 'colmatage'],
    });

    expect(findSimilarIncidents('colmatage circuit', [tague])).toHaveLength(1);
  });

  it('ne propose rien sur un symptôme sans mot signifiant', () => {
    expect(findSimilarIncidents('la presse', passe)).toEqual([]);
    expect(findSimilarIncidents('', passe)).toEqual([]);
  });

  it('limite le nombre de propositions', () => {
    expect(findSimilarIncidents('pontage matière trémie', passe, { limit: 1 })).toHaveLength(1);
  });
});
