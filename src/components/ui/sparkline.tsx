import { cn } from '@/lib/cn';

/**
 * Sparkline — tendance, pas mesure.
 *
 * Rendue en SVG natif plutôt qu'avec Recharts : l'écran en affiche huit, et
 * une courbe de tendance sans axe ni interaction n'a besoin ni de conteneur
 * réactif ni de moteur de graphique. Les vrais graphiques (production, donuts)
 * utilisent Recharts.
 *
 * La couleur vient de `currentColor` : on pose la teinte sur le parent, le
 * thème reste la seule source de vérité.
 */
/** Empreinte courte d'une série, pour nommer un dégradé sans collision. */
function hash(values: number[]): string {
  let acc = 2166136261;
  for (const value of values) {
    acc = Math.imul(acc ^ Math.round(value * 1000), 16777619);
  }
  return (acc >>> 0).toString(36);
}

export function Sparkline({
  values,
  filled = false,
  strokeWidth = 1.5,
  className,
}: {
  values: number[];
  /** Aplat dégradé sous la courbe — réservé aux cartes KPI principales. */
  filled?: boolean;
  strokeWidth?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Marge de 12 % en haut et en bas : la courbe ne touche jamais les bords.
  const span = max - min || 1;
  const padding = span * 0.12;

  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - min + padding) / (span + padding * 2)) * height,
  }));

  const line = points
    .map((point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`))
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  // Identifiant stable et déterministe : même série ⇒ même id côté serveur et
  // côté client, donc aucune divergence d'hydratation.
  const gradientId = `spark-${hash(values)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={cn('h-full w-full overflow-visible', className)}
    >
      {filled ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
