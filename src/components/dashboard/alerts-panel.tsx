import { AlertTriangle } from 'lucide-react';
import { Panel, PanelEyebrow, PanelLink } from '@/components/ui/panel';
import { SEVERITY_LABEL, SEVERITY_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { AlertsPanelData, CriticalAlert } from '@/types/dashboard';

/**
 * Centre d'alertes condensé.
 *
 * Chaque ligne répond à deux questions et pas une de plus : que se passe-t-il,
 * et sur quoi. Le diagnostic complet (cause → conséquence → recommandation)
 * vit dans le centre d'alertes, pas ici.
 */
export function AlertsPanel({ data, className }: { data: AlertsPanelData; className?: string }) {
  return (
    <Panel className={cn('justify-between', className)}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-3.5 pt-2 pb-1">
          <PanelEyebrow>Alertes critiques</PanelEyebrow>
        </div>

        {/* Les lignes se répartissent la hauteur disponible : sur un grand
            écran la carte respire, sur un petit elle reste dense. */}
        <ul className="flex flex-1 flex-col divide-y divide-edge-soft">
          {data.alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </ul>
      </div>

      <PanelLink href="/alertes" align="end" className="pt-1">
        Voir toutes les alertes ({data.totalCount})
      </PanelLink>
    </Panel>
  );
}

export function AlertItem({ alert }: { alert: CriticalAlert }) {
  return (
    <li className="flex flex-1 items-center gap-2.5 px-3.5 py-[5px]">
      <AlertTriangle
        className={cn('size-3.5 shrink-0', SEVERITY_TEXT[alert.severity])}
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate text-[0.75rem] leading-tight font-semibold text-ink">
          {/* La couleur ne porte jamais seule l'information de gravité. */}
          <span className="sr-only">{SEVERITY_LABEL[alert.severity]} — </span>
          {alert.title}
        </p>
        <p className="mt-0.5 truncate text-[0.625rem] leading-tight text-ink-dim">{alert.detail}</p>
      </div>
    </li>
  );
}
