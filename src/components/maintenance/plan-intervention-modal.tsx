'use client';

import { useId, useRef, useState } from 'react';
import { CalendarPlus, Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  ASSET_TYPE_OPTIONS,
  DURATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  INTERVENTION_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  PRODUCTION_IMPACT_OPTIONS,
  RECURRENCE_OPTIONS,
  SKILL_OPTIONS,
  TECHNICIAN_OPTIONS,
  URGENCY_OPTIONS,
} from '@/server/db/fixtures/maintenance';
import type { SelectOption } from '@/types/maintenance';

/**
 * Modale « Planifier une intervention ».
 *
 * Construite sur l'élément natif `<dialog>` : le focus est piégé, `Échap`
 * ferme, et le fond de page reste visible derrière l'overlay — sans dépendance
 * ni gestionnaire de focus maison.
 *
 * Le formulaire est entièrement contrôlé. Aucune écriture n'est effectuée :
 * la création réelle viendra d'une Server Action, ce composant n'aura alors
 * qu'à changer de `onSubmit`.
 */

const CONTROL_CLASS =
  'h-8 w-full rounded-chip border border-edge bg-background-secondary px-2.5 text-[0.75rem] text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-primary focus-visible:outline-none';

type FormState = {
  assetType: string;
  equipment: string;
  interventionType: string;
  priority: string;
  technician: string;
  skill: string;
  scheduledAt: string;
  duration: string;
  productionImpact: string;
  urgency: string;
  description: string;
  part: string;
  recurrence: string;
};

const INITIAL_STATE: FormState = {
  assetType: '',
  equipment: '',
  interventionType: 'curative',
  priority: 'medium',
  technician: '',
  skill: '',
  scheduledAt: '',
  duration: '',
  productionImpact: 'moderate',
  urgency: 'normal',
  description: '',
  part: '',
  recurrence: 'once',
};

export function PlanInterventionModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [created, setCreated] = useState<string | null>(null);
  const equipmentListId = useId();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function open() {
    setCreated(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const equipment =
      EQUIPMENT_OPTIONS.find((option) => option.value === form.equipment)?.label ||
      form.equipment ||
      'équipement non précisé';
    setCreated(equipment);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-chip bg-primary px-3 text-[0.75rem] font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <CalendarPlus className="size-3.5" strokeWidth={2} />
        Planifier une intervention
      </button>

      <dialog
        ref={dialogRef}
        data-theme="dashboard"
        aria-label="Planifier une intervention"
        onClose={() => setForm(INITIAL_STATE)}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="m-auto max-h-[88vh] w-[min(92vw,620px)] overflow-y-auto rounded-panel border border-edge bg-card p-0 text-ink shadow-2xl backdrop:bg-[rgb(6_14_26/0.55)] backdrop:backdrop-blur-[2px]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 className="text-[0.8125rem] font-semibold text-ink">Planifier une intervention</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="grid size-6 place-items-center rounded-chip text-ink-dim transition-colors hover:bg-background-secondary hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </header>

        {created ? (
          <div className="px-4 py-6">
            <p className="flex items-start gap-2 rounded-chip border border-accent-green/30 bg-accent-green/10 px-3 py-2.5 text-[0.75rem] text-accent-green">
              <Check className="mt-px size-3.5 shrink-0" />
              <span>
                Intervention préparée pour <strong className="font-semibold">{created}</strong>.
                L’enregistrement réel sera effectué lorsque la GMAO sera reliée à la base.
              </span>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="h-8 rounded-chip border border-edge px-3 text-[0.75rem] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Planifier une autre
              </button>
              <button
                type="button"
                onClick={close}
                className="h-8 rounded-chip bg-primary px-3 text-[0.75rem] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-4 py-3.5">
            <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
              <SelectField
                label="Type d’actif"
                value={form.assetType}
                onChange={(value) => update('assetType', value)}
                options={ASSET_TYPE_OPTIONS}
                placeholder="Sélectionner un type"
              />

              <Field label="Équipement / Zone / Bâtiment">
                <input
                  list={equipmentListId}
                  value={form.equipment}
                  onChange={(event) => update('equipment', event.target.value)}
                  placeholder="Rechercher un équipement…"
                  className={CONTROL_CLASS}
                />
                <datalist id={equipmentListId}>
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </Field>

              <SelectField
                label="Type d’intervention"
                value={form.interventionType}
                onChange={(value) => update('interventionType', value)}
                options={INTERVENTION_TYPE_OPTIONS}
              />

              <SelectField
                label="Priorité"
                value={form.priority}
                onChange={(value) => update('priority', value)}
                options={PRIORITY_OPTIONS}
              />

              <SelectField
                label="Intervenant"
                value={form.technician}
                onChange={(value) => update('technician', value)}
                options={TECHNICIAN_OPTIONS}
                placeholder="Sélectionner un intervenant"
              />

              <SelectField
                label="Compétence requise"
                value={form.skill}
                onChange={(value) => update('skill', value)}
                options={SKILL_OPTIONS}
                placeholder="Sélectionner une compétence"
              />

              <Field label="Date / heure souhaitée">
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) => update('scheduledAt', event.target.value)}
                  className={cn(CONTROL_CLASS, '[color-scheme:dark]')}
                />
              </Field>

              <SelectField
                label="Durée estimée"
                value={form.duration}
                onChange={(value) => update('duration', value)}
                options={DURATION_OPTIONS}
                placeholder="Sélectionner"
              />

              <SelectField
                label="Impact production"
                value={form.productionImpact}
                onChange={(value) => update('productionImpact', value)}
                options={PRODUCTION_IMPACT_OPTIONS}
              />

              <SelectField
                label="Niveau d’urgence"
                value={form.urgency}
                onChange={(value) => update('urgency', value)}
                options={URGENCY_OPTIONS}
              />

              <Field label="Description / symptôme" className="sm:col-span-2">
                <textarea
                  value={form.description}
                  onChange={(event) => update('description', event.target.value)}
                  rows={2}
                  placeholder="Décrire le problème ou l’action à réaliser…"
                  className={cn(CONTROL_CLASS, 'h-auto py-1.5 leading-relaxed')}
                />
              </Field>

              <Field label="Pièce / matériel nécessaire">
                <input
                  value={form.part}
                  onChange={(event) => update('part', event.target.value)}
                  placeholder="Rechercher une pièce…"
                  className={CONTROL_CLASS}
                />
              </Field>

              <SelectField
                label="Récurrence"
                value={form.recurrence}
                onChange={(value) => update('recurrence', value)}
                options={RECURRENCE_OPTIONS}
              />
            </div>

            <footer className="mt-4 flex items-center justify-end gap-2 border-t border-edge pt-3">
              <button
                type="button"
                onClick={close}
                className="h-8 rounded-chip border border-edge px-3 text-[0.75rem] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="h-8 rounded-chip bg-primary px-3.5 text-[0.75rem] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Créer l’intervention
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[0.6875rem] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(CONTROL_CLASS, 'pr-7')}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
