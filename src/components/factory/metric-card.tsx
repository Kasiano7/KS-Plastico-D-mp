import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SEVERITY_TEXT, SEVERITY_BG, type Severity } from '@/components/ui/severity';
import { Progress } from '@/components/ui/primitives';

/**
 * Tuile du résumé opérationnel (§10).
 * Une tuile = une question, une réponse, une couleur qui veut dire quelque chose.
 */
export function MetricCard({
  label,
  value,
  unit,
  severity,
  hint,
  progress,
  href,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  severity: Severity;
  hint?: string;
  progress?: number;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.75rem] font-medium text-fg-muted">{label}</p>
        <span className={cn('mt-1 block size-1.5 shrink-0 rounded-full', SEVERITY_BG[severity])} aria-hidden />
      </div>

      <p className="mt-2 flex items-baseline gap-1">
        <span className={cn('tabular text-[1.75rem] leading-none font-semibold tracking-tight', SEVERITY_TEXT[severity])}>
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-fg-subtle">{unit}</span> : null}
      </p>

      {progress !== undefined ? (
        <Progress value={progress} severity={severity} className="mt-3" label={label} />
      ) : null}

      {hint ? <p className="mt-2 text-[0.75rem] leading-snug text-fg-subtle">{hint}</p> : null}

      {href ? (
        <ArrowUpRight className="absolute top-4 right-4 size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </>
  );

  const base = cn(
    'group relative rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]',
    href && 'transition-colors hover:border-line-strong',
    className,
  );

  return href ? (
    <Link href={href} prefetch={false} className={base}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}
