'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Loader2, Plus, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  cancelMaintenanceTaskAction,
  completeMaintenanceTaskAction,
  resolveIncidentAction,
  scheduleMaintenanceAction,
  type MaintenanceActionState,
} from '@/server/actions/maintenance';
import { Button, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionToast } from '@/components/ui/toast';

type Option = { id: string; label: string };

export function ScheduleMaintenanceForm({
  machines,
  skills,
  staff,
}: {
  machines: Option[];
  skills: Option[];
  staff: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MaintenanceActionState, FormData>(
    scheduleMaintenanceAction,
    {},
  );

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Planifier une intervention
      </Button>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-fg">Nouvelle maintenance préventive</h2>
          <p className="text-xs text-fg-muted">Créneau, compétence et responsable sont enregistrés.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>
      <form action={action} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {machines.length === 1 ? (
          <input type="hidden" name="machineId" value={machines[0].id} />
        ) : (
          <Field label="Machine" htmlFor="maintenance-machine">
            <Select id="maintenance-machine" name="machineId" required>
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Intervention" htmlFor="maintenance-title">
          <Input id="maintenance-title" name="title" required placeholder="Contrôle hydraulique" />
        </Field>
        <Field label="Date et heure" htmlFor="maintenance-date">
          <Input id="maintenance-date" name="scheduledAt" type="datetime-local" required />
        </Field>
        <Field label="Durée prévue (min)" htmlFor="maintenance-duration">
          <Input id="maintenance-duration" name="estimatedMinutes" type="number" min={15} defaultValue={60} required />
        </Field>
        <Field label="Compétence requise" htmlFor="maintenance-skill">
          <Select id="maintenance-skill" name="requiredSkillId" defaultValue="">
            <option value="">Non précisée</option>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
          </Select>
        </Field>
        <Field label="Intervenant" htmlFor="maintenance-assignee">
          <Select id="maintenance-assignee" name="assignedEmployeeId" defaultValue="">
            <option value="">À affecter</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
          </Select>
        </Field>
        <Field label="Récurrence" htmlFor="maintenance-recurrence">
          <Select id="maintenance-recurrence" name="recurrence" defaultValue="none">
            <option value="none">Ponctuelle</option>
            <option value="monthly">Mensuelle</option>
            <option value="quarterly">Trimestrielle</option>
            <option value="semiannual">Semestrielle</option>
            <option value="annual">Annuelle</option>
          </Select>
        </Field>
        <Field label="Consignes" htmlFor="maintenance-description">
          <Input id="maintenance-description" name="description" placeholder="Points de contrôle, pièces…" />
        </Field>
        <div className="flex items-end md:col-span-2 xl:col-span-4">
          <SubmitButton label="Ajouter au calendrier" />
          {state.message ? (
            <p className={cn('ml-3 text-sm', state.ok ? 'text-normal' : 'text-critical')} role="status">
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export function ResolveIncidentForm({
  incidentId,
  defaultDowntime,
  defaultTags,
}: {
  incidentId: string;
  defaultDowntime: number;
  defaultTags: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MaintenanceActionState, FormData>(resolveIncidentAction, {});

  if (!open) {
    return <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Diagnostiquer</Button>;
  }

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-control)] bg-surface-sunken p-3 md:grid-cols-2">
      <input type="hidden" name="incidentId" value={incidentId} />
      <Field label="Cause racine" htmlFor={`cause-${incidentId}`}>
        <Textarea id={`cause-${incidentId}`} name="rootCause" rows={2} required />
      </Field>
      <Field label="Solution appliquée" htmlFor={`resolution-${incidentId}`}>
        <Textarea id={`resolution-${incidentId}`} name="resolution" rows={2} required />
      </Field>
      <Field label="Arrêt total (minutes)" htmlFor={`downtime-${incidentId}`}>
        <Input id={`downtime-${incidentId}`} name="downtimeMinutes" type="number" min={0} defaultValue={defaultDowntime} required />
      </Field>
      <Field label="Mots-clés" htmlFor={`tags-${incidentId}`}>
        <Input id={`tags-${incidentId}`} name="tags" defaultValue={defaultTags} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <SubmitButton label="Résoudre et mémoriser" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
        {state.message ? <p className={cn('text-sm', state.ok ? 'text-normal' : 'text-critical')} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function CompleteMaintenanceButton({ taskId }: { taskId: string }) {
  const [state, action] = useActionState<MaintenanceActionState, FormData>(completeMaintenanceTaskAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton label="Terminer" icon />
      {state.message ? <span className={cn('text-xs', state.ok ? 'text-normal' : 'text-critical')}>{state.message}</span> : null}
    </form>
  );
}

export function CancelMaintenanceButton({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const [state, action] = useActionState<MaintenanceActionState, FormData>(cancelMaintenanceTaskAction, {});
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useActionToast(state, {
    success: 'Intervention annulée',
    description: taskTitle,
    error: 'Annulation impossible',
  });

  return (
    <>
      <form ref={formRef} action={action} className="flex items-center gap-2">
        <input type="hidden" name="taskId" value={taskId} />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass('ghost', 'sm', 'text-critical hover:bg-critical-soft')}
        >
          <XCircle className="size-4" />
          Annuler
        </button>
      </form>

      <ConfirmDialog
        open={confirming}
        title="Annuler cette intervention ?"
        description={
          <>
            <span className="font-medium text-fg">{taskTitle}</span> ne sera pas réalisée. Une
            intervention récurrente recréera néanmoins sa prochaine échéance.
          </>
        }
        confirmLabel="Annuler l’intervention"
        cancelLabel="Revenir"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}

function SubmitButton({ label, icon = false }: { label: string; icon?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon ? <Check className="size-4" /> : null}
      {label}
    </button>
  );
}
