'use client';

import { useEffect } from 'react';

/**
 * Affichage intégré (`?embed=1`) : tout lien qui quitte l'application s'ouvre
 * dans un nouvel onglet, au lieu de remplacer la démonstration à l'intérieur
 * du cadre. Les liens internes gardent la navigation normale.
 *
 * Délégation au niveau du document : couvre aussi les liens produits plus
 * tard (réponses du copilote, contenus chargés), sans toucher aux composants.
 */
export function EmbedLinkPolicy() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const url = new URL(anchor.href, window.location.href);
      const outbound = url.origin !== window.location.origin || url.protocol === 'mailto:' || url.protocol === 'tel:';
      if (!outbound) return;

      event.preventDefault();
      window.open(url.href, '_blank', 'noopener,noreferrer');
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
