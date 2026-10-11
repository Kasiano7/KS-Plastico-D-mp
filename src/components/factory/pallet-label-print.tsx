/**
 * Étiquette de palette imprimable (§ ROADMAP.md Phase 4). Invisible à
 * l'écran (`hidden print:block`) — seule cette étiquette doit sortir sur
 * papier, pas la fiche complète : le reste de la page passe à `print:hidden`
 * en contrepartie (§ page.tsx). Grand format, peu de texte : une étiquette se
 * lit d'un coup d'œil collée sur un filmage, pas depuis un bureau.
 */
export function PalletLabelPrint({
  palletCode,
  productReference,
  productName,
  lotNumber,
  quantityUnits,
  customerOrderNumber,
  qrDataUrl,
}: {
  palletCode: string;
  productReference: string;
  productName: string;
  lotNumber: string | null;
  quantityUnits: number;
  customerOrderNumber: string | null;
  qrDataUrl: string;
}) {
  return (
    <div className="hidden print:flex print:h-[100mm] print:w-[150mm] print:flex-col print:justify-between print:gap-4 print:border-2 print:border-black print:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.04em]">Usine de démonstration</p>
          <p className="mt-2 truncate text-[22px] leading-tight font-bold">{productName}</p>
          <p className="font-mono text-[13px]">{productReference}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR généré côté serveur en data URL, pas une image optimisable. */}
        <img src={qrDataUrl} alt={`Code QR de la palette ${palletCode}`} className="size-[100px] shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t-2 border-black pt-3 text-[13px]">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Palette</p>
          <p className="font-mono text-[16px] font-bold">{palletCode}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Lot</p>
          <p className="font-mono text-[16px] font-bold">{lotNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Quantité</p>
          <p className="text-[16px] font-bold">{quantityUnits.toLocaleString('fr-FR')} pièces</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Commande</p>
          <p className="text-[16px] font-bold">{customerOrderNumber ?? '—'}</p>
        </div>
      </div>
    </div>
  );
}
