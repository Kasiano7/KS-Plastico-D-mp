import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Page introuvable' };

/**
 * 404 applicative — même gabarit que `/acces-refuse` (§ SECURITY.md « Reste
 * à durcir » : une page d'erreur cohérente plutôt que l'écran blanc par
 * défaut de Next). Volontairement statique et sans dépendance à la session :
 * une route inexistante ne doit jamais dépendre d'une lecture réussie en base.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-info-soft text-info">
          <Compass className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-fg">Page introuvable</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Cette adresse ne correspond à aucune page de KS Plastico Demo. Elle a peut-être été déplacée, ou
          le lien suivi n’est plus valide.
        </p>
        <Link href="/" className={buttonClass('secondary', 'md', 'mt-6')}>
          Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}
