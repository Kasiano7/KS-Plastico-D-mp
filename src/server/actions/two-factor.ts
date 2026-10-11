'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '../auth/session';
import { beginEnrollment, confirmEnrollment, disableTwoFactor } from '../services/two-factor';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

/**
 * Double authentification — accessible à tout utilisateur authentifié pour
 * son PROPRE compte (§ SECURITY.md « Reste à durcir » : recommandée au
 * minimum pour la direction et l'administration, mais rien n'empêche
 * quiconque de la vouloir). Pas de permission particulière requise :
 * `requireUser()` suffit, il ne s'agit jamais du compte d'un tiers.
 */

export type TwoFactorState = {
  step?: 'enrolling' | 'confirmed';
  qrDataUrl?: string;
  secretBase32?: string;
  recoveryCodes?: string[];
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposée par useActionState, aucun des deux paramètres n'est nécessaire ici.
export async function beginEnrollmentAction(_state: TwoFactorState, _formData: FormData): Promise<TwoFactorState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await requireUser();
  const { qrDataUrl, secretBase32 } = await beginEnrollment(user.id, user.email);
  return { step: 'enrolling', qrDataUrl, secretBase32 };
}

export async function confirmEnrollmentAction(
  _state: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await requireUser();
  const code = String(formData.get('code') ?? '').trim();
  const qrDataUrl = String(formData.get('qrDataUrl') ?? '');
  const secretBase32 = String(formData.get('secretBase32') ?? '');

  if (!code) {
    return { step: 'enrolling', qrDataUrl, secretBase32, error: 'Code requis.' };
  }

  const result = await confirmEnrollment(user.id, code);
  if (!result.ok) {
    return { step: 'enrolling', qrDataUrl, secretBase32, error: result.error };
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'user.2fa_enabled',
    entityType: 'user',
    entityId: user.id,
  });

  revalidatePath('/mon-compte/securite');
  return { step: 'confirmed', recoveryCodes: result.recoveryCodes };
}

export async function disableTwoFactorAction(): Promise<void> {
  if (demoWriteRefusal()) return;
  const user = await requireUser();
  await disableTwoFactor(user.id);

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'user.2fa_disabled',
    entityType: 'user',
    entityId: user.id,
  });

  revalidatePath('/mon-compte/securite');
}
