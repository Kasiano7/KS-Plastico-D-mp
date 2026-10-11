'use client';

import { Printer } from 'lucide-react';
import { Button, buttonClass } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/**
 * Bouton d'impression générique — même mécanisme partout dans l'app :
 * `window.print()` ouvre la boîte native du navigateur, qui sait enregistrer
 * en PDF. Aucun fichier n'est généré côté serveur, d'où le libellé qui évite
 * « Télécharger » (ça laisserait croire à un export déjà prêt).
 */
export function PrintButton({
  label = 'Imprimer / enregistrer en PDF',
  title,
  className,
}: {
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => window.print()} title={title} className={cn(buttonClass('secondary', 'sm'), className)}>
      <Printer className="size-3.5" />
      {label}
    </button>
  );
}

export function ReportActions() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer className="size-3.5" />
      Imprimer / enregistrer en PDF
    </Button>
  );
}
