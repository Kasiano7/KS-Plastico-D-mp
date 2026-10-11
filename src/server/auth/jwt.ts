import { SignJWT, jwtVerify } from 'jose';

/**
 * Émission et vérification du jeton de session — séparé de `session.ts` pour
 * une raison purement technique : le middleware tourne sur le runtime Edge,
 * qui ne peut importer ni `pg`/`bcryptjs` (Node uniquement) ni `next/headers`
 * (réservé aux Server Components/Actions). Ce module n'a besoin ni de l'un
 * ni de l'autre — seulement de `jose`, compatible Edge — donc lui seul peut
 * être importé depuis `middleware.ts`. `session.ts` l'utilise aussi, pour ne
 * garder qu'une seule implémentation du jeton.
 */

export const SESSION_COOKIE_NAME = 'app_session';

/** Fenêtre glissante : une session active est prolongée à chaque rotation. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

/**
 * Plafond absolu, indépendant de l'activité : au-delà, la session est
 * révoquée même renouvelée en continu — une session ne vit jamais éternellement.
 */
export const SESSION_ABSOLUTE_MAX_SECONDS = 60 * 60 * 24 * 7;

export function authSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET est obligatoire en production.');
    }
    // Secret de développement : jamais utilisé en production, cf. garde ci-dessus.
    return new TextEncoder().encode('ks-plastico-demo-development-secret-do-not-use-in-production');
  }
  return new TextEncoder().encode(value);
}

export type SessionTokenPayload = {
  userId: string;
  /** Épinglé à la première émission et reconduit à chaque rotation — sert au plafond absolu. */
  sessionStart: number;
  /** Horodatage d'émission de CE jeton précis — sert à décider quand le renouveler. */
  issuedAt: number;
};

/**
 * @param sessionStart Omis pour une toute nouvelle session (connexion). Fourni par le
 * middleware lors d'un renouvellement, pour préserver l'horodatage d'origine.
 */
export async function signSessionToken(userId: string, sessionStart?: number): Promise<string> {
  const start = sessionStart ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, sessionStart: start })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('ks-plastico-demo')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(authSecret());
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), { issuer: 'ks-plastico-demo' });
    if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number') return null;
    const sessionStart = typeof payload.sessionStart === 'number' ? payload.sessionStart : payload.iat;
    return { userId: payload.sub, sessionStart, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/' as const,
    maxAge: maxAgeSeconds,
  };
}

/*
 * ──────────────────────────────────────────────── 2FA — jeton intermédiaire ──
 * Le mot de passe est vérifié, mais la session complète n'est PAS encore
 * ouverte : ce jeton court (5 min, cookie distinct) porte juste « ce
 * userId a passé l'étape mot de passe » le temps de saisir le code TOTP.
 * Signé avec le même secret, mais un `issuer` différent : impossible de le
 * confondre avec un vrai jeton de session, même par erreur de câblage.
 */

export const TWO_FACTOR_PENDING_COOKIE_NAME = 'app_2fa_pending';
const TWO_FACTOR_PENDING_TTL_SECONDS = 5 * 60;
const TWO_FACTOR_ISSUER = 'ks-plastico-demo-2fa-pending';

export async function signTwoFactorPendingToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(TWO_FACTOR_ISSUER)
    .setExpirationTime(`${TWO_FACTOR_PENDING_TTL_SECONDS}s`)
    .sign(authSecret());
}

export async function verifyTwoFactorPendingToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), { issuer: TWO_FACTOR_ISSUER });
    if (typeof payload.sub !== 'string') return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function twoFactorPendingCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/' as const,
    maxAge: TWO_FACTOR_PENDING_TTL_SECONDS,
  };
}
