'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NAV_GROUPS, NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/cn';
import { Logo } from './logo';

export function Sidebar({
  allowedHrefs,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  allowedHrefs: string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    // Le tiroir mobile se referme dès qu'on navigue.
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      onCloseMobile();
    }
  }, [pathname, onCloseMobile]);

  const allowed = new Set(allowedHrefs);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: NAV_ITEMS.filter((item) => item.group === group.id && allowed.has(item.href)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fermer la navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-overlay print:hidden lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-navy transition-transform duration-200 ease-out print:hidden lg:w-[var(--sidebar-width)] lg:translate-x-0 lg:transition-[width]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-white/10 px-5',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <Link href="/" className="flex items-center rounded" aria-label="KS Plastico Demo — accueil">
            <span className="hidden lg:flex">
              <Logo compact={collapsed} />
            </span>
            <span className="flex lg:hidden">
              <Logo />
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer la navigation"
            className="ml-auto rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-x-hidden overflow-y-auto py-4" aria-label="Navigation principale">
          {visibleGroups.map((group) => (
            <div key={group.id} className="mb-5 last:mb-0">
              {collapsed ? (
                <div className="mx-3 mb-2 hidden h-px bg-white/10 lg:block" aria-hidden />
              ) : null}
              <p
                className={cn(
                  'mb-1.5 px-5 text-[0.625rem] font-semibold tracking-[0.14em] text-white/35 uppercase lg:px-4',
                  collapsed && 'lg:hidden',
                )}
              >
                {group.label}
              </p>

              <ul className="space-y-0.5 px-3 lg:px-2">
                {group.items.map((item) => {
                  const isActive =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={false}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                          collapsed && 'lg:justify-center lg:px-0',
                          isActive
                            ? 'bg-white/[0.12] text-white'
                            : 'text-white/60 hover:bg-white/[0.08] hover:text-white',
                        )}
                      >
                        {isActive ? (
                          <span
                            aria-hidden
                            className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                          />
                        ) : null}
                        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                        <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hidden h-11 shrink-0 items-center gap-2 border-t border-white/10 px-4 text-[0.75rem] font-medium text-white/45 transition-colors hover:text-white lg:flex"
          aria-label={collapsed ? 'Déplier la navigation' : 'Replier la navigation'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span>Replier</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
}
