'use client';

import { useRef } from 'react';
import { QrCode, X } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';

/** Réaffiche le QR d'une palette déjà déclarée — utile si l'étiquette d'origine est perdue. */
export function PalletQrDialog({
  palletCode,
  lotNumber,
  qrDataUrl,
}: {
  palletCode: string;
  lotNumber: string | null;
  qrDataUrl: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('ghost', 'sm', 'px-2')}
        title="Revoir le QR de cette palette"
        aria-label={`Revoir le QR de la palette ${palletCode}`}
      >
        <QrCode className="size-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-4"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">QR de la palette</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={buttonClass('ghost', 'sm', 'px-2')}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`Code QR de la palette ${palletCode}`}
            className="size-[180px] rounded-lg border border-line bg-white p-2"
          />
          <p className="font-mono text-xs text-fg">{palletCode}</p>
          <p className="text-xs text-fg-subtle">Lot {lotNumber ?? '—'}</p>
        </div>
      </dialog>
    </>
  );
}
