'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { MachineSnapshot } from '@/server/services/factory-context';
import { getBayStyle } from './workshop-bay-style';

/**
 * Les 13 emplacements de presses de l'atelier PU, positionnés en % du
 * conteneur (aspect 16/9, comme la vignette Injection) qui affiche
 * /images/atelierpu.png.
 *
 * Numérotation donnée par l'atelier, en partant du haut de la photo :
 *   41 - 42 - 53 - 44
 *   11/31 - 52 - 34
 *   21 - 22 - 51 - 43
 *   12 - 54 - 55
 *
 * « 11/31 » est une seule et même presse, sur un seul socle visible sur la
 * photo — pas deux machines distinctes — d'où le badge et le `code` uniques
 * (PR-11) pour cet emplacement.
 *
 * Centres mesurés à l'œil sur des recadrages zoomés x2 avec grille tous les
 * 20 px (image source 1448×1086, ratio 4/3), en visant le centre du socle
 * jaune de chaque presse — même méthode que l'atelier Injection. Contrairement à
 * la photo Injection (déjà en 16/9), celle-ci est en 4/3 : `object-contain` la
 * fait apparaître en bandes verticales (12,5 % de vide de chaque côté, image
 * sur 75 % de la largeur), d'où la conversion `12.5 + 0.75 × %image` sur
 * l'axe horizontal ci-dessous. L'axe vertical n'a pas besoin de correction
 * (la hauteur de l'image remplit exactement celle du conteneur).
 */
const ALL_BAYS = [
  { number: '41', code: 'PR-41', left: '47.5%', top: '20.3%' },
  { number: '42', code: 'PR-42', left: '54.4%', top: '22.1%' },
  { number: '53', code: 'PR-53', left: '61.7%', top: '25.3%' },
  { number: '44', code: 'PR-44', left: '69.2%', top: '28.5%' },
  { number: '11/31', code: 'PR-11', left: '36.6%', top: '45.6%' },
  { number: '52', code: 'PR-52', left: '43.9%', top: '48.8%' },
  { number: '34', code: 'PR-34', left: '50.6%', top: '49.7%' },
  { number: '21', code: 'PR-21', left: '35.0%', top: '56.6%' },
  { number: '22', code: 'PR-22', left: '42.8%', top: '58.5%' },
  { number: '51', code: 'PR-51', left: '49.6%', top: '61.2%' },
  { number: '43', code: 'PR-43', left: '56.3%', top: '63.1%' },
  { number: '12', code: 'PR-12', left: '40.0%', top: '69.1%' },
  { number: '54', code: 'PR-54', left: '48.0%', top: '71.4%' },
  { number: '55', code: 'PR-55', left: '55.3%', top: '74.1%' },
] as const;

const BAY_WIDTH = '5.1%';
const BAY_HEIGHT = '5.2%';

export function PuWorkshopView({
  machines,
  onBack,
}: {
  machines: MachineSnapshot[];
  onBack: () => void;
}) {
  const machineByCode = new Map(machines.map((m) => [m.code, m]));

  return (
    <div className="relative h-full w-full">
      <Image
        src="/images/atelierpu.png"
        alt="Plan de l'atelier PU"
        fill
        unoptimized
        priority
        sizes="100vw"
        className="object-contain"
      />

      {/* Bouton retour */}
      <button
        onClick={onBack}
        className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <ArrowLeft className="size-3.5" />
        Santé de l&apos;usine
      </button>

      {/* Badges presses */}
      {ALL_BAYS.map((bay) => {
        const machine = machineByCode.get(bay.code);
        return (
          <MachineBay
            key={bay.number}
            bayNumber={bay.number}
            left={bay.left}
            top={bay.top}
            machine={machine}
          />
        );
      })}
    </div>
  );
}

function MachineBay({
  bayNumber,
  left,
  top,
  machine,
}: {
  bayNumber: string;
  left: string;
  top: string;
  machine: MachineSnapshot | undefined;
}) {
  const [hovered, setHovered] = useState(false);
  const severity = machine?.severity ?? 'offline';
  const style = getBayStyle(severity);

  const productLabel =
    machine && machine.status !== 'idle' ? (machine.currentProductName ?? null) : null;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: BAY_WIDTH,
    height: BAY_HEIGHT,
    transform: 'translate(-50%, -50%)',
    border: `2px solid ${hovered && machine ? style.border : 'transparent'}`,
    boxShadow: hovered && machine ? style.glow : 'none',
    borderRadius: '5px',
    transition: 'border-color 180ms ease, box-shadow 180ms ease',
    cursor: machine ? 'pointer' : 'default',
    zIndex: hovered ? 20 : 10,
  };

  const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '10%',
    background: style.bg,
    border: `1px solid ${style.border}`,
    borderRadius: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const inner = (
    <div
      style={containerStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Badge numéro — coloré selon la sévérité réelle de la presse. « 11/31 »
          est plus long que les autres (une seule presse, deux numéros) : police
          plus compacte et sans espacement pour tenir dans le même badge. */}
      <div style={badgeStyle}>
        <span
          style={{
            color: style.text,
            fontWeight: 700,
            fontSize: bayNumber.length > 2 ? 'clamp(0.32rem, 0.62vw, 0.52rem)' : 'clamp(0.42rem, 0.85vw, 0.7rem)',
            letterSpacing: bayNumber.length > 2 ? '0' : '0.04em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {bayNumber}
        </span>
      </div>

      {/* Pièce en cours — affichée en survol pour ne pas surcharger un plan dense */}
      {hovered && productLabel ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '105%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.82)',
            borderRadius: '3px',
            padding: '2px 5px',
            backdropFilter: 'blur(4px)',
            whiteSpace: 'nowrap',
            zIndex: 30,
          }}
        >
          <span
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: '0.6rem',
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {productLabel}
          </span>
        </div>
      ) : null}
    </div>
  );

  if (machine) {
    return (
      <Link href={`/machines/${machine.id}`} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
