'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, ImageIcon, Loader2, Upload } from 'lucide-react';
import type {
  CatalogImportAnalysis,
  CatalogImportConfirmation,
  CatalogImportDraft,
} from '@/lib/catalog-import';
import { Badge, Button, Card, CardBody, CardHeader, Input, Table, Td, Th, Tr, buttonClass } from '@/components/ui/primitives';

type EditableKey =
  | 'reference'
  | 'name'
  | 'family'
  | 'weightGrams'
  | 'dimensionsMm'
  | 'cycleTimeSeconds'
  | 'unitsPerPallet';

export function CatalogImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CatalogImportAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportConfirmation | null>(null);

  const selectedDrafts = useMemo(
    () => analysis?.drafts.filter((draft) => selected.has(draft.tempId)) ?? [],
    [analysis, selected],
  );

  async function analyse() {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/catalogue/import/analyse', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "L'analyse a échoué.");
      const nextAnalysis = payload.analysis as CatalogImportAnalysis;
      setAnalysis(nextAnalysis);
      setSelected(
        new Set(nextAnalysis.drafts.filter((draft) => !draft.duplicate).map((draft) => draft.tempId)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'analyse a échoué.");
    } finally {
      setPending(false);
    }
  }

  function updateDraft(tempId: string, key: EditableKey, value: string) {
    if (!analysis) return;
    const numeric = ['weightGrams', 'cycleTimeSeconds', 'unitsPerPallet'].includes(key);
    setAnalysis({
      ...analysis,
      drafts: analysis.drafts.map((draft) =>
        draft.tempId === tempId
          ? { ...draft, [key]: numeric ? Number(value.replace(',', '.')) || 0 : value }
          : draft,
      ),
    });
  }

  function toggle(tempId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  async function confirmImport() {
    if (!analysis || selectedDrafts.length === 0 || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch('/api/catalogue/import/confirmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: analysis.fileName, items: selectedDrafts }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "L'import a échoué.");
      setResult(payload.result as CatalogImportConfirmation);
      setAnalysis(null);
      setSelected(new Set());
      setFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'import a échoué.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="1. Choisir la source"
          subtitle="XLSX et CSV sont d’abord lus localement. Les photos sont envoyées au fournisseur IA configuré et ne sont pas conservées par KS Plastico Demo."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface-sunken p-4 transition-colors hover:border-brand/50">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                {file?.type.startsWith('image/') ? <ImageIcon className="size-5" /> : <FileSpreadsheet className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{file ? file.name : 'Sélectionner un fichier'}</span>
                <span className="block text-xs text-fg-subtle">XLSX, CSV, JPG, PNG ou WEBP · 4 Mo maximum</span>
              </span>
              <input
                type="file"
                accept=".xlsx,.csv,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setAnalysis(null);
                  setError(null);
                  setResult(null);
                }}
              />
            </label>

            <div className="rounded-[var(--radius-control)] border border-line bg-surface p-4 text-sm text-fg-muted">
              <p className="font-medium text-fg">Conseil pour une photo</p>
              <p className="mt-1 text-xs leading-relaxed">
                Cadrez le tableau ou les étiquettes, évitez les reflets et assurez-vous que les références sont nettes.
              </p>
            </div>
          </div>

          <Button onClick={analyse} disabled={!file || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {pending ? 'Analyse en cours…' : 'Analyser le fichier'}
          </Button>
        </CardBody>
      </Card>

      {error ? (
        <Card className="border-critical/30 p-4">
          <p className="text-sm text-critical">{error}</p>
        </Card>
      ) : null}

      {result ? (
        <Card className="border-normal/30 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-normal" />
            <div>
              <p className="font-medium text-fg">{result.created} référence{result.created > 1 ? 's créées' : ' créée'}</p>
              <p className="mt-1 text-sm text-fg-muted">
                {result.skipped > 0 ? `${result.skipped} doublon(s) ignoré(s). ` : ''}L’opération est enregistrée dans l’historique.
              </p>
              <Link href="/catalogue" className={buttonClass('secondary', 'sm', 'mt-3')}>
                <ArrowLeft className="size-3.5" /> Voir le catalogue
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {analysis ? (
        <Card>
          <CardHeader
            title="2. Vérifier les propositions"
            subtitle={`${analysis.drafts.length} ligne(s) détectée(s) · ${analysis.provider === 'local' ? 'lecture locale' : 'lecture par IA'}`}
            action={<Badge tone={analysis.provider === 'local' ? 'neutral' : 'brand'}>{analysis.provider === 'local' ? 'Local' : 'IA'}</Badge>}
          />

          {analysis.warnings.length > 0 ? (
            <ul className="mx-5 mb-3 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-warning">
              {analysis.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          ) : null}

          <Table className="min-w-[1180px]">
            <thead>
              <tr>
                <Th className="w-10">OK</Th>
                <Th>Référence</Th>
                <Th>Désignation</Th>
                <Th>Famille</Th>
                <Th numeric>Poids (g)</Th>
                <Th>Dimensions</Th>
                <Th numeric>Cycle (s)</Th>
                <Th numeric>Pièces/palette</Th>
                <Th>Contrôle</Th>
              </tr>
            </thead>
            <tbody>
              {analysis.drafts.map((draft) => (
                <DraftRow
                  key={draft.tempId}
                  draft={draft}
                  checked={selected.has(draft.tempId)}
                  onToggle={() => toggle(draft.tempId)}
                  onChange={(key, value) => updateDraft(draft.tempId, key, value)}
                />
              ))}
            </tbody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <p className="text-sm text-fg-muted">{selectedDrafts.length} référence(s) sélectionnée(s)</p>
            <Button onClick={confirmImport} disabled={selectedDrafts.length === 0 || confirming} variant="success">
              {confirming ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {confirming ? 'Enregistrement…' : 'Valider et ajouter au catalogue'}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function DraftRow({
  draft,
  checked,
  onToggle,
  onChange,
}: {
  draft: CatalogImportDraft;
  checked: boolean;
  onToggle: () => void;
  onChange: (key: EditableKey, value: string) => void;
}) {
  const field = (key: EditableKey, type: 'text' | 'number' = 'text') => (
    <Input
      type={type}
      min={type === 'number' ? 0 : undefined}
      value={String(draft[key])}
      onChange={(event) => onChange(key, event.target.value)}
      className="h-8 min-w-24 px-2 text-xs"
      disabled={draft.duplicate}
    />
  );

  return (
    <Tr className={draft.duplicate ? 'opacity-60' : undefined}>
      <Td>
        <input
          type="checkbox"
          checked={checked}
          disabled={draft.duplicate}
          onChange={onToggle}
          aria-label={`Importer ${draft.reference}`}
          className="size-4 accent-[var(--color-brand)]"
        />
      </Td>
      <Td>{field('reference')}</Td>
      <Td>{field('name')}</Td>
      <Td>{field('family')}</Td>
      <Td>{field('weightGrams', 'number')}</Td>
      <Td>{field('dimensionsMm')}</Td>
      <Td>{field('cycleTimeSeconds', 'number')}</Td>
      <Td>{field('unitsPerPallet', 'number')}</Td>
      <Td className="max-w-64 text-xs">
        {draft.duplicate ? (
          <Badge>Doublon bloqué</Badge>
        ) : draft.issues.length > 0 ? (
          <span className="text-warning">{draft.issues.join(' ')}</span>
        ) : (
          <span className="text-normal">Confiance {Math.round(draft.confidence * 100)} %</span>
        )}
      </Td>
    </Tr>
  );
}
