import { describe, expect, it } from 'vitest';
import { hasAttention, selectAttention, type AttentionItem } from '../attention';

const item = (id: string, severity: AttentionItem['severity']): AttentionItem => ({
  id,
  severity,
  title: id,
});

describe('selectAttention', () => {
  it('ne retient que le critique et l’attention', () => {
    const result = selectAttention([
      item('a', 'normal'),
      item('b', 'critical'),
      item('c', 'info'),
      item('d', 'warning'),
    ]);

    expect(result.map((row) => row.id)).toEqual(['b', 'd']);
  });

  it('hisse le critique au-dessus de l’attention', () => {
    const result = selectAttention([item('a', 'warning'), item('b', 'critical')]);

    expect(result.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('conserve l’ordre d’entrée à sévérité égale', () => {
    // Les pages trient déjà par gravité métier : ce tri ne doit pas la défaire.
    const result = selectAttention([
      item('premier', 'warning'),
      item('deuxième', 'warning'),
      item('troisième', 'warning'),
    ]);

    expect(result.map((row) => row.id)).toEqual(['premier', 'deuxième', 'troisième']);
  });

  it('tronque à trois lignes par défaut', () => {
    const result = selectAttention([
      item('a', 'critical'),
      item('b', 'critical'),
      item('c', 'critical'),
      item('d', 'critical'),
      item('e', 'critical'),
    ]);

    expect(result).toHaveLength(3);
  });

  it('accepte une limite explicite', () => {
    const five = Array.from({ length: 5 }, (_, i) => item(String(i), 'warning'));

    expect(selectAttention(five, 5)).toHaveLength(5);
    expect(selectAttention(five, 1)).toHaveLength(1);
  });

  it('ne renvoie rien pour une limite nulle ou négative', () => {
    expect(selectAttention([item('a', 'critical')], 0)).toEqual([]);
    expect(selectAttention([item('a', 'critical')], -2)).toEqual([]);
  });

  it('ne modifie pas la liste reçue', () => {
    const source = [item('a', 'warning'), item('b', 'critical')];
    selectAttention(source);

    expect(source.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('renvoie une liste vide quand tout va bien', () => {
    expect(selectAttention([item('a', 'normal'), item('b', 'info')])).toEqual([]);
  });
});

describe('hasAttention', () => {
  it('répond faux quand rien ne dépasse « information »', () => {
    expect(hasAttention([item('a', 'normal'), item('b', 'info')])).toBe(false);
    expect(hasAttention([])).toBe(false);
  });

  it('répond vrai dès une seule ligne en attention', () => {
    expect(hasAttention([item('a', 'normal'), item('b', 'warning')])).toBe(true);
  });
});
