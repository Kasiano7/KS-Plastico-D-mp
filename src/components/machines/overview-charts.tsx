'use client';

import {
  Bar,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { HourlyProductionPoint } from '@/server/domain/machine-signals';
import { formatNumber } from '@/lib/format';

/**
 * Graphiques analytiques de la vue d'ensemble.
 *
 * Comme partout dans le projet, aucune couleur littérale : les éléments SVG de
 * Recharts reçoivent des classes du thème, et `currentColor` fait le reste.
 */

/** Production horaire : barres empilées bonnes / rebutées, objectif en pointillé. */
export function ProductionHourlyChart({ points }: { points: HourlyProductionPoint[] }) {
  return (
    <div className="h-[13rem] w-full [&_.recharts-cartesian-axis-tick_text]:fill-[var(--fg-subtle)]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: -14 }} barCategoryGap="18%">
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
            tickMargin={8}
            interval={3}
          />
          <YAxis
            tickFormatter={(value: number) => (value >= 1_000 ? `${value / 1_000}k` : String(value))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
            width={40}
          />
          <Tooltip content={<HourlyTooltip />} cursor={{ className: 'fill-[var(--surface-raised)]' }} />

          <Bar dataKey="rejectedUnits" stackId="production" className="fill-critical" radius={[0, 0, 2, 2]} isAnimationActive={false} />
          <Bar dataKey="goodUnits" stackId="production" className="fill-normal" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="targetUnits"
            className="text-fg-muted"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="maxHourlyCapacity"
            className="text-brand"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function HourlyTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const value = (key: string) => payload.find((entry) => entry.dataKey === key)?.value;
  const point = payload[0]?.payload as HourlyProductionPoint | undefined;
  const good = value('goodUnits');
  const rejected = value('rejectedUnits');
  const target = value('targetUnits');
  const maxCapacity = value('maxHourlyCapacity');

  return (
    <div className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 shadow-[var(--shadow-float)]">
      <p className="text-[0.6875rem] font-semibold text-fg">{point?.fullLabel ?? point?.label}</p>
      {typeof good === 'number' ? (
        <p className="tabular mt-1 text-[0.6875rem] text-normal">Bonnes {formatNumber(good)}</p>
      ) : null}
      {typeof rejected === 'number' ? (
        <p className="tabular text-[0.6875rem] text-critical">Rebutées {formatNumber(rejected)}</p>
      ) : null}
      {typeof target === 'number' && target > 0 ? (
        <p className="tabular text-[0.6875rem] text-fg-subtle">Objectif {formatNumber(target)}</p>
      ) : null}
      {typeof maxCapacity === 'number' && maxCapacity > 0 ? (
        <p className="tabular text-[0.6875rem] text-brand">Max {formatNumber(maxCapacity)}/h</p>
      ) : null}
    </div>
  );
}

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  className: string;
};

/**
 * Anneau de répartition avec libellé au centre.
 * Dimensions fixes : un anneau de 148 px reste un anneau de 148 px, et la
 * mise en page ne saute pas au montage.
 */
export function RatioDonut({
  segments,
  centerValue,
  centerLabel,
  size = 148,
  thickness = 22,
  ariaLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
  ariaLabel: string;
}) {
  const outerRadius = size / 2;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size} role="img" aria-label={ariaLabel}>
        <Pie
          data={total > 0 ? segments : [{ key: 'empty', label: 'Aucune donnée', value: 1, className: 'text-fg-subtle' }]}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={outerRadius - thickness}
          outerRadius={outerRadius}
          paddingAngle={1.5}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          {(total > 0 ? segments : [{ key: 'empty', className: 'text-fg-subtle' }]).map((segment) => (
            <Cell key={segment.key} className={segment.className} fill="currentColor" />
          ))}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[1.375rem] leading-none font-semibold text-fg">{centerValue}</span>
        <span className="mt-1 text-[0.6875rem] text-fg-muted">{centerLabel}</span>
      </div>
    </div>
  );
}
