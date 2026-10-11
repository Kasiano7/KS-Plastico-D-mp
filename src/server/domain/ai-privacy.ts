/**
 * Couche de confidentialité IA (« AI Privacy Layer »).
 *
 * Règle fondamentale : un fournisseur IA distant ne doit jamais connaître
 * l'identité réelle d'un salarié — ni son nom, ni son prénom, ni son
 * matricule (le matricule reste un identifiant permanent interne, voir
 * `schema/hr.ts`). Il ne reçoit que des alias temporaires, régénérés à
 * chaque appel, et les quelques indicateurs métier strictement nécessaires.
 *
 * Ce module est **pur** (aucune I/O, aucun accès base) afin de rester
 * testable indépendamment de la base de données ou du fournisseur IA :
 *   - `server/services/employee-directory.ts` fournit les identités réelles ;
 *   - `server/ai/openai-provider.ts` et `server/ai/tools.ts` l'utilisent pour
 *     construire le contexte envoyé à OpenAI et restaurer les identités
 *     locales dans la réponse.
 *
 * La correspondance alias ↔ identité (`AliasMap`) ne doit **jamais** être
 * sérialisée vers OpenAI ni journalisée : elle ne vit que le temps d'une
 * requête, en mémoire serveur.
 */

export type EmployeeIdentity = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
};

export type AliasMap = {
  /** Alias temporaire pour cette requête, ou `undefined` si l'identifiant est inconnu. */
  aliasFor(employeeId: string): string | undefined;
  /** Identifiant technique correspondant à un alias, ou `undefined` s'il est inconnu. */
  employeeIdFor(alias: string): string | undefined;
  /** Nom complet local correspondant à un alias — utilisé pour restaurer l'affichage. */
  fullNameFor(alias: string): string | undefined;
};

/**
 * Indicateurs de production qu'il est acceptable de transmettre à l'IA pour
 * un salarié, une fois pseudonymisé. Liste blanche volontairement courte :
 * tout champ absent d'ici doit être ajouté explicitement, jamais déduit.
 */
export const ALLOWED_EMPLOYEE_AI_FIELDS = [
  'goodUnits',
  'rejectedUnits',
  'scrapRatePct',
  'downtimeMinutes',
  'machineCodes',
  'shift',
  'workshopName',
] as const;

/**
 * Champs interdits par défaut — jamais transmis automatiquement à l'IA,
 * qu'ils apparaissent en `snake_case` (colonnes SQL) ou en `camelCase`
 * (objets applicatifs). Liste noire de sécurité : la liste blanche
 * `ALLOWED_EMPLOYEE_AI_FIELDS` reste la protection principale, celle-ci est
 * un filet de secours pour tout objet non explicitement construit pour l'IA
 * (résultat d'outil futur, contexte étendu…).
 */
