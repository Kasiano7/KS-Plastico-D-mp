/**
 * Squelette racine — couvre le tout premier chargement (URL tapée
 * directement, retour à froid) avant même que la coquille applicative ou la
 * page de connexion ne soit prête. Volontairement neutre : à ce niveau, on
 * ne sait pas encore si l'utilisateur atterrit sur `/connexion` ou dans
 * l'application, donc pas de mise en page spécifique à l'un ou l'autre.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" />
        <span className="text-xs font-medium tracking-[0.08em] text-fg-subtle uppercase">
          KS Plastico Demo
        </span>
      </div>
    </div>
  );
}
