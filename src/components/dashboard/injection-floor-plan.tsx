'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { MachineSnapshot } from '@/server/services/factory-context';
import { getBayStyle } from './workshop-bay-style';

/**
 * Les 9 baies de l'atelier Injection, de gauche à droite sur l'image.
 * left = bord gauche de la baie en % de l'image (aspect 16/9 ≈ viewport).
 * Les baies font chacune 7.8% de large et 40% de haut, top à 20%.
 *
 * Valeurs mesurées directement sur /images/atelier-injection.png : centre de
 * chaque presse (corps peint + mécanisme visible) repéré à l'œil sur des
 * recadrages zoomés x5, gradués tous les 0.5% — pas de détection
 * automatique (elle accroche le détail texturé de la presse, pas son
 * emprise visuelle complète, ce qui décale le centre réel). Ne pas revenir
 * à un pas régulier arbitraire, les baies ne sont pas parfaitement égales.
 */
const ALL_BAYS = [
  { number: '67', left: '6.6%' },
  { number: '66', left: '14.75%' },
  { number: '65', left: '24.75%' },
  { number: '64', left: '35.6%' },
  { number: '63', left: '45.35%' },
  { number: '62', left: '55.85%' },
  { number: '61', left: '65.25%' },
  { number: '60', left: '74.75%' },
  { number: '59', left: '82.5%' },
] as const;

const BAY_WIDTH = '7.8%';
const BAY_HEIGHT = '40%';
const BAY_TOP = '20%';

/** Panneau numéro : centré, couvre le panneau noir de la photo (3.6% à 20% du haut de la baie). */
const PANEL = { left: '22%', top: '3.6%', width: '56%', height: '17%' } as const;

export function InjectionWorkshopView({
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
        src="/images/atelier-injection.png"
        alt="Plan de l'atelier Injection"
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

      {/* Baies machines */}
      {ALL_BAYS.map((bay) => {
        const machine = machineByCode.get(`PR-${bay.number}`);
        return (
          <MachineBay
            key={bay.number}
            bayNumber={bay.number}
            left={bay.left}
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
  machine,
}: {
  bayNumber: string;
  left: string;
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
    top: BAY_TOP,
    width: BAY_WIDTH,
    height: BAY_HEIGHT,
    border: `2px solid ${hovered && machine ? style.border : 'transparent'}`,
    boxShadow: hovered && machine ? style.glow : 'none',
    borderRadius: '5px',
    transition: 'border-color 180ms ease, box-shadow 180ms ease',
    cursor: machine ? 'pointer' : 'default',
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    left: PANEL.left,
    top: PANEL.top,
    width: PANEL.width,
    height: PANEL.height,
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
      {/* Panneau numéro — remplace le panneau noir de la photo */}
      <div style={panelStyle}>
        <span
          style={{
            color: style.text,
            fontWeight: 700,
            fontSize: 'clamp(0.5rem, 1vw, 0.85rem)',
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          {bayNumber}
        </span>
      </div>

      {/* Pièce en cours (si applicable) */}
      {productLabel ? (
        <div
          style={{
            position: 'absolute',
            left: '5%',
            right: '5%',
            top: '23%',
            background: 'rgba(0,0,0,0.72)',
            borderRadius: '3px',
            padding: '2px 4px',
            backdropFilter: 'blur(4px)',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              color: 'rgba(255,255,255,0.82)',
              fontSize: 'clamp(0.38rem, 0.55vw, 0.52rem)',
              fontWeight: 500,
              lineHeight: 1.3,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
