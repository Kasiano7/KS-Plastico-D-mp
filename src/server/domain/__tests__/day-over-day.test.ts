import { describe, expect, it } from 'vitest';
import { compareToPreviousDay, formatDelta } from '../day-over-day';

describe('compareToPreviousDay', () => {
  it('ne renvoie aucun écart quand la veille n’a pas été enregistrée', () => {
    // Règle n° 4 : pas de référence, pas de chiffre. Surtout pas un faux zéro,
    // qui se lirait « stable » alors qu'on ne sait rien.
    expect(compareToPreviousDay(500, null, 'higher-is-better')).toEqual({
      delta: null,
      deltaPct: null,
      severity: 'info',
    });
    expect(compareToPreviousDay(500, undefined, 'higher-is-better').delta).toBeNull();
  });

  it('calcule l’écart absolu et relatif', () => {
    const result = compareToPreviousDay(1200, 1000, 'higher-is-better');

    expect(result.delta).toBe(200);
    expect(result.deltaPct).toBe(20);
  });

  it('n’exprime aucun pourcentage à partir de zéro', () => {
    // Passer de 0 à 500 n'est pas « +∞ % » : seul l'écart absolu a un sens.
    const result = compareToPreviousDay(500, 0, 'higher-is-better');

    expect(result.delta).toBe(500);
    expect(result.deltaPct).toBeNull();
  });

  it('lit une hausse de production comme une amélioration', () => {
    expect(compareToPreviousDay(1200, 1000, 'higher-is-better').severity).toBe('normal');
    expect(compareToPreviousDay(800, 1000, 'higher-is-better').severity).toBe('warning');
  });

  it('lit une hausse de retards comme une dégradation', () => {
    // Le sens vient de la métrique, jamais du seul signe de l'écart.
    expect(compareToPreviousDay(5, 2, 'lower-is-better').severity).toBe('warning');
    expect(compareToPreviousDay(1, 2, 'lower-is-better').severity).toBe('normal');
  });

  it('traite l’absence d’écart comme normale, quel que soit le sens', () => {
    expect(compareToPreviousDay(10, 10, 'higher-is-better').severity).toBe('normal');
    expect(compareToPreviousDay(10, 10, 'lower-is-better').severity).toBe('normal');
  });

  it('gère une valeur de veille négative sans inverser le pourcentage', () => {
    // L'écart relatif se mesure sur la valeur absolue de la référence.
    const result = compareToPreviousDay(-50, -100, 'higher-is-better');

    expect(result.delta).toBe(50);
    expect(result.deltaPct).toBe(50);
  });
});

describe('formatDelta', () => {
  const plain = (value: number) => String(value);

  it('rend le signe explicite, y compris au positif', () => {
    expect(formatDelta(240, plain)).toBe('+240');
  });

  it('utilise le signe moins typographique, aligné sur les chiffres', () => {
    expect(formatDelta(-3, plain)).toBe('−3');
    expect(formatDelta(-3, plain)).not.toBe('-3');
  });

  it('écrit « = » plutôt que « +0 »', () => {
    expect(formatDelta(0, plain)).toBe('=');
  });

  it('délègue entièrement la mise en forme du nombre', () => {
    expect(formatDelta(1500, (value) => `${value / 1000} k`)).toBe('+1.5 k');
  });
});
