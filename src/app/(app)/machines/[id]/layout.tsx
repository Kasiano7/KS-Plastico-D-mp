import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { can, canAny } from '@/server/domain/permissions';
import { getMachineIdentity } from '@/server/services/machine-fleet';
import { MachineHeader } from '@/components/machines/machine-header';
import { MachineTabs } from '@/components/machines/machine-tabs';
import styles from '@/components/machines/machines.module.css';

/**
 * Coquille de la fiche machine : en-tête et navigation interne, partagés par
 * tous les onglets. La permission est vérifiée ici **et** dans chaque page :
 * un onglet ne s'ouvre jamais sur la seule foi du layout.
 */
export default async function MachineDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('machines:read');
  const machine = await getMachineIdentity((await params).id);
  if (!machine) notFound();

  return (
    <div className={styles.shell}>
      <div className="mx-auto max-w-[110rem]">
        <MachineHeader
          machine={machine}
          canWrite={can(user.permissions, 'machines:write')}
          canDeclareIncident={canAny(user.permissions, ['incidents:declare', 'maintenance:write'])}
          canManageFleet={can(user.permissions, 'admin:write')}
        />
        <MachineTabs machineId={machine.id} />
        {children}
      </div>
    </div>
  );
}
