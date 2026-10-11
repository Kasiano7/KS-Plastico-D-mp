import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter } from 'next/font/google';
import { THEME_COOKIE } from '@/lib/theme';
import { isDemoMode } from '@/config/demo';
import './globals.css';

/**
 * Inter, auto-hébergée par Next : aucune requête externe, aucun décalage de
 * mise en page. Le design system la consomme via `--font-inter`.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'KS Plastico Demo',
    template: '%s · KS Plastico Demo',
  },
  description:
    "Pilotage temps réel d'une usine de démonstration : production, machines, stocks, commandes, qualité et recommandations.",
  applicationName: 'KS Plastico Demo',
  // Démonstration publique : jamais référencée (doublé par X-Robots-Tag et robots.txt).
  ...(isDemoMode() ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f16' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Le thème est résolu côté serveur à partir du cookie. Aucun script bloquant,
 * aucun scintillement, aucune divergence d'hydratation.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <html lang="fr" className={[inter.variable, theme === 'dark' ? 'dark' : ''].join(' ').trim()}>
      <body className="min-h-screen bg-canvas text-fg antialiased">{children}</body>
    </html>
  );
}
