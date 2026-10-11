import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_ABSOLUTE_MAX_SECONDS,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '@/server/auth/jwt';
import { demoFrameAncestors, isDemoMode } from '@/config/demo';
import { demoProxy } from '@/server/demo/proxy';

/**
 * Deux responsabilités, toutes deux du ressort exclusif du proxy (elles ont
 * besoin de tourner AVANT le rendu, sur chaque requête). Fichier nommé
 * `proxy.ts` et fonction `proxy` — Next.js 16 a renommé la convention
 * `middleware.ts`/`middleware()`, dépréciée (voir
 * `node_modules/next/dist/docs/.../proxy.md`, § Migration to Proxy) ; cette
 * version tourne d'ailleurs sur le runtime Node.js par défaut, plus Edge.
 *
 * 1. Rotation de session — fenêtre glissante : tant que l'utilisateur est
 *    actif, sa session est prolongée à chaque passage ici plutôt que de
 *    tomber sèchement douze heures après la connexion, au milieu d'un poste.
 *    `sessionStart` est préservé à travers les renouvellements pour un
 *    plafond absolu — une session ne se prolonge jamais indéfiniment par la
 *    seule activité. Ne fait AUCUNE vérification d'autorisation (§ règle 3 de
 *    CLAUDE.md) : un jeton absent/invalide/expiré est laissé tel quel,
 *    `requireUser()`/`getCurrentUser()` côté page restent la seule source de
 *    vérité, relue en base.
 *
 * 2. Content-Security-Policy avec nonce par requête — la seule façon de
 *    restreindre `script-src` sans casser les scripts d'hydratation que
 *    Next.js injecte lui-même (voir la doc officielle Next.js sur la CSP).
 *    Les autres en-têtes de sécurité (HSTS, etc.), eux, sont statiques et
 *    vivent dans `next.config.ts`.
 */

const ROTATE_AFTER_SECONDS = 30 * 60;

/**
 * `frame-ancestors` : `'self'` seul en fonctionnement normal. En
 * démonstration, s'y ajoutent les sites autorisés à intégrer l'application
 * (`DEMO_ALLOWED_FRAME_ANCESTORS`, site vitrine KS par défaut) — le reste de
 * la politique est strictement identique.
 */
function frameAncestors(): string {
  return ["'self'", ...(isDemoMode() ? demoFrameAncestors() : [])].join(' ');
}

function buildCsp(nonce: string): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Nombreux composants (plans d'atelier, badges de sévérité…) posent des
    // couleurs dynamiques via l'attribut `style`, pas des classes Tailwind
    // statiques : 'unsafe-inline' est nécessaire ici. Un CSS injecté reste un
    // risque bien plus faible qu'un script injecté.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // `'self'` bloque toujours l'encadrement par un site tiers — le
    // détournement de clic reste impossible. Ce que cela autorise, et que
    // `'none'` interdisait, c'est qu'une page de l'application affiche un de
    // ses propres documents dans un cadre plutôt que de forcer un
    // téléchargement. `object-src 'none'` reste en place : seul `<iframe>`
    // est permis, jamais `<object>` ni `<embed>`.
    `frame-ancestors ${frameAncestors()}`,
    'upgrade-insecure-requests',
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  // `next dev --webpack` recompile/HMR exécute du JS généré via `eval()` —
  // une CSP stricte le bloque et casse l'hydratation (page blanche en local).
  // La CSP stricte ne protège que ce qui compte réellement : le build de
  // production, celui qui tourne devant de vrais navigateurs.
  const csp = process.env.NODE_ENV === 'production' ? buildCsp(nonce) : null;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  function next(init?: Parameters<typeof NextResponse.next>[0]) {
    const response = NextResponse.next({ ...init, request: { headers: requestHeaders } });
    if (csp) response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // Démonstration publique : pas de session, point de vue résolu sans connexion.
  if (isDemoMode()) return demoProxy(request, { requestHeaders, next: () => next(), csp });

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return next();

  const verified = await verifySessionToken(token);
  if (!verified) return next();

  const now = Math.floor(Date.now() / 1000);

  if (now - verified.sessionStart > SESSION_ABSOLUTE_MAX_SECONDS) {
    const response = NextResponse.redirect(new URL('/connexion', request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    if (csp) response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  if (now - verified.issuedAt < ROTATE_AFTER_SECONDS) {
    return next();
  }

  const response = next();
  const fresh = await signSessionToken(verified.userId, verified.sessionStart);
  response.cookies.set(SESSION_COOKIE_NAME, fresh, sessionCookieOptions());
  return response;
}

export const config = {
  // Exclu par extension, pas par chemin : `/machines/…` sert à la fois des
  // photos statiques (`public/machines/*.png`) ET la vraie route applicative
  // `/machines/[id]` — un préfixe de chemin aurait ignoré la seconde.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
