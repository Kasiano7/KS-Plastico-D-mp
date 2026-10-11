/**
 * Politique de mot de passe (§ SECURITY.md « Reste à durcir »). Fonctions
 * pures, sans I/O : la longueur minimale sert de constante partagée avec les
 * schémas Zod des Server Actions, et `passwordPolicyIssues` couvre ce qu'une
 * seule contrainte de longueur ne peut pas attraper.
 */

export const PASSWORD_MIN_LENGTH = 10;

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'motdepasse',
  'motdepasse1',
  '123456789',
  '1234567890',
  'azertyuiop',
  'qwertyuiop',
  'Demo-9b8d8-2kx8w',
]);

/** Retourne la liste des raisons de refus — vide si le mot de passe est acceptable. */
export function passwordPolicyIssues(
  password: string,
  context: { email?: string | null } = {},
): string[] {
  const issues: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Mot de passe : ${PASSWORD_MIN_LENGTH} caractères minimum.`);
  }

  if (/^(.)\1*$/.test(password)) {
    issues.push('Le mot de passe ne peut pas être un seul caractère répété.');
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    issues.push('Ce mot de passe est trop courant, choisissez-en un autre.');
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase().trim();
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    issues.push('Le mot de passe ne doit pas contenir l’adresse e-mail du compte.');
  }

  return issues;
}
