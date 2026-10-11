import { describe, expect, it } from 'vitest';
import { MAX_SHIFT_DAYS, daysToShift, shouldShift } from '../demo-clock';

const now = new Date('2026-09-05T14:30:00Z');

describe('daysToShift', () => {
  it('ne décale rien quand le jeu date d’aujourd’hui', () => {
    expect(daysToShift(new Date('2026-09-05T06:00:00Z'), now)).toBe(0);
  });

  it('compte les jours entiers écoulés', () => {
    expect(daysToShift(new Date('2026-09-04T06:00:00Z'), now)).toBe(1);
    expect(daysToShift(new Date('2026-08-29T23:00:00Z'), now)).toBe(7);
  });

  it('compare des journées, pas des durées', () => {
    // Hier 23 h et aujourd'hui 14 h sont séparés de 15 heures, mais d'un jour :
    // c'est le jour qui compte, sinon « 6 h du matin » deviendrait 21 h.
    expect(daysToShift(new Date('2026-09-04T23:59:00Z'), now)).toBe(1);
  });

  it('ne recule jamais', () => {
    // Un ancrage dans le futur ne doit pas produire un décalage négatif, qui
    // renverrait des événements passés dans l'avenir.
    expect(daysToShift(new Date('2026-09-10T06:00:00Z'), now)).toBe(0);
  });

  it('ne décale rien sans ancrage', () => {
    expect(daysToShift(null, now)).toBe(0);
  });
});

describe('shouldShift', () => {
  it('n’applique pas un décalage nul', () => {
    expect(shouldShift(0)).toBe(false);
  });

  it('applique un décalage raisonnable', () => {
    expect(shouldShift(1)).toBe(true);
    expect(shouldShift(30)).toBe(true);
    expect(shouldShift(MAX_SHIFT_DAYS)).toBe(true);
  });

  it('renonce au-delà d’un an', () => {
    // Le jeu ne décrit plus une usine plausible : le décaler masquerait qu'il
    // faut le recharger.
    expect(shouldShift(MAX_SHIFT_DAYS + 1)).toBe(false);
  });

  it('refuse une valeur négative', () => {
    expect(shouldShift(-3)).toBe(false);
  });
});
