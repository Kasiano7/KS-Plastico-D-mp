import 'server-only';

import { evaluateAlerts } from './alert-engine';
import { consumeRateLimit } from './rate-limit';

/**
 * Détection continue des alertes dérivées.
 *
 * Les notifications hors-app fonctionnent depuis le début : un arrêt machine
 * détecté par la télémétrie part immédiatement en e-mail, SMS et push. Mais
 * les alertes **dérivées** — commande qui bascule en risque, stock qui passe
 * sous le seuil, atelier qui décroche de son objectif — ne naissent qu'en
 * faisant tourner le moteur de détection, et celui-ci ne tournait qu'une fois
 * par jour, à 5 h UTC.
 *
 * Conséquence concrète : une commande qui devient irrattrapable à 3 h du matin
 * n'était constatée qu'au passage du lendemain. La notification marchait ; il
 * n'y avait simplement rien à notifier.
 *
 * La cause est un plafond d'hébergement — une seule planification par jour.
 * Plutôt que d'attendre un changement de forfait, la détection se greffe sur
 * ce qui bat déjà en continu : les relevés de la passerelle machine.
 *
 * Deux garde-fous :
 *
 *   1. **Cadence plafonnée.** Une évaluation au plus toutes les quinze
 *      minutes, quel que soit le débit de la passerelle — sinon chaque relevé
 *      déclencherait une trentaine de requêtes.
 *   2. **Jamais bloquante.** L'ingestion de télémétrie ne doit pas ralentir ni
 *      échouer parce que la détection a échoué : ce sont deux responsabilités
 *      distinctes, et perdre un relevé coûte plus cher que retarder une
 *      alerte de quinze minutes.
 */

/** Intervalle minimal entre deux évaluations déclenchées par la passerelle. */
const MIN_INTERVAL_SECONDS = 15 * 60;

/**
 * Le compteur de débit sert ici de verrou temporel : avec une limite de 1 sur
 * une fenêtre de quinze minutes, `allowed` n'est vrai qu'une fois par fenêtre.
 * Réutiliser ce mécanisme évite une table de plus pour stocker une date.
 */
export async function evaluateAlertsIfDue(): Promise<{ ran: boolean }> {
  const slot = await consumeRateLimit('alert-engine:auto', 1, MIN_INTERVAL_SECONDS);
  if (!slot.allowed) return { ran: false };

  const result = await evaluateAlerts();

  // Trace volontaire : sans elle, personne ne peut vérifier que la détection
  // continue tourne réellement, ni à quelle cadence.
  console.info(
    `[alertes] Évaluation continue — ${result.evaluated} règle(s), ${result.created} alerte(s) créée(s).`,
  );

  return { ran: true };
}

/**
 * Variante à déclencher sans attendre le résultat.
 * L'appelant — la route de la passerelle — répond immédiatement ; l'évaluation
 * se poursuit et signale ses propres échecs.
 */
export function scheduleAlertEvaluation(): void {
  void evaluateAlertsIfDue().catch((error) => {
    console.error('[alertes] Évaluation continue en échec.', error);
  });
}
