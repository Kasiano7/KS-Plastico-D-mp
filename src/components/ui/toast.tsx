'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Undo2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Retour d'action — file de messages éphémères.
 *
 * Une mutation qui ne dit rien laisse l'utilisateur deviner si elle a eu lieu.
 * Ce composant répond à trois besoins d'un coup :
 *
 *   1. confirmer visuellement ce qui vient de se passer ;
 *   2. l'annoncer à un lecteur d'écran, via une région `aria-live` unique et
 *      permanente — une région créée en même temps que son contenu n'est pas
 *      lue, c'est l'erreur classique ;
 *   3. offrir un retour en arrière quand l'action est réversible, ce qui vaut
 *      mieux qu'une demande de confirmation avant coup.
 *
 * La sévérité suit la convention du projet : `normal` 🟢, `info` 🟡,
 * `warning` 🟠, `critical` 🔴. Elle n'est jamais portée par la seule couleur —
 * chaque message a une icône et un intitulé.
 */

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export type ToastInput = {
  title: string;
  /** Détail facultatif : ce qui a changé, ou pourquoi ça a échoué. */
  description?: string;
  tone?: ToastTone;
  /** Action de retour en arrière. Le message reste affiché plus longtemps. */
  undo?: { label?: string; run: () => void | Promise<void> };
  /** Millisecondes avant disparition. `0` = message persistant. */
  durationMs?: number;
};

type Toast = ToastInput & { id: number; tone: ToastTone };

type ToastApi = {
  toast: (input: ToastInput) => void;
  /** Raccourcis pour les deux cas qui couvrent 90 % des appels. */
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Hors fournisseur, les appels ne cassent rien : ils ne font simplement rien.
 * Un composant réutilisé dans un contexte sans coquille ne doit pas planter
 * pour une notification.
 */
const NOOP: ToastApi = { toast: () => {}, success: () => {}, error: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

/**
 * Annonce le résultat d'une Server Action, une fois par réponse.
 *
 * `useActionState` renvoie un nouvel objet à chaque réponse du serveur : c'est
 * cette identité qui sert de déclencheur. Deux réponses identiques successives
 * — deux échecs avec le même message — restent donc bien annoncées deux fois.
 *
 * Le message part dans la file des toasts, c'est-à-dire dans l'état d'un autre
 * composant : aucune boucle de rendu possible ici.
 */
export function useActionToast(
  state: { ok?: boolean; message?: string },
  labels: { success: string; error?: string; description?: string },
) {
  const { toast } = useToast();
  // Les libellés sont décomposés en chaînes : ce sont des valeurs stables,
  // contrairement à l'objet `labels` recréé à chaque rendu.
  const { success, error, description } = labels;

  useEffect(() => {
    if (!state.message) return;
    toast(
      state.ok
        ? { title: success, description, tone: 'success' }
        : {
            title: error ?? 'L’action n’a pas abouti',
            description: state.message,
            tone: 'error',
            durationMs: 0,
          },
    );
  }, [state, toast, success, error, description]);
}

const TONE_STYLE: Record<ToastTone, { icon: typeof CheckCircle2; ring: string; accent: string }> = {
  success: { icon: CheckCircle2, ring: 'border-normal/35', accent: 'text-normal' },
  info: { icon: Info, ring: 'border-brand/35', accent: 'text-brand' },
  warning: { icon: AlertTriangle, ring: 'border-warning/40', accent: 'text-warning' },
  error: { icon: XCircle, ring: 'border-critical/40', accent: 'text-critical' },
};

/** Intitulé lu par le lecteur d'écran avant le message lui-même. */
const TONE_LABEL: Record<ToastTone, string> = {
  success: 'Succès',
  info: 'Information',
  warning: 'Attention',
  error: 'Erreur',
};

const DEFAULT_DURATION_MS = 5_000;
/** Une action annulable doit laisser le temps de lire, puis de cliquer. */
const UNDOABLE_DURATION_MS = 10_000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = (nextId.current += 1);
      const tone = input.tone ?? 'success';
      const duration =
        input.durationMs ?? (input.undo ? UNDOABLE_DURATION_MS : DEFAULT_DURATION_MS);

      setToasts((current) => [...current, { ...input, id, tone }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      // Une erreur ne disparaît pas toute seule : on doit pouvoir la lire.
      error: (title, description) => toast({ title, description, tone: 'error', durationMs: 0 }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
        La région vit en permanence dans le document, vide la plupart du temps.
        C'est la condition pour qu'un lecteur d'écran annonce ce qui y entre.
        `polite` et non `assertive` : une confirmation ne doit pas couper la
        lecture en cours.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 print:hidden sm:items-end sm:p-6"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, ring, accent } = TONE_STYLE[toast.tone];

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[var(--radius-control)] border bg-surface px-3.5 py-3 shadow-lg',
        'motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in',
        ring,
      )}
    >
      <Icon aria-hidden className={cn('mt-px size-[18px] shrink-0', accent)} strokeWidth={2} />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">
          <span className="sr-only">{TONE_LABEL[toast.tone]} : </span>
          {toast.title}
        </p>
        {toast.description ? (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-muted">
            {toast.description}
          </p>
        ) : null}

        {toast.undo ? (
          <button
            type="button"
            onClick={() => {
              void toast.undo?.run();
              onDismiss();
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2 py-1 text-xs font-medium text-fg transition-colors hover:border-brand hover:text-brand"
          >
            <Undo2 className="size-3.5" strokeWidth={2} />
            {toast.undo.label ?? 'Annuler'}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        className="-mr-1 -mt-1 shrink-0 rounded-[var(--radius-control)] p-1 text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
