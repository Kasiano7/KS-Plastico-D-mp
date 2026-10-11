import type { Severity } from '@/components/ui/severity';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import styles from './machines.module.css';

/**
 * Jauges et micro-graphiques du module machines.
 *
 * Rendus en SVG natif côté serveur : un parc affiche jusqu'à douze anneaux et
 * douze courbes, un moteur de graphique n'apporterait ici ni interaction ni
 * axe — seulement du JavaScript envoyé au navigateur. Les vrais graphiques
 * analytiques (production, disponibilité) utilisent Recharts.
 *
 * La couleur vient toujours de `currentColor` : le thème reste seul maître.
 */

/** Anneau de TRS. Le trait gris marque le tour complet, l'arc coloré la valeur. */
export function OeeRing({
  value,
  size = 44,
  thickness = 4,
  severity = 'normal',
  muted = false,
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  severity?: Severity;
  /** Presse sans production : l'anneau reste gris plutôt que coloré. */
  muted?: boolean;
  label?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 100);
  const dash = (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `TRS ${Math.round(clamped)} %`}
      className={cn('shrink-0', muted ? 'text-fg-subtle' : SEVERITY_TEXT[severity])}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={thickness}
        opacity={0.16}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/** Empreinte stable d'une série : identifiant de dégradé unique et reproductible. */
function seriesKey(prefix: string, values: readonly number[]): string {
  let hash = 2_166_136_261;
  for (const value of values) hash = Math.imul(hash ^ Math.round(value * 97), 16_777_619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

/**
 * Courbe d'activité sur 24 h. Les valeurs sont des pourcentages : l'échelle est
 * donc fixe (0 → 100), sans quoi deux presses ne seraient pas comparables.
 */
export function ActivityCurve({
  values,
  className,
  ariaLabel,
}: {
  values: number[];
  className?: string;
  ariaLabel: string;
}) {
  if (values.length < 2) return null;

  const width = 300;
  const height = 74;
  const step = width / (values.length - 1);
  const toY = (value: number) => height - (Math.min(Math.max(value, 0), 100) / 100) * (height - 6) - 3;

  const points = values.map((value, index) => ({ x: index * step, y: toY(value) }));
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = seriesKey('activity', values);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={cn('h-full w-full text-brand', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Cadre du graphique 24 h : axe des ordonnées, lignes de fond, axe des heures. */
export function ActivityChart({
  values,
  ariaLabel,
  hourLabels = ['00h', '04h', '08h', '12h', '16h', '20h', '24h'],
}: {
  values: number[];
  ariaLabel: string;
  hourLabels?: string[];
}) {
  return (
    <div>
      <div className="flex gap-2">
        <div
          className="flex w-8 shrink-0 flex-col justify-between py-px text-right text-[0.5625rem] leading-none text-fg-subtle"
          aria-hidden
        >
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className={cn(styles.chartFrame, 'h-[74px] min-w-0 flex-1')}>
          <ActivityCurve values={values} ariaLabel={ariaLabel} />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pl-10 text-[0.625rem] text-fg-subtle" aria-hidden>
        {hourLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

/** Barre horizontale d'un signal process. */
export function SignalBar({ fillPct, tone }: { fillPct: number; tone: Severity }) {
  return (
    // Le rail doit rester visible sur fond sombre : sans lui, on ne lit plus la
    // proportion, seulement une barre flottante.
    <span className="block h-[5px] w-full overflow-hidden rounded-full bg-line-strong">
      <span
        className={cn('block h-full rounded-full', {
          'bg-normal': tone === 'normal',
          'bg-info': tone === 'info',
          'bg-warning': tone === 'warning',
          'bg-critical': tone === 'critical',
        })}
        style={{ width: `${Math.min(Math.max(fillPct, 0), 100)}%` }}
      />
    </span>
  );
}

/** Courbe de tendance à points — mini graphique du temps d'arrêt. */
export function TrendLine({
  values,
  ariaLabel,
  severity = 'critical',
}: {
  values: number[];
  ariaLabel: string;
  severity?: Severity;
}) {
  if (values.length < 2) return null;

  const width = 300;
  const height = 86;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const toY = (value: number) => height - 10 - (value / max) * (height - 24);

  const points = values.map((value, index) => ({ x: index * step, y: toY(value) }));
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = seriesKey('trend', values);

  return (
    // Pas de `preserveAspectRatio="none"` ici : les points deviendraient des
    // ellipses. Le graphique se met à l'échelle en conservant ses proportions.
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn('h-full w-full', SEVERITY_TEXT[severity])}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point) => (
        <circle
          key={`${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={3.2}
          fill="currentColor"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
