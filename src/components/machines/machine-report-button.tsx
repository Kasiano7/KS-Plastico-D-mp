'use client';

import { Printer } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';

/**
 * « Imprimer / PDF » — impression de la fiche affichée.
 *
 * Aucune génération de fichier côté serveur n'existe encore : plutôt que de
 * simuler un téléchargement, le bouton ouvre la boîte d'impression du
 * navigateur, qui sait enregistrer la fiche en PDF. C'est le même mécanisme
 * que les rapports existants de l'application.
 *
 * Le libellé évite volontairement « Télécharger » : rien n'est enregistré
 * tant que l'utilisateur ne choisit pas lui-même « Enregistrer en PDF » dans
 * la boîte d'impression — un vrai téléchargement laisserait croire à un
 * fichier généré côté serveur qui n'existe pas.
 */
export function MachineReportButton({ machineName }: { machineName: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title={`Imprimer ou enregistrer en PDF la fiche de ${machineName}`}
      className={buttonClass('secondary', 'md', 'h-10 px-4')}
    >
      <Printer className="size-4" aria-hidden />
      Imprimer / PDF
    </button>
  );
}
