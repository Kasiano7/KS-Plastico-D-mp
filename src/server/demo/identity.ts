import 'server-only';

import { cookies, headers } from 'next/headers';
import {
  DEFAULT_DEMO_ROLE,
  DEMO_EMBED_COOKIE,
  DEMO_EMBED_HEADER,
  DEMO_ROLE_COOKIE,
  DEMO_ROLE_HEADER,
  parseDemoRole,
  type DemoRoleKey,
} from '@/config/demo';

/**
 * Point de vue de démonstration de la requête courante.
 *
 * Le proxy résout le rôle (URL, cookie partitionné, page précédente) et le
 * transmet dans un en-tête de requête : c'est la source normale. Le cookie
 * n'est relu qu'en secours, et le rôle Direction s'applique sans rien.
 */
export async function currentDemoRole(): Promise<DemoRoleKey> {
  const fromHeader = parseDemoRole((await headers()).get(DEMO_ROLE_HEADER));
  if (fromHeader) return fromHeader;
  return parseDemoRole((await cookies()).get(DEMO_ROLE_COOKIE)?.value) ?? DEFAULT_DEMO_ROLE;
}

/** Affichage intégré (`?embed=1`) : l'application tourne dans une iframe du site KS. */
export async function isDemoEmbed(): Promise<boolean> {
  if ((await headers()).get(DEMO_EMBED_HEADER) === '1') return true;
  return (await cookies()).get(DEMO_EMBED_COOKIE)?.value === '1';
}
