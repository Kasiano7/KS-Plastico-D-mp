'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 5_000;

export function MachineLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  return null;
}
