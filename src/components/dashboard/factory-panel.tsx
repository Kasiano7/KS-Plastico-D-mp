'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import type { MachineSnapshot } from '@/server/services/factory-context';
import { InjectionWorkshopView } from './injection-floor-plan';
import { PuWorkshopView } from './pu-floor-plan';

/**
 * Durée et courbe du morphing petite vignette ↔ vue agrandie. Les deux
 * usages (transform du dialogue, opacité du fond) doivent rester synchro.
 */
const MORPH_DURATION_MS = 420;
const MORPH_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Calcule le transform à appliquer au dialogue pour qu'il se superpose
 * exactement à la vignette d'origine (même centre, même taille apparente).
 * C'est le point de départ (ouverture) et d'arrivée (fermeture) du morphing.
 */
function computeOriginTransform(originEl: HTMLElement, dialogEl: HTMLElement): string {
  const originRect = originEl.getBoundingClientRect();
  const dialogRect = dialogEl.getBoundingClientRect();
  if (!dialogRect.width || !dialogRect.height) return 'none';

  const scale = Math.min(originRect.width / dialogRect.width, originRect.height / dialogRect.height);
  const translateX = originRect.left + originRect.width / 2 - (dialogRect.left + dialogRect.width / 2);
  const translateY = originRect.top + originRect.height / 2 - (dialogRect.top + dialogRect.height / 2);

  return `translate(${translateX}px, ${translateY}px) scale(${scale || 1})`;
}

/**
 * Couleur néon de chaque bâtiment. Au repos, fond sombre quasi opaque
 * (lisibilité du texte) ; au survol, le fond bascule vers la couleur du
 * néon lui-même mais reste translucide (`/40`) pour laisser deviner le
 * plan derrière — pas un aplat à 100 %.
 */
const FACTORY_ZONES = [
  {
    slug: 'vestiaire-refectoire',
    label: 'Vestiaire et réfectoire',
    position: 'left-[37.5%] top-[21.5%]',
    color:
      'border-[#8cff47]/80 bg-[#10200d]/90 text-[#d7ffbf] shadow-[0_0_12px_rgba(126,255,57,0.35)] hover:bg-[#8cff47]/40 hover:shadow-[0_0_18px_rgba(126,255,57,0.7)]',
  },
  {
    slug: 'bureau',
    label: 'Bureau',
    position: 'left-[46.2%] top-[31.5%]',
    color:
      'border-[#ff7a18]/80 bg-[#251307]/90 text-[#ffd2aa] shadow-[0_0_12px_rgba(255,103,18,0.35)] hover:bg-[#ff7a18]/40 hover:shadow-[0_0_18px_rgba(255,103,18,0.7)]',
  },
  {
    slug: 'montage-expedition',
    label: 'Montage / expédition',
    position: 'left-[32.5%] top-[35%]',
    color:
      'border-[#2f91ff]/80 bg-[#07172a]/90 text-[#c4e2ff] shadow-[0_0_12px_rgba(23,119,255,0.4)] hover:bg-[#2f91ff]/40 hover:shadow-[0_0_18px_rgba(23,119,255,0.75)]',
  },
] as const;

type WorkshopView = 'aerial' | 'injection' | 'pu';

