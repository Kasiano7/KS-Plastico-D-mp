'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bell, BellRing, LogOut, Menu, Search, ShieldCheck } from 'lucide-react';
import { AiSearchBar } from '@/components/ai/ai-search-bar';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { SEVERITY_CHIP, type Severity } from '@/components/ui/severity';
import type { AiSuggestion } from '@/types/dashboard';
import { Sidebar } from './sidebar';
import { CopilotPanel, type CopilotRequest } from './copilot-panel';
import { CommandPalette } from './command-palette';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeToggle } from './theme-toggle';

/** Préférence de sidebar : stockée en cookie pour être connue dès le rendu serveur. */
export const SIDEBAR_COOKIE = 'app_sidebar_collapsed';

export type ShellUser = {
  fullName: string;
  email: string;
  roleLabel: string;
};

export type ShellStatus = {
  score: number;
  severity: Severity;
  label: string;
};

/** Coquille commune : navigation, agent IA, heure, alertes, thème et session. */
export function AppShell({
  user,
  allowedHrefs,
  openAlerts,
  status,
  canUseCopilot,
  aiSuggestions,
  initialNowIso,
  initialCollapsed,
  onLogout,
  children,
}: {
  user: ShellUser;
  allowedHrefs: string[];
  openAlerts: number;
  status: ShellStatus | null;
  canUseCopilot: boolean;
  aiSuggestions: AiSuggestion[];
  initialNowIso: string;
  initialCollapsed: boolean;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotRequest, setCopilotRequest] = useState<CopilotRequest | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [now, setNow] = useState(() => new Date(initialNowIso));

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      }).format(now),
    [now],
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i' && canUseCopilot) {
        event.preventDefault();
        setCopilotOpen((open) => !open);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseCopilot]);

  return (
    <ToastProvider>
    <div
      className="min-h-screen"
      style={{ ['--sidebar-width' as string]: collapsed ? '68px' : '228px' }}
    >
      <Sidebar
        allowedHrefs={allowedHrefs}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div className="flex min-h-screen flex-col transition-[padding] duration-200 print:pl-0 lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-md print:hidden lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir la navigation"
            className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface-sunken hover:text-fg lg:hidden"
          >
            <Menu className="size-[18px]" />
          </button>

          {canUseCopilot ? (
            <div
              data-theme="dashboard"
              className="flex min-w-0 flex-1 justify-center bg-transparent text-ink"
            >
              <AiSearchBar
                suggestions={aiSuggestions}
                showSuggestions={false}
                className="max-w-[790px]"
                onAsk={(question) => {
                  setCopilotRequest({ id: Date.now(), question });
                  setCopilotOpen(true);
                }}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {status ? (
              <Link
                href="/"
                title="Score de santé de l'usine"
                className={cn(
                  'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex',
                  SEVERITY_CHIP[status.severity],
                )}
              >
                <span className="tabular">{status.score}/100</span>
                <span className="hidden opacity-80 lg:inline">{status.label}</span>
              </Link>
            ) : null}

            <time
              dateTime={now.toISOString()}
              className="tabular hidden min-w-12 text-right text-sm font-semibold text-fg sm:block"
            >
              {time}
            </time>

            {/*
              Le raccourci est écrit, pas seulement dans l'attribut `title` :
              une fonction dont rien à l'écran n'annonce l'existence n'est
              utilisée par personne. Sur petit écran, seule l'icône reste.
            */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Recherche globale (Ctrl+K)"
              title="Recherche globale (Ctrl+K)"
              className="flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] px-2 text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg md:border md:border-line md:pr-1.5 md:pl-2.5"
            >
              <Search className="size-[18px]" />
              <Shortcut aria-hidden className="hidden md:inline-flex">
                Ctrl K
              </Shortcut>
            </button>

            <Link
              href="/alertes"
              aria-label={`Alertes ouvertes : ${openAlerts}`}
              className="relative flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              <Bell className="size-[18px]" />
              {openAlerts > 0 ? (
                <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.5625rem] font-bold text-white">
                  {openAlerts > 9 ? '9+' : openAlerts}
                </span>
              ) : null}
            </Link>

            <ThemeToggle />

            <div className="ml-1 flex items-center gap-2 border-l border-line pl-2">
              <div className="hidden text-right xl:block">
                <p className="text-[0.8125rem] leading-tight font-medium text-fg">{user.fullName}</p>
                <p className="text-[0.6875rem] leading-tight text-fg-subtle">{user.roleLabel}</p>
              </div>
              <span
                aria-hidden
                className="hidden size-8 items-center justify-center rounded-full bg-navy text-[0.6875rem] font-semibold text-white sm:flex"
              >
                {initials(user.fullName)}
              </span>
              <Link
                href="/mon-compte/notifications"
                aria-label="Préférences de notification"
                title="Préférences de notification"
                className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <BellRing className="size-[18px]" />
              </Link>
              <Link
                href="/mon-compte/securite"
                aria-label="Sécurité du compte"
                title="Sécurité du compte"
                className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <ShieldCheck className="size-[18px]" />
              </Link>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-critical"
              >
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 print:p-0 lg:px-6 lg:py-7">{children}</main>
      </div>

      {canUseCopilot ? (
        <CopilotPanel
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          request={copilotRequest}
        />
      ) : null}

      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} allowedHrefs={allowedHrefs} />
      ) : null}
    </div>
    </ToastProvider>
  );
}

/**
 * Touche de raccourci, présentée comme une touche.
 * Marquée `aria-hidden` par ses appelants : le raccourci figure déjà dans
 * l'`aria-label` du bouton, le lecteur d'écran n'a pas à l'entendre deux fois.
 */
function Shortcut({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'kbd'>) {
  return (
    <kbd
      className={cn(
        'items-center rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-fg-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
