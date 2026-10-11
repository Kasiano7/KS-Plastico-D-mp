'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { IncidentMemoryHints } from './incident-memory-hints';
import {
  changeMachineStatusAction,
  declareIncidentAction,
  type ActionState,
} from '@/server/actions/machines';

const STATUSES = [
  { value: 'production', label: 'En production' },
  { value: 'setup', label: 'Réglage' },
  { value: 'mold_change', label: 'Changement de moule' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'stopped', label: 'Arrêt' },
  { value: 'fault', label: 'Défaut' },
  { value: 'idle', label: 'Disponible' },
];

/** Changement d'état machine — mutation réelle, tracée dans la timeline. */
export function MachineStatusForm({
  machineId,
  currentStatus,
}: {
  machineId: string;
  currentStatus: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(changeMachineStatusAction, {});

  return (
    <form action={formAction} className="space-y-3 px-5 pb-5">
      <input type="hidden" name="machineId" value={machineId} />

      <Field label="Nouvel état" htmlFor="status">
        <Select id="status" name="status" defaultValue={currentStatus}>
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Motif" htmlFor="reason" hint="Visible dans la timeline et le journal d’audit.">
        <Input id="reason" name="reason" placeholder="Ex. reprise après changement de lot matière" />
      </Field>

      <SubmitButton label="Appliquer le changement" />

      {state.message ? (
        <p className={cn('text-[0.8125rem]', state.ok ? 'text-normal' : 'text-critical')} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Déclaration d'incident : alimente la mémoire de l'usine et le centre d'alertes. */
export function IncidentForm({ machineId }: { machineId: string }) {
  // Le symptôme est suivi en état pour alimenter la mémoire des pannes au fil
  // de la frappe ; le formulaire reste soumis par le navigateur.
  const [symptom, setSymptom] = useState('');
  const [state, formAction] = useActionState<ActionState, FormData>(declareIncidentAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="px-5 pb-5">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Déclarer un incident
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 px-5 pb-5">
      <input type="hidden" name="machineId" value={machineId} />

      <Field label="Titre" htmlFor="title">
        <Input id="title" name="title" required placeholder="Ex. arrêt sur défaut alimentation matière" />
      </Field>

      <Field
        label="Symptôme observé"
        htmlFor="symptom"
        hint="Décrivez précisément : les incidents similaires déjà résolus apparaissent au fil de la saisie."
      >
        <Textarea
          id="symptom"
          name="symptom"
          required
          rows={3}
          value={symptom}
          onChange={(event) => setSymptom(event.target.value)}
        />
      </Field>

      {/* La mémoire des pannes se consulte AVANT le diagnostic, pas après. */}
      <IncidentMemoryHints symptom={symptom} machineId={machineId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gravité" htmlFor="severity">
          <Select id="severity" name="severity" defaultValue="warning">
            <option value="info">Information</option>
            <option value="warning">Attention</option>
            <option value="critical">Critique</option>
          </Select>
        </Field>
        <Field label="Arrêt (minutes)" htmlFor="downtimeMinutes" hint="Sert au calcul de l’impact.">
          <Input id="downtimeMinutes" name="downtimeMinutes" type="number" min={0} defaultValue={0} />
        </Field>
      </div>

      <Field label="Mots-clés" htmlFor="tags" hint="Séparés par des virgules.">
        <Input id="tags" name="tags" placeholder="trémie, vis de dosage, matière" />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton label="Déclarer l’incident" />
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'md')}>
          Annuler
        </button>
      </div>

      {state.message ? (
        <p className={cn('text-[0.8125rem]', state.ok ? 'text-normal' : 'text-critical')} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {label}
    </button>
  );
}
