'use client';

/**
 * Filet de rattrapage quand le root layout LUI-MÊME plante — le seul cas que
 * `error.tsx` ne couvre pas. Contrat Next.js : ce fichier remplace tout,
 * `<html>` et `<body>` compris, donc il ne peut dépendre ni du thème
 * (résolu par cookie dans `layout.tsx`, qu'on ne peut pas relire ici sans
 * risquer une nouvelle erreur), ni du CSS applicatif : couleurs en dur,
 * volontairement minimal.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f16',
          color: '#e6edf3',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
            KS Plastico Demo n’a pas pu démarrer
          </h1>
          <p style={{ marginTop: 8, fontSize: '0.875rem', color: '#9fb0c0', lineHeight: 1.5 }}>
            Une erreur inattendue a empêché l’affichage de l’application. Réessayez — si le
            problème persiste, contactez votre administrateur.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#2f6fed',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
