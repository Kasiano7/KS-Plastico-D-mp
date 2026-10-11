'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Search } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { formatDate, formatFileSize } from '@/lib/format';
import type { DocumentLibraryEntry } from '@/server/services/documents';
import {
  DOCUMENT_CATEGORIES,
  documentPreviewKind,
  type DocumentCategory,
} from '@/server/domain/documents';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_STYLE,
  documentCategoryOf as categoryOf,
} from './document-category';

/**
 * Bibliothèque documentaire du site.
 *
 * Recherche et filtres travaillent sur la liste déjà chargée : la réponse est
 * immédiate, sans aller-retour serveur. Le contenu des fichiers n'est jamais
 * transporté ici — seul le lien de téléchargement l'est, et il revérifie la
 * permission côté serveur.
 */

/**
 * URL de consultation d'un document.
 *
 * `?vue=1` demande l'affichage ; la route ne l'accorde qu'aux formats
 * réellement affichables. Pour un Word ou un Excel, on vise directement l'URL
 * de téléchargement : ouvrir un onglet qui se refermerait aussitôt ne rend
 * service à personne.
 */
function documentHref(entry: DocumentLibraryEntry): string {
  const base = `/machines/${entry.machineId}/documents/${entry.id}`;
  return documentPreviewKind(entry.mimeType) ? `${base}?vue=1` : base;
}

function openLabel(entry: DocumentLibraryEntry): string {
  return documentPreviewKind(entry.mimeType)
    ? `Ouvrir ${entry.fileName} dans un nouvel onglet`
    : `Télécharger ${entry.fileName} — ce format ne s’affiche pas dans le navigateur`;
}

function openDocument(entry: DocumentLibraryEntry): void {
  if (documentPreviewKind(entry.mimeType)) {
    window.open(documentHref(entry), '_blank', 'noopener');
  } else {
    // Un format non affichable ne peut être que téléchargé : autant le faire
    // dans l'onglet courant plutôt que d'en ouvrir un qui resterait vide.
    window.location.href = documentHref(entry);
  }
}

