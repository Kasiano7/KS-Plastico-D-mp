import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Panel, PanelHeader, PanelLink } from '@/components/ui/panel';
import { DemoDataBadge } from './demo-data-notice';
import { cn } from '@/lib/cn';
import type { SkillGap, TechnicianLoad } from '@/types/maintenance';

/**
 * Affectation intelligente.
 *
 * Aujourd'hui : charge et compétence de chaque technicien, plus l'alerte
 * quand aucune compétence n'est disponible. Demain : ce panneau proposera le
 * bon intervenant en croisant compétence, disponibilité, charge, zone et type
 * d'intervention. La forme est déjà celle d'une recommandation — l'humain
 * garde la décision, il clique sur « Planifier ».
 */

/** La charge se lit d'abord à la couleur de la jauge, puis au chiffre. */
function loadTone(loadPct: number): { bar: string; text: string } {
  if (loadPct > 70) return { bar: 'bg-danger', text: 'text-danger' };
  if (loadPct > 45) return { bar: 'bg-accent-orange', text: 'text-accent-orange' };
  return { bar: 'bg-accent-green', text: 'text-accent-green' };
}

export function TechnicianAssignment({
  technicians,
  skillGap,
}: {
  technicians: TechnicianLoad[];
  skillGap: SkillGap;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Affectation intelligente"
        action={<DemoDataBadge />}
      />

      <div className="min-h-0 flex-1 px-3.5 pb-2">
        <div className="mb-1.5 flex items-center gap-2 text-[0.5625rem] font-semibold tracking-[0.1em] text-ink-dim uppercase">
          <span className="flex-1">Technicien</span>
          <span className="w-[38%]">Compétence</span>
          <span className="w-11 text-right">Charge</span>
        </div>

        <ul className="space-y-2">
          {technicians.map((technician) => {
            const tone = loadTone(technician.loadPct);
            return (
              <li key={technician.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-ink">
                  {technician.name}
                </span>
                <span className="w-[38%] min-w-0 truncate text-[0.625rem] text-ink-muted">
                  {technician.skill}
                </span>
                <span className="w-11 shrink-0">
                  <span className={cn('tnum block text-right text-[0.625rem] font-semibold', tone.text)}>
                    {technician.loadPct} %
                  </span>
                  <span
                    aria-hidden
                    className="mt-0.5 block h-[3px] overflow-hidden rounded-full bg-background-secondary"
                  >
                    <span
                      className={cn('block h-full rounded-full', tone.bar)}
                      style={{ width: `${Math.min(technician.loadPct, 100)}%` }}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <PanelLink href="/personnel" align="end">
        Voir tous les techniciens
      </PanelLink>

      <div className="mx-3.5 mb-3 flex items-start gap-2 rounded-chip border border-accent-orange/30 bg-accent-orange/10 px-2.5 py-2">
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-accent-orange" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold text-accent-orange">{skillGap.message}</p>
          <p className="mt-0.5 text-[0.625rem] text-ink-muted">
            Prochaine disponibilité : {skillGap.nextAvailability}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-0.5 self-center rounded-chip px-1.5 py-1 text-[0.625rem] font-semibold text-primary transition-colors hover:text-primary-hover"
        >
          Planifier
          <ChevronRight className="size-3" strokeWidth={2.25} />
        </button>
      </div>
    </Panel>
  );
}
