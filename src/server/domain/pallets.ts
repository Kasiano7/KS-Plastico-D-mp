/**
 * Règles métier des palettes (§26).
 */

/**
 * Une palette n'est corrigeable depuis le poste que tant qu'elle n'a pas
 * quitté le contrôle de l'opérateur : une fois allouée ou expédiée, une
 * erreur se corrige par un ajustement de stock documenté, pas par une
 * annulation silencieuse.
 */
export const CANCELLABLE_PALLET_STATUSES = ['in_stock', 'completed'] as const;

export function canCancelPallet(status: string): boolean {
  return (CANCELLABLE_PALLET_STATUSES as readonly string[]).includes(status);
}
