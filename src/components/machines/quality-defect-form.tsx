'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { declareQualityEventAction, type QualityActionState } from '@/server/actions/quality';

export const DEFECT_LABELS: Record<string, string> = {
  appearance: 'Aspect',
  dimension: 'Dimensionnel',
  material: 'Matière',
  shrinkage: 'Retassure',
  burn: 'Brûlure',
  flash: 'Bavure',
  contamination: 'Contamination',
  other: 'Autre',
};

/** Déclaration d'un rebut — repliable, même pattern que `IncidentForm`. */
export function QualityDefectForm({ machineId }: { machineId: string }) {
  const [state, formAction] = useActionState<QualityActionState, FormData>(
    declareQualityEventAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Déclarer un rebut
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-control)] border border-line bg-surface-sunken p-3.5">
      <input type="hidden" name="machineId" value={machineId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Motif" htmlFor="defect">
          <Select id="defect" name="defect" defaultValue="appearance">
            {Object.entries(DEFECT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pièces rebutées" htmlFor="rejectedUnits">
          <Input id="rejectedUnits" name="rejectedUnits" type="number" min={1} defaultValue={1} required />
        </Field>
      </div>

      <Field label="Lot" htmlFor="lotNumber" hint="Facultatif.">
        <Input id="lotNumber" name="lotNumber" placeholder="LOT-2026-..." />
      </Field>

      <Field label="Commentaire" htmlFor="comment" hint="Facultatif.">
        <Textarea id="comment" name="comment" rows={2} />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton />
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Déclarer le rebut
    </button>
  );
}
