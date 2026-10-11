/**
 * Mode démonstration publique (`DEMO_MODE=true`).
 *
 * Constantes pures, sans I/O : partagées par le proxy, le serveur et
 * l'interface. Désactivé, ce mode ne change strictement rien au
 * fonctionnement normal de l'application.
 *
 * Identité de démonstration : aucun mot de passe, aucun cookie tiers requis.
 * Le point de vue (rôle) se résout dans cet ordre :
 *   1. paramètre d'URL `?role=` ;
 *   2. cookie `demo_role` (`SameSite=None; Secure; Partitioned`, accepté
 *      dans une iframe intersite par les navigateurs qui gèrent CHIPS) ;
 *   3. rôle Direction par défaut.
 * Quand le cookie est refusé, le proxy propage `?role=` de page en page.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/** Points de vue proposés : des comptes réels du jeu de démonstration, avec leurs droits réels. */
export const DEMO_ROLES = [
  { key: 'direction', label: 'Direction', email: 'direction@demo.example' },
  { key: 'production', label: 'Responsable de production', email: 'production@demo.example' },
  { key: 'atelier', label: "Chef d'atelier", email: 'atelier@demo.example' },
  { key: 'maintenance', label: 'Maintenance', email: 'maintenance@demo.example' },
  { key: 'operateur', label: 'Opérateur', email: 'operateur@demo.example' },
] as const;

export type DemoRoleKey = (typeof DEMO_ROLES)[number]['key'];

export const DEFAULT_DEMO_ROLE: DemoRoleKey = 'direction';

export const DEMO_ROLE_PARAM = 'role';
export const DEMO_EMBED_PARAM = 'embed';
export const DEMO_ROLE_COOKIE = 'demo_role';
export const DEMO_EMBED_COOKIE = 'demo_embed';
/** En-têtes posés par le proxy sur la requête : seule source lue par le serveur. */
export const DEMO_ROLE_HEADER = 'x-demo-role';
export const DEMO_EMBED_HEADER = 'x-demo-embed';

/** Pages sans objet en démonstration : connexion, comptes, administration. */
export const DEMO_BLOCKED_PATH_PREFIXES = ['/connexion', '/mot-de-passe', '/administration', '/mon-compte'] as const;

export const DEMO_WRITE_DISABLED_MESSAGE = 'Action désactivée dans la démonstration';

export function parseDemoRole(value: string | null | undefined): DemoRoleKey | null {
  return DEMO_ROLES.find((role) => role.key === value)?.key ?? null;
}

export function demoRoleEmail(key: DemoRoleKey): string {
  return DEMO_ROLES.find((role) => role.key === key)!.email;
}

export function isDemoBlockedPath(pathname: string): boolean {
  return DEMO_BLOCKED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
