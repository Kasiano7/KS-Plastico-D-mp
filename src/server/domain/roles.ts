/**
 * Règles d'administration des rôles.
 *
 * Module pur : il ne connaît ni la base ni le web. Il répond à une seule
 * question — « cette modification de rôle est-elle acceptable ? » — et il la
 * répond de manière testable.
 *
 * L'enjeu principal n'est pas la validation de surface (longueur d'un nom),
 * mais **l'impossibilité de se verrouiller hors de l'application** : un
 * administrateur ne doit jamais pouvoir retirer le dernier droit
 * d'administration de l'usine, y compris par erreur.
 */

import { PERMISSIONS, type PermissionCode } from './permissions';

/** Permission sans laquelle plus personne ne peut administrer l'application. */
export const ADMIN_PERMISSION: PermissionCode = 'admin:write';

export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;

export const ROLE_NAME_MIN_LENGTH = 3;
export const ROLE_NAME_MAX_LENGTH = 60;

export type RoleSnapshot = {
  id: string;
  code: string;
  isSystem: boolean;
  permissions: readonly PermissionCode[];
  /** Nombre d'utilisateurs actifs portant ce rôle. */
  userCount: number;
};

export type RoleGuardContext = {
  /** Identifiant du rôle de la personne qui effectue la modification. */
  editorRoleId: string;
  /** État courant de tous les rôles. */
  roles: readonly RoleSnapshot[];
};

export type RoleDraft = {
  name: string;
  code: string;
  description?: string | null;
  permissions: readonly string[];
};

/**
 * Dérive un code technique à partir d'un nom saisi en clair.
 * « Responsable qualité » → `responsable_qualite`.
 */
export function slugifyRoleCode(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  // Une saisie vide ne produit pas de code : le champ reste vide à l'écran.
  if (slug.length === 0) return '';

  // Un code doit commencer par une lettre : on préfixe si la saisie
  // commençait par un chiffre.
  return /^[a-z]/.test(slug) ? slug : `role_${slug}`.slice(0, 40);
}

/** Validation de forme, indépendante de l'état des autres rôles. */
export function validateRoleDraft(
  draft: RoleDraft,
  options: { existingCodes: readonly string[]; currentCode?: string },
): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();

  if (name.length < ROLE_NAME_MIN_LENGTH) {
    errors.push(`Le nom du rôle doit comporter au moins ${ROLE_NAME_MIN_LENGTH} caractères.`);
  }
  if (name.length > ROLE_NAME_MAX_LENGTH) {
    errors.push(`Le nom du rôle ne peut pas dépasser ${ROLE_NAME_MAX_LENGTH} caractères.`);
  }

  if (!ROLE_CODE_PATTERN.test(draft.code)) {
    errors.push(
      'Le code doit commencer par une lettre et ne contenir que des minuscules, des chiffres et des tirets bas (3 à 40 caractères).',
    );
  }

  const taken = options.existingCodes.some(
    (code) => code === draft.code && code !== options.currentCode,
  );
  if (taken) errors.push(`Le code « ${draft.code} » est déjà utilisé par un autre rôle.`);

  const known = new Set(Object.keys(PERMISSIONS));
  const unknown = draft.permissions.filter((permission) => !known.has(permission));
  if (unknown.length > 0) {
    errors.push(`Permission inconnue : ${unknown.join(', ')}.`);
  }

  if (draft.permissions.length === 0) {
    errors.push('Un rôle doit accorder au moins une permission.');
  }

  return errors;
}

/**
 * Vérifie qu'après modification, l'usine conserve au moins un administrateur
 * réel : un rôle portant `admin:write` ET occupé par au moins une personne.
 */
function keepsAtLeastOneAdministrator(roles: readonly RoleSnapshot[]): boolean {
  return roles.some(
    (role) => role.permissions.includes(ADMIN_PERMISSION) && role.userCount > 0,
  );
}

