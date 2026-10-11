import { describe, expect, it } from 'vitest';
import {
  LOCKOUT_THRESHOLD,
  lockoutMessage,
  lockoutVerdict,
  registerFailure,
  registerSuccess,
  type LockoutState,
} from '../account-lockout';

const NOW = new Date('2026-09-01T10:00:00Z');
const OPEN: LockoutState = { failedAttempts: 0, lockedUntil: null };

/** Rejoue `count` échecs consécutifs à partir d'un compte ouvert. */
function afterFailures(count: number, now = NOW): LockoutState {
  let state = OPEN;
  for (let i = 0; i < count; i += 1) state = registerFailure(state, now);
  return state;
}

describe('registerFailure', () => {
  it('ne verrouille pas avant le seuil', () => {
    const state = afterFailures(LOCKOUT_THRESHOLD - 1);

    expect(state.failedAttempts).toBe(4);
    expect(state.lockedUntil).toBeNull();
  });

  it('verrouille une minute au franchissement du seuil', () => {
    const state = afterFailures(LOCKOUT_THRESHOLD);

    expect(state.lockedUntil).toEqual(new Date('2026-09-01T10:01:00Z'));
  });

  it('allonge la durée à chaque nouveau palier franchi', () => {
    // 5 échecs → 1 min, 10 → 5 min, 15 → 15 min, 20 → 60 min.
    expect(afterFailures(10).lockedUntil).toEqual(new Date('2026-09-01T10:05:00Z'));
    expect(afterFailures(15).lockedUntil).toEqual(new Date('2026-09-01T10:15:00Z'));
    expect(afterFailures(20).lockedUntil).toEqual(new Date('2026-09-01T11:00:00Z'));
  });

  it('plafonne la durée plutôt que de verrouiller indéfiniment', () => {
    // Sinon un attaquant met l'usine à l'arrêt en bloquant ses sept comptes.
    expect(afterFailures(50).lockedUntil).toEqual(new Date('2026-09-01T11:00:00Z'));
    expect(afterFailures(200).lockedUntil).toEqual(new Date('2026-09-01T11:00:00Z'));
  });
});

describe('registerSuccess', () => {
  it('efface l’ardoise entièrement', () => {
    expect(registerSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});

describe('lockoutVerdict', () => {
  it('laisse passer un compte jamais verrouillé', () => {
    expect(lockoutVerdict(OPEN, NOW)).toEqual({ locked: false });
  });

  it('bloque tant que l’échéance n’est pas atteinte', () => {
    const state: LockoutState = {
      failedAttempts: 5,
      lockedUntil: new Date('2026-09-01T10:03:30Z'),
    };

    // 3 min 30 restantes → arrondi à la minute supérieure.
    expect(lockoutVerdict(state, NOW)).toEqual({
      locked: true,
      until: state.lockedUntil,
      remainingMinutes: 4,
    });
  });

  it('rouvre le compte dès l’échéance passée, sans intervention', () => {
    const state: LockoutState = {
      failedAttempts: 5,
      lockedUntil: new Date('2026-09-01T09:59:00Z'),
    };

    expect(lockoutVerdict(state, NOW)).toEqual({ locked: false });
  });

  it('ne renvoie jamais zéro minute restante', () => {
    // « Réessayez dans 0 minute » n'aide personne.
    const state: LockoutState = {
      failedAttempts: 5,
      lockedUntil: new Date('2026-09-01T10:00:01Z'),
    };

    expect(lockoutVerdict(state, NOW)).toMatchObject({ remainingMinutes: 1 });
  });
});

describe('lockoutMessage', () => {
  it('accorde le singulier', () => {
    expect(lockoutMessage(1)).toBe('Trop de tentatives. Réessayez dans une minute.');
  });

  it('donne le délai au pluriel', () => {
    expect(lockoutMessage(15)).toBe('Trop de tentatives. Réessayez dans 15 minutes.');
  });

  it('ne révèle jamais si le compte existe', () => {
    // La formulation est celle du dépassement de débit : rien à apprendre.
    expect(lockoutMessage(5)).not.toMatch(/compte|utilisateur|adresse/i);
  });
});
