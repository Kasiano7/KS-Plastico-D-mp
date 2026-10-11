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

/** Comptes proposés au changement d’utilisateur : les comptes réels du jeu de démonstration, avec leurs droits réels. */
export const DEMO_ROLES = [
  { key: 'direction', label: 'Direction', email: 'direction@demo.example' },
  { key: 'production', label: 'Responsable de production', email: 'production@demo.example' },
  { key: 'atelier', label: "Chef d'atelier", email: 'atelier@demo.example' },
  { key: 'maintenance', label: 'Responsable maintenance', email: 'maintenance@demo.example' },
  { key: 'rh', label: 'Responsable RH', email: 'rh@demo.example' },
  { key: 'stock', label: 'Responsable stock', email: 'stock@demo.example' },
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

/**
 * Pages sans objet en démonstration : connexion, mot de passe, compte personnel.
 * L'administration, elle, reste visible mais en lecture seule (grisée).
 */
export const DEMO_BLOCKED_PATH_PREFIXES = ['/connexion', '/mot-de-passe', '/mon-compte'] as const;

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

/**
 * Sites autorisés à intégrer la démonstration en iframe (`frame-ancestors`),
 * en plus de `'self'`. Lus dans `DEMO_ALLOWED_FRAME_ANCESTORS` (origines
 * séparées par des virgules ou des espaces) ; par défaut, le site vitrine KS
 * Développement et son serveur de développement local.
 */
export const DEFAULT_DEMO_FRAME_ANCESTORS = ['https://www.ks-developpement.fr', 'http://localhost:3000'] as const;

/**
 * Origines validées une à une : seule une origine `http(s)://hôte[:port]`
 * est retenue. Un jeton mal formé est ignoré plutôt que recopié tel quel
 * dans la CSP, où un `;` suffirait à injecter une directive.
 */
export function demoFrameAncestors(raw = process.env.DEMO_ALLOWED_FRAME_ANCESTORS): string[] {
  const tokens = raw?.trim() ? raw.split(/[\s,]+/).filter(Boolean) : [...DEFAULT_DEMO_FRAME_ANCESTORS];
  const origins = tokens.flatMap((token) => {
    try {
      const url = new URL(token);
      const isOriginOnly = url.pathname === '/' && !url.search && !url.hash;
      // `new URL` tolère `;` dans un nom d'hôte : le nom est donc revérifié.
      const plainHost = /^[a-z0-9.-]+$/i.test(url.hostname);
      const httpScheme = url.protocol === 'https:' || url.protocol === 'http:';
      return httpScheme && isOriginOnly && plainHost ? [url.origin] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(origins)];
}
