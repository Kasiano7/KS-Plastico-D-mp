'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';

/**
 * Filet de rattrapage d'une erreur serveur inattendue (§ SECURITY.md « Reste
 * à durcir »). Sans ce fichier, Next affiche son écran blanc générique — ici
 * l'utilisateur garde une sortie et un message compréhensible.
 *
 * Composant client obligatoire (contrat Next.js `error.tsx`). Ne capture PAS
 * les erreurs du root layout lui-même : voir `global-error.tsx` pour ce cas.
 *
 * `console.error` est le seul point de journalisation pour l'instant — c'est
 * exactement le point d'accroche d'un futur suivi d'erreurs (Sentry ou
 * équivalent), volontairement hors périmètre ici (nécessite un compte externe).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] Erreur non interceptée.', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-critical-soft text-critical">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-fg">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Cette page n’a pas pu s’afficher correctement. Vos données ne sont pas perdues — vous
          pouvez réessayer, ou revenir à l’accueil.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-fg-subtle">Référence : {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={reset} className={buttonClass('primary', 'md')}>
            Réessayer
          </button>
          <Link href="/" className={buttonClass('secondary', 'md')}>
            Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
