/**
 * Champs jamais journalisés en clair.
 *
 * Le journal d'audit conserve l'avant et l'après de chaque mutation, et c'est
 * ce qui en fait sa valeur : une décision doit rester explicable des mois plus
 * tard. Mais il devient de ce fait une **base de données parallèle**, lisible
 * par quiconque a `history:read` — sans repasser par les permissions du module
 * d'origine.
 *
 * Tant qu'on y journalise des changements de rôle ou d'état de machine, c'est
 * sans conséquence. Le jour où une modification RH y passe — salaire, arrêt
 * maladie, motif d'absence — le journal livre à la maintenance des données que
 * seul le service RH devrait voir.
 *
 * D'où cette liste, posée **avant** que le cas ne se présente : la valeur est
 * remplacée par un marqueur, et le journal continue de dire *qu'un* champ a
 * changé sans dire *en quoi*. Qui a modifié quoi et quand reste tracé ; c'est
 * ce qu'on demande à un audit.
 */

/**
 * Comparaison insensible à la casse et au séparateur : `salaryCents`,
 * `salary_cents` et `SALARY_CENTS` désignent la même chose.
 */
function normalize(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** Noms de champs dont la valeur ne doit jamais atteindre le journal. */
const REDACTED_KEYS = new Set(
  [
    // Rémunération
    'salary', 'salaryCents', 'hourlyRate', 'hourlyRateCents', 'bonus', 'bonusCents',
    // Santé et absences
    'medicalNote', 'sickLeave', 'absenceReason', 'healthNote', 'disability',
    // Identité et coordonnées personnelles
    'socialSecurityNumber', 'iban', 'bic', 'bankAccount', 'birthDate', 'homeAddress',
    'personalPhone', 'personalEmail',
    // Secrets
    'password', 'passwordHash', 'totpSecret', 'token', 'tokenHash', 'apiKey', 'secret',
    'recoveryCode',
  ].map(normalize),
);

export const REDACTED_MARKER = '[valeur masquée]';

export function isRedactedKey(key: string): boolean {
  return REDACTED_KEYS.has(normalize(key));
}

/**
 * Remplace récursivement la valeur des champs sensibles.
 *
 * Récursif parce qu'une charge d'audit est souvent imbriquée
 * (`{ employee: { salaryCents: 3200000 } }`), et que masquer seulement le
 * premier niveau donnerait une fausse impression de protection.
 */
export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);

  if (value !== null && typeof value === 'object') {
    // `Date` et consorts ne sont pas des objets à parcourir.
    if (value instanceof Date) return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isRedactedKey(key) ? REDACTED_MARKER : redactAuditValue(entry),
      ]),
    );
  }

  return value;
}
