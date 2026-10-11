import { describe, expect, it } from 'vitest';
import { meetsNotificationThreshold } from '../notification-routing';

describe('meetsNotificationThreshold', () => {
  it('laisse passer une alerte au moins aussi urgente que le seuil', () => {
    expect(meetsNotificationThreshold('critical', 'warning')).toBe(true);
    expect(meetsNotificationThreshold('warning', 'warning')).toBe(true);
  });

  it('bloque une alerte moins urgente que le seuil', () => {
    expect(meetsNotificationThreshold('info', 'critical')).toBe(false);
    expect(meetsNotificationThreshold('normal', 'warning')).toBe(false);
  });

  it('un seuil "normal" laisse tout passer', () => {
    expect(meetsNotificationThreshold('normal', 'normal')).toBe(true);
    expect(meetsNotificationThreshold('critical', 'normal')).toBe(true);
  });
});
