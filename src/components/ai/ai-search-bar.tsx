'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AiSuggestion } from '@/types/dashboard';

/**
 * Barre IA — élément central de l'application.
 *
 * Elle n'est pas un champ de recherche : c'est le point d'entrée du copilote.
 * D'où sa taille, sa position et son halo. Les suggestions vivent avec elle
 * parce qu'elles remplissent le même champ : un seul composant, un seul état.
 */

/**
 * L'API Web Speech n'est pas dans le lib DOM standard de TypeScript (seuls
 * les types de résultat le sont) — on ne déclare ici que ce dont ce composant
 * se sert, plutôt que d'importer des types tiers pour trois méthodes.
 */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AiSearchBar({
  suggestions,
  className,
  showSuggestions = true,
  onAsk,
}: {
  suggestions: AiSuggestion[];
  className?: string;
  showSuggestions?: boolean;
  onAsk?: (question: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [listening, setListening] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Détecté après le montage, jamais pendant le rendu : le HTML serveur ne
  // connaît pas le navigateur (l'API n'existe d'ailleurs pas dans tous —
  // Chrome/Edge oui, Firefox non), donc calculer la valeur pendant le rendu
  // client désynchroniserait l'hydratation de ce que le serveur a envoyé.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDictationSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      setQuestion(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    inputRef.current?.focus();
    recognition.start();
  }

  return (
    <div className={cn('flex w-full flex-col items-center gap-2', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = question.trim();
          if (!trimmed) return;
          onAsk?.(trimmed);
          setQuestion('');
        }}
        className="group relative w-full max-w-[790px]"
      >
        {/* Halo bleu-cyan-violet : discret au repos, affirmé au focus. */}
        <div
          aria-hidden
          className="ai-aura pointer-events-none absolute -inset-[5px] rounded-[16px] opacity-50 blur-md transition-opacity duration-300 group-focus-within:opacity-100"
        />

        <div className="ai-aura relative rounded-[11px] p-px">
          <div className="flex h-10 items-center gap-2.5 rounded-[10px] bg-background-secondary px-2.5">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-gradient-to-br from-primary to-accent-purple"
            >
              <Sparkles className="size-3.5 text-white" strokeWidth={2} />
            </span>

            <input
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={listening ? 'Je vous écoute…' : 'Posez votre question à l’agent IA...'}
              aria-label="Posez votre question à l’agent IA"
              className="h-full min-w-0 flex-1 bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-dim"
            />

            {dictationSupported ? (
              <button
                type="button"
                onClick={toggleDictation}
                aria-label={listening ? 'Arrêter la dictée' : 'Dicter la question'}
                aria-pressed={listening}
                title={listening ? 'Arrêter la dictée' : 'Dicter la question'}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full transition-colors',
                  listening
                    ? 'animate-pulse bg-critical/15 text-critical'
                    : 'text-ink-muted hover:bg-card-hover hover:text-ink',
                )}
              >
                {listening ? <MicOff className="size-4" strokeWidth={1.75} /> : <Mic className="size-4" strokeWidth={1.75} />}
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {/* Les suggestions peuvent déborder la largeur de la barre : elles
          forment une ligne unique tant que la place le permet. */}
      {showSuggestions ? (
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <span className="text-[0.625rem] whitespace-nowrap text-ink-dim">Exemples de questions :</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => {
                setQuestion(suggestion.label);
                inputRef.current?.focus();
              }}
              className="rounded-md border border-edge-soft bg-card px-2 py-[3px] text-[0.625rem] whitespace-nowrap text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
