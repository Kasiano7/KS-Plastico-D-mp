import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * TOTP — RFC 6238 (et HOTP sous-jacent, RFC 4226). Aucune dépendance externe :
 * l'algorithme tient dans `node:crypto`, et c'est un standard figé depuis
 * 2011 — pas de bibliothèque à maintenir pour ça. Testé contre les vecteurs
 * officiels de la RFC (§ __tests__/totp.test.ts), pas seulement contre
 * lui-même : l'enjeu est l'interopérabilité avec de vraies applications
 * d'authentification (Google Authenticator, etc.), pas juste l'auto-cohérence.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secret aléatoire de 160 bits (recommandation RFC 4226 §4 pour SHA-1), prêt à afficher en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) — brique de calcul du TOTP, exposée séparément pour les tests contre les vecteurs officiels. */
export function computeHotpCode(secretBase32: string, counter: number, digits = DEFAULT_DIGITS): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  // Compteur 64 bits grand-boutiste — au-delà de Number.MAX_SAFE_INTEGER pour
  // le compteur de temps TOTP il faudrait BigInt, largement hors de portée ici
  // (des milliards d'années de pas de 30 s).
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[19]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const code = (binary % 10 ** digits).toString().padStart(digits, '0');
  return code;
}

export function computeTotpCode(
  secretBase32: string,
  atMs: number,
  stepSeconds = DEFAULT_STEP_SECONDS,
  digits = DEFAULT_DIGITS,
): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  return computeHotpCode(secretBase32, counter, digits);
}

/**
 * Tolère un pas avant/après (§ dérive d'horloge côté téléphone) — fenêtre
 * volontairement étroite : plus large affaiblirait la protection contre le
 * rejeu.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  atMs: number,
  window = 1,
  stepSeconds = DEFAULT_STEP_SECONDS,
  digits = DEFAULT_DIGITS,
): boolean {
  const normalized = code.trim();
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) return false;
  const counter = Math.floor(atMs / 1000 / stepSeconds);

  for (let delta = -window; delta <= window; delta++) {
    const expected = computeHotpCode(secretBase32, counter + delta, digits);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
  }
  return false;
}

export function buildOtpAuthUri(params: { secretBase32: string; accountLabel: string; issuer?: string }): string {
  const issuer = params.issuer ?? 'KS Plastico Demo';
  const label = encodeURIComponent(`${issuer}:${params.accountLabel}`);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Codes de secours — lisibles à la main (pas de caractères ambigus 0/O, 1/I),
 * groupés en `xxxx-xxxx` pour la même raison qu'un numéro de téléphone se lit
 * mieux par blocs.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}
