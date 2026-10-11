import { cn } from '@/lib/cn';
import { formatDuration, formatTime } from '@/lib/format';
import { SEVERITY_BG, SEVERITY_TEXT, type Severity } from '@/components/ui/severity';

export type TimelineEntry = {
  id: string;
  label: string;
  severity: Severity;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
  detail?: string | null;
};

/**
 * Timeline machine (§30) : la journée reconstituée à la minute.
 * La barre horizontale donne la proportion, la liste donne le détail.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-5 pb-5 text-sm text-fg-muted">Aucun événement enregistré aujourd’hui.</p>;
  }

  const total = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0) || 1;

  return (
    <div className="px-5 pb-5">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label="Répartition de la journée par état machine"
      >
        {entries.map((entry) => (
          <span
            key={entry.id}
            title={`${entry.label} · ${formatTime(entry.startedAt)} → ${entry.endedAt ? formatTime(entry.endedAt) : 'en cours'}`}
            className={cn(SEVERITY_BG[entry.severity], 'h-full')}
            style={{ width: `${(entry.durationMinutes / total) * 100}%` }}
          />
        ))}
      </div>

      <ol className="mt-4 space-y-0">
        {entries.map((entry, index) => (
          <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < entries.length - 1 ? (
              <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-line" />
            ) : null}
            <span
              aria-hidden
              className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface', SEVERITY_BG[entry.severity])}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-[0.8125rem] font-medium text-fg">
                  {formatTime(entry.startedAt)}
                </span>
                <span className={cn('text-[0.8125rem] font-medium', SEVERITY_TEXT[entry.severity])}>
                  {entry.label}
                </span>
                <span className="tabular text-xs text-fg-subtle">
                  {entry.endedAt ? formatDuration(entry.durationMinutes) : `en cours · ${formatDuration(entry.durationMinutes)}`}
                </span>
              </div>
              {entry.detail ? (
                <p className="mt-0.5 text-[0.75rem] text-fg-muted">{entry.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
