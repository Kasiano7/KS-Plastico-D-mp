import { describe, expect, it } from 'vitest';
import { TOKEN_LIFETIME_MINUTES, tokenExpiry, tokenState } from '../password-tokens';

const NOW = new Date('2026-09-01T10:00:00Z');

describe('tokenExpiry', () => {
  it('donne une heure à une réinitialisation', () => {
    expect(tokenExpiry('reset', NOW)).toEqual(new Date('2026-09-01T11:00:00Z'));
  });

  it('donne sept jours à une invitation', () => {
    // L'invité n'attend rien et peut être absent ; il n'a aucun autre moyen
    // d'entrer.
    expect(tokenExpiry('invitation', NOW)).toEqual(new Date('2026-09-08T10:00:00Z'));
  });

  it('laisse toujours une invitation vivre plus longtemps qu’une réinitialisation', () => {
    expect(TOKEN_LIFETIME_MINUTES.invitation).toBeGreaterThan(TOKEN_LIFETIME_MINUTES.reset);
  });
});

describe('tokenState', () => {
  const future = new Date('2026-09-01T11:00:00Z');
  const past = new Date('2026-09-01T09:00:00Z');

  it('accepte un jeton neuf et non expiré', () => {
    expect(tokenState({ usedAt: null, expiresAt: future }, NOW)).toEqual({ usable: true });
  });

  it('refuse un jeton déjà utilisé', () => {
    expect(tokenState({ usedAt: past, expiresAt: future }, NOW)).toEqual({
      usable: false,
      reason: 'used',
    });
  });

  it('refuse un jeton expiré', () => {
    expect(tokenState({ usedAt: null, expiresAt: past }, NOW)).toEqual({
      usable: false,
      reason: 'expired',
    });
  });

  it('refuse un jeton dont l’expiration tombe à l’instant présent', () => {
    // Strictement : à l'instant exact de l'expiration, le jeton est mort.
    expect(tokenState({ usedAt: null, expiresAt: NOW }, NOW)).toEqual({
      usable: false,
      reason: 'expired',
    });
  });

  it('dit « déjà utilisé » plutôt que « expiré » quand les deux s’appliquent', () => {
    // Sinon l'utilisateur retente un lien qui ne remarchera jamais.
    expect(tokenState({ usedAt: past, expiresAt: past }, NOW)).toEqual({
      usable: false,
      reason: 'used',
    });
  });
});
