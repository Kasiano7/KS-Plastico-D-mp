import { timingSafeEqual } from 'node:crypto';

/**
 * Comparaison de secret en temps constant, pour ne pas laisser fuir sa
 * longueur ni son contenu via le timing — utilisée partout où une requête
 * s'authentifie par jeton partagé plutôt que par session (passerelle
 * machine, cron Vercel…).
 */
export function safeSecretMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