export function FactoryPanel({
  injectionMachines,
  puMachines,
}: {
  injectionMachines: MachineSnapshot[];
  puMachines: MachineSnapshot[];
}) {
  const [view, setView] = useState<WorkshopView>('aerial');
  const [zooming, setZooming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Origine du zoom sur la vue aérienne — le badge cliqué (Injection ou PU).
  const [zoomOrigin, setZoomOrigin] = useState('36% 63%');
  // Transform actif du dialogue : une chaîne = replié sur la vignette
  // d'origine, `null` = posé au centre à sa taille normale.
  const [morphTransform, setMorphTransform] = useState<string | null>(null);

  const originRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openWorkshop = useCallback((target: 'injection' | 'pu', origin: string) => {
    setZoomOrigin(origin);
    setZooming(true);
    setTimeout(() => {
      setView(target);
      setZooming(false);
    }, 380);
  }, []);

  const closeWorkshop = useCallback(() => {
    setView('aerial');
  }, []);

  const expand = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setExpanded(true);
  }, []);

  const collapse = useCallback(() => {
    if (dialogRef.current && originRef.current) {
      setMorphTransform(computeOriginTransform(originRef.current, dialogRef.current));
    }
    closeTimeoutRef.current = setTimeout(() => {
      setExpanded(false);
      setMorphTransform(null);
      closeTimeoutRef.current = null;
    }, MORPH_DURATION_MS);
  }, []);

  // À l'ouverture : superpose d'abord le dialogue, à sa taille pleine, sur la
  // vignette (avant peinture, donc invisible), puis relâche vers le centre
  // au repaint suivant — l'image « décolle » de la vignette pour s'étirer.
  useLayoutEffect(() => {
    if (!expanded) return;
    if (dialogRef.current && originRef.current) {
      setMorphTransform(computeOriginTransform(originRef.current, dialogRef.current));
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => setMorphTransform(null));
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') collapse();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded, collapse]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <Panel className="min-h-0 overflow-hidden bg-[#020711]">
        <h2 className="sr-only">Santé de l&apos;usine</h2>
        {/* Vignette : cache son contenu pendant l'agrandissement (elle
            disparaît), mais garde sa taille pour ancrer l'animation et ne
            pas faire sauter la grille du tableau de bord. */}
        {expanded ? (
          <div ref={originRef} className="relative aspect-[16/9] w-full overflow-hidden" />
        ) : (
          <FactoryVisual
            rootRef={originRef}
            view={view}
            zooming={zooming}
            zoomOrigin={zoomOrigin}
            injectionMachines={injectionMachines}
            puMachines={puMachines}
            openWorkshop={openWorkshop}
            closeWorkshop={closeWorkshop}
            onExpand={expand}
            expanded={false}
          />
        )}
      </Panel>

      {expanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10">
          <button
            type="button"
            aria-label="Fermer la vue agrandie"
            onClick={collapse}
            className="absolute inset-0 bg-overlay"
            style={{
              opacity: morphTransform ? 0 : 1,
              transition: `opacity ${MORPH_DURATION_MS}ms ${MORPH_EASING}`,
            }}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Santé de l'usine — vue agrandie"
            className="panel-surface relative w-full max-w-6xl overflow-hidden rounded-panel border border-edge bg-[#020711] shadow-panel"
            style={{
              transform: morphTransform ?? 'none',
              transition: `transform ${MORPH_DURATION_MS}ms ${MORPH_EASING}`,
            }}
          >
            <FactoryVisual
              view={view}
              zooming={zooming}
              zoomOrigin={zoomOrigin}
              injectionMachines={injectionMachines}
              puMachines={puMachines}
              openWorkshop={openWorkshop}
              closeWorkshop={closeWorkshop}
              onExpand={collapse}
              expanded
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function FactoryVisual({
  rootRef,
  view,
  zooming,
  zoomOrigin,
  injectionMachines,
  puMachines,
  openWorkshop,
  closeWorkshop,
  onExpand,
  expanded,
}: {
  rootRef?: React.Ref<HTMLDivElement>;
  view: WorkshopView;
  zooming: boolean;
  zoomOrigin: string;
  injectionMachines: MachineSnapshot[];
  puMachines: MachineSnapshot[];
  openWorkshop: (target: 'injection' | 'pu', origin: string) => void;
  closeWorkshop: () => void;
  onExpand: () => void;
  expanded: boolean;
}) {
  return (
    <div ref={rootRef} className="relative aspect-[16/9] w-full overflow-hidden">
      {/* Vue aérienne — zoome vers l'atelier choisi lors de la transition */}
      <div
        className="absolute inset-0"
        style={{
          opacity: view === 'aerial' && !zooming ? 1 : 0,
          transform: zooming ? 'scale(3.5)' : 'scale(1)',
          transformOrigin: zoomOrigin,
          transition: 'transform 380ms ease-in, opacity 350ms ease-in',
          pointerEvents: view === 'aerial' ? 'auto' : 'none',
        }}
      >
        <Image
          src="/images/usine-sante.svg"
          alt="Vue aérienne de l'usine de démonstration avec les zones Injection, PU, Montage et expédition, Bureau, Vestiaire et réfectoire"
          fill
          unoptimized
          priority
          sizes="(min-width: 1280px) 40vw, 100vw"
          className="object-contain"
        />

        {FACTORY_ZONES.map((zone) => (
          <Link
            key={zone.slug}
            href={`/ateliers/${zone.slug}`}
            prefetch={false}
            aria-label={`Ouvrir la fiche ${zone.label}`}
            title={`Voir ${zone.label}`}
            className={`absolute z-10 max-w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-1 text-center text-[0.5rem] leading-tight font-bold tracking-[0.04em] backdrop-blur-sm transition-[transform,background-color,box-shadow] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-2 sm:text-[0.5625rem] wide:text-[0.625rem] ${zone.position} ${zone.color}`}
          >
            {zone.label}
          </Link>
        ))}

        {/* Badge Injection — déclenche le zoom */}
        <button
          type="button"
          onClick={() => openWorkshop('injection', '36% 63%')}
          aria-label="Zoomer sur l'atelier Injection"
          title="Voir l'atelier Injection"
          className="absolute z-10 left-[36%] top-[63%] max-w-[19%] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border px-1.5 py-1 text-center text-[0.5rem] font-bold leading-tight tracking-[0.04em] backdrop-blur-sm transition-[transform,background-color,box-shadow] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-2 sm:text-[0.5625rem] wide:text-[0.625rem] border-[#ff68ed]/80 bg-[#270b25]/90 text-[#ffd0fa] shadow-[0_0_12px_rgba(255,67,232,0.35)] hover:bg-[#ff68ed]/40 hover:shadow-[0_0_18px_rgba(255,67,232,0.7)]"
        >
          Injection
        </button>

        {/* Badge PU — déclenche le zoom */}
        <button
          type="button"
          onClick={() => openWorkshop('pu', '60.5% 38.5%')}
          aria-label="Zoomer sur l'atelier PU"
          title="Voir l'atelier PU"
          className="absolute z-10 left-[60.5%] top-[38.5%] max-w-[19%] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border px-1.5 py-1 text-center text-[0.5rem] font-bold leading-tight tracking-[0.04em] backdrop-blur-sm transition-[transform,background-color,box-shadow] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-2 sm:text-[0.5625rem] wide:text-[0.625rem] border-[#8cff47]/80 bg-[#10200d]/90 text-[#d7ffbf] shadow-[0_0_12px_rgba(126,255,57,0.35)] hover:bg-[#8cff47]/40 hover:shadow-[0_0_18px_rgba(126,255,57,0.7)]"
        >
          PU
        </button>
      </div>

      {/* Vue atelier Injection — remplace la vue aérienne dans le même panneau */}
      <div
        className="absolute inset-0"
        style={{
          opacity: view === 'injection' ? 1 : 0,
          transform: view === 'injection' ? 'scale(1)' : 'scale(0.96)',
          transition: view === 'injection'
            ? 'opacity 300ms ease-out 60ms, transform 300ms ease-out 60ms'
            : 'none',
          pointerEvents: view === 'injection' ? 'auto' : 'none',
        }}
      >
        <InjectionWorkshopView machines={injectionMachines} onBack={closeWorkshop} />
      </div>

      {/* Vue atelier PU — remplace la vue aérienne dans le même panneau */}
      <div
        className="absolute inset-0"
        style={{
          opacity: view === 'pu' ? 1 : 0,
          transform: view === 'pu' ? 'scale(1)' : 'scale(0.96)',
          transition: view === 'pu'
            ? 'opacity 300ms ease-out 60ms, transform 300ms ease-out 60ms'
            : 'none',
          pointerEvents: view === 'pu' ? 'auto' : 'none',
        }}
      >
        <PuWorkshopView machines={puMachines} onBack={closeWorkshop} />
      </div>

      {/* Bouton agrandir / réduire — toujours visible au-dessus des vues */}
      <button
        type="button"
        onClick={onExpand}
        aria-label={expanded ? "Réduire l'image" : "Agrandir l'image"}
        title={expanded ? 'Réduire' : 'Agrandir'}
        className="absolute bottom-3 right-3 z-20 flex items-center justify-center rounded-md border border-white/20 bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      </button>
    </div>
  );
}