const FORBIDDEN_FIELD_NAMES = new Set(
  [
    'nom',
    'prenom',
    'prénom',
    'nomComplet',
    'fullName',
    'firstName',
    'lastName',
    'first_name',
    'last_name',
    'name',
    'matricule',
    'email',
    'mail',
    'telephone',
    'téléphone',
    'phone',
    'phoneNumber',
    'adresse',
    'address',
    'dateNaissance',
    'birthDate',
    'dateOfBirth',
    'login',
    'username',
    'password',
    'passwordHash',
    'password_hash',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'api_key',
    'ssn',
    'nir',
    'iban',
    'employeeId',
    'operatorId',
    'operator_id',
  ].map((field) => field.toLowerCase()),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Génère la correspondance alias temporaire ↔ salarié pour **une seule**
 * requête. L'ordre est mélangé à chaque appel (`crypto.randomInt`) afin que
 * deux requêtes successives sur les mêmes salariés produisent des alias
 * différents (§3 — OpenAI ne doit pas pouvoir corréler deux appels via un
 * alias stable).
 */
export function createAliasMap(
  employees: readonly EmployeeIdentity[],
  randomInt: (max: number) => number = (max) => Math.floor(Math.random() * max),
): AliasMap {
  const shuffled = [...employees];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const aliasByEmployeeId = new Map<string, string>();
  const employeeByAlias = new Map<string, EmployeeIdentity>();

  shuffled.forEach((employee, index) => {
    const alias = `OPERATOR_${alphaLabel(index)}`;
    aliasByEmployeeId.set(employee.id, alias);
    employeeByAlias.set(alias, employee);
  });

  return {
    aliasFor: (employeeId) => aliasByEmployeeId.get(employeeId),
    employeeIdFor: (alias) => employeeByAlias.get(alias)?.id,
    fullNameFor: (alias) => {
      const employee = employeeByAlias.get(alias);
      return employee ? `${employee.firstName} ${employee.lastName}` : undefined;
    },
  };
}

/** A, B, … Z, AA, AB, … — jamais de chiffre pur, pour rester lisible dans un prompt. */
function alphaLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Remplace toute mention d'un salarié (nom complet, nom, prénom, matricule)
 * par son alias temporaire. Volontairement permissif : en cas de doute,
 * mieux vaut sur-rédiger (remplacer un mot qui n'était pas un nom) que
 * laisser passer une vraie identité — c'est la seule direction d'erreur
 * acceptable pour cette fonction.
 */
export function redactText(
  text: string,
  employees: readonly EmployeeIdentity[],
  aliasMap: AliasMap,
): string {
  if (!text) return text;

  const candidates: { pattern: string; alias: string }[] = [];
  for (const employee of employees) {
    const alias = aliasMap.aliasFor(employee.id);
    if (!alias) continue;
    const firstName = employee.firstName.trim();
    const lastName = employee.lastName.trim();
    if (firstName && lastName) {
      candidates.push({ pattern: `${firstName} ${lastName}`, alias });
      candidates.push({ pattern: `${lastName} ${firstName}`, alias });
    }
    if (firstName.length >= 2) candidates.push({ pattern: firstName, alias });
    if (lastName.length >= 2) candidates.push({ pattern: lastName, alias });
    if (employee.matricule.trim()) candidates.push({ pattern: employee.matricule.trim(), alias });
  }

  // Les motifs les plus longs d'abord : « Luc Bernard » avant « Luc », sans
  // quoi le remplacement partiel laisserait « Bernard » orphelin en clair.
  candidates.sort((a, b) => b.pattern.length - a.pattern.length);

  let result = text;
  for (const { pattern, alias } of candidates) {
    const escaped = escapeRegExp(pattern);
    result = result.replace(new RegExp(escaped, 'gi'), alias);
  }
  return result;
}

/** Restaure, dans un texte produit par l'IA, les alias par les identités locales. */
export function restoreText(text: string, aliasMap: AliasMap): string {
  if (!text) return text;
  return text.replace(/\bOPERATOR_[A-Z]+\b/g, (alias) => aliasMap.fullNameFor(alias) ?? alias);
}

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_FIELD_NAMES.has(key.toLowerCase());
}

/**
 * Retire récursivement tout champ de la liste noire d'un objet/tableau
 * arbitraire, sans muter l'original. Filet de sécurité appliqué à chaque
 * résultat d'outil avant transmission à OpenAI (§7, §18) : même un futur
 * outil mal conçu ne peut pas faire fuiter ces champs par accident.
 */
export function scrubForbiddenFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubForbiddenFields(entry)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      if (isForbiddenKey(key)) continue;
      result[key] = scrubForbiddenFields(entry);
    }
    return result as T;
  }
  return value;
}

/** Un tour de conversation dont le texte a été pseudonymisé pour un appel IA. */
export type RedactedTurn = { question: string; summary: string };

/**
 * Pseudonymise en une passe la question courante et l'historique conservé —
 * les deux chemins par lesquels un nom réel peut échapper à la
 * pseudonymisation structurée des outils (question tapée librement §1,
 * historique relu depuis la base §11).
 */
export function redactConversation(
  question: string,
  history: readonly RedactedTurn[],
  employees: readonly EmployeeIdentity[],
  aliasMap: AliasMap,
): { question: string; history: RedactedTurn[] } {
  return {
    question: redactText(question, employees, aliasMap),
    history: history.map((turn) => ({
      question: redactText(turn.question, employees, aliasMap),
      summary: redactText(turn.summary, employees, aliasMap),
    })),
  };
}
