import { Skeleton } from '@/components/ui/primitives';

/**
 * Squelette affiché pendant le chargement d'une page applicative. Next
 * l'utilise comme frontière de Suspense autour de `page.tsx` UNIQUEMENT — le
 * layout parent (`(app)/layout.tsx`, la coquille avec sidebar/topbar) reste
 * affiché immédiatement, seule la zone de contenu montre ce squelette.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-panel" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-panel" />
      <Skeleton className="h-48 rounded-panel" />
    </div>
  );
}
