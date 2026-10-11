'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Loader2, X } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';

/**
 * Scan QR par caméra réelle (`getUserMedia` + décodage image par image avec
 * jsQR, en pur JS — fonctionne sur tout navigateur avec caméra, sans dépendre
 * de l'API native `BarcodeDetector` qui manque encore à Firefox et Safari).
 *
 * Générique : `onScan` reçoit le texte brut décodé, à l'appelant de
 * l'interpréter (ex. le JSON `{p, l, q}` encodé dans les QR de palette,
 * cf. `app/(app)/poste/page.tsx`).
 */
export function QrScannerDialog({
  onScan,
  label = 'Scanner un QR code',
  iconOnly = false,
}: {
  onScan: (text: string) => void;
  label?: string;
  /** N'affiche que l'icône du déclencheur — pour les barres compactes. */
  iconOnly?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    dialogRef.current?.close();
  }, []);

  // Déclaration nommée (pas un `useCallback` auto-référencé) : la récursion
  // via `requestAnimationFrame` n'a besoin d'exister que le temps d'une
  // session de scan, pas d'être stable entre rendus.
  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    dialogRef.current?.showModal();

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        stop();
        onScan(code.data);
        return;
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setError(
        "Caméra inaccessible. Vérifiez que le navigateur y est autorisé (icône dans la barre d'adresse) et qu'aucune autre application ne l'utilise.",
      );
    } finally {
      setStarting(false);
    }
  }, [onScan, stop]);

  // Coupe la caméra si le composant disparaît pendant un scan.
  useEffect(() => stop, [stop]);

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={buttonClass('secondary', 'sm', iconOnly ? 'px-2' : undefined)}
        title={label}
        aria-label={label}
      >
        <Camera className="size-3.5" />
        {iconOnly ? null : label}
      </button>

      <dialog
        ref={dialogRef}
        onClose={stop}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xl backdrop:bg-fg/30 open:flex open:flex-col open:gap-3"
        onClick={(e) => {
          if (e.target === dialogRef.current) stop();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Scanner un QR code</h2>
          <button type="button" onClick={stop} className={buttonClass('ghost', 'sm', 'px-2')} aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        {error ? (
          <p className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3.5 py-2.5 text-[0.8125rem] text-critical">
            {error}
          </p>
        ) : (
          <div className="relative overflow-hidden rounded-[var(--radius-control)] bg-fg/90">
            <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-6 animate-spin text-white" />
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-8 rounded-[var(--radius-control)] border-2 border-white/70" />
            )}
          </div>
        )}

        <p className="text-center text-xs text-fg-subtle">Cadrez le QR code de la palette dans le repère.</p>
      </dialog>
    </>
  );
}
