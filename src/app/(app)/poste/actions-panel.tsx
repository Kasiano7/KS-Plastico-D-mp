'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertTriangle, Loader2, PackageCheck, QrCode } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { completePalletAction, type ActionState } from '@/server/actions/pallets';
import { declareIncidentAction, type ActionState as MachineActionState } from '@/server/actions/machines';

/**
 * Les deux gestes du poste opérateur : terminer une palette, déclarer un
 * problème. Cibles tactiles larges, aucun jargon.
 */
export function WorkstationActions({
  productionOrderId,
  machineId,
  unitsPerPallet,
}: {
  productionOrderId: string;
  machineId: string;
  unitsPerPallet: number;
}) {
  const [panel, setPanel] = useState<'none' | 'pallet' | 'issue'>('none');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPanel(panel === 'pallet' ? 'none' : 'pallet')}
          className={cn(
            'flex h-20 items-center justify-center gap-3 rounded-[var(--radius-card)] border text-[1rem] font-semibold transition-colors',
            panel === 'pallet'
              ? 'border-brand bg-brand text-white'
              : 'border-line bg-surface text-fg hover:border-brand/50',
          )}
        >
          <PackageCheck className="size-6" />
          Terminer une palette
        </button>

        <button
          type="button"
          onClick={() => setPanel(panel === 'issue' ? 'none' : 'issue')}
          className={cn(
            'flex h-20 items-center justify-center gap-3 rounded-[var(--radius-card)] border text-[1rem] font-semibold transition-colors',
            panel === 'issue'
              ? 'border-critical bg-critical text-white'
              : 'border-line bg-surface text-fg hover:border-critical/50',
          )}
        >
          <AlertTriangle className="size-6" />
          Déclarer un problème
        </button>
      </div>

      {panel === 'pallet' ? (
        <PalletForm productionOrderId={productionOrderId} unitsPerPallet={unitsPerPallet} />
      ) : null}
      {panel === 'issue' ? <IssueForm machineId={machineId} /> : null}
    </div>
  );
}

function PalletForm({
  productionOrderId,
  unitsPerPallet,
}: {
  productionOrderId: string;
  unitsPerPallet: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(completePalletAction, {});

  return (
    <Card className="animate-fade-up">
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="productionOrderId" value={productionOrderId} />

        <Field
          label="Quantité sur la palette"
          htmlFor="quantityUnits"
          hint="Pré-remplie avec la quantité standard de la référence."
        >
          <Input
            id="quantityUnits"
            name="quantityUnits"
            type="number"
            min={1}
            defaultValue={unitsPerPallet}
            className="h-12 text-lg"
            inputMode="numeric"
          />
        </Field>

        <p className="rounded-[var(--radius-control)] border border-line bg-surface-sunken px-3.5 py-2.5 text-[0.8125rem] text-fg-muted">
          À la validation : un code QR est généré, la palette entre en stock, elle est affectée à la
          commande et l’avancement est mis à jour.
        </p>

        <SubmitButton label="Valider la palette" icon={<QrCode className="size-4" />} />

        {state.message ? (
          <p
            role="status"
            className={cn(
              'rounded-[var(--radius-control)] px-3.5 py-2.5 text-[0.875rem]',
              state.ok ? 'bg-normal-soft text-normal' : 'bg-critical-soft text-critical',
            )}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function IssueForm({ machineId }: { machineId: string }) {
  const [state, formAction] = useActionState<MachineActionState, FormData>(declareIncidentAction, {});

  return (
    <Card className="animate-fade-up">
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="machineId" value={machineId} />

        <Field label="Que se passe-t-il ?" htmlFor="title">
          <Input
            id="title"
            name="title"
            required
            className="h-12"
            placeholder="Ex. la presse s’arrête toute seule"
          />
        </Field>

        <Field label="Décrivez le problème" htmlFor="symptom">
          <Textarea id="symptom" name="symptom" required rows={3} placeholder="Ce que vous observez…" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gravité" htmlFor="severity">
            <Select id="severity" name="severity" defaultValue="warning" className="h-12">
              <option value="info">Je signale</option>
              <option value="warning">Ça gêne la production</option>
              <option value="critical">La machine est arrêtée</option>
            </Select>
          </Field>
          <Field label="Arrêt (minutes)" htmlFor="downtimeMinutes">
            <Input
              id="downtimeMinutes"
              name="downtimeMinutes"
              type="number"
              min={0}
              defaultValue={0}
              className="h-12"
              inputMode="numeric"
            />
          </Field>
        </div>

        <SubmitButton label="Envoyer" icon={<AlertTriangle className="size-4" />} />

        {state.message ? (
          <p
            role="status"
            className={cn(
              'rounded-[var(--radius-control)] px-3.5 py-2.5 text-[0.875rem]',
              state.ok ? 'bg-normal-soft text-normal' : 'bg-critical-soft text-critical',
            )}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function SubmitButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass('primary', 'lg', 'w-full sm:w-auto')}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
