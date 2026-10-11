'use client';

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { formatDate, formatDuration } from '@/lib/format';
import {
  searchIncidentMemoryAction,
  type IncidentMemoryResult,
} from '@/server/actions/incident-memory';

/**
 * Mémoire des pannes, affichée pendant la déclaration.
 *
 * Le champ « Symptôme observé » promettait déjà que « ce texte sera retrouvé
 * lors d'un incident similaire ». La promesse tenait à moitié : le texte était
 * bien enregistré, mais rien ne le ressortait — et sûrement pas au moment où
 * il sert, c'est-à-dire **avant** que le diagnostic ne commence.
 *
 * Le rapprochement est délibérément explicable : les mots qui l'ont motivé
 * sont affichés. Un régleur qui voit « rapproché sur : pontage, trémie » peut
 * juger en trois secondes si la proposition tient — ce qu'un score de
 * similarité ne permet pas.
 */

/** Laisse le temps de finir un mot avant d'interroger. */
const DEBOUNCE_MS = 450;

/** En deçà, le texte ne porte pas encore de mot exploitable. */
const MIN_SYMPTOM_LENGTH = 6;

export function IncidentMemoryHints({
  symptom,
  machineId,
}: {
  symptom: string;
  machineId: string | null;
}) {
  const [result, setResult] = useState<IncidentMemoryResult>({ matches: [] });
  const [searching, setSearching] = useState(false);

  const text = symptom.trim();
  const tooShort = text.length < MIN_SYMPTOM_LENGTH;

  /*
   * Le cas « texte trop court » est **dérivé**, pas posé dans l'état : vider
   * le résultat depuis l'effet déclencherait un rendu en cascade, que le
   * compilateur React refuse à juste titre. Effacer le champ efface donc les
   * propositions sans qu'aucun état ne change.
   */
  const matches = tooShort ? [] : result.matches;

  useEffect(() => {
    if (tooShort) return;

    // `cancelled` évite qu'une réponse lente écrase une réponse plus récente.
    let cancelled = false;

    const timer = setTimeout(() => {
      // L'attente commence quand la requête part, pas pendant la temporisation.
      setSearching(true);
      searchIncidentMemoryAction(text, machineId)
        .then((response) => {
          if (!cancelled) setResult(response);
        })
        .catch(() => {
          // Une mémoire indisponible ne doit pas empêcher de déclarer.
          if (!cancelled) setResult({ matches: [] });
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, tooShort, machineId]);

  if (matches.length === 0) {
    return searching ? (
      <p className="flex items-center gap-1.5 text-[0.75rem] text-fg-subtle">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Recherche d’incidents similaires…
      </p>
    ) : null;
  }

  return (
    <section
      aria-live="polite"
      className="rounded-[var(--radius-control)] border border-info/30 bg-info-soft/50 p-3"
    >
      <h3 className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-fg">
        <History className="size-3.5 shrink-0 text-info" aria-hidden />
        Déjà vu {matches.length === 1 ? 'une fois' : `${matches.length} fois`}
      </h3>

      <ul className="mt-2 space-y-2.5">
        {matches.map((match) => (
          <li key={match.reference} className="border-l-2 border-info/40 pl-2.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[0.75rem]">
              <span className="font-medium text-fg">{match.reference}</span>
              <span className="text-fg-muted">
                {match.machineName ?? 'Machine non précisée'} · {formatDate(match.occurredAt)}
                {match.downtimeMinutes > 0
                  ? ` · ${formatDuration(match.downtimeMinutes)} d’arrêt`
                  : ''}
              </span>
              {match.sameMachine ? (
                <span className="rounded bg-info/15 px-1.5 py-px text-[0.625rem] font-medium text-info">
                  même machine
                </span>
              ) : null}
            </p>

            {match.rootCause ? (
              <p className="mt-0.5 text-[0.75rem] text-fg-muted">
                <span className="font-medium text-fg">Cause :</span> {match.rootCause}
              </p>
            ) : null}
            {match.resolution ? (
              <p className="text-[0.75rem] text-fg-muted">
                <span className="font-medium text-fg">Solution :</span> {match.resolution}
              </p>
            ) : null}

            {/* Le « pourquoi » du rapprochement, pour qu'il puisse être écarté. */}
            <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
              Rapproché sur : {match.matchedTerms.join(', ')}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 border-t border-info/20 pt-2 text-[0.6875rem] leading-relaxed text-fg-subtle">
        Ces incidents ressemblent au vôtre par les mots employés. À vous de juger s’ils
        s’appliquent — l’application n’a rien diagnostiqué.
      </p>
    </section>
  );
}
