/**
 * Jetons de définition de mot de passe — règles pures.
 *
 * Deux parcours, une seule mécanique : inviter quelqu'un, ou lui permettre de
 * reprendre la main après un oubli. Ce qui les distingue n'est pas le code,
 * c'est la durée de validité — et elle n'est pas arbitraire.
 */

export type PasswordTokenPurpose = 'invitation' | 'reset';

/**
 * Durées de validité.
 *
 * Une **réinitialisation** est demandée par quelqu'un devant son écran : une
 * heure lui suffit largement, et raccourcir la fenêtre réduit d'autant le
 * risque qu'un lien traîne dans une boîte partagée.
 *
 * Une **invitation** part vers quelqu'un qui n'attend rien, peut être en
 * congés, et n'a aucun autre moyen d'entrer. Sept jours est le compromis
 * habituel entre utilisable et court.
 */
export const TOKEN_LIFETIME_MINUTES: Record<PasswordTokenPurpose, number> = {
  reset: 60,
  invitation: 7 * 24 * 60,
};

export function tokenExpiry(purpose: PasswordTokenPurpose, now: Date): Date {
  return new Date(now.getTime() + TOKEN_LIFETIME_MINUTES[purpose] * 60_000);
}

export type TokenState =
  | { usable: true }
  | { usable: false; reason: 'used' | 'expired' };

/**
 * Un jeton n'est utilisable qu'une fois, et pas indéfiniment.
 *
 * L'ordre des tests compte : un jeton déjà utilisé le reste, même expiré. Le
 * message rendu à l'utilisateur doit dire lequel des deux s'applique, sinon
 * il retente indéfiniment un lien qui ne remarchera jamais.
 */
export function tokenState(
  token: { usedAt: Date | null; expiresAt: Date },
  now: Date,
): TokenState {
  if (token.usedAt !== null) return { usable: false, reason: 'used' };
  if (token.expiresAt.getTime() <= now.getTime()) return { usable: false, reason: 'expired' };
  return { usable: true };
}

export const TOKEN_STATE_MESSAGES: Record<'used' | 'expired', string> = {
  used: 'Ce lien a déjà servi. Demandez-en un nouveau depuis la page de connexion.',
  expired: 'Ce lien a expiré. Demandez-en un nouveau depuis la page de connexion.',
};

/**
 * Réponse à une demande de réinitialisation — **toujours la même**.
 *
 * Répondre « aucun compte avec cette adresse » livrerait à un attaquant la
 * liste des adresses valides de l'entreprise, à raison d'un essai par requête.
 * L'utilisateur légitime, lui, reçoit son message ; celui qui s'est trompé
 * d'adresse ne reçoit rien et le comprend en n'ayant rien reçu.
 */
export const RESET_REQUEST_ACK =
  'Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé. Vérifiez votre messagerie.';
