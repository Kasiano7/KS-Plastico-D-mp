import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Signalement des données de démonstration.
 *
 * La maintenance de site affiche depuis le début des chiffres écrits à la
 * main — 42 demandes ouvertes, 91,4 % de disponibilité, 128 450 € de coût —
 * et **rien à l'écran ne le disait**. Un responsable qui prend « 91,4 % » pour
 * une mesure décide sur du vide.
 *
 * Le problème s'est aggravé depuis que le référentiel d'actifs existe : une
 * partie de l'écran est désormais réelle, l'autre non, et le mélange est
 * indiscernable. D'où deux marqueurs complémentaires plutôt qu'un seul :
 *
 *   · `DemoDataBadge` sur chaque panneau concerné — on ne peut pas lire un
 *     chiffre sans voir d'où il vient (règle n° 4) ;
 *   · `DemoDataNotice` en tête d'onglet, qui explique une fois pourquoi et
 *     jusqu'à quand.
 */

/** Marqueur posé sur le panneau lui-même, au plus près du chiffre. */
export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <span
      title="Ces valeurs sont écrites à la main, elles ne proviennent d’aucune mesure."
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-chip border border-warning/35 bg-warning/10',
        'px-1.5 py-[2px] text-[0.5625rem] font-semibold tracking-[0.06em] whitespace-nowrap text-warning uppercase',
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-2.5" strokeWidth={2.5} />
      Démonstration
    </span>
  );
}

/**
 * Explication en tête d'onglet.
 * Dit ce qui est réel, ce qui ne l'est pas, et ce qu'il faudrait pour que ça
 * le devienne — sans quoi le marqueur ressemble à un aveu plutôt qu'à une
 * étape.
 */
export function DemoDataNotice({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'flex items-start gap-2.5 rounded-panel border border-warning/25 bg-warning/[0.06] px-3.5 py-2.5',
        className,
      )}
    >
      <FlaskConical aria-hidden className="mt-px size-3.5 shrink-0 text-warning" strokeWidth={2} />
      <p className="text-[0.6875rem] leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">Données de démonstration.</span> Les indicateurs,
        la file d’interventions, le calendrier et l’affectation ci-dessous sont écrits à la main :
        ils ne proviennent d’aucune mesure et ne doivent servir à aucune décision. Le{' '}
        <span className="font-medium text-ink">parc d’actifs</span>, lui, est lu en base et exact.
        Les autres panneaux le deviendront lorsque les interventions seront rattachées aux actifs.
      </p>
    </aside>
  );
}
