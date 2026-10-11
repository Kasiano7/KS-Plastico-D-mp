import { Lock } from 'lucide-react';
import { isDemoMode } from '@/config/demo';

/**
 * Administration (utilisateurs, rôles, permissions).
 *
 * En démonstration, l'onglet reste visible pour montrer ce que l'application
 * sait faire, mais son contenu est grisé et rendu inerte : personne ne doit
 * pouvoir modifier les accès d'une démonstration publique. Les écritures sont
 * de toute façon refusées côté serveur (garde démo) ; le grisage évite d'y
 * inviter. Hors démonstration, rien ne change.
 */
export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  if (!isDemoMode()) return children;

  return (
    <div className="space-y-4">
      <div
        role="note"
        className="flex items-start gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft px-4 py-3 text-fg"
      >
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-semibold">Désactivé en mode démo</p>
          <p className="mt-0.5 text-fg-muted">
            L’administration des utilisateurs, des rôles et des permissions est présentée en
            lecture seule : les accès de la démonstration ne peuvent pas être modifiés.
          </p>
        </div>
      </div>

      <div inert aria-disabled="true" className="pointer-events-none opacity-50 grayscale select-none">
        {children}
      </div>
    </div>
  );
}
