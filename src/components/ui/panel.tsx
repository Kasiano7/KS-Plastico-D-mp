import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Carte — la brique unique de tout le tableau de bord.
 *
 * Une seule surface, un seul rayon, un seul trait : la hiérarchie est portée
 * par la typographie et l'espace, jamais par des fonds ou des ombres.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'panel-surface flex flex-col rounded-panel border border-edge shadow-panel',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** En-tête de carte : titre à gauche, contrôle secondaire à droite. */
export function PanelHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-center justify-between gap-2 px-3.5 pt-3 pb-2', className)}>
      <h2 className="min-w-0 truncate text-[0.8125rem] leading-tight font-semibold text-ink">
        {title}
      </h2>
      {action}
    </header>
  );
}

/** Titre de section discret, en capitales — utilisé par le panneau d'alertes. */
export function PanelEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-[0.625rem] font-semibold tracking-[0.14em] text-ink-muted uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-h-0 flex-1 px-3.5 pb-3', className)}>{children}</div>;
}

/**
 * Lien de pied de carte (« Voir toutes les machines › »).
 * Toujours la même forme : c'est ce qui rend l'application prévisible.
 */
export function PanelLink({
  href,
  children,
  align = 'center',
  className,
}: {
  href: string;
  children: React.ReactNode;
  align?: 'center' | 'end';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex px-3.5 pt-1.5 pb-3',
        align === 'center' ? 'justify-center' : 'justify-end',
        className,
      )}
    >
      <Link
        href={href}
        prefetch={false}
        className="group inline-flex items-center gap-1 text-[0.6875rem] font-medium text-primary transition-colors hover:text-primary-hover"
      >
        {children}
        <ChevronRight
          className="size-3 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
        />
      </Link>
    </div>
  );
}

/** Étiquette de période affichée en en-tête de carte — lecture seule. */
export function PeriodLabel({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-chip border border-edge bg-background-secondary px-1.5 py-[3px] text-[0.625rem] font-medium whitespace-nowrap text-ink-muted',
        className,
      )}
    >
      {label}
    </span>
  );
}
