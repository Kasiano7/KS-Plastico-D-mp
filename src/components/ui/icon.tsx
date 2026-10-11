import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  Cpu,
  Factory,
  FileText,
  LayoutGrid,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wrench,
} from 'lucide-react';
import type { IconKey } from '@/types/dashboard';

/**
 * Registre d'icônes.
 *
 * Les données nomment une intention métier (`'machines'`), jamais un composant.
 * Elles restent donc sérialisables : le jour où elles arrivent d'une API JSON,
 * rien ne change ici.
 */
export const ICONS: Record<IconKey, LucideIcon> = {
  home: LayoutGrid,
  production: Factory,
  stocks: Boxes,
  planning: CalendarDays,
  machines: Cpu,
  maintenance: Wrench,
  quality: ShieldCheck,
  purchasing: ShoppingCart,
  logistics: Truck,
  reports: BarChart3,
  settings: Settings,
  orders: ClipboardList,
  alerts: AlertTriangle,
  'daily-report': FileText,
  'order-tracking': Package,
};
