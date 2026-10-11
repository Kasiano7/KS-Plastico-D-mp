'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MOLD_PRESS_NUMBERS, type CompanyMold } from '@/data/company-molds';
import { Badge, Card, CardHeader, Input, Select } from '@/components/ui/primitives';

export type MoldMachine = { id: string; press: string; name: string };

function joinedPartValues(
  mold: CompanyMold,
  read: (part: CompanyMold['parts'][number]) => string | undefined,
) {
  const values = mold.parts.map(read).filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(' · ') : '—';
}

export function MoldsCatalog({ molds, machines }: { molds: CompanyMold[]; machines: MoldMachine[] }) {
  const [query, setQuery] = useState('');
  const [press, setPress] = useState('all');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('fr'));
  const machineByPress = useMemo(
    () => new Map(machines.map((machine) => [machine.press, machine])),
    [machines],
  );
  const visibleMolds = useMemo(
    () =>
      molds.filter((mold) => {
        const matchesPress = press === 'all' || mold.compatiblePresses.includes(press);
        const haystack = [
          mold.reference,
          mold.location,
          ...mold.parts.flatMap((part) => [
            part.sheetNumber,
            part.designation,
            ...(part.partReferences ?? []),
            part.robotHandReference,
            part.robotHandLocation,
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('fr');
        return matchesPress && haystack.includes(deferredQuery);
      }),
    [deferredQuery, molds, press],
  );

  return (
    <Card>
      <CardHeader
        title="Matrice des moules"
        subtitle={`${visibleMolds.length} moule(s) affiché(s) · ● compatible · ○ non compatible`}
      />

      <div className="grid gap-3 px-5 pb-4 md:grid-cols-[1fr_15rem]">
        <label className="relative">
          <span className="sr-only">Rechercher un moule</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Référence, pièce ou fiche…"
            className="pl-9"
          />
        </label>
        <label>
          <span className="sr-only">Filtrer par presse compatible</span>
          <Select value={press} onChange={(event) => setPress(event.target.value)}>
            <option value="all">Toutes les presses</option>
            {MOLD_PRESS_NUMBERS.map((pressNumber) => (
              <option key={pressNumber} value={pressNumber}>Presse {pressNumber}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="overflow-x-auto px-5 pb-5">
        <table className="w-full min-w-[1320px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-28 border-b border-line bg-surface px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Moule
              </th>
              <th className="min-w-72 border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Pièces produites
              </th>
              <th className="min-w-28 border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Réf. pièces
              </th>
              <th className="min-w-24 border-b border-line px-3 py-2 text-right text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Poids
              </th>
              <th className="min-w-28 border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Matière recyclée
              </th>
              <th className="min-w-28 border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Main robot
              </th>
              <th className="min-w-24 border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Emplacements
              </th>
              {MOLD_PRESS_NUMBERS.map((pressNumber) => (
                <th
                  key={pressNumber}
                  className="border-b border-line px-2 py-2 text-center text-[0.625rem] font-semibold text-fg-subtle"
                >
                  Presse<br />{pressNumber}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleMolds.map((mold) => (
              <tr key={mold.reference} className="transition-colors hover:bg-surface-sunken/70">
                <td className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-2.5 align-top group-hover:bg-surface-sunken">
                  <span className="font-mono text-xs font-semibold text-fg">{mold.reference}</span>
                  <Badge tone="outline" className="mt-1 block w-fit">Statut inconnu</Badge>
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  <ul className="space-y-1.5">
                    {mold.parts.map((part) => (
                      <li key={part.sheetNumber}>
                        <span className="font-medium text-fg">{part.designation}</span>
                        <span className="block text-[0.6875rem] text-fg-subtle">Fiche n° {part.sheetNumber}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top text-xs text-fg-muted">
                  {joinedPartValues(mold, (part) => part.partReferences?.join(', '))}
                </td>
                <td className="tabular border-b border-line px-3 py-2.5 text-right align-top text-xs text-fg-muted">
                  {mold.weightKg ? `${mold.weightKg.toLocaleString('fr-FR')} kg` : '—'}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top text-xs text-fg-muted">
                  {joinedPartValues(
                    mold,
                    (part) => part.recycledMaterialPct === undefined ? undefined : `${part.recycledMaterialPct} %`,
                  )}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top text-xs text-fg-muted">
                  {joinedPartValues(mold, (part) => part.robotHandReference)}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top text-xs text-fg-muted">
                  <span className="block"><span className="text-fg-subtle">Moule :</span> {mold.location ?? '—'}</span>
                  <span className="mt-1 block"><span className="text-fg-subtle">Main :</span> {joinedPartValues(mold, (part) => part.robotHandLocation)}</span>
                </td>
                {MOLD_PRESS_NUMBERS.map((pressNumber) => {
                  const isCompatible = mold.compatiblePresses.includes(pressNumber);
                  const machine = machineByPress.get(pressNumber);
                  const label = `Moule ${mold.reference} ${isCompatible ? 'compatible' : 'non compatible'} avec la presse ${pressNumber}`;
                  return (
                    <td
                      key={pressNumber}
                      className="border-b border-line px-2 py-2.5 text-center align-top"
                      title={label}
                    >
                      {isCompatible && machine ? (
                        <Link
                          href={`/machines/${machine.id}`}
                          prefetch={false}
                          className="inline-flex size-7 items-center justify-center rounded-md text-normal hover:bg-normal-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-normal"
                          aria-label={`${label} — ouvrir la fiche machine`}
                        >
                          ●
                        </Link>
                      ) : (
                        <span className={isCompatible ? 'text-normal' : 'text-fg-subtle/35'} aria-label={label}>
                          {isCompatible ? '●' : '○'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {visibleMolds.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">Aucun moule ne correspond aux filtres.</p>
        ) : null}
      </div>
    </Card>
  );
}
