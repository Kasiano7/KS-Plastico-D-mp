'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import {
  createMachineAction,
  updateMachineAction,
  type ActionState,
} from '@/server/actions/machines';
import { MachinePhotoPicker, type MachinePhotoOption } from './machine-photo-picker';

export type MachineEditorMachine = {
  id: string;
  code: string;
  name: string;
  workshopId: string;
  tonnage: number;
  manufacturer: string | null;
  model: string | null;
  hourlyCostCents: number;
  dailyCapacityHours: number;
  serialNumber: string | null;
  manufacturingYear: number | null;
  totalHours: number | null;
  productionHours: number | null;
  controlSoftware: string | null;
  controlSoftwareVersion: string | null;
  photoId: string | null;
};

/**
 * Éditeur de machine, en création comme en modification (miroir de
 * `RoleEditor`) : mêmes champs, seule l'action serveur change selon le mode.
 */
export function MachineEditor({
  machine,
  workshops,
  photos,
  mode,
}: {
  machine: MachineEditorMachine | null;
  workshops: { id: string; name: string }[];
  photos: MachinePhotoOption[];
  mode: 'create' | 'edit';
}) {
  const action = mode === 'create' ? createMachineAction : updateMachineAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      {machine ? <input type="hidden" name="machineId" value={machine.id} /> : null}

      <Card>
        <CardHeader
          title="Identité de la presse"
          subtitle="Code et atelier déterminent où la machine apparaît dans le parc et le planning."
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Code presse" htmlFor="code" hint="Identifiant court et unique, ex. PR-68.">
            <Input id="code" name="code" required defaultValue={machine?.code} placeholder="PR-68" />
          </Field>
          <Field label="Nom" htmlFor="name">
            <Input id="name" name="name" required defaultValue={machine?.name} placeholder="Presse 68" />
          </Field>
          <Field label="Atelier" htmlFor="workshopId">
            <Select id="workshopId" name="workshopId" required defaultValue={machine?.workshopId ?? ''}>
              <option value="" disabled>
                Sélectionner un atelier
              </option>
              {workshops.map((workshop) => (
                <option key={workshop.id} value={workshop.id}>
                  {workshop.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tonnage (T)" htmlFor="tonnage">
            <Input
              id="tonnage"
              name="tonnage"
              type="number"
              min={0}
              defaultValue={machine?.tonnage ?? 0}
            />
          </Field>
          <Field label="Fabricant" htmlFor="manufacturer">
            <Input id="manufacturer" name="manufacturer" defaultValue={machine?.manufacturer ?? ''} />
          </Field>
          <Field label="Modèle" htmlFor="model">
            <Input id="model" name="model" defaultValue={machine?.model ?? ''} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Photo"
          subtitle="Choisissez une photo déjà importée pour une autre presse du même modèle, ou importez-en une nouvelle. Sans choix, une illustration générique s'affiche selon le fabricant."
        />
        <div className="px-5 pb-5">
          <MachinePhotoPicker photos={photos} currentPhotoId={machine?.photoId ?? null} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Capacité et coût"
          subtitle="Utilisés par le planning et les calculs d'impact financier."
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Coût horaire (€)" htmlFor="hourlyCostEuros" hint="Énergie, amortissement et main d'œuvre.">
            <Input
              id="hourlyCostEuros"
              name="hourlyCostEuros"
              type="number"
              min={0}
              step={0.01}
              defaultValue={machine ? (machine.hourlyCostCents / 100).toFixed(2) : 0}
            />
          </Field>
          <Field label="Capacité journalière (h)" htmlFor="dailyCapacityHours">
            <Input
              id="dailyCapacityHours"
              name="dailyCapacityHours"
              type="number"
              min={0}
              max={24}
              step={0.5}
              defaultValue={machine?.dailyCapacityHours ?? 21}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Plaque signalétique"
          subtitle="Renseignée à la mise en service — laissez vide si inconnue, jamais de valeur inventée."
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Numéro de série" htmlFor="serialNumber">
            <Input id="serialNumber" name="serialNumber" defaultValue={machine?.serialNumber ?? ''} />
          </Field>
          <Field label="Année de fabrication" htmlFor="manufacturingYear">
            <Input
              id="manufacturingYear"
              name="manufacturingYear"
              type="number"
              min={1970}
              max={2100}
              defaultValue={machine?.manufacturingYear ?? ''}
            />
          </Field>
          <Field label="Compteur total (h)" htmlFor="totalHours">
            <Input id="totalHours" name="totalHours" type="number" min={0} defaultValue={machine?.totalHours ?? ''} />
          </Field>
          <Field label="Dont production (h)" htmlFor="productionHours">
            <Input
              id="productionHours"
              name="productionHours"
              type="number"
              min={0}
              defaultValue={machine?.productionHours ?? ''}
            />
          </Field>
          <Field label="Logiciel de contrôle" htmlFor="controlSoftware">
            <Input id="controlSoftware" name="controlSoftware" defaultValue={machine?.controlSoftware ?? ''} />
          </Field>
          <Field label="Version" htmlFor="controlSoftwareVersion">
            <Input
              id="controlSoftwareVersion"
              name="controlSoftwareVersion"
              defaultValue={machine?.controlSoftwareVersion ?? ''}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton label={mode === 'create' ? 'Créer la machine' : 'Enregistrer les modifications'} />
        {state.message ? (
          <p
            role="status"
            className={cn(
              'rounded-[var(--radius-control)] px-3.5 py-2.5 text-[0.8125rem]',
              state.ok ? 'bg-normal-soft text-normal' : 'bg-critical-soft text-critical',
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
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
