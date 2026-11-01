// Column handles: drag the edge of the reference column (log and rules tabs) or of the commander's panel to resize it.
// Widths are kept in rem, so they grow with the root font on large screens, and remembered in the browser.
// Double-click a handle to reset its column; with a handle focused, the arrow keys resize by 1rem.
import { $ } from '../util.js';

// The left column was the dice log above the mission card; since the mission became a strip above the board it holds
// the reference tabs only. Its saved width is carried over from the old key once.
const COLS_KEY = 'captains-school-columns-2', OLD_KEY = 'captains-school-columns';
const COL_LIMITS = { left: [13, 32], right: [20, 40] };   // rem
// rem the board column always keeps.
const minMiddle = () => 20;
const colWidths = {};
try { Object.assign(colWidths, JSON.parse(localStorage.getItem(COLS_KEY) || localStorage.getItem(OLD_KEY) || '{}')); localStorage.removeItem(OLD_KEY); } catch (e) { /* no browser storage */ }
const saveCols = () => { try { localStorage.setItem(COLS_KEY, JSON.stringify(colWidths)); } catch (e) { /* ignore */ } };

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

// The three columns as laid out right now, in rem; null when the layout is a single column (phones).
function colsNow() {
  const cs = getComputedStyle($('.main')), r = remPx();
  const cols = cs.gridTemplateColumns.split(' ').map(v => parseFloat(v) / r);
  // Two columns (medium screens: board and panel, the tabs below the board): the left one has no width of its own.
  if (cols.length === 2) return { cols: [0, ...cols], gap: parseFloat(cs.columnGap) / r };
  return cols.length === 3 ? { cols, gap: parseFloat(cs.columnGap) / r } : null;
}

// Keeps a width inside its limits and leaves the middle column at least minMiddle() wide.
function clampCol(k, rem) {
  const now = colsNow(); if (!now) return rem;
  const total = $('.main').clientWidth / remPx(), other = k === 'left' ? now.cols[2] : now.cols[0];
  const [lo, hi] = COL_LIMITS[k];
  return Math.max(lo, Math.min(hi, total - other - 2 * now.gap - minMiddle(), rem));
}

function applyCols() {
  const main = $('.main');
  for (const k of ['left', 'right']) {
    if (colWidths[k]) main.style.setProperty(`--col-${k}`, clampCol(k, colWidths[k]).toFixed(3) + 'rem');
    else main.style.removeProperty(`--col-${k}`);
  }
  const now = colsNow();
  if (now) { $('#splitL').setAttribute('aria-valuenow', Math.round(now.cols[0])); $('#splitR').setAttribute('aria-valuenow', Math.round(now.cols[2])); }
}

function setCol(k, rem) { colWidths[k] = +clampCol(k, rem).toFixed(3); applyCols(); }
function resetCol(k) { delete colWidths[k]; applyCols(); saveCols(); }

// sign: +1 when moving the handle right widens the column (left column), -1 when it narrows it (right panel).
function initHandle(el, k, sign) {
  const [lo, hi] = COL_LIMITS[k];
  el.setAttribute('aria-valuemin', lo); el.setAttribute('aria-valuemax', hi);
  el.addEventListener('pointerdown', e => {
    const now = colsNow();
    if (e.button !== 0 || !now) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag'); document.body.classList.add('col-drag');
    const x0 = e.clientX, w0 = k === 'left' ? now.cols[0] : now.cols[2];
    const move = ev => setCol(k, w0 + sign * (ev.clientX - x0) / remPx());
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('drag'); document.body.classList.remove('col-drag');
      saveCols();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => resetCol(k));
  el.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const now = colsNow();
    if (!step || !now) return;
    e.preventDefault();
    setCol(k, (k === 'left' ? now.cols[0] : now.cols[2]) + sign * step);
    saveCols();
  });
}

export function initColumns() {
  initHandle($('#splitL'), 'left', 1);
  initHandle($('#splitR'), 'right', -1);
  applyCols();
  // A saved width that no longer fits a smaller window is narrowed for now, and comes back when the window grows.
  new ResizeObserver(applyCols).observe($('.main'));
}