/**
 * Contrôle une modification de permissions.
 * Renvoie la liste des raisons de refus — vide si la modification est acceptée.
 */
export function checkRoleUpdate(
  roleId: string,
  nextPermissions: readonly PermissionCode[],
  context: RoleGuardContext,
): string[] {
  const role = context.roles.find((candidate) => candidate.id === roleId);
  if (!role) return ['Rôle introuvable.'];

  const errors: string[] = [];
  const losesAdmin =
    role.permissions.includes(ADMIN_PERMISSION) && !nextPermissions.includes(ADMIN_PERMISSION);

  // Se retirer à soi-même le droit d'administrer est la façon la plus simple
  // de perdre l'accès à cette page. On refuse, même s'il reste d'autres admins.
  if (losesAdmin && roleId === context.editorRoleId) {
    errors.push(
      "Vous ne pouvez pas retirer l'administration à votre propre rôle : vous perdriez l'accès à cette page.",
    );
  }

  const after = context.roles.map((candidate) =>
    candidate.id === roleId ? { ...candidate, permissions: nextPermissions } : candidate,
  );

  if (losesAdmin && !keepsAtLeastOneAdministrator(after)) {
    errors.push(
      "Cette modification retirerait le dernier droit d'administration de l'application. Accordez-le d'abord à un autre rôle occupé.",
    );
  }

  return errors;
}

/** Contrôle une suppression de rôle. */
export function checkRoleDeletion(roleId: string, context: RoleGuardContext): string[] {
  const role = context.roles.find((candidate) => candidate.id === roleId);
  if (!role) return ['Rôle introuvable.'];

  const errors: string[] = [];

  if (role.isSystem) {
    errors.push(
      'Un rôle livré avec l’application ne peut pas être supprimé. Ses permissions restent modifiables.',
    );
  }

  if (role.userCount > 0) {
    errors.push(
      `Ce rôle est attribué à ${role.userCount} utilisateur(s). Réaffectez-les avant de le supprimer.`,
    );
  }

  if (roleId === context.editorRoleId) {
    errors.push('Vous ne pouvez pas supprimer votre propre rôle.');
  }

  const after = context.roles.filter((candidate) => candidate.id !== roleId);
  if (!keepsAtLeastOneAdministrator(after)) {
    errors.push("Cette suppression retirerait le dernier droit d'administration de l'application.");
  }

  return errors;
}

/** Un rôle système garde son code technique : d'autres écrans s'y réfèrent. */
export function checkCodeChange(role: RoleSnapshot, nextCode: string): string[] {
  if (role.isSystem && nextCode !== role.code) {
    return ['Le code technique d’un rôle livré avec l’application ne peut pas être modifié.'];
  }
  return [];
}

/** Regroupe les permissions par domaine, pour l'affichage de la matrice. */
export function groupPermissionsByDomain(): { domain: string; permissions: PermissionCode[] }[] {
  const codes = Object.keys(PERMISSIONS) as PermissionCode[];
  const domains = [...new Set(codes.map((code) => code.split(':')[0]))];

  return domains.map((domain) => ({
    domain,
    permissions: codes.filter((code) => code.startsWith(`${domain}:`)),
  }));
}

export const DOMAIN_LABELS: Record<string, string> = {
  dashboard: 'Control Tower',
  alerts: 'Alertes',
  orders: 'Commandes',
  production: 'Production',
  planning: 'Planning',
  machines: 'Machines',
  maintenance: 'Maintenance',
  incidents: 'Incidents',
  inventory: 'Stocks',
  catalog: 'Catalogue',
  hr: 'Personnel',
  quality: 'Qualité',
  suppliers: 'Fournisseurs',
  analytics: 'Analyse et KPI',
  finance: 'Données financières',
  ai: 'Copilote IA',
  recommendations: 'Recommandations',
  history: 'Historique',
  admin: 'Administration',
  workstation: 'Poste opérateur',
};
