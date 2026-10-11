'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { formatNumber } from '@/lib/format';
import type { ProductionPoint } from '@/types/dashboard';

/**
 * Courbe de production cumulée sur 24 h : réalisé contre objectif.
 *
 * Toute la mise en couleur passe par des classes Tailwind appliquées aux
 * éléments SVG de Recharts (les règles CSS l'emportent sur les attributs de
 * présentation). Conséquence : le graphique suit le thème, sans une seule
 * couleur écrite en dur.
 */
export function ProductionChart({ points }: { points: ProductionPoint[] }) {
  /*
   * Dernière heure réellement mesurée. La courbe s'arrête là ; sans repère,
   * l'œil ne sait pas distinguer « la production s'est arrêtée » de « la
   * journée n'est pas finie ». Le point terminal répond à cette question.
   */
  const lastMeasuredIndex = points.reduce(
    (last, point, index) => (typeof point.actual === 'number' ? index : last),
    -1,
  );

  return (
    <div
      className={[
        'h-full w-full text-accent-purple',
        '[&_.recharts-cartesian-grid_line]:stroke-edge-soft',
        '[&_.recharts-cartesian-axis-tick_text]:fill-ink-dim',
      ].join(' ')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
          <defs>
            <linearGradient id="production-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} strokeDasharray="2 4" />

          <XAxis
            dataKey="hour"
            ticks={['00h', '04h', '08h', '12h', '16h', '20h', '24h']}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            tickMargin={6}
            interval={0}
          />
          <YAxis
            domain={[0, 10000]}
            ticks={[0, 2000, 4000, 6000, 8000, 10000]}
            tickFormatter={(value: number) => (value === 0 ? '0' : `${value / 1000}k`)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            width={44}
          />

          <Tooltip content={<ProductionTooltip />} cursor={{ stroke: 'currentColor', strokeWidth: 1 }} />

          {/* Objectif : trait discret, en pointillé — c'est un repère, pas une mesure. */}
          <Line
            type="monotone"
            dataKey="target"
            className="text-ink-dim"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="actual"
            stroke="currentColor"
            strokeWidth={2}
            fill="url(#production-fill)"
            dot={(props) => <EndpointDot {...props} lastIndex={lastMeasuredIndex} />}
            activeDot={{ r: 3, strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Recharts clone l'élément passé à `content` en lui injectant ses props :
 * elles sont donc toutes optionnelles du point de vue de l'appelant.
 */
function ProductionTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const actual = payload.find((entry) => entry.dataKey === 'actual')?.value;
  const target = payload.find((entry) => entry.dataKey === 'target')?.value;

  return (
    <div className="rounded-chip border border-edge bg-card px-2.5 py-1.5 shadow-panel">
      <p className="text-[0.625rem] font-semibold text-ink-muted">{label}</p>
      {typeof actual === 'number' ? (
        <p className="tnum mt-0.5 text-[0.6875rem] text-ink">
          Réalisé <span className="font-semibold">{formatNumber(actual)}</span>
        </p>
      ) : null}
      {typeof target === 'number' ? (
        <p className="tnum text-[0.6875rem] text-ink-dim">Objectif {formatNumber(target)}</p>
      ) : null}
    </div>
  );
}

/**
 * Point terminal de la courbe.
 *
 * Recharts appelle ce rendu pour chaque point ; on ne dessine qu'au dernier
 * relevé. Le halo reprend le fond de la carte : il détache le point de la
 * courbe sans introduire de couleur supplémentaire.
 */
function EndpointDot({
  cx,
  cy,
  index,
  lastIndex,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  lastIndex: number;
}) {
  if (index !== lastIndex || typeof cx !== 'number' || typeof cy !== 'number') {
    // Recharts attend un élément SVG, jamais `null`.
    return <g />;
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={5} className="fill-card" />
      <circle cx={cx} cy={cy} r={3.5} fill="currentColor" />
    </g>
  );
}
