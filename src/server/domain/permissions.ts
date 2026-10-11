/**
 * Catalogue RBAC — source de vérité unique.
 *
 * Ce module est volontairement pur (aucun accès base de données) : il est
 * testable, et il sert à la fois à amorcer les tables `permissions` /
 * `role_permissions` et à raisonner sur les droits dans les tests.
 *
 * Règle absolue (§45) : une condition d'affichage côté client n'est jamais une
 * autorisation. Toute route et toute mutation revérifie la permission côté serveur.
 */

export const PERMISSIONS = {
  'dashboard:read': 'Consulter la Control Tower',
  'alerts:read': 'Consulter les alertes',
  'alerts:write': 'Prendre en charge et clôturer une alerte',
  'orders:read': 'Consulter les commandes clients',
  'orders:write': 'Créer et modifier une commande',
  'production:read': 'Consulter la production',
  'production:write': 'Piloter les ordres de fabrication',
  'planning:read': 'Consulter le planning',
  'planning:write': 'Modifier le planning',
  'machines:read': 'Consulter les machines',
  'machines:write': "Modifier l'état d'une machine",
  'maintenance:read': 'Consulter la maintenance et les arrêts',
  'maintenance:write': 'Résoudre et clôturer un incident',
  'incidents:declare': 'Déclarer un incident depuis le terrain',
  'inventory:read': 'Consulter les stocks',
  'inventory:write': 'Effectuer un mouvement de stock',
  'catalog:read': 'Consulter le catalogue pièces et moules',
  'catalog:write': 'Modifier le catalogue',
  'hr:read': 'Consulter le personnel',
  'hr:write': 'Modifier le personnel, les compétences et les absences',
  'quality:read': 'Consulter la qualité',
  'quality:write': 'Déclarer un événement qualité',
  'suppliers:read': 'Consulter les fournisseurs',
  'suppliers:write': 'Modifier les fournisseurs',
  'analytics:read': 'Consulter les analyses et KPI',
  'finance:read': 'Consulter les données financières et la rentabilité',
  'ai:ask': 'Interroger le copilote IA',
  'recommendations:approve': 'Approuver ou refuser une recommandation IA',
  'history:read': "Consulter l'historique et la traçabilité",
  'admin:read': "Consulter l'administration",
  'admin:write': 'Administrer utilisateurs, rôles et paramètres',
  'workstation:use': 'Utiliser le poste opérateur',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Rôles livrés avec l'application.
 *
 * Ce bloc n'est PAS la source de vérité des droits à l'exécution : depuis que
 * les rôles sont administrables, les permissions effectives sont lues dans la
 * table `role_permissions` à chaque requête (voir `server/auth/session.ts`).
 *
 * Il définit uniquement **la configuration initiale** chargée par le seed, et
 * sert de référence dans les tests. La direction peut ensuite modifier ces
 * rôles ou en créer d'autres depuis `/administration/roles`.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const ROLE_CODES = [
  'direction',
  'responsable_production',
  'chef_atelier',
  'responsable_maintenance',
  'responsable_rh',
  'responsable_stock',
  'operateur',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  direction: 'Direction',
  responsable_production: 'Responsable de production',
  chef_atelier: "Chef d'atelier",
  responsable_maintenance: 'Responsable maintenance',
  responsable_rh: 'Responsable RH / administratif',
  responsable_stock: 'Responsable stock / logistique',
  operateur: 'Opérateur',
};

export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  direction: "Accès complet, incluant les données financières et les analyses IA.",
  responsable_production: 'Commandes, planning, machines, personnel, stocks et production.',
  chef_atelier: "Périmètre limité à son atelier : machines, équipes, ordres de fabrication.",
  responsable_maintenance: 'Machines, arrêts, incidents, maintenance et analyses machines.',
  responsable_rh: 'Employés, compétences, formations, absences et habilitations.',
  responsable_stock: 'Stocks, matières, palettes, fournisseurs et approvisionnements.',
  operateur: 'Poste de travail simplifié : ordre en cours, progression, déclarations.',
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  direction: ALL_PERMISSIONS.filter((permission) => permission !== 'planning:write'),

  responsable_production: [
    'dashboard:read',
    'alerts:read',
    'alerts:write',
    'orders:read',
    'orders:write',
    'production:read',
    'production:write',
    'planning:read',
    'machines:read',
    'machines:write',
    'maintenance:read',
    'incidents:declare',
    'inventory:read',
    'inventory:write',
    'catalog:read',
    'hr:read',
    'quality:read',
    'quality:write',
    'suppliers:read',
    'analytics:read',
    'ai:ask',
    'recommendations:approve',
    'history:read',
  ],

  chef_atelier: [
    'dashboard:read',
    'alerts:read',
    'alerts:write',
    'orders:read',
    'production:read',
    'production:write',
    'planning:read',
    'planning:write',
    'machines:read',
    'machines:write',
    'maintenance:read',
    'incidents:declare',
    'inventory:read',
    'catalog:read',
    'hr:read',
    'quality:read',
    'quality:write',
    'ai:ask',
    'history:read',
  ],

  responsable_maintenance: [
    'dashboard:read',
    'alerts:read',
    'alerts:write',
    'production:read',
    'planning:read',
    'machines:read',
    'machines:write',
    'maintenance:read',
    'maintenance:write',
    'incidents:declare',
    'catalog:read',
    'quality:read',
    'analytics:read',
    'ai:ask',
    'history:read',
  ],

  responsable_rh: [
    'dashboard:read',
    'alerts:read',
    'hr:read',
    'hr:write',
    'planning:read',
    'ai:ask',
    'history:read',
  ],

  responsable_stock: [
    'dashboard:read',
    'alerts:read',
    'alerts:write',
    'orders:read',
    'inventory:read',
    'inventory:write',
    'catalog:read',
    'suppliers:read',
    'suppliers:write',
    'production:read',
    'ai:ask',
    'history:read',
  ],

  operateur: ['workstation:use', 'production:read', 'quality:write', 'incidents:declare'],
};

/**
 * Permissions **par défaut** d'un rôle livré avec l'application.
 * À l'exécution, utiliser les permissions de la session, qui viennent de la base.
 */
export function permissionsForRole(role: RoleCode): readonly PermissionCode[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(
  granted: readonly PermissionCode[] | ReadonlySet<PermissionCode>,
  permission: PermissionCode,
): boolean {
  return granted instanceof Set
    ? (granted as ReadonlySet<PermissionCode>).has(permission)
    : (granted as readonly PermissionCode[]).includes(permission);
}

export function canAny(
  granted: readonly PermissionCode[] | ReadonlySet<PermissionCode>,
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.some((permission) => can(granted, permission));
}

export function permissionDomain(code: PermissionCode): string {
  return code.split(':')[0];
}
