import { cn } from '@/lib/cn';

/**
 * Marque KS Plastico Demo : monogramme « KS » sobre, souligné d'un trait
 * d'accent unique (bleu du design system), sans référence à une entreprise réelle.
 */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <span className={cn('flex flex-col items-center gap-1', className)} aria-label="KS Plastico Demo">
        <span className="text-[0.9375rem] leading-none font-black tracking-tight text-white">KS</span>
        <Accent className="w-5" />
      </span>
    );
  }

  return (
    <span className={cn('flex flex-col gap-1.5', className)} aria-label="KS Plastico Demo">
      <span className="text-[1.0625rem] leading-none font-black tracking-[0.02em] text-white">
        KS PLASTICO
      </span>
      <span className="flex items-center gap-2">
        <Accent className="w-8" />
        <span className="text-[0.5625rem] font-semibold tracking-[0.22em] text-white/45 uppercase">
          Démo
        </span>
      </span>
    </span>
  );
}

function Accent({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block h-[3px] rounded-full bg-[#2f91ff]', className)} />;
}
