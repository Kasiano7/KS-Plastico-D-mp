import { getFactoryContext } from '@/server/services/factory-context';
import { FactoryPanel } from './factory-panel';

/** Vue aérienne de l'usine, avec chaque atelier identifié sur sa zone. */
export async function FactoryOverview() {
  const context = await getFactoryContext();
  const injectionWorkshop = context.workshops.find((w) => w.code === 'B');
  const injectionMachines = injectionWorkshop
    ? context.machines.filter((m) => m.workshopId === injectionWorkshop.id)
    : [];
  const puWorkshop = context.workshops.find((w) => w.code === 'A');
  const puMachines = puWorkshop
    ? context.machines.filter((m) => m.workshopId === puWorkshop.id)
    : [];
  return <FactoryPanel injectionMachines={injectionMachines} puMachines={puMachines} />;
}
