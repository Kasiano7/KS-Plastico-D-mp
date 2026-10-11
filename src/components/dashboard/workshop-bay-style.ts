/**
 * Style visuel partagé par les vues d'atelier en plan (Injection, PU…) : couleur,
 * bordure et halo appliqués à un badge de presse selon sa sévérité réelle.
 * Une seule table pour que « rouge » veuille dire la même chose partout (§47).
 */

export const BAY_SEVERITY_STYLE: Record<
  string,
  { bg: string; border: string; text: string; glow: string }
> = {
  normal: {
    bg: 'rgba(21,128,61,1)',
    border: 'rgba(34,197,94,0.9)',
    text: '#bbf7d0',
    glow: '0 0 30px 10px rgba(34,197,94,0.6), inset 0 0 20px 2px rgba(34,197,94,0.1)',
  },
  info: {
    bg: 'rgba(29,78,216,1)',
    border: 'rgba(59,130,246,0.9)',
    text: '#bfdbfe',
    glow: '0 0 30px 10px rgba(59,130,246,0.6), inset 0 0 20px 2px rgba(59,130,246,0.1)',
  },
  warning: {
    bg: 'rgba(180,52,3,1)',
    border: 'rgba(249,115,22,0.9)',
    text: '#fed7aa',
    glow: '0 0 30px 10px rgba(249,115,22,0.6), inset 0 0 20px 2px rgba(249,115,22,0.1)',
  },
  critical: {
    bg: 'rgba(153,27,27,1)',
    border: 'rgba(239,68,68,0.9)',
    text: '#fecaca',
    glow: '0 0 30px 10px rgba(239,68,68,0.6), inset 0 0 20px 2px rgba(239,68,68,0.1)',
  },
  offline: {
    bg: 'rgba(40,40,55,1)',
    border: 'rgba(100,100,130,0.4)',
    text: '#6b7280',
    glow: 'none',
  },
};

export function getBayStyle(severity?: string) {
  return BAY_SEVERITY_STYLE[severity ?? 'offline'] ?? BAY_SEVERITY_STYLE.offline;
}
