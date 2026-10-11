'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck, ShieldOff, Loader2, TriangleAlert } from 'lucide-react';
import {
  beginEnrollmentAction,
  confirmEnrollmentAction,
  disableTwoFactorAction,
  type TwoFactorState,
} from '@/server/actions/two-factor';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

export function TwoFactorSettings({
  enabled,
  remainingRecoveryCodes,
}: {
  enabled: boolean;
  remainingRecoveryCodes: number;
}) {
  const [enrollState, beginAction] = useActionState<TwoFactorState, FormData>(beginEnrollmentAction, {});
  const [confirmState, confirmAction] = useActionState<TwoFactorState, FormData>(confirmEnrollmentAction, {});
  const [disabling, setDisabling] = useState(false);

  // Une fois confirmée, `confirmState` prime sur `enrollState` pour l'affichage.
  const active = confirmState.step ?? enrollState.step;

  if (confirmState.step === 'confirmed' && confirmState.recoveryCodes) {
    return <RecoveryCodesReveal codes={confirmState.recoveryCodes} />;
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-normal">
          <ShieldCheck className="size-4" />
          Double authentification activée
        </div>
        <p className="text-[0.8125rem] text-fg-muted">
          {remainingRecoveryCodes} code{remainingRecoveryCodes > 1 ? 's' : ''} de secours restant
          {remainingRecoveryCodes > 1 ? 's' : ''}.
        </p>
        <form
          action={async () => {
            setDisabling(true);
            await disableTwoFactorAction();
            setDisabling(false);
          }}
        >
          <button
            type="submit"
            disabled={disabling}
            className={buttonClass('secondary', 'md')}
          >
            {disabling ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
            Désactiver la double authentification
          </button>
        </form>
      </div>
    );
  }

  if (active === 'enrolling') {
    const qrDataUrl = confirmState.qrDataUrl ?? enrollState.qrDataUrl;
    const secretBase32 = confirmState.secretBase32 ?? enrollState.secretBase32;
    const error = confirmState.error;

    return (
      <form action={confirmAction} className="space-y-4">
        <p className="text-[0.8125rem] text-fg-muted">
          Scannez ce code avec une application d’authentification (Google Authenticator, Authy…),
          ou saisissez la clé manuellement.
        </p>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté serveur, pas une image optimisable par next/image.
          <img src={qrDataUrl} alt="QR code d'activation de la double authentification" width={180} height={180} className="rounded-[var(--radius-card)] border border-line" />
        ) : null}
        {secretBase32 ? (
          <p className="rounded-[var(--radius-control)] bg-surface-sunken px-3 py-2 font-mono text-xs break-all text-fg-muted">
            {secretBase32}
          </p>
        ) : null}

        <input type="hidden" name="qrDataUrl" value={qrDataUrl ?? ''} />
        <input type="hidden" name="secretBase32" value={secretBase32 ?? ''} />

        <Field label="Code à 6 chiffres" htmlFor="code">
          <Input id="code" name="code" type="text" inputMode="numeric" autoFocus required placeholder="123456" />
        </Field>

        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3 py-2 text-[0.8125rem] text-critical">
            {error}
          </p>
        ) : null}

        <SubmitButton label="Activer" pendingLabel="Vérification…" />
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <ShieldOff className="size-4" />
        Double authentification désactivée
      </div>
      <form action={beginAction}>
        <SubmitButton label="Configurer la double authentification" pendingLabel="Préparation…" />
      </form>
    </div>
  );
}

function RecoveryCodesReveal({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-normal">
        <ShieldCheck className="size-4" />
        Double authentification activée
      </div>

      <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3 py-2 text-[0.8125rem] text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Notez ces codes de secours maintenant — ils ne seront plus jamais affichés. Chacun ne
          fonctionne qu’une fois, en cas de perte de votre téléphone.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-line bg-surface-sunken p-4 font-mono text-sm">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>

      <button type="button" onClick={() => window.location.reload()} className={buttonClass('primary', 'md')}>
        J’ai noté mes codes
      </button>
    </div>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
