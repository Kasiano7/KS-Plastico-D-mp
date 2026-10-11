import type { NextConfig } from 'next';

/**
 * En-têtes de sécurité statiques (§ SECURITY.md « Reste à durcir »).
 *
 * La Content-Security-Policy N'EST PAS ici : elle a besoin d'un nonce généré
 * à chaque requête (scripts d'hydratation Next.js), ce que cette fonction
 * statique ne peut pas faire — voir `src/middleware.ts`.
 */
const SECURITY_HEADERS = [
  {
    // HTTPS forcé pendant deux ans, y compris sous-domaines. Inoffensif en
    // http:// local : les navigateurs ignorent HSTS hors origine sécurisée.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Filet de sécurité pour les navigateurs qui ignorent `frame-ancestors`
  // (la CSP, elle, le couvre déjà pour les navigateurs modernes).
  //
  // `SAMEORIGIN` et non `DENY` : les deux bloquent identiquement l'encadrement
  // par un site tiers — la seule attaque que cet en-tête prévient. Ils ne
  // diffèrent que sur un point, la capacité de l'application à encadrer ses
  // propres pages. `DENY` l'interdisait, ce qui rendait impossible toute
  // lecture de document en place. Voir `frame-ancestors 'self'` dans proxy.ts.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Désactive ce que l'app n'utilise pas ; le scanner QR (§ qr-scanner-dialog)
    // a réellement besoin de la caméra, donc elle reste autorisée en `self`.
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

/** Démonstration publique : aucune ressource ne doit être indexée, statiques compris. */
const DEMO_MODE = process.env.DEMO_MODE === 'true';

const nextConfig: NextConfig = {
  async headers() {
    // Démonstration intégrée au site KS : `X-Frame-Options` ne sait désigner
    // qu'une origine (`SAMEORIGIN`), il est donc retiré au profit de
    // `frame-ancestors` (CSP du proxy), qui liste les sites autorisés.
    // Hors démonstration, rien ne change.
    const headers = DEMO_MODE
      ? [
          ...SECURITY_HEADERS.filter((header) => header.key !== 'X-Frame-Options'),
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ]
      : SECURITY_HEADERS;
    return [{ source: '/(.*)', headers }];
  },

  // PGlite embarque un binaire WebAssembly : il doit rester externe au bundle
  // serveur. `pg` et `bcryptjs` sont également chargés dynamiquement.
  //
  // Turbopack (bundler par défaut de `next dev`/`next build` depuis la 16)
  // fait planter ce binaire WASM au premier appel (`RuntimeError: Aborted()`
  // sur la moindre requête PGlite, y compris `CREATE SCHEMA`), ce qui bloque
  // toute connexion : la session lit la base au chargement de /connexion.
  // Le même module fonctionne sans problème en Node nu ou sous webpack — le
  // bug est dans le bundling Turbopack, pas dans PGlite. D'où `--webpack`
  // dans les scripts `dev`/`build` de package.json. À retirer si une future
  // version de Next.js/Turbopack corrige ce cas.
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'bcryptjs', 'exceljs'],

  typedRoutes: false,

  experimental: {
    /*
     * Plafond des corps de requête des Server Actions.
     *
     * 1 Mo était incohérent avec l'application elle-même : le dépôt de
     * document et la photo de machine annoncent « 5 Mo maximum » et le
     * vérifient, mais Next.js coupait la requête bien avant — l'utilisateur
     * recevait une erreur de plateforme opaque au lieu du message prévu.
     *
     * 6 Mo laisse passer un fichier de 5 Mo et l'enrobage multipart qui
     * l'accompagne. Le contrôle métier reste la vraie limite : c'est lui qui
     * refuse, avec une phrase compréhensible.
     */
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
