'use client';

import { Cell, Pie, PieChart } from 'recharts';
import { TONE_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { Tone } from '@/types/dashboard';

export type DonutSlice = {
  id: string;
  label: string;
  sharePct: number;
  tone: Tone;
};

/**
 * Anneau de répartition.
 *
 * Dimensions fixes plutôt que `ResponsiveContainer` : un anneau de 118 px reste
 * un anneau de 118 px, et on évite le saut de mise en page au montage.
 *
 * Les parts prennent leur couleur via `currentColor` + la classe de teinte :
 * aucune couleur littérale ne traverse le code du graphique.
 */
export function DonutChart({
  slices,
  size = 118,
  thickness = 20,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
}) {
  const outerRadius = size / 2;

  return (
    <PieChart width={size} height={size} role="img" aria-label="Répartition en anneau">
      <Pie
        data={slices}
        dataKey="sharePct"
        nameKey="label"
        cx="50%"
        cy="50%"
        innerRadius={outerRadius - thickness}
        outerRadius={outerRadius}
        paddingAngle={2}
        startAngle={90}
        endAngle={-270}
        stroke="none"
        isAnimationActive={false}
      >
        {slices.map((slice) => (
          <Cell key={slice.id} className={TONE_TEXT[slice.tone]} fill="currentColor" />
        ))}
      </Pie>
    </PieChart>
  );
}

/** Légende commune aux deux anneaux : pastille, libellé, part, valeur. */
export function DonutLegend({
  slices,
  className,
}: {
  slices: (DonutSlice & { valueLabel?: string })[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {slices.map((slice) => (
        <li key={slice.id} className="flex items-center gap-1 text-[0.625rem]">
          <span
            aria-hidden
            className={cn('size-[7px] shrink-0 rounded-full bg-current', TONE_TEXT[slice.tone])}
          />
          <span className="min-w-0 flex-1 truncate text-ink-muted">{slice.label}</span>
          <span className="tnum shrink-0 font-medium text-ink">{slice.sharePct} %</span>
          {slice.valueLabel ? (
            <span className="tnum w-[34px] shrink-0 text-right text-ink-dim">{slice.valueLabel}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