export function DocumentLibrary({
  entries,
  canDownload,
}: {
  entries: DocumentLibraryEntry[];
  /** Sans `machines:read`, la route de téléchargement refuserait le fichier. */
  canDownload: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DocumentCategory | 'all'>('all');

  const counts = useMemo(() => {
    const base = new Map<DocumentCategory, number>();
    for (const entry of entries) {
      const key = categoryOf(entry.category);
      base.set(key, (base.get(key) ?? 0) + 1);
    }
    return base;
  }, [entries]);

  const needle = query.trim().toLowerCase();
  const rows = entries.filter((entry) => {
    if (category !== 'all' && categoryOf(entry.category) !== category) return false;
    if (needle === '') return true;
    return [
      entry.fileName,
      entry.machineName,
      entry.machineCode,
      entry.workshopName,
      DOCUMENT_CATEGORY_LABELS[categoryOf(entry.category)],
      entry.uploadedByLabel ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  return (
    <Panel className="min-h-0 min-w-0 overflow-hidden lg:h-full">
      <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Bibliothèque documentaire</h2>
        <span className="tnum rounded-chip bg-primary/12 px-1.5 py-px text-[0.6875rem] font-semibold text-primary">
          {entries.length}
        </span>

        <label className="ml-auto flex h-7 min-w-[168px] items-center gap-1.5 rounded-chip border border-edge bg-background-secondary px-2 focus-within:border-primary">
          <Search aria-hidden className="size-3 shrink-0 text-ink-dim" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fichier, machine, atelier…"
            aria-label="Rechercher un document"
            className="min-w-0 flex-1 bg-transparent text-[0.6875rem] text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-1 px-3.5 pb-2">
        <FilterChip
          label="Tous"
          count={entries.length}
          isActive={category === 'all'}
          onClick={() => setCategory('all')}
        />
        {DOCUMENT_CATEGORIES.map((item) => (
          <FilterChip
            key={item}
            label={DOCUMENT_CATEGORY_LABELS[item]}
            count={counts.get(item) ?? 0}
            isActive={category === item}
            onClick={() => setCategory(item)}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        {rows.length === 0 ? (
          <EmptyState hasEntries={entries.length > 0} />
        ) : (
          <table className="w-full table-auto border-collapse">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {['Fichier', 'Catégorie', 'Machine', 'Atelier', 'Taille', 'Déposé le', 'Par', ''].map(
                  (heading, index) => (
                    <th
                      key={heading || `action-${index}`}
                      className="border-b border-edge px-1.5 pt-1 pb-1.5 text-left text-[0.5625rem] font-semibold tracking-[0.08em] text-ink-dim uppercase whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const key = categoryOf(entry.category);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => openDocument(entry)}
                    title={openLabel(entry)}
                    className="cursor-pointer transition-colors hover:bg-card-hover"
                  >
                    <td className="max-w-[220px] border-b border-edge-soft px-1.5 py-1.5">
                      {/*
                       * Un vrai lien, pas seulement la ligne cliquable : il
                       * reçoit le focus au clavier, et le clic du milieu ou
                       * Ctrl+clic ouvrent l'onglet comme partout ailleurs.
                       */}
                      <a
                        href={documentHref(entry)}
                        target={documentPreviewKind(entry.mimeType) ? '_blank' : undefined}
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="flex items-center gap-1.5"
                      >
                        <FileText aria-hidden className="size-3 shrink-0 text-ink-dim" strokeWidth={2} />
                        <span className="truncate text-[0.6875rem] font-medium text-ink hover:text-primary hover:underline">
                          {entry.fileName}
                        </span>
                      </a>
                    </td>
                    <td className="border-b border-edge-soft px-1.5 py-1.5 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex rounded-chip border px-1.5 py-px text-[0.625rem] font-medium',
                          DOCUMENT_CATEGORY_STYLE[key],
                        )}
                      >
                        {DOCUMENT_CATEGORY_LABELS[key]}
                      </span>
                    </td>
                    <td className="border-b border-edge-soft px-1.5 py-1.5 whitespace-nowrap">
                      <Link
                        href={`/machines/${entry.machineId}/documents`}
                        prefetch={false}
                        onClick={(event) => event.stopPropagation()}
                        className="text-[0.6875rem] font-medium text-primary hover:underline"
                      >
                        {entry.machineName}
                      </Link>
                      <span className="ml-1 text-[0.625rem] text-ink-dim">{entry.machineCode}</span>
                    </td>
                    <td className="border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink-muted">
                      {entry.workshopName}
                    </td>
                    <td className="tnum border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink-muted">
                      {formatFileSize(entry.sizeBytes)}
                    </td>
                    <td className="tnum border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink-dim">
                      {formatDate(entry.uploadedAt)}
                    </td>
                    <td className="max-w-[110px] truncate border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] text-ink-muted">
                      {entry.uploadedByLabel ?? '—'}
                    </td>
                    <td className="border-b border-edge-soft px-1.5 py-1.5 text-right whitespace-nowrap">
                      {canDownload ? (
                        <a
                          href={`/machines/${entry.machineId}/documents/${entry.id}`}
                          aria-label={`Télécharger ${entry.fileName}`}
                          title={`Télécharger ${entry.fileName}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-grid size-6 place-items-center rounded-chip text-ink-dim transition-colors hover:bg-background-secondary hover:text-primary"
                        >
                          <Download className="size-3.5" strokeWidth={2} />
                        </a>
                      ) : (
                        <span className="text-[0.625rem] text-ink-dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

function FilterChip({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'rounded-chip border px-2 py-[3px] text-[0.625rem] font-medium whitespace-nowrap transition-colors',
        isActive
          ? 'border-primary bg-primary/12 text-primary'
          : 'border-edge text-ink-muted hover:border-primary/40 hover:text-ink',
      )}
    >
      {label}
      <span className="tnum ml-1 opacity-70">{count}</span>
    </button>
  );
}

/**
 * Deux vides très différents : « rien ne correspond au filtre » se corrige en
 * un clic, « aucun document déposé » demande une action. Les confondre laisse
 * croire à une panne.
 */
function EmptyState({ hasEntries }: { hasEntries: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-9 place-items-center rounded-chip bg-primary/12 text-primary">
        <FileText className="size-4" strokeWidth={2} />
      </span>
      {hasEntries ? (
        <p className="text-[0.75rem] text-ink-muted">Aucun document ne correspond à cette recherche.</p>
      ) : (
        <>
          <p className="text-[0.8125rem] font-medium text-ink">Aucun document déposé</p>
          <p className="max-w-md text-[0.75rem] leading-relaxed text-ink-muted">
            Notices constructeur, plans électriques, fiches de réglage et certificats se déposent
            depuis l’onglet Documents de chaque machine.
          </p>
        </>
      )}
    </div>
  );
}
