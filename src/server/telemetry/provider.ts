import 'server-only';

/**
 * Abstraction de télémétrie machine (§31).
 *
 * RÈGLE ABSOLUE : le navigateur ne communique JAMAIS avec une machine
 * industrielle, et aucune presse n'est exposée sur Internet. La chaîne est :
 *
 *   Presse → OPC UA / protocole industriel → passerelle locale sécurisée
 *          → API KS Plastico Demo → base de données → application → IA
 *
 * En V1, seule l'implémentation simulée existe. Brancher une passerelle
 * consistera à fournir une autre implémentation de cette interface, sans
 * toucher aux pages ni aux services métier.
 */

export type TelemetryReading = {
  machineId: string;
  recordedAt: Date;
  /** Temps de cycle instantané en secondes, `null` si la machine ne produit pas. */
  cycleTimeSeconds: number | null;
  /** Cadence instantanée en pièces/heure. */
  unitsPerHour: number;
  partsProduced: number;
  partsRejected: number;
  source: 'simulated' | 'gateway' | 'manual';
};

export interface MachineTelemetryProvider {
  readonly id: string;
  readonly label: string;
  /** Dernier relevé connu pour une machine. */
  read(machineId: string): Promise<TelemetryReading | null>;
  /** Relevés de plusieurs machines en un appel. */
  readMany(machineIds: readonly string[]): Promise<TelemetryReading[]>;
}
