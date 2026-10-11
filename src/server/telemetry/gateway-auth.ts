import { safeSecretMatch } from '../security/safe-compare';

/**
 * Authentification de la passerelle machine (§ INDUSTRIAL_INTEGRATION).
 *
 * Extrait de la route pour une raison purement mécanique : un fichier
 * `route.ts` de l'App Router ne peut exporter que les symboles reconnus par
 * Next (méthodes HTTP, `runtime`, `dynamic`…) — tout autre export y casse la
 * vérification de types générée au build.
 */

export function gatewayAuthError(request: Request): Response | null {
  const configuredSecret = process.env.MACHINE_GATEWAY_SECRET;
  if (!configuredSecret) {
    return Response.json(
      { ok: false, error: 'La passerelle machine n’est pas configurée.' },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization');
  const receivedSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  return safeSecretMatch(receivedSecret, configuredSecret)
    ? null
    : Response.json({ ok: false, error: 'Authentification refusée.' }, { status: 401 });
}
