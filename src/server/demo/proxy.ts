import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_DEMO_ROLE,
  DEMO_EMBED_COOKIE,
  DEMO_EMBED_HEADER,
  DEMO_EMBED_PARAM,
  DEMO_ROLE_COOKIE,
  DEMO_ROLE_HEADER,
  DEMO_ROLE_PARAM,
  isDemoBlockedPath,
  parseDemoRole,
  type DemoRoleKey,
} from '@/config/demo';

/**
 * Volet démonstration du proxy (`DEMO_MODE=true` uniquement).
 *
 * 1. Résout le point de vue : `?role=` > cookie partitionné > page précédente
 *    (en-tête `Referer`, même origine) > Direction. Le résultat part au
 *    serveur dans l'en-tête de requête `x-demo-role` ; aucun cookie n'est
 *    nécessaire pour que la démonstration fonctionne.
 * 2. Mémorise le choix dans un cookie `SameSite=None; Secure; Partitioned`
 *    (CHIPS) : accepté dans une iframe intersite par Chrome, Edge et Firefox.
 * 3. Si ce cookie est refusé (Safari, cookies tiers bloqués), propage
 *    `?role=` / `?embed=1` en redirigeant la navigation suivante : l'URL
 *    porte alors elle-même le point de vue, page après page.
 * 4. Renvoie vers `/demo` tout ce qui n'a pas de sens sans compte (connexion,
 *    mot de passe, comptes, administration), puis `/demo` vers l'accueil.
 */

const DEMO_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  partitioned: true,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const;

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

type DemoProxyContext = {
  requestHeaders: Headers;
  /** `NextResponse.next()` avec les en-têtes de requête et la CSP du proxy principal. */
  next: () => NextResponse;
  csp: string | null;
};

function sameOriginReferer(request: NextRequest): URL | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin === request.nextUrl.origin ? url : null;
  } catch {
    return null;
  }
}

export function demoProxy(request: NextRequest, { requestHeaders, next, csp }: DemoProxyContext): NextResponse {
  const url = request.nextUrl;

  if (url.pathname === '/robots.txt') {
    return new NextResponse(ROBOTS_TXT, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const referer = sameOriginReferer(request);
  const paramRole = parseDemoRole(url.searchParams.get(DEMO_ROLE_PARAM));
  const paramEmbed = url.searchParams.get(DEMO_EMBED_PARAM) === '1';
  const cookieRole = parseDemoRole(request.cookies.get(DEMO_ROLE_COOKIE)?.value);
  const cookieEmbed = request.cookies.get(DEMO_EMBED_COOKIE)?.value === '1';
  const refererRole = parseDemoRole(referer?.searchParams.get(DEMO_ROLE_PARAM));
  const refererEmbed = referer?.searchParams.get(DEMO_EMBED_PARAM) === '1';

  const role: DemoRoleKey = paramRole ?? cookieRole ?? refererRole ?? DEFAULT_DEMO_ROLE;
  const embed = paramEmbed || cookieEmbed || refererEmbed;

  // Ce que le cookie ne retient pas doit voyager dans l'URL.
  const roleNeedsUrl = role !== (cookieRole ?? DEFAULT_DEMO_ROLE);
  const embedNeedsUrl = embed && !cookieEmbed;

  function remember(response: NextResponse): NextResponse {
    if (paramRole && paramRole !== cookieRole) {
      response.cookies.set(DEMO_ROLE_COOKIE, paramRole, DEMO_COOKIE_OPTIONS);
    }
    if (paramEmbed && !cookieEmbed) {
      response.cookies.set(DEMO_EMBED_COOKIE, '1', DEMO_COOKIE_OPTIONS);
    }
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  function redirectTo(pathname: string, keepSearch: boolean): NextResponse {
    const target = new URL(pathname, request.url);
    if (keepSearch) target.search = url.search;
    if (roleNeedsUrl) target.searchParams.set(DEMO_ROLE_PARAM, role);
    if (embedNeedsUrl) target.searchParams.set(DEMO_EMBED_PARAM, '1');
    const response = NextResponse.redirect(target);
    if (csp) response.headers.set('Content-Security-Policy', csp);
    return remember(response);
  }

  if (url.pathname === '/demo') return redirectTo('/', false);
  if (isDemoBlockedPath(url.pathname)) return redirectTo('/demo', false);

  // Navigation sans le point de vue dans l'URL alors que le cookie ne le porte pas.
  const isNavigation = request.method === 'GET' && !url.pathname.startsWith('/api/');
  if (
    isNavigation &&
    ((roleNeedsUrl && !paramRole) || (embedNeedsUrl && !paramEmbed))
  ) {
    return redirectTo(url.pathname, true);
  }

  requestHeaders.set(DEMO_ROLE_HEADER, role);
  requestHeaders.set(DEMO_EMBED_HEADER, embed ? '1' : '0');
  return remember(next());
}
