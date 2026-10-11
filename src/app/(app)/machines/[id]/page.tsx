import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { getMachineOverview } from '@/server/services/machine-overview';
import { MachineHero } from '@/components/machines/machine-hero';
import {
  AvailabilityCard,
  ConsumptionCard,
  MachineInformationCard,
  MachineStateCard,
  MaintenanceCard,
  ProductionCard,
  RecentStopsCard,
  TemperatureCard,
} from '@/components/machines/overview-cards';
import styles from '@/components/machines/machines.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const machine = await getMachineOverview((await params).id);
  return { title: machine?.name ?? 'Machine' };
}

export default async function MachineOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('machines:read');
  const machine = await getMachineOverview((await params).id);
  if (!machine) notFound();

  return (
    <>
      <MachineHero machine={machine} />

      <div className={styles.overviewGrid}>
        <div className="space-y-4">
          <div className={styles.overviewTopRow}>
            <ProductionCard machine={machine} />
            <MachineStateCard machine={machine} />
          </div>
          <div className={styles.overviewBottomRow}>
            <AvailabilityCard machine={machine} />
            <RecentStopsCard machine={machine} />
            <MachineInformationCard machine={machine} />
          </div>
        </div>

        <div className="space-y-4">
          <ConsumptionCard machine={machine} />
          <TemperatureCard machine={machine} />
          <MaintenanceCard machine={machine} />
        </div>
      </div>
    </>
  );
}
