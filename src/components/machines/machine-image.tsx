import Image from 'next/image';
import type { MachineImageKey } from '@/server/services/machine-fleet';
import { cn } from '@/lib/cn';
import styles from './machines.module.css';

/**
 * Illustrations génériques du parc — trois photographies de presses, marques
 * et plaques de modèle effacées, utilisées tant qu'une machine n'a pas sa
 * propre photo. Les fichiers ne sont jamais déformés : le conteneur s'adapte,
 * jamais la presse.
 */
const MACHINE_PHOTOS: Record<MachineImageKey, { src: string; label: string }> = {
  'type-a': { src: '/machines/presse-type-a.png', label: 'Presse à injecter — Constructeur presses A' },
  'type-b': { src: '/machines/presse-type-b.png', label: 'Presse à injecter — Constructeur presses B' },
  'type-c': { src: '/machines/presse-type-c.png', label: 'Presse à injecter — Constructeur presses C' },
};

export function MachineImage({
  imageKey,
  photoUrl,
  machineName,
  sizes,
  className,
  priority = false,
}: {
  imageKey: MachineImageKey;
  /** Photo choisie manuellement pour cette machine (§ machine-photos.ts) — prioritaire sur `imageKey`. */
  photoUrl?: string | null;
  machineName: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={machineName}
        fill
        unoptimized
        sizes={sizes}
        priority={priority}
        className={cn(styles.machineImage, className)}
      />
    );
  }

  const photo = MACHINE_PHOTOS[imageKey];

  return (
    <Image
      src={photo.src}
      alt={`${machineName} — ${photo.label}`}
      fill
      sizes={sizes}
      priority={priority}
      className={cn(styles.machineImage, className)}
    />
  );
}
