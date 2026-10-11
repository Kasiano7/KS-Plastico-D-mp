'use client';

import { Moon, Sun } from 'lucide-react';
import { THEME_COOKIE } from '@/lib/theme';

/**
 * Bascule clair / sombre.
 *
 * Aucun état React : l'icône affichée dépend de la classe `dark` posée sur
 * `<html>`, elle-même résolue côté serveur depuis un cookie. Le clic applique
 * le changement immédiatement puis mémorise la préférence.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    document.cookie = `${THEME_COOKIE}=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Changer de thème"
      title="Changer de thème"
      className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
    >
      <Moon className="size-[18px] dark:hidden" />
      <Sun className="hidden size-[18px] dark:block" />
    </button>
  );
}
