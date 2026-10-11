import 'server-only';

import { headers } from 'next/headers';

/**
 * Adresse IP du client, telle que transmise par le proxy (Vercel, ou tout
 * reverse-proxy en amont). Best-effort : sert à limiter le débit, pas à une
 * décision de sécurité forte — un en-tête `X-Forwarded-For` reste déclaratif.
 */
export async function getClientIp(): Promise<string> {
  const store = await headers();
  const forwardedFor = store.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]!.trim();
  return store.get('x-real-ip') ?? 'unknown';
}
