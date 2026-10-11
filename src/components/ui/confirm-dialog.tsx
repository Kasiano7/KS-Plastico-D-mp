'use client';

import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/**
 * Demande de confirmation avant une action irréversible.
 *
 * Remplace `window.confirm`, qui posait deux problèmes : la boîte grise du
 * système d'exploitation rompt net l'apparence du logiciel, et elle ne peut
 * rien dire de plus qu'une phrase — ni nommer précisément ce qui va être
 * supprimé, ni prévenir de ce qui est perdu.
 *
 * `<dialog>` natif : la pile de fenêtres, le verrouillage du focus et la
 * fermeture par Échap sont gérés par le navigateur, pas réimplémentés.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pour une suppression, `default` pour une action réversible. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onCancel}
      onClick={(event) => {
        // Un clic sur le fond annule ; c'est le geste attendu, et il est sûr
        // puisque l'action destructrice demande un clic explicite.
        if (event.target === dialogRef.current) onCancel();
      }}
      className={cn(
        // Tailwind neutralise le `margin: auto` par défaut de `<dialog>` :
        // sans `m-auto`, la fenêtre se colle en haut à gauche de l'écran.
        'm-auto w-[min(92vw,28rem)] max-w-none rounded-[var(--radius-card)] border border-line',
        'bg-surface p-0 text-fg shadow-2xl backdrop:bg-overlay',
      )}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          {tone === 'danger' ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-critical/10 text-critical">
              <AlertTriangle className="size-[18px]" strokeWidth={2} />
            </span>
          ) : null}

          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <div className="mt-1.5 text-sm leading-relaxed text-fg-muted">{description}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            /* Le geste destructeur ne doit jamais être celui qu'on déclenche
               en tapant Entrée par réflexe. */
            autoFocus={tone !== 'danger'}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
