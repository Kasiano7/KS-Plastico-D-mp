'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatTime } from '@/lib/format';
import { scheduleProductionOrderAction } from '@/server/actions/planning';

const DAY_MS = 86_400_000;

const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-brand/15 border-brand/40 text-brand',
  released: 'bg-brand/20 border-brand/50 text-brand',
  running: 'bg-normal-soft border-normal/40 text-normal',
  paused: 'bg-warning-soft border-warning/45 text-warning',
  done: 'bg-surface-sunken border-line text-fg-muted',
  cancelled: 'bg-surface-sunken border-line text-fg-subtle line-through',
};

/** Statuts qu'un planificateur peut encore déplacer — un ordre déjà lancé
 * relève du terrain, pas du planning (même règle que `cancelProductionOrderAction`). */
const DRAGGABLE_STATUSES = new Set(['planned', 'released']);

export type GanttOrder = {
  id: string;
  number: string;
  status: string;
  machineId: string;
  productName: string;
  plannedStartAt: string;
  plannedEndAt: string;
};

export type GanttMachine = { id: string; code: string; name: string };

export function GanttBoard({
  workshops,
  orders,
  windowStartIso,
  horizonDays,
  canWrite,
}: {
  workshops: { name: string; machines: GanttMachine[] }[];
  orders: GanttOrder[];
  windowStartIso: string;
  horizonDays: number;
  canWrite: boolean;
}) {
  const windowStart = new Date(windowStartIso).getTime();
  const windowEnd = windowStart + horizonDays * DAY_MS;
  const days = Array.from({ length: horizonDays }, (_, index) => new Date(windowStart + index * DAY_MS));

  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // Un `dragstart` a lieu avant le `click` correspondant : s'il s'est
  // effectivement produit, le clic qui suit ne doit pas ouvrir la fiche.
  const didDragRef = useRef(false);

  function handleDrop(machineId: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    if (!orderId) return;

    const order = orders.find((candidate) => candidate.id === orderId);
    const row = rowRefs.current.get(machineId);
    if (!order || !row) return;

    const rect = row.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const dropDayIndex = Math.floor(ratio * horizonDays);

    // Le jour change, l'heure de la journée et la durée de l'ordre sont conservées :
    // glisser une barre ne fait que la déplacer sur l'axe du temps, pas la redimensionner.
    const originalStart = new Date(order.plannedStartAt);
    const originalEnd = new Date(order.plannedEndAt);
    const durationMs = originalEnd.getTime() - originalStart.getTime();
    const originalDayIndex = Math.floor((originalStart.getTime() - windowStart) / DAY_MS);
    const dayDelta = dropDayIndex - originalDayIndex;
    if (dayDelta === 0 && order.machineId === machineId) return;

    const newStart = new Date(originalStart.getTime() + dayDelta * DAY_MS);
    const newEnd = new Date(newStart.getTime() + durationMs);

    setError(null);
    const formData = new FormData();
    formData.set('productionOrderId', order.id);
    formData.set('machineId', machineId);
    formData.set('plannedStartAt', newStart.toISOString());
    formData.set('plannedEndAt', newEnd.toISOString());

    startTransition(async () => {
      try {
        const result = await scheduleProductionOrderAction({}, formData);
        // Un succès déclenche `redirect()` côté serveur : cette ligne ne
        // s'exécute alors jamais, Next.js prend la main sur la navigation.
        if (result && result.ok === false) setError(result.message ?? 'Échec de la replanification.');
      } catch (thrown) {
        // `redirect()` lève une erreur interne Next.js qui n'en est pas une :
        // on la laisse remonter, elle porte la navigation.
        throw thrown;
      }
    });
  }

  return (
    <div className="min-w-[900px]">
      {error ? (
        <p className="mb-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3.5 py-2.5 text-[0.8125rem] text-critical">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <p className="mb-3 text-xs text-fg-subtle">
          Glissez un ordre planifié ou lancé vers un autre jour ou une autre presse pour le replanifier —
          toutes les règles (compatibilité pièce/machine, disponibilité de la presse) restent vérifiées
          côté serveur.
        </p>
      ) : null}

      {/* En-tête des jours */}
      <div className="mb-2 flex gap-2 pl-[150px]">
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-center text-[0.6875rem] font-medium',
              day.getDay() === 0 || day.getDay() === 6 ? 'bg-surface-sunken text-fg-subtle' : 'text-fg-muted',
            )}
          >
            <span className="block capitalize">
              {day.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })}
            </span>
            <span className="block text-fg-subtle">{formatDate(day).slice(0, 5)}</span>
          </div>
        ))}
      </div>

      {workshops.map(({ name, machines }) => (
        <div key={name} className="mb-4 last:mb-0">
          <p className="mb-1.5 text-[0.6875rem] font-semibold tracking-[0.1em] text-fg-subtle uppercase">{name}</p>

          {machines.map((machine) => {
            const machineOrders = orders.filter((order) => order.machineId === machine.id);

            return (
              <div key={machine.id} className="mb-1.5 flex items-stretch gap-2">
                <div className="w-[142px] shrink-0 self-center">
                  <Link href={`/machines/${machine.id}`} className="block truncate text-[0.8125rem] font-medium text-fg hover:text-brand">
                    {machine.name}
                  </Link>
                  <span className="block text-[0.6875rem] text-fg-subtle">{machine.code}</span>
                </div>

                <div
                  ref={(node) => {
                    if (node) rowRefs.current.set(machine.id, node);
                    else rowRefs.current.delete(machine.id);
                  }}
                  onDragOver={(event) => {
                    if (canWrite) event.preventDefault();
                  }}
                  onDrop={canWrite ? (event) => handleDrop(machine.id, event) : undefined}
                  className={cn(
                    'relative h-11 flex-1 overflow-hidden rounded-md border bg-surface-sunken transition-colors',
                    draggingId ? 'border-brand/50' : 'border-line',
                  )}
                >
                  {days.map((_, index) => (
                    <span key={index} aria-hidden className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${(index / horizonDays) * 100}%` }} />
                  ))}

                  {machineOrders.map((order) => {
                    const orderStart = new Date(order.plannedStartAt).getTime();
                    const orderEnd = new Date(order.plannedEndAt).getTime();
                    const start = Math.max(orderStart, windowStart);
                    const end = Math.min(orderEnd, windowEnd);
                    const left = ((start - windowStart) / (horizonDays * DAY_MS)) * 100;
                    const width = Math.max(((end - start) / (horizonDays * DAY_MS)) * 100, 1.5);
                    const draggable = canWrite && DRAGGABLE_STATUSES.has(order.status);

                    return (
                      <div
                        key={order.id}
                        draggable={draggable}
                        onDragStart={(event) => {
                          didDragRef.current = true;
                          event.dataTransfer.setData('text/plain', order.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(order.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => {
                          if (didDragRef.current) {
                            didDragRef.current = false;
                            return;
                          }
                          if (canWrite) router.push(`/planning/nouveau?ordre=${order.id}`);
                        }}
                        role={canWrite ? 'button' : undefined}
                        tabIndex={canWrite ? 0 : undefined}
                        onKeyDown={(event) => {
                          if (canWrite && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            router.push(`/planning/nouveau?ordre=${order.id}`);
                          }
                        }}
                        title={`${order.productName} · ${order.number} · ${formatTime(new Date(order.plannedStartAt))} → ${formatTime(new Date(order.plannedEndAt))}${canWrite ? ' · cliquer pour modifier' : ''}${draggable ? ' · glisser pour replanifier' : ''}`}
                        className={cn(
                          'absolute top-1 bottom-1 block overflow-hidden rounded border px-2 py-1',
                          STATUS_STYLES[order.status] ?? STATUS_STYLES.planned,
                          canWrite && 'transition-[filter] hover:brightness-95',
                          draggable && 'cursor-grab active:cursor-grabbing',
                          draggingId === order.id && 'opacity-40',
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="block truncate text-[0.6875rem] font-semibold">{order.productName}</span>
                        <span className="block truncate text-[0.625rem] opacity-80">{order.number}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {pending ? (
        <p className="mt-3 flex items-center gap-2 text-[0.75rem] text-fg-muted">
          <Loader2 className="size-3.5 animate-spin" />
          Replanification en cours…
        </p>
      ) : null}
    </div>
  );
}
