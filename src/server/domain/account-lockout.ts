/**
 * Verrouillage de compte après échecs répétés — règles pures.
 *
 * La limitation de débit et le verrouillage ne protègent pas de la même chose,
 * et c'est pourquoi il faut les deux :
 *
 *   · La **limitation de débit** ralentit. Elle compte les tentatives sur une
 *     fenêtre glissante, puis se remet à zéro. Un attaquant patient qui essaie
 *     dix mots de passe toutes les quinze minutes ne la déclenche jamais et
 *     finit par épuiser une liste.
 *   · Le **verrouillage** arrête. Il compte les échecs *consécutifs*, sans
 *     fenêtre, et ne se remet à zéro que sur une connexion réussie.
 *
 * Le verrouillage est temporaire et croissant : bloquer définitivement un
 * compte donnerait à un attaquant un moyen simple de mettre une usine à
 * l'arrêt en verrouillant ses sept comptes.
 */

/** Échecs consécutifs tolérés avant le premier verrouillage. */
export const LOCKOUT_THRESHOLD = 5;

/**
 * Durées successives, en minutes.
 *
 * Croissantes : la première rend une attaque non rentable sans gêner
 * l'utilisateur qui s'est trompé de clavier ; les suivantes distinguent
 * l'erreur humaine de l'acharnement. Au-delà, la dernière valeur se répète —
 * on ne verrouille jamais indéfiniment.
 */
export const LOCKOUT_STEPS_MINUTES = [1, 5, 15, 60] as const;

export type LockoutState = {
  /** Échecs consécutifs depuis la dernière connexion réussie. */
  failedAttempts: number;
  /** Fin du verrouillage en cours, `null` si le compte est ouvert. */
  lockedUntil: Date | null;
};

export type LockoutVerdict =
  | { locked: false }
  | { locked: true; until: Date; remainingMinutes: number };

export function lockoutVerdict(state: LockoutState, now: Date): LockoutVerdict {
  if (state.lockedUntil === null || state.lockedUntil.getTime() <= now.getTime()) {
    return { locked: false };
  }

  return {
    locked: true,
    until: state.lockedUntil,
    remainingMinutes: Math.max(
      Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 60_000),
      1,
    ),
  };
}

/**
 * État après un échec.
 *
 * Le palier appliqué dépend du nombre de verrouillages déjà subis, déduit du
 * compteur d'échecs : chaque tranche de `LOCKOUT_THRESHOLD` en franchit un.
 */
export function registerFailure(state: LockoutState, now: Date): LockoutState {
  const failedAttempts = state.failedAttempts + 1;

  if (failedAttempts < LOCKOUT_THRESHOLD) {
    return { failedAttempts, lockedUntil: state.lockedUntil };
  }

  const step = Math.floor(failedAttempts / LOCKOUT_THRESHOLD) - 1;
  const minutes =
    LOCKOUT_STEPS_MINUTES[Math.min(step, LOCKOUT_STEPS_MINUTES.length - 1)];

  return { failedAttempts, lockedUntil: new Date(now.getTime() + minutes * 60_000) };
}

/** Une connexion réussie efface l'ardoise — c'est la seule chose qui l'efface. */
export function registerSuccess(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null };
}

/**
 * Message affiché à qui se heurte à un verrou.
 *
 * Il ne dit pas si le compte existe — sinon le verrouillage deviendrait à son
 * tour un moyen d'énumérer les adresses valides. La formulation est celle du
 * dépassement de débit, avec le délai en plus.
 */
export function lockoutMessage(remainingMinutes: number): string {
  return remainingMinutes <= 1
    ? 'Trop de tentatives. Réessayez dans une minute.'
    : `Trop de tentatives. Réessayez dans ${remainingMinutes} minutes.`;
}
