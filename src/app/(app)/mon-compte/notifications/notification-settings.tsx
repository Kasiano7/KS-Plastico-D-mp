'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Bell, BellOff, Loader2, Mail, MessageSquare, Smartphone } from 'lucide-react';
import {
  updateNotificationPreferencesAction,
  savePushSubscriptionAction,
  removePushSubscriptionAction,
  type NotificationSettingsState,
} from '@/server/actions/notification-preferences';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import type { NotificationPreferences } from '@/server/services/notification-preferences';

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critique uniquement' },
  { value: 'warning', label: 'Attention et plus' },
  { value: 'info', label: 'Information et plus' },
  { value: 'normal', label: 'Tout' },
] as const;

/** RFC 8291 : la clé VAPID publique doit passer de base64url à un `Uint8Array` pour `pushManager.subscribe`. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function NotificationSettings({
  preferences,
  phoneNumber,
  pushSubscriptionCount,
  emailConfigured,
  smsConfigured,
  pushConfigured,
  vapidPublicKey,
}: {
  preferences: NotificationPreferences;
  phoneNumber: string | null;
  pushSubscriptionCount: number;
  emailConfigured: boolean;
  smsConfigured: boolean;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
}) {
  const [state, formAction] = useActionState<NotificationSettingsState, FormData>(
    updateNotificationPreferencesAction,
    {},
  );
  const [smsChecked, setSmsChecked] = useState(preferences.smsEnabled);
  const [pushChecked, setPushChecked] = useState(preferences.pushEnabled);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <ChannelRow
          icon={<Mail className="size-4" />}
          name="emailEnabled"
          label="E-mail"
          defaultChecked={preferences.emailEnabled}
          configured={emailConfigured}
        />
        <ChannelRow
          icon={<MessageSquare className="size-4" />}
          name="smsEnabled"
          label="SMS"
          defaultChecked={preferences.smsEnabled}
          configured={smsConfigured}
          onChange={setSmsChecked}
        />
        {smsChecked ? (
          <Field label="Numéro de téléphone (format international)" htmlFor="phoneNumber" className="ml-6">
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              defaultValue={phoneNumber ?? ''}
              placeholder="+33612345678"
            />
          </Field>
        ) : (
          <input type="hidden" name="phoneNumber" value={phoneNumber ?? ''} />
        )}

        <ChannelRow
          icon={<Smartphone className="size-4" />}
          name="pushEnabled"
          label="Notification smartphone (push navigateur)"
          defaultChecked={preferences.pushEnabled}
          configured={pushConfigured}
          onChange={setPushChecked}
        />

        <Field label="Seuil minimal" htmlFor="minSeverity">
          <Select id="minSeverity" name="minSeverity" defaultValue={preferences.minSeverity}>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {state.errors?.length ? (
          <ul className="space-y-1 rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3 py-2 text-[0.8125rem] text-critical">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {state.message ? <p className="text-[0.8125rem] text-normal">{state.message}</p> : null}

        <SubmitButton />
      </form>

      {pushChecked && pushConfigured && vapidPublicKey ? (
        <PushDeviceControl vapidPublicKey={vapidPublicKey} pushSubscriptionCount={pushSubscriptionCount} />
      ) : null}
    </div>
  );
}

function ChannelRow({
  icon,
  name,
  label,
  defaultChecked,
  configured,
  onChange,
}: {
  icon: React.ReactNode;
  name: string;
  label: string;
  defaultChecked: boolean;
  configured: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1.5 hover:bg-surface-sunken">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
      />
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-fg-muted">{icon}</span>
        <span className="text-[0.8125rem] text-fg">{label}</span>
        {!configured ? (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] text-fg-subtle">
            Non configuré côté serveur
          </span>
        ) : null}
      </span>
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  );
}

/** Abonnement Web Push de CET appareil précisément — un utilisateur peut en avoir plusieurs (téléphone, poste fixe…). */
function PushDeviceControl({
  vapidPublicKey,
  pushSubscriptionCount,
}: {
  vapidPublicKey: string;
  pushSubscriptionCount: number;
}) {
  // Toujours 'checking' au premier rendu, y compris côté serveur (SSR) — la
  // détection de support dépend de `window`/`navigator`, indisponibles sur le
  // serveur. Brancher dessus dans l'initialiseur de useState produirait un
  // rendu serveur figé sur « non supporté » et une incohérence d'hydratation
  // (le client, lui, verrait le support réel). La détection n'a donc lieu
  // que dans l'effet ci-dessous, après le montage côté client.
  const [status, setStatus] = useState<'checking' | 'unsupported' | 'subscribed' | 'unsubscribed'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'checking') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      Promise.resolve().then(() => setStatus('unsupported'));
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.getRegistration('/sw.js').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setStatus(subscription ? 'subscribed' : 'unsubscribed');
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Autorisation refusée par le navigateur.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();
      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        setError(result.error ?? 'Échec de l’enregistrement.');
        return;
      }
      setStatus('subscribed');
    } catch {
      setError('Impossible d’activer les notifications sur cet appareil.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('unsubscribed');
    } catch {
      setError('Impossible de désactiver les notifications sur cet appareil.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'unsupported') {
    return <p className="text-[0.8125rem] text-fg-subtle">Ce navigateur ne prend pas en charge les notifications push.</p>;
  }

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <p className="text-[0.8125rem] text-fg-muted">
        {pushSubscriptionCount > 0
          ? `${pushSubscriptionCount} appareil${pushSubscriptionCount > 1 ? 's' : ''} activé${pushSubscriptionCount > 1 ? 's' : ''}.`
          : 'Aucun appareil activé pour l’instant.'}
      </p>
      {status === 'subscribed' ? (
        <button type="button" onClick={disable} disabled={busy} className={buttonClass('secondary', 'md')}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
          Désactiver sur cet appareil
        </button>
      ) : (
        <button type="button" onClick={enable} disabled={busy || status === 'checking'} className={buttonClass('secondary', 'md')}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          Activer sur cet appareil
        </button>
      )}
      {error ? <p className="text-[0.8125rem] text-critical">{error}</p> : null}
    </div>
  );
}
