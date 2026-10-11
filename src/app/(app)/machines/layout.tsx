import type { ReactNode } from 'react';
import { MachineLiveRefresh } from './live-refresh';

export default function MachinesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MachineLiveRefresh />
      {children}
    </>
  );
}
