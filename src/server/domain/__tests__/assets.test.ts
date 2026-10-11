import { describe, expect, it } from 'vitest';
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  assetTypeOf,
  countByType,
  sortByCriticality,
  type AssetRecord,
} from '../assets';

const asset = (
  code: string,
  type: AssetRecord['type'],
  criticality: AssetRecord['criticality'] = 'normal',
): AssetRecord => ({
  id: code,
  code,
  name: code,
  type,
  criticality,
  workshopName: null,
  isActive: true,
});

describe('countByType', () => {
  it('compte les actifs par nature', () => {
    const result = countByType([
      asset('PR-01', 'machine'),
      asset('PR-02', 'machine'),
      asset('COMP-01', 'compressor'),
    ]);

    expect(result).toEqual([
      { type: 'machine', label: 'Machine de production', count: 2, vitalCount: 0 },
      { type: 'compressor', label: 'Compresseur', count: 1, vitalCount: 0 },
    ]);
  });

  it('compte séparément ce dont l’arrêt stopperait la production', () => {
    const result = countByType([
      asset('PR-01', 'machine', 'vital'),
      asset('PR-02', 'machine', 'normal'),
    ]);

    expect(result[0]).toMatchObject({ count: 2, vitalCount: 1 });
  });

  it('n’affiche pas les catégories absentes', () => {
    // « Robotique : 0 » sur un site sans robot remplit l'écran sans rien dire.
    const result = countByType([asset('PR-01', 'machine')]);

    expect(result).toHaveLength(1);
    expect(result.map((row) => row.type)).not.toContain('robotics');
  });

  it('classe par effectif décroissant', () => {
    const result = countByType([
      asset('D-1', 'door'),
      asset('PR-01', 'machine'),
      asset('PR-02', 'machine'),
    ]);

    expect(result.map((row) => row.type)).toEqual(['machine', 'door']);
  });

  it('départage deux effectifs égaux par l’ordre du référentiel, jamais au hasard', () => {
    const result = countByType([asset('D-1', 'door'), asset('C-1', 'compressor')]);

    // `compressor` précède `door` dans ASSET_TYPES.
    expect(result.map((row) => row.type)).toEqual(['compressor', 'door']);
  });

  it('renvoie une liste vide sans actif', () => {
    expect(countByType([])).toEqual([]);
  });
});

describe('sortByCriticality', () => {
  it('remonte le vital, puis l’important', () => {
    const result = sortByCriticality([
      asset('C', 'other', 'normal'),
      asset('A', 'other', 'important'),
      asset('B', 'other', 'vital'),
    ]);

    expect(result.map((row) => row.code)).toEqual(['B', 'A', 'C']);
  });

  it('départage par code, en respectant les nombres', () => {
    // « PR-9 » avant « PR-10 » : un tri alphabétique brut ferait l'inverse.
    const result = sortByCriticality([
      asset('PR-10', 'machine', 'vital'),
      asset('PR-9', 'machine', 'vital'),
    ]);

    expect(result.map((row) => row.code)).toEqual(['PR-9', 'PR-10']);
  });

  it('ne modifie pas la liste reçue', () => {
    const source = [asset('C', 'other', 'normal'), asset('B', 'other', 'vital')];
    sortByCriticality(source);

    expect(source.map((row) => row.code)).toEqual(['C', 'B']);
  });
});

describe('assetTypeOf', () => {
  it('reconnaît les types du référentiel', () => {
    expect(assetTypeOf('compressor')).toBe('compressor');
    expect(assetTypeOf('building')).toBe('building');
  });

  it('rattache un type inconnu à « autre » plutôt que de l’afficher brut', () => {
    expect(assetTypeOf('type_supprime')).toBe('other');
  });
});

describe('référentiel', () => {
  it('donne un libellé à chaque type déclaré', () => {
    for (const type of ASSET_TYPES) {
      expect(ASSET_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});
