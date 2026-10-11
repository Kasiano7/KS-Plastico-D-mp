import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SEVERITY_CHIP, SEVERITY_SYMBOLS, type Severity } from './severity';

/* ─────────────────────────────────────────────────────────────── Card ──── */

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] leading-6 font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center gap-3 border-t border-line px-5 py-3 text-sm', className)}
      {...props}
    />
  );
}

/* ──────────────────────────────────────────────────────────── Sections ─── */

export function SectionTitle({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-4', className)}>
      <h2 className="text-xs font-semibold tracking-[0.08em] text-fg-subtle uppercase">{children}</h2>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── Badges ─── */

export function StatusBadge({
  severity,
  children,
  className,
  size = 'md',
}: {
  severity: Severity;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[0.6875rem]' : 'px-2.5 py-1 text-xs',
        SEVERITY_CHIP[severity],
        className,
      )}
    >
      <span aria-hidden className="text-[0.5rem] leading-none">
        {SEVERITY_SYMBOLS[severity]}
      </span>
      {children}
    </span>
  );
}

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'brand' | 'outline';
}) {
  const tones = {
    neutral: 'bg-surface-sunken text-fg-muted border-line',
    brand: 'bg-brand-soft text-brand border-brand/25',
    outline: 'bg-transparent text-fg-muted border-line-strong',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ severity, pulse }: { severity: Severity; pulse?: boolean }) {
  const colors: Record<Severity, string> = {
    normal: 'bg-normal',
    info: 'bg-info',
    warning: 'bg-warning',
    critical: 'bg-critical',
  };
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        colors[severity],
        pulse && severity === 'critical' && 'animate-pulse-ring',
      )}
    />
  );
}

/* ───────────────────────────────────────────────────────────── Boutons ─── */

const buttonVariants = {
  primary:
    'bg-brand text-white hover:bg-brand-hover shadow-[var(--shadow-xs)] disabled:bg-brand/50',
  secondary:
    'bg-surface text-fg border border-line-strong hover:bg-surface-sunken disabled:text-fg-subtle',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
  danger: 'bg-critical text-white hover:opacity-90',
  success: 'bg-normal text-white hover:opacity-90',
} as const;

const buttonSizes = {
  sm: 'h-8 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[0.9375rem] gap-2',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: keyof typeof buttonSizes = 'md',
  className?: string,
) {
  return cn(
    'inline-flex items-center justify-center rounded-[var(--radius-control)] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ─────────────────────────────────────────────────────────── Formulaire ── */

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none focus-visible:outline-none';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(inputClass, 'pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(inputClass, 'h-auto min-h-20 py-2 leading-relaxed', className)}
      {...props}
    />
  );
}

/* ──────────────────────────────────────────────────────────── Tableaux ─── */

/**
 * Tableau de données.
 *
 * `maxHeight` rend l'en-tête collant : sur une liste de quarante lignes, on
 * perd sinon le nom des colonnes dès le premier défilement, et un tableau dont
 * on ne sait plus lire les colonnes ne sert à rien.
 */
export function Table({
  className,
  maxHeight,
  ...props
}: ComponentProps<'table'> & { maxHeight?: string }) {
  return (
    <div
      className={cn('w-full overflow-x-auto', maxHeight && 'overflow-y-auto')}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

/**
 * En-tête de colonne.
 * `numeric` aligne à droite : une colonne de nombres se compare colonne par
 * colonne, ce qui suppose que les unités soient alignées entre elles.
 */
export function Th({
  className,
  numeric = false,
  sticky = false,
  ...props
}: ComponentProps<'th'> & { numeric?: boolean; sticky?: boolean }) {
  return (
    <th
      className={cn(
        'border-b border-line px-4 py-2.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase whitespace-nowrap',
        numeric ? 'text-right' : 'text-left',
        // Le fond est indispensable : sans lui, les lignes défilent en
        // transparence derrière l'en-tête collant.
        sticky && 'sticky top-0 z-10 bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric = false,
  ...props
}: ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'border-b border-line-soft px-4 py-3 align-middle text-fg',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-surface-sunken', className)} {...props} />;
}

/* ────────────────────────────────────────────────────────────── Divers ─── */

export function Progress({
  value,
  severity = 'normal',
  className,
  label,
}: {
  value: number;
  severity?: Severity;
  className?: string;
  label?: string;
}) {
  const colors: Record<Severity, string> = {
    normal: 'bg-normal',
    info: 'bg-info',
    warning: 'bg-warning',
    critical: 'bg-critical',
  };
  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', colors[severity])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-sunken', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Indique la provenance d'un chiffre (§16, §40).
 * Une estimation ne doit jamais être confondue avec une mesure.
 */
export function DataOrigin({
  origin,
  className,
}: {
  origin: 'measured' | 'computed' | 'estimated' | 'forecast';
  className?: string;
}) {
  const labels = {
    measured: 'Mesuré',
    computed: 'Calculé',
    estimated: 'Estimé',
    forecast: 'Prévisionnel',
  } as const;

  return (
    <span
      title={
        {
          measured: 'Donnée relevée directement sur le terrain.',
          computed: 'Valeur calculée à partir de données réelles.',
          estimated: 'Estimation fondée sur un modèle de coût.',
          forecast: 'Projection sur la base des consommations observées.',
        }[origin]
      }
      className={cn(
        'inline-flex items-center rounded border border-line px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-fg-subtle uppercase',
        className,
      )}
    >
      {labels[origin]}
    </span>
  );
}
