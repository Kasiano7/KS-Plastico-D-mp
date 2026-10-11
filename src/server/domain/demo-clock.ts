/**
 * Horloge du jeu de démonstration.
 *
 * Le seed ancre tout sur le jour où il s'exécute : les ordres de fabrication
 * démarrent « aujourd'hui à 6 h », l'arrêt de la Presse 64 date d'« il y a une
 * heure ». Le lendemain, plus rien n'est aujourd'hui — la production tombe à
 * zéro, le TRS à 0 %, et l'application donne l'impression d'être cassée alors
 * qu'elle lit correctement une usine qui n'a rien produit.
 *
 * La correction consiste à **décaler l'ensemble du jeu** d'un nombre entier de
 * jours. Décaler en bloc, et non régénérer, est ce qui préserve l'histoire :
 * la presse arrêtée bloque toujours le même ordre, qui menace toujours la même
 * commande (règle n° 10). Seule la date change ; les écarts, eux, sont
 * conservés.
 *
 * Un nombre **entier** de jours, pour que « 6 h du matin » reste 6 h du matin.
 */

/**
 * Nombre de jours dont il faut avancer le jeu de données.
 *
 * `0` quand le jeu est déjà à jour : le décalage ne doit jamais tourner à
 * vide, et surtout jamais reculer — décaler vers le passé rendrait des
 * événements futurs, ce qui n'a aucun sens.
 */
export function daysToShift(lastAnchor: Date | null, now: Date): number {
  if (lastAnchor === null) return 0;

  const anchorDay = startOfUtcDay(lastAnchor);
  const today = startOfUtcDay(now);
  const elapsed = Math.floor((today.getTime() - anchorDay.getTime()) / 86_400_000);

  return Math.max(elapsed, 0);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Le décalage vaut-il d'être appliqué ?
 *
 * Au-delà d'un certain âge, le jeu ne décrit plus une usine plausible : des
 * habilitations ont expiré, des commandes sont échues depuis des mois. Le
 * décaler ne le réparerait qu'à moitié, et masquerait le fait qu'il faudrait
 * le recharger.
 */
export const MAX_SHIFT_DAYS = 365;

export function shouldShift(days: number): boolean {
  return days > 0 && days <= MAX_SHIFT_DAYS;
}
