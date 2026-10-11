/**
 * Écrit un cookie de préférence d'interface (thème, navigation repliée).
 *
 * Dans une iframe intersite — la démonstration intégrée au site KS — un
 * cookie `SameSite=Lax` n'est jamais renvoyé : la préférence serait perdue à
 * chaque page. Il devient alors `SameSite=None; Secure; Partitioned` (CHIPS),
 * cloisonné au site qui intègre l'application. Hors iframe, rien ne change.
 */
export function writePreferenceCookie(name: string, value: string): void {
  const framed = window.self !== window.top;
  const sameSite = framed ? 'samesite=none; secure; partitioned' : 'samesite=lax';
  document.cookie = `${name}=${value}; path=/; max-age=31536000; ${sameSite}`;
}
