import { ChevronDown, Download, FilePlus2, ShieldPlus } from 'lucide-react';
import { PlanInterventionModal } from './plan-intervention-modal';

/**
 * En-tête de la maintenance : intention à gauche, actions à droite.
 *
 * Une seule action est primaire — planifier une intervention. Les trois autres
 * restent secondaires : si tout était bleu, plus rien ne guiderait l'œil.
 */
export function MaintenanceHeader() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.0625rem] leading-tight font-semibold tracking-tight text-ink">
          Maintenance générale
        </h1>
        <p className="mt-1 text-[0.75rem] text-ink-muted">
          Suivi des équipements, infrastructures, utilités et interventions sur l’ensemble du site.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PlanInterventionModal />
        <SecondaryAction icon={FilePlus2} label="Nouvelle demande" />
        <SecondaryAction icon={ShieldPlus} label="Nouvelle préventive" />
        <SecondaryAction icon={Download} label="Exporter" trailing={ChevronDown} />
      </div>
    </header>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
  trailing: Trailing,
}: {
  icon: typeof Download;
  label: string;
  trailing?: typeof ChevronDown;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-edge bg-card px-3 text-[0.75rem] font-medium text-ink-muted transition-colors hover:border-primary/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {label}
      {Trailing ? <Trailing className="size-3 text-ink-dim" strokeWidth={2} /> : null}
    </button>
  );
}
