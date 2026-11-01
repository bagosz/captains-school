// Small helpers shared by every module.
export const $ = s => document.querySelector(s);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = x => (Math.round(x * 10) / 10).toFixed(1);
// For "too far" messages: a distance rounded up and a Move left rounded down, so 6.04″ against 6″ reads 6.1″ against 6.0″.
export const fmtUp = x => (Math.ceil(x * 10 - 1e-6) / 10).toFixed(1);
export const fmtDown = x => (Math.floor(x * 10 + 1e-6) / 10).toFixed(1);
export const pct = p => (p > 0 && p < 0.005 ? '<1' : Math.round(p * 100)) + '%';
export const d6 = () => 1 + Math.floor(Math.random() * 6);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const frac = v => v - Math.floor(v);
// How much the UI is scaled up: the root font size (it grows on large screens, see css/style.css) over the 16px it is designed at.
export const uiScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;

// Seeded random numbers, so terrain art looks the same on every redraw.
export function mulberry(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Rounded-rectangle path.
export function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
