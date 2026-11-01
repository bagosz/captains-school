// The battlefield: a felt mat measured in inches, terrain, tokens, overlays and effects.
// Positions are in inches; S converts inches to CSS pixels.
import { G, prefs } from '../state.js';
import { active, VINE_R } from '../engine/magic.js';
import { ARC } from '../engine/siege.js';
import { $, TAU, RM, fmt, fmtUp, fmtDown, pct, mulberry, rr, uiScale } from '../util.js';
import { gap, ptIn, pieceCentre, edgesOf } from '../engine/geometry.js';
import { alive, engaged, canMove, remaining, shooterReason, zoneCutters, zoneBlocked, touching, defends, inBrush, moveVal, woundNeed, needStr, losBlocked } from '../engine/rules.js';
import { HEROIC, SHOUT_RANGE, strikeS } from '../engine/heroes.js';
import { centreOf, combatOdds, duelDice, goodsOf, evilsOf, strikeChance, trappedIfLose, supOf, unpaired, BANNER_RANGE, bestPart, woundBonus } from '../engine/combat.js';
import { drawToken, drawGhost, trackHeading, clearTokenCache, drawStatus, statusSpots, drawMWF, mwfHeight } from './tokens.js';
import { tokensOf } from './status.js';
import { tool, zonesShown, tapeLength, lookLines } from './overlays.js';
import { inPlay } from '../data/missions.js';
import { standFastRange } from '../engine/named.js';
import { ruleShort } from '../data/rules-text.js';
import { stores, burning } from '../engine/narrative.js';

const cv = $('#board'), ctx = cv.getContext('2d');
let S = 20, DPR = 1, bg = null;
// Z scales text and lines drawn on the board: it follows the board's size (S) but stays between 1x and 1.4x the UI scale.
let Z = 1;
const MONO = '"IBM Plex Mono", Consolas, monospace', SANS = '"Alegreya Sans", "Segoe UI", sans-serif';
const fpx = (n, fam = MONO) => `600 ${Math.round(n * Z)}px ${fam}`;
export const boardCanvas = cv;

const COL = {
  accent: '#f2c45c', ok: '#a8e6a3', bad: '#ff917c',
  cz: 'rgba(230,92,66,0.12)', czLine: 'rgba(244,128,104,0.75)', threat: '#ffb3a3',
};

// CSS pixels per inch of table, zoom included.
export const pxPerInch = () => S;
export function toBoard(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left + camX) / S, y: (e.clientY - r.top + camY) / S }; }
// The other way: a point of the table (inches) in CSS pixels, for HTML laid over the board (a tag with a link, a card).
// client: in the window (as toBoard takes); wrap: inside #boardwrap, for an overlay placed absolutely in it. s: CSS pixels
// per inch now. It follows zoom, the moved view and the window size; the 'boardview' event on #board fires whenever one
// of them changes, so an overlay can re-place itself then instead of every frame.
export function toScreen(x, y) {
  const r = cv.getBoundingClientRect(), px = x * S - camX, py = y * S - camY;
  return { x: r.left + px, y: r.top + py, wx: cv.offsetLeft + px, wy: cv.offsetTop + py, s: S };
}
let lastView = '';
function viewChanged() {
  const k = `${S}|${camX}|${camY}|${VW}|${VH}|${cv.offsetLeft}|${cv.offsetTop}`;
  if (k !== lastView) { lastView = k; cv.dispatchEvent(new CustomEvent('boardview')); }
}

/* ---------- Size, zoom and background ---------- */
// The table is drawn through a camera. At zoom 1 the canvas shows the whole table, fitted to its column; zoomed in,
// the canvas fills the column and shows part of the table: (camX, camY) is the top left of the view, in CSS pixels of
// the zoomed table. S0 is the scale at zoom 1; VW, VH the canvas size in CSS pixels.
let S0 = 20, zoom = 1, camX = 0, camY = 0, VW = 0, VH = 0, viewOf = null, bgTimer = 0, viewTimer = 0;
const MAX_ZOOM = 8;
const maxZoom = () => (G ? MAX_ZOOM : 1);
// The background of the whole table (bg) is one canvas, kept under BG_MAX device pixels a side: zoomed in further, it is
// drawn at a lower scale and stretched, and the part in view (with a margin) is drawn again sharp on bgView.
const BG_MAX = 4096;
const bgCap = () => BG_MAX / (Math.max(G.W, G.H) * DPR);   // the largest scale (pixels per inch) bg can have
let bgView = null;
const clampCam = () => {
  camX = Math.max(0, Math.min(camX, G.W * S - VW));
  camY = Math.max(0, Math.min(camY, G.H * S - VH));
};
export function fit() {
  if (!G) return;
  if (viewOf !== G) { viewOf = G; zoom = 1; camX = 0; camY = 0; }   // a new game starts with the whole table in view
  const wrap = $('#boardwrap'), narrow = matchMedia('(max-width: 900px)').matches;
  const aw = wrap.clientWidth, ah = narrow ? Infinity : wrap.clientHeight;
  if (!aw) return;
  DPR = window.devicePixelRatio || 1;
  S0 = Math.max(8, Math.min(aw / G.W, ah / G.H));
  zoom = Math.min(zoom, maxZoom());
  applyZoom(aw, narrow ? Math.max(G.H * S0, innerHeight * 0.7) : ah);
  clearTokenCache();
  buildBg();
  // Resizing the canvas wipes it: draw at once, so the table never shows blank for a frame.
  try { draw(performance.now()); } catch (e) { /* drawn on the next frame */ }
}
// Sizes the canvas for the current zoom (aw, ah: the room in the column) and keeps the view on the table. quiet: the
// caller moves the camera next and announces the new view itself (zoomAt), so overlays are not placed twice.
function applyZoom(aw, ah, quiet = false) {
  S = S0 * zoom;
  const U = uiScale();
  Z = Math.max(U, Math.min(S / 45, 1.4 * U));
  const w = Math.floor(Math.min(G.W * S, aw)), h = Math.floor(Math.min(G.H * S, ah));
  if (w !== VW || h !== VH || cv.width !== Math.round(w * DPR)) {
    VW = w; VH = h;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  }
  clampCam();
  cv.classList.toggle('zoomed', zoom > 1.001);
  const zin = $('#zoomIn');
  if (zin) { zin.disabled = zoom >= maxZoom() - 1e-3; $('#zoomOut').disabled = $('#zoomFit').disabled = zoom <= 1.001; }
  if (!quiet) viewChanged();
}
export function rebuildBackground() { if (G) { clearTokenCache(); buildBg(); } }

// Zoom by factor f around a point on the screen (the pointer; the middle of the view when cx is null): the spot of
// the table under it stays where it is. The background is redrawn sharp a moment after the last step.
export function zoomAt(f, cx, cy) {
  if (!G) return;
  const z = Math.max(1, Math.min(maxZoom(), zoom * f));
  if (Math.abs(z - zoom) < 1e-3) return;
  const r0 = cv.getBoundingClientRect(), px = cx == null ? VW / 2 : cx - r0.left, py = cy == null ? VH / 2 : cy - r0.top;
  const bx = (px + camX) / S, by = (py + camY) / S;
  const wrap = $('#boardwrap'), narrow = matchMedia('(max-width: 900px)').matches;
  zoom = z;
  applyZoom(wrap.clientWidth, narrow ? Math.max(G.H * S0, innerHeight * 0.7) : wrap.clientHeight, true);
  const r1 = cv.getBoundingClientRect();
  camX = bx * S - (cx == null ? VW / 2 : cx - r1.left); camY = by * S - (cy == null ? VH / 2 : cy - r1.top);
  clampCam();
  viewChanged();
  clearTimeout(bgTimer);
  bgTimer = setTimeout(() => { if (G) buildBg(); }, 160);   // the token images stay: they are kept per size
}
export function panBy(dx, dy) {
  if (!G) return;
  camX += dx; camY += dy; clampCam(); viewChanged();
  // Moved past the sharp part of the background: draw the new view sharp once the view stops moving.
  if (S > bgCap() + 1e-6 && !viewCovered()) { clearTimeout(viewTimer); viewTimer = setTimeout(() => { if (G) buildView(); }, 90); }
}
const viewCovered = () => bgView && bgView.s === S && camX >= bgView.ox - 1 && camY >= bgView.oy - 1
  && camX + VW <= bgView.ox + bgView.ow + 1 && camY + VH <= bgView.oy + bgView.oh + 1;
export function resetZoom() { if (G && zoom !== 1) { zoom = 1; fit(); } }
export const zoomInfo = () => ({ zoom, max: maxZoom() });

function buildBg() {
  const s = Math.min(S, bgCap());
  bg = paintBg(s, 0, 0, G.W * s, G.H * s);
  bgView = null;
  if (s < S - 1e-6) buildView();
}
// The sharp background of the view and half a view around it (less if that would pass BG_MAX), at the full scale.
function buildView() {
  clearTimeout(viewTimer);
  const lim = BG_MAX / DPR, mx = Math.max(0, Math.min(VW / 2, (lim - VW) / 2)), my = Math.max(0, Math.min(VH / 2, (lim - VH) / 2));
  const x0 = Math.max(0, camX - mx), y0 = Math.max(0, camY - my), x1 = Math.min(G.W * S, camX + VW + mx), y1 = Math.min(G.H * S, camY + VH + my);
  bgView = Object.assign(paintBg(S, x0, y0, x1 - x0, y1 - y0), { s: S, ox: x0, oy: y0, ow: x1 - x0, oh: y1 - y0 });
}
// Paints the mat and terrain at scale s (pixels per inch), the part from (ox, oy) of size w x h in pixels at that scale.
function paintBg(s, ox, oy, w, h) {
  const keep = S;
  S = s;   // the terrain painters below draw at S
  try {
    const W = G.W * S, H = G.H * S, cvs = document.createElement('canvas');
    cvs.width = Math.max(1, Math.round(w * DPR)); cvs.height = Math.max(1, Math.round(h * DPR));
    const b = cvs.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, -ox * DPR, -oy * DPR);
    paintMat(b, W, H, ox, oy, w, h);
    return cvs;
  } finally { S = keep; }
}
function paintMat(b, W, H, ox, oy, w, h) {
  const gr = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, '#5e7250'); gr.addColorStop(1, '#43543a');
  b.fillStyle = gr; b.fillRect(0, 0, W, H);
  const rnd = mulberry(7);
  for (let i = 0; i < Math.min(w * h / 16, 250000); i++) { b.fillStyle = rnd() < 0.5 ? 'rgba(255,255,235,0.035)' : 'rgba(0,0,0,0.055)'; b.fillRect(ox + rnd() * w, oy + rnd() * h, 1.3, 1.3); }
  const x0 = ox / S, y0 = oy / S, x1 = (ox + w) / S, y1 = (oy + h) / S;
  patches(b, x0, y0, x1, y1);
  tufts(b, x0, y0, x1, y1, 2, false);
  b.strokeStyle = 'rgba(255,255,235,0.07)'; b.lineWidth = 1;
  for (let x = 6; x < G.W; x += 6) { b.beginPath(); b.moveTo(x * S + 0.5, 0); b.lineTo(x * S + 0.5, H); b.stroke(); }
  for (let y = 6; y < G.H; y += 6) { b.beginPath(); b.moveTo(0, y * S + 0.5); b.lineTo(W, y * S + 0.5); b.stroke(); }
  const plats = G.terrain.filter(T => T.k === 'plateau').sort((a, c) => a.z - c.z);
  for (const T of plats) turned(b, T, () => drawPlateau(b, T, plats));
  const bands = new Set();   // a curving river's pieces (geometry.js: riverPieces) are drawn once, as one strip
  for (const T of G.terrain) { if (T.band) { if (!bands.has(T.band)) { bands.add(T.band); drawBand(b, T.band, T); } continue; } turned(b, T, () => { if (T.k === 'zone') drawZone(b, T); else if (T.k === 'water') drawWater(b, T); }); }
  for (const T of G.terrain) turned(b, T, () => { if (T.k === 'brush') drawBrush(b, T); else if (T.k === 'rock') drawRock(b, T); else if (T.k === 'wall') drawWall(b, T); else if (T.k === 'hedge') drawHedge(b, T); else if (T.k === 'ladder') drawLadder(b, T); else if (T.k === 'building') drawBuilding(b, T); else if (T.k === 'door') drawDoor(b, T); });
  for (const T of plats) drawCliffs(b, T, plats);
}
// A turned piece (T.a degrees about its centre) is drawn as if it were not turned, on a canvas turned about that centre.
// Canvas shadows ignore the turn, so every piece casts its shadow the same way.
function turned(b, T, draw) {
  if (!T.a) return draw();
  const c = pieceCentre(T);
  b.save(); b.translate(c.x * S, c.y * S); b.rotate(T.a * Math.PI / 180); b.translate(-c.x * S, -c.y * S);
  try { draw(); } finally { b.restore(); }
}
// Raised ground: lighter turf, darker the lower it is (a narrow strip is a plank bridge).
function drawPlateau(b, T, plats) {
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S, k = Math.min(1, T.z / 2);
  if (T.bridge) {
    b.fillStyle = '#6b4b2c'; b.fillRect(x, y, w, h);
    b.strokeStyle = 'rgba(30,18,8,0.7)'; b.lineWidth = 1;
    for (let px = x + S * 0.3; px < x + w; px += S * 0.3) { b.beginPath(); b.moveTo(px, y); b.lineTo(px, y + h); b.stroke(); }
    b.strokeStyle = '#2b1a0c'; b.lineWidth = 2; b.strokeRect(x + 1, y + 1, w - 2, h - 2);
    return;
  }
  const g = b.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, `rgba(${Math.round(118 + 40 * k)},${Math.round(128 + 30 * k)},${Math.round(92 + 10 * k)},1)`);
  g.addColorStop(1, `rgba(${Math.round(96 + 30 * k)},${Math.round(108 + 24 * k)},${Math.round(76 + 8 * k)},1)`);
  b.fillStyle = g; b.fillRect(x, y, w, h);
  const rnd = mulberry(Math.round(T.x * 41 + T.y * 7 + T.z * 100));
  for (let i = 0; i < T.w * T.h * 2; i++) { b.fillStyle = rnd() < 0.5 ? 'rgba(255,250,220,0.06)' : 'rgba(0,0,0,0.06)'; b.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); }
  b.save(); b.beginPath(); b.rect(x, y, w, h); b.clip(); tufts(b, T.x, T.y, T.x + T.w, T.y + T.h, 3, true); b.restore();
}
// The edges of raised ground that drop to lower ground: a dark rock face with hatching (deeper drops look heavier).
function drawCliffs(b, T, plats) {
  if (T.bridge) return;
  const lowerAt = (px, py) => { let z = 0; for (const o of plats) if (o.z > z && ptIn(px, py, o)) z = o.z; return z; };
  const edges = T.a ? edgesOf(T).map(e => [e.x1, e.y1, e.x2, e.y2, e.nx, e.ny])   // a turned piece: its own sides, normals pointing out
    : [[T.x, T.y, T.x + T.w, T.y, 0, -1], [T.x, T.y + T.h, T.x + T.w, T.y + T.h, 0, 1], [T.x, T.y, T.x, T.y + T.h, -1, 0], [T.x + T.w, T.y, T.x + T.w, T.y + T.h, 1, 0]];
  for (const [x1, y1, x2, y2, nx, ny] of edges) {
    const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(L / 0.25));
    for (let i = 0; i < n; i++) {
      const ax = x1 + (x2 - x1) * i / n, ay = y1 + (y2 - y1) * i / n, bx = x1 + (x2 - x1) * (i + 1) / n, by = y1 + (y2 - y1) * (i + 1) / n;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, drop = T.z - lowerAt(mx + nx * 0.05, my + ny * 0.05);
      if (drop <= 0.05) continue;
      const t = Math.min(1, drop / 2), d = (0.12 + 0.18 * t) * S;
      // The shadow the cliff casts on the lower ground (a gully between two cliffs gets it from both sides).
      const sh = Math.min(1.1, 0.5 * drop) * S, g = b.createLinearGradient(mx * S, my * S, mx * S + nx * sh, my * S + ny * sh);
      g.addColorStop(0, `rgba(10,14,8,${0.25 + 0.25 * t})`); g.addColorStop(1, 'rgba(10,14,8,0)');
      b.fillStyle = g;
      b.beginPath(); b.moveTo(ax * S, ay * S); b.lineTo(bx * S, by * S); b.lineTo(bx * S + nx * sh, by * S + ny * sh); b.lineTo(ax * S + nx * sh, ay * S + ny * sh); b.closePath(); b.fill();
      b.fillStyle = `rgba(40,34,26,${0.55 + 0.35 * t})`;
      b.beginPath(); b.moveTo(ax * S, ay * S); b.lineTo(bx * S, by * S); b.lineTo(bx * S + nx * d, by * S + ny * d); b.lineTo(ax * S + nx * d, ay * S + ny * d); b.closePath(); b.fill();
      b.strokeStyle = 'rgba(220,210,180,0.35)'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(ax * S, ay * S); b.lineTo(ax * S + nx * d + ny * d * 0.4, ay * S + ny * d + nx * d * 0.4); b.stroke();
    }
  }
}
// A hedge: a dense green strip with leafy clumps, taller-looking than a wall.
function drawHedge(b, T) {
  const rnd = mulberry(Math.round(T.x * 61 + T.y * 17 + T.w * 5 + T.h));
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S, rad = Math.min(w, h) * 0.4;
  b.save(); b.shadowColor = 'rgba(0,0,0,0.5)'; b.shadowBlur = 7; b.shadowOffsetY = 3;
  b.fillStyle = '#1d3a19'; rr(b, x, y, w, h, rad); b.fill(); b.restore();
  b.save(); rr(b, x, y, w, h, rad); b.clip();
  // Clumps of leaves, each lit from the top left and outlined, the lower ones first.
  const shades = ['#2f6127', '#3c7531', '#285521', '#4a8a3a', '#356b2c'], clumps = [];
  for (let i = 0; i < T.w * T.h * 7; i++) clumps.push([T.x + rnd() * T.w, T.y + rnd() * T.h, 0.12 + rnd() * 0.14, shades[Math.floor(rnd() * shades.length)]]);
  clumps.sort((a, c) => a[1] - c[1]);
  for (const [cx, cy, r, col] of clumps) lump(b, cx, cy, r, rnd, col, 8, 0.35);
  // Single leaves catching the light, and a few berries.
  for (let i = 0; i < T.w * T.h * 14; i++) {
    const lx = (T.x + rnd() * T.w) * S, ly = (T.y + rnd() * T.h) * S;
    b.fillStyle = rnd() < 0.5 ? 'rgba(170,215,120,0.45)' : 'rgba(10,30,8,0.35)';
    b.beginPath(); b.ellipse(lx, ly, S * 0.035, S * 0.018, rnd() * 3, 0, TAU); b.fill();
  }
  for (let i = 0; i < T.w * T.h * 0.8; i++) { b.fillStyle = '#a8322a'; b.beginPath(); b.arc((T.x + rnd() * T.w) * S, (T.y + rnd() * T.h) * S, Math.max(0.8, S * 0.025), 0, TAU); b.fill(); }
  b.restore();
  b.strokeStyle = INK; b.lineWidth = inkW(); rr(b, x, y, w, h, rad); b.stroke();
}
// Inch marks along the top and left of the view (they stay in sight when the view is zoomed in and moved).
function drawRulers() {
  const x0 = Math.max(1, Math.ceil(camX / S)), x1 = Math.min(G.W - 1, Math.floor((camX + VW) / S));
  const y0 = Math.max(1, Math.ceil(camY / S)), y1 = Math.min(G.H - 1, Math.floor((camY + VH) / S));
  ctx.fillStyle = 'rgba(246,239,216,0.6)';
  for (let i = x0; i <= x1; i++) { const L = (i % 6 === 0 ? 10 : i % 3 === 0 ? 6 : 3) * Z; ctx.fillRect(i * S - 0.5, camY, 1, L); }
  for (let j = y0; j <= y1; j++) { const L = (j % 6 === 0 ? 10 : j % 3 === 0 ? 6 : 3) * Z; ctx.fillRect(camX, j * S - 0.5, L, 1); }
  ctx.font = fpx(11); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  for (let i = Math.ceil(x0 / 6) * 6; i <= x1; i += 6) ctx.fillText(i + '″', i * S + 3 * Z, camY + 2 * Z);
  for (let j = Math.ceil(y0 / 6) * 6; j <= y1; j += 6) ctx.fillText(j + '″', camX + 3 * Z, j * S + 3 * Z);
}
function drawZone(b, T) {
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S;
  b.fillStyle = 'rgba(242,196,92,0.13)'; b.fillRect(x, y, w, h);
  b.setLineDash([8, 6]); b.strokeStyle = 'rgba(242,196,92,0.85)'; b.lineWidth = 1.5; b.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5); b.setLineDash([]);
  b.save(); b.translate(x + w / 2, y + h / 2); b.rotate(-Math.PI / 2);
  b.fillStyle = 'rgba(250,218,140,0.95)';
  b.font = `700 ${Math.round(Math.max(12, Math.min(w * 0.42, 22)))}px "Alegreya SC", Georgia, serif`;
  b.textAlign = 'center'; b.textBaseline = 'middle';
  b.fillText(T.label.split('').join(' '), 0, 0);
  b.restore();
}
// Water is drawn as a stream running along its longer side: a piece taller than it is wide is drawn lying down on a
// canvas turned a quarter about its centre. Banks run along both long sides, and across an end too where the water
// stops short of the board edge (a pool or a stream's end); the ends that reach the edge stay open.
function drawWater(b, T) {
  const open = T.w >= T.h ? [T.x <= 0.01, T.x + T.w >= G.W - 0.01] : [T.y <= 0.01, T.y + T.h >= G.H - 0.01];
  if (T.w >= T.h) return drawStream(b, T, open);
  const cx = (T.x + T.w / 2) * S, cy = (T.y + T.h / 2) * S;
  b.save(); b.translate(cx, cy); b.rotate(Math.PI / 2); b.translate(-cx, -cy);
  try { drawStream(b, { x: T.x + T.w / 2 - T.h / 2, y: T.y + T.h / 2 - T.w / 2, w: T.h, h: T.w }, open); } finally { b.restore(); }
}
// A stream lying left to right. open: [left end, right end] at the board edge, so without a bank.
function drawStream(b, T, open) {
  const rnd = mulberry(Math.round(T.x * 31 + T.y * 57 + T.w + T.h * 13));
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S, bank = S * 0.2;
  const stones = ['#9a9284', '#857d70', '#b0a898'];
  // Muddy banks with pebbles and reeds, along both sides and across a closed end.
  b.fillStyle = '#6e5d3e'; b.fillRect(x, y - bank, w, bank); b.fillRect(x, y + h, w, bank);
  if (!open[0]) b.fillRect(x - bank, y - bank, bank, h + 2 * bank);
  if (!open[1]) b.fillRect(x + w, y - bank, bank, h + 2 * bank);
  b.strokeStyle = '#3d5a2a'; b.lineWidth = Math.max(0.8, S * 0.025); b.lineCap = 'round';
  const reeds = (rx, ry, dx, dy) => { for (let k = -2; k <= 2; k++) { b.beginPath(); b.moveTo(rx * S, ry * S); b.lineTo((rx + dx * (0.18 + rnd() * 0.08) + dy * k * 0.05) * S, (ry + dy * (0.18 + rnd() * 0.08) + dx * k * 0.05) * S); b.stroke(); } };
  for (const [by, dir] of [[T.y - 0.1, -1], [T.y + T.h + 0.1, 1]]) {
    for (let px = T.x; px < T.x + T.w; px += 0.18) if (rnd() < 0.5) lump(b, px + rnd() * 0.1, by + (rnd() - 0.5) * 0.08, 0.05 + rnd() * 0.04, rnd, stones[Math.floor(rnd() * 3)], 6, 0.3);
    for (let px = T.x; px < T.x + T.w; px += 0.6 + rnd() * 0.8) reeds(px + rnd() * 0.3, by - dir * 0.12, 0, dir);   // reeds leaning out of the water
  }
  for (const [end, bx, dir] of [[0, T.x - 0.1, -1], [1, T.x + T.w + 0.1, 1]]) {
    if (open[end]) continue;
    for (let py = T.y; py < T.y + T.h; py += 0.18) if (rnd() < 0.5) lump(b, bx + (rnd() - 0.5) * 0.08, py + rnd() * 0.1, 0.05 + rnd() * 0.04, rnd, stones[Math.floor(rnd() * 3)], 6, 0.3);
    for (let py = T.y + 0.2; py < T.y + T.h - 0.2; py += 0.7 + rnd() * 0.8) reeds(bx - dir * 0.12, py, dir, 0);
  }
  // Deeper in the middle, shallow and lighter towards the banks.
  const g = b.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#5f97a3'); g.addColorStop(0.18, '#3f7688'); g.addColorStop(0.5, '#2e5d70'); g.addColorStop(0.82, '#3f7688'); g.addColorStop(1, '#5f97a3');
  b.fillStyle = g; b.fillRect(x, y, w, h);
  if (!open[0] || !open[1]) {   // a closed end shallows too
    for (const [end, x0, x1] of [[0, x, x + Math.min(w, h) * 0.3], [1, x + w, x + w - Math.min(w, h) * 0.3]]) {
      if (open[end]) continue;
      const e = b.createLinearGradient(x0, 0, x1, 0); e.addColorStop(0, 'rgba(95,151,163,0.9)'); e.addColorStop(1, 'rgba(95,151,163,0)');
      b.fillStyle = e; b.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0), h);
    }
  }
  // The current: long, gently waving streaks running with the stream, and glints of light.
  b.lineCap = 'round';
  for (let i = 0; i < T.w * T.h * 1.1; i++) {
    const sx = T.x + rnd() * T.w, sy = T.y + 0.15 + rnd() * (T.h - 0.3), len = 0.5 + rnd() * 1.2, amp = 0.03 + rnd() * 0.03, ph = rnd() * TAU;
    b.strokeStyle = `rgba(220,240,245,${0.15 + rnd() * 0.25})`; b.lineWidth = Math.max(0.6, S * (0.015 + rnd() * 0.02));
    b.beginPath();
    for (let k = 0; k <= 12; k++) { const t = k / 12, px = sx + t * len, py = sy + Math.sin(ph + t * 5) * amp; if (px > T.x + T.w) break; k ? b.lineTo(px * S, py * S) : b.moveTo(px * S, py * S); }
    b.stroke();
  }
  for (let i = 0; i < T.w * T.h * 3; i++) { b.fillStyle = 'rgba(255,255,255,0.5)'; b.beginPath(); b.arc((T.x + rnd() * T.w) * S, (T.y + rnd() * T.h) * S, Math.max(0.6, S * 0.018), 0, TAU); b.fill(); }
  // The water's edge, inked like the tokens.
  b.strokeStyle = INK; b.lineWidth = inkW();
  b.beginPath(); b.moveTo(x, y); b.lineTo(x + w, y); b.moveTo(x, y + h); b.lineTo(x + w, y + h);
  if (!open[0]) { b.moveTo(x, y); b.lineTo(x, y + h); }
  if (!open[1]) { b.moveTo(x + w, y); b.lineTo(x + w, y + h); }
  b.stroke();
}
// A curving river drawn as one smooth strip along its centreline: muddy banks with pebbles and reeds, water deep in the
// middle and shallow at the sides, the current running with the bends, inked edges. T: one of its pieces (for the seed).
function drawBand(b, band, T) {
  const rnd = mulberry(Math.round(band.pts[0][0] * 31 + band.pts[0][1] * 57 + band.w * 13));
  const w = band.w, P = band.pts, line = [];
  // A Catmull-Rom curve through the points, sampled about every 0.2", with arc length, direction and normal.
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.2));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      line.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  let len = 0;
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], c = line[Math.min(line.length - 1, i + 1)], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (i) len += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y);
    Object.assign(p, { s: len, ux: dx / d, uy: dy / d, nx: -dy / d, ny: dx / d });
  });
  const at = s => { let i = 1; while (i < line.length - 1 && line[i].s < s) i++; const a = line[i - 1], c = line[i], t = Math.min(1, Math.max(0, (s - a.s) / ((c.s - a.s) || 1))); return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, nx: a.nx, ny: a.ny }; };
  const stroke = (width, col) => { b.beginPath(); line.forEach((p, i) => i ? b.lineTo(p.x * S, p.y * S) : b.moveTo(p.x * S, p.y * S)); b.lineWidth = width * S; b.strokeStyle = col; b.lineCap = 'butt'; b.lineJoin = 'round'; b.stroke(); };
  const side = (off) => { b.beginPath(); line.forEach((p, i) => { const x = (p.x + p.nx * off) * S, y = (p.y + p.ny * off) * S; i ? b.lineTo(x, y) : b.moveTo(x, y); }); };
  // Banks, then the water in bands from the shallow edge to the deep middle (softened by a little blur).
  stroke(w + 0.4, '#6e5d3e');
  const stones = ['#9a9284', '#857d70', '#b0a898'];
  for (let s = 0; s < len; s += 0.18) for (const k of [-1, 1]) if (rnd() < 0.5) { const p = at(s + rnd() * 0.1), o = k * (w / 2 + 0.1 + (rnd() - 0.5) * 0.06); lump(b, p.x + p.nx * o, p.y + p.ny * o, 0.05 + rnd() * 0.04, rnd, stones[Math.floor(rnd() * 3)], 6, 0.3); }
  b.strokeStyle = '#3d5a2a'; b.lineWidth = Math.max(0.8, S * 0.025); b.lineCap = 'round';
  for (let s = 0.3; s < len; s += 0.6 + rnd() * 0.8) for (const k of [-1, 1]) {   // reeds leaning out of the water
    const p = at(s + rnd() * 0.3), o = k * (w / 2 - 0.05), rx = p.x + p.nx * o, ry = p.y + p.ny * o;
    for (let j = -2; j <= 2; j++) { const l = 0.18 + rnd() * 0.08; b.beginPath(); b.moveTo(rx * S, ry * S); b.lineTo((rx + k * p.nx * l - p.ny * j * 0.05) * S, (ry + k * p.ny * l + p.nx * j * 0.05) * S); b.stroke(); }
  }
  b.save(); b.filter = `blur(${Math.max(0.5, S * 0.08)}px)`;
  stroke(w, '#5f97a3'); stroke(w * 0.78, '#4a8597'); stroke(w * 0.55, '#3a6f82'); stroke(w * 0.3, '#2e5d70');
  b.restore();
  // The current: streaks that follow the bends, and glints of light.
  b.lineCap = 'round';
  for (let i = 0; i < len * w * 1.1; i++) {
    const s0 = rnd() * len, l = 0.5 + rnd() * 1.2, off = (rnd() - 0.5) * (w - 0.3), amp = 0.03 + rnd() * 0.03, ph = rnd() * TAU;
    b.strokeStyle = `rgba(220,240,245,${0.15 + rnd() * 0.25})`; b.lineWidth = Math.max(0.6, S * (0.015 + rnd() * 0.02));
    b.beginPath();
    for (let k = 0; k <= 12; k++) { const t = k / 12, s = s0 + t * l; if (s > len) break; const p = at(s), o = off + Math.sin(ph + t * 5) * amp; k ? b.lineTo((p.x + p.nx * o) * S, (p.y + p.ny * o) * S) : b.moveTo((p.x + p.nx * o) * S, (p.y + p.ny * o) * S); }
    b.stroke();
  }
  for (let i = 0; i < len * w * 3; i++) { const p = at(rnd() * len), o = (rnd() - 0.5) * w; b.fillStyle = 'rgba(255,255,255,0.5)'; b.beginPath(); b.arc((p.x + p.nx * o) * S, (p.y + p.ny * o) * S, Math.max(0.6, S * 0.018), 0, TAU); b.fill(); }
  // Inked edges along both banks.
  b.strokeStyle = INK; b.lineWidth = inkW(); b.lineJoin = 'round';
  side(w / 2); b.stroke(); side(-w / 2); b.stroke();
}
function drawBrush(b, T) {
  const rnd = mulberry(Math.round(T.x * 97 + T.y * 31 + T.w * 7 + T.h));
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S;
  // Woodland: shaded bushes with outlines; rocky scree (T.rocky): loose shaded stones.
  b.fillStyle = T.rocky ? 'rgba(52,46,38,0.55)' : 'rgba(24,42,22,0.55)'; rr(b, x, y, w, h, Math.min(8, S * 0.4)); b.fill();
  const shades = T.rocky ? ['#7d7466', '#8a8172', '#6b6459', '#9a9080', '#5f594f'] : ['#2b4727', '#3a5c33', '#4a723f', '#335230', '#55803f'];
  const items = [];
  for (let i = 0; i < T.w * T.h * (T.rocky ? 6 : 3.2); i++) {
    const r = T.rocky ? 0.07 + rnd() * 0.14 : 0.16 + rnd() * 0.26;
    items.push([T.x + r + rnd() * (T.w - 2 * r), T.y + r + rnd() * (T.h - 2 * r), r, shades[Math.floor(rnd() * shades.length)]]);
  }
  items.sort((a, c) => a[1] - c[1]);
  b.save(); b.shadowColor = 'rgba(0,0,0,0.35)'; b.shadowBlur = 3; b.shadowOffsetY = 1.5;
  for (const [cx, cy, r, col] of items) lump(b, cx, cy, r, rnd, col, T.rocky ? 6 : 9, T.rocky ? 0.4 : 0.3);
  b.restore();
  if (!T.rocky) for (let i = 0; i < T.w * T.h * 5; i++) { b.fillStyle = 'rgba(160,200,110,0.35)'; b.beginPath(); b.ellipse((T.x + rnd() * T.w) * S, (T.y + rnd() * T.h) * S, S * 0.04, S * 0.02, rnd() * 3, 0, TAU); b.fill(); }
  b.setLineDash([3, 4]); b.strokeStyle = 'rgba(196,230,160,0.5)'; b.lineWidth = 1; b.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); b.setLineDash([]);
}
// A low dry-stone wall: stones in staggered courses along its length.
// A building wall (impassable, blocks sight) and a doorway in it (a wooden threshold).
function drawBuilding(b, T) {
  if (T.house) { drawHouse(b, T); return; }
  b.save(); b.shadowColor = 'rgba(0,0,0,0.45)'; b.shadowBlur = 6; b.shadowOffsetY = 2;
  b.fillStyle = '#5b5348'; b.fillRect(T.x * S, T.y * S, T.w * S, T.h * S); b.restore();
  b.strokeStyle = INK; b.lineWidth = inkW(); b.strokeRect(T.x * S, T.y * S, T.w * S, T.h * S);
}
// A Rohan House seen from above: a thatched roof with its ridge along the long side, straw strokes down both slopes,
// timber gable ends. A Storehouse (store) is drawn the same; its fire is drawn live (drawFires).
function drawHouse(b, T) {
  const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S, horiz = T.w >= T.h;
  b.save(); b.shadowColor = 'rgba(0,0,0,0.5)'; b.shadowBlur = 8; b.shadowOffsetY = 3;
  b.fillStyle = '#b8954f'; b.fillRect(x, y, w, h); b.restore();
  const g = horiz ? b.createLinearGradient(0, y, 0, y + h) : b.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#d9b76a'); g.addColorStop(0.48, '#c49a4f'); g.addColorStop(0.52, '#8f6d34'); g.addColorStop(1, '#a9843f');
  b.fillStyle = g; b.fillRect(x, y, w, h);
  const rnd = mulberry(Math.round(T.x * 31 + T.y * 17 + T.w * 5));
  b.strokeStyle = 'rgba(90,62,22,0.35)'; b.lineWidth = Math.max(1, S * 0.03);
  const len = horiz ? w : h, half = (horiz ? h : w) / 2;
  for (let p = S * 0.15; p < len; p += S * 0.22) {
    const j = (rnd() - 0.5) * S * 0.08;
    for (const dir of [-1, 1]) {
      b.beginPath();
      if (horiz) { b.moveTo(x + p + j, y + half); b.lineTo(x + p + j, y + half + dir * half * (0.85 + rnd() * 0.15)); }
      else { b.moveTo(x + half, y + p + j); b.lineTo(x + half + dir * half * (0.85 + rnd() * 0.15), y + p + j); }
      b.stroke();
    }
  }
  b.strokeStyle = '#5e4524'; b.lineWidth = Math.max(2, S * 0.12); b.beginPath();   // the ridge
  if (horiz) { b.moveTo(x + S * 0.1, y + half); b.lineTo(x + w - S * 0.1, y + half); } else { b.moveTo(x + half, y + S * 0.1); b.lineTo(x + half, y + h - S * 0.1); }
  b.stroke();
  b.fillStyle = '#6b4a26';   // gable ends: carved timber
  const e = S * 0.18;
  if (horiz) { b.fillRect(x, y, e, h); b.fillRect(x + w - e, y, e, h); } else { b.fillRect(x, y, w, e); b.fillRect(x, y + h - e, w, e); }
  b.strokeStyle = INK; b.lineWidth = inkW(); b.strokeRect(x, y, w, h);
}
// Storehouses (narrative.js): live flames on the burning ones (the roof itself shows it is a house, so no label).
function drawFires(now) {
  const t = now / 1000;
  for (const T of stores()) {
    const x = T.x * S, y = T.y * S, w = T.w * S, h = T.h * S, on = burning(T);
    if (on) turned(ctx, T, () => {   // the flames on the (turned) roof
      ctx.save();
      ctx.fillStyle = 'rgba(30,20,15,0.45)'; ctx.fillRect(x, y, w, h);   // charred thatch
      const rnd = mulberry(Math.round(T.x * 13 + T.y * 29)), n = Math.max(4, Math.round(T.w * T.h * 1.2));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const fx = x + (0.1 + rnd() * 0.8) * w, fy = y + (0.1 + rnd() * 0.8) * h, ph = rnd() * TAU, sp = 3 + rnd() * 3;
        const r = S * (0.35 + 0.25 * rnd()) * (0.8 + 0.25 * Math.sin(t * sp + ph));
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy - r * 0.3, r);
        gr.addColorStop(0, 'rgba(255,240,170,0.9)'); gr.addColorStop(0.4, 'rgba(255,140,30,0.6)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy - r * 0.3, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save(); ctx.strokeStyle = `rgba(255,120,30,${0.55 + 0.25 * Math.sin(t * 4)})`; ctx.lineWidth = Math.max(2, S * 0.08); ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); ctx.restore();
    });
  }
}
function drawDoor(b, T) {
  b.fillStyle = '#8a6a43'; b.fillRect(T.x * S, T.y * S, T.w * S, T.h * S);
  b.strokeStyle = '#5e4527'; b.lineWidth = Math.max(1, S * 0.025); b.strokeRect(T.x * S, T.y * S, T.w * S, T.h * S);
}
// A ladder against a cliff: two rails along its length and rungs across.
function drawLadder(b, T) {
  const horiz = T.w >= T.h, len = horiz ? T.w : T.h;
  b.save();
  b.strokeStyle = '#7a5530'; b.lineCap = 'round';
  b.lineWidth = Math.max(2, S * 0.07);
  const rail = f => { b.beginPath(); if (horiz) { b.moveTo(T.x * S, (T.y + T.h * f) * S); b.lineTo((T.x + T.w) * S, (T.y + T.h * f) * S); } else { b.moveTo((T.x + T.w * f) * S, T.y * S); b.lineTo((T.x + T.w * f) * S, (T.y + T.h) * S); } b.stroke(); };
  rail(0.2); rail(0.8);
  b.lineWidth = Math.max(1.5, S * 0.045);
  for (let p = 0.15; p < len; p += 0.3) { b.beginPath(); if (horiz) { b.moveTo((T.x + p) * S, (T.y + T.h * 0.2) * S); b.lineTo((T.x + p) * S, (T.y + T.h * 0.8) * S); } else { b.moveTo((T.x + T.w * 0.2) * S, (T.y + p) * S); b.lineTo((T.x + T.w * 0.8) * S, (T.y + p) * S); } b.stroke(); }
  b.restore();
}
function drawWall(b, T) {
  const rnd = mulberry(Math.round(T.x * 53 + T.y * 89 + T.w * 11 + T.h));
  const horiz = T.w >= T.h, len = horiz ? T.w : T.h, thick = horiz ? T.h : T.w, rows = Math.max(1, Math.round(thick / 0.3));
  b.save();
  b.shadowColor = 'rgba(0,0,0,0.45)'; b.shadowBlur = 6; b.shadowOffsetY = 3;
  b.fillStyle = '#3f3c36'; b.fillRect(T.x * S, T.y * S, T.w * S, T.h * S);
  b.restore();
  const shades = ['#a29c8e', '#8f897d', '#b0aa9b', '#837d72', '#9a9384'], gp = Math.max(1, S * 0.035);
  for (let r = 0; r < rows; r++) {
    const t0 = r * thick / rows, t1 = (r + 1) * thick / rows;
    for (let p = r % 2 ? -0.3 : 0; p < len;) {
      const sl = 0.45 + rnd() * 0.35, a = Math.max(0, p), e = Math.min(len, p + sl);
      const [sx, sy, sw, sh] = horiz ? [T.x + a, T.y + t0, e - a, t1 - t0] : [T.x + t0, T.y + a, t1 - t0, e - a];
      const px = sx * S + gp / 2, py = sy * S + gp / 2, pw = sw * S - gp, ph = sh * S - gp;
      rr(b, px, py, pw, ph, Math.min(4, S * 0.08));
      b.fillStyle = lit(b, px, py, px + pw, py + ph, shades[Math.floor(rnd() * shades.length)], 0.25, 0.3); b.fill();
      b.strokeStyle = 'rgba(30,26,20,0.7)'; b.lineWidth = Math.max(0.6, S * 0.018); b.stroke();
      if (rnd() < 0.25) { b.fillStyle = 'rgba(96,130,60,0.6)'; b.beginPath(); b.ellipse(px + pw * rnd(), py + ph * (rnd() < 0.5 ? 0.1 : 0.9), S * 0.07, S * 0.035, 0, 0, TAU); b.fill(); }   // moss in a joint
      p += sl;
    }
  }
  b.strokeStyle = INK; b.lineWidth = inkW(); b.strokeRect(T.x * S, T.y * S, T.w * S, T.h * S);
}
// A rocky outcrop seen from above: an angular block whose flat top catches the light, bevelled sides falling away
// into shade, cracks across the top and moss in them; inked like the tokens.
function drawRock(b, T) {
  const rnd = mulberry(Math.round(T.x * 73 + T.y * 131 + T.w * 17));
  const pts = [], st = 0.5, j = () => rnd() * 0.22;
  for (let x = T.x; x < T.x + T.w; x += st) pts.push([x, T.y + j()]);
  for (let y = T.y; y < T.y + T.h; y += st) pts.push([T.x + T.w - j(), y]);
  for (let x = T.x + T.w; x > T.x; x -= st) pts.push([x, T.y + T.h - j()]);
  for (let y = T.y + T.h; y > T.y; y -= st) pts.push([T.x + j(), y]);
  const cx = T.x + T.w / 2, cy = T.y + T.h / 2, inset = Math.min(0.32, Math.min(T.w, T.h) * 0.16);
  // The top face: the outline drawn in towards the middle, a little up and left (the light comes from there).
  const top = pts.map(([x, y]) => { const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1, k = inset * (0.7 + rnd() * 0.6) / d; return [x + dx * k - 0.04, y + dy * k - 0.06]; });
  const path = q => { b.beginPath(); q.forEach(([x, y], i) => i ? b.lineTo(x * S, y * S) : b.moveTo(x * S, y * S)); b.closePath(); };
  b.save();
  b.shadowColor = 'rgba(0,0,0,0.45)'; b.shadowBlur = 9; b.shadowOffsetY = 4;
  path(pts); b.fillStyle = lit(b, T.x * S, T.y * S, (T.x + T.w) * S, (T.y + T.h) * S, '#7c7d75', 0.15, 0.35); b.fill();
  b.restore();
  // Bevels: each side between the outline and the top face, lighter facing the light, darker facing away.
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length], ta = top[i], tc = top[(i + 1) % pts.length];
    const nx = c[1] - a[1], ny = a[0] - c[0], n = Math.hypot(nx, ny) || 1, facing = -(nx + ny) / n / Math.SQRT2;   // +1 towards the top-left light
    b.beginPath(); b.moveTo(a[0] * S, a[1] * S); b.lineTo(c[0] * S, c[1] * S); b.lineTo(tc[0] * S, tc[1] * S); b.lineTo(ta[0] * S, ta[1] * S); b.closePath();
    b.fillStyle = facing > 0 ? `rgba(235,235,220,${0.12 + 0.25 * facing})` : `rgba(15,15,12,${0.15 - 0.35 * facing})`; b.fill();
    if (i % 2 === 0) { b.strokeStyle = 'rgba(25,24,20,0.45)'; b.lineWidth = Math.max(0.6, S * 0.015); b.beginPath(); b.moveTo(a[0] * S, a[1] * S); b.lineTo(ta[0] * S, ta[1] * S); b.stroke(); }
  }
  path(top); b.fillStyle = lit(b, T.x * S, T.y * S, (T.x + T.w) * S, (T.y + T.h) * S, '#a9aa9f', 0.2, 0.2); b.fill();
  b.strokeStyle = 'rgba(25,24,20,0.6)'; b.lineWidth = Math.max(0.7, S * 0.02); b.stroke();
  // Cracks across the top, each a jagged dark line with a light lip, moss collecting in some.
  b.save(); path(top); b.clip();
  for (let k = 0; k < Math.max(2, Math.round(T.w * T.h / 4)); k++) {
    let x = T.x + rnd() * T.w, y = T.y + rnd() * T.h, a = rnd() * TAU;
    const line = [[x, y]];
    for (let n = 0; n < 4; n++) { a += (rnd() - 0.5) * 1.2; const l = 0.25 + rnd() * 0.35; x += Math.cos(a) * l; y += Math.sin(a) * l; line.push([x, y]); }
    for (const [off, col, w] of [[0.025, 'rgba(240,240,225,0.35)', 0.02], [0, 'rgba(25,24,20,0.75)', 0.025]]) {
      b.beginPath(); line.forEach(([px, py], i) => i ? b.lineTo((px + off) * S, (py + off) * S) : b.moveTo((px + off) * S, (py + off) * S));
      b.strokeStyle = col; b.lineWidth = Math.max(0.7, S * w); b.lineJoin = 'miter'; b.stroke();
    }
    if (rnd() < 0.6) { const [mx, my] = line[1 + Math.floor(rnd() * 3)]; b.fillStyle = 'rgba(110,140,60,0.6)'; blob(b, mx, my, 0.1 + rnd() * 0.08, rnd, 6, 0.5); b.fill(); }
  }
  for (let k = 0; k < T.w * T.h * 3; k++) { b.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,0.18)' : 'rgba(0,0,0,0.12)'; b.beginPath(); b.arc((T.x + rnd() * T.w) * S, (T.y + rnd() * T.h) * S, Math.max(0.6, S * 0.02), 0, TAU); b.fill(); }   // grain and lichen specks
  b.restore();
  b.strokeStyle = INK; b.lineWidth = inkW(); path(pts); b.stroke();
}

/* ---------- Terrain finish: dark ink outlines and light from the top left, as on the tokens ---------- */
const INK = 'rgba(22,17,10,0.9)', inkW = () => Math.max(1.2, S * 0.05);
function tone(hex, t) {   // lighter (t > 0) or darker (t < 0)
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)));
  return `rgb(${c.join(',')})`;
}
function lit(b, x0, y0, x1, y1, col, hi = 0.22, lo = 0.3) { const g = b.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, tone(col, hi)); g.addColorStop(1, tone(col, -lo)); return g; }
// An irregular rounded shape around (cx, cy) in inches: a stone, a bush, a clump of leaves.
function blob(b, cx, cy, r, rnd, n = 7, j = 0.28) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = i * TAU / n + rnd() * 0.4, k = r * (1 - j / 2 + rnd() * j); p.push([(cx + Math.cos(a) * k) * S, (cy + Math.sin(a) * k) * S]); }
  const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2], s0 = mid(p[n - 1], p[0]);
  b.beginPath(); b.moveTo(s0[0], s0[1]);
  for (let i = 0; i < n; i++) { const q = mid(p[i], p[(i + 1) % n]); b.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
  b.closePath();
}
// A shaded, inked lump with a highlight on its top-left shoulder.
function lump(b, cx, cy, r, rnd, col, n, j) {
  blob(b, cx, cy, r, rnd, n, j);
  b.fillStyle = lit(b, (cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S, col); b.fill();
  b.strokeStyle = INK; b.lineWidth = Math.max(0.7, S * 0.022); b.stroke();
  if (S * r > 5) { b.beginPath(); b.ellipse((cx - r * 0.3) * S, (cy - r * 0.35) * S, r * 0.35 * S, r * 0.15 * S, -0.6, 0, TAU); b.fillStyle = 'rgba(255,255,240,0.2)'; b.fill(); }
}
// Lighter and darker patches of turf, seeded per 6-inch square so they do not move when the view is redrawn.
function patches(b, x0, y0, x1, y1) {
  for (let gx = Math.floor(x0 / 6) - 1; gx * 6 < x1 + 6; gx++) for (let gy = Math.floor(y0 / 6) - 1; gy * 6 < y1 + 6; gy++) {
    const rnd = mulberry(gx * 3571 + gy * 7919 + 5);
    for (let i = 0; i < 3; i++) {
      const cx = (gx + rnd()) * 6 * S, cy = (gy + rnd()) * 6 * S, r = (1.5 + rnd() * 2.5) * S, g = b.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rnd() < 0.5 ? 'rgba(150,170,90,0.10)' : 'rgba(20,35,15,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = g; b.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
}
// Grass tufts seen from above (little stars of blades) and a few wild flowers, seeded per inch so the same tuft lands
// in the same place at any zoom.
function tufts(b, x0, y0, x1, y1, dens, light) {
  const cols = light ? ['rgba(150,175,110,0.45)', 'rgba(70,95,50,0.4)'] : ['rgba(130,160,95,0.4)', 'rgba(35,52,28,0.4)', 'rgba(110,140,80,0.35)'];
  b.lineCap = 'round'; b.lineWidth = Math.max(0.7, S * 0.022);
  for (let gx = Math.floor(x0); gx < x1; gx++) for (let gy = Math.floor(y0); gy < y1; gy++) {
    const rnd = mulberry(gx * 7919 + gy * 104729 + 13);
    for (let i = 0; i < dens; i++) {
      const x = (gx + rnd()) * S, y = (gy + rnd()) * S, l = (0.04 + rnd() * 0.05) * S, a0 = rnd() * TAU;
      b.strokeStyle = cols[Math.floor(rnd() * cols.length)]; b.beginPath();
      for (let k = 0; k < 5; k++) { const a = a0 + k * TAU / 5; b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
      b.stroke();
      if (rnd() < 0.03) { b.fillStyle = rnd() < 0.5 ? '#ece6cc' : '#e3c25a'; b.beginPath(); b.arc(x + l, y, Math.max(0.7, S * 0.028), 0, TAU); b.fill(); }   // a flower
    }
  }
}

/* ---------- Drawing helpers (inches in, pixels out) ---------- */
const dashes = d => (d || []).map(v => v * Z);
function ring(x, y, r, col, dash, w) { if (r <= 0) return; ctx.beginPath(); ctx.arc(x * S, y * S, r * S, 0, TAU); ctx.setLineDash(dashes(dash)); ctx.strokeStyle = col; ctx.lineWidth = (w || 1) * Z; ctx.stroke(); ctx.setLineDash([]); }
function seg(x1, y1, x2, y2, col, dash, w) { ctx.beginPath(); ctx.moveTo(x1 * S, y1 * S); ctx.lineTo(x2 * S, y2 * S); ctx.setLineDash(dashes(dash)); ctx.strokeStyle = col; ctx.lineWidth = (w || 1) * Z; ctx.stroke(); ctx.setLineDash([]); }
// The shooter's view of the whole target, seen from above: from its centre to the target's base (In The Way is
// anything that overlaps it).
function viewWedge(p, T, r, col) {
  const dx = T.x - p.x, dy = T.y - p.y, d = Math.hypot(dx, dy);
  if (d <= r) return;
  const f = Math.atan2(dy, dx), a = Math.asin(r / d), l = Math.sqrt(d * d - r * r);
  ctx.beginPath(); ctx.moveTo(p.x * S, p.y * S);
  ctx.lineTo((p.x + Math.cos(f - a) * l) * S, (p.y + Math.sin(f - a) * l) * S);
  ctx.arc(T.x * S, T.y * S, r * S, f - a - Math.PI / 2, f + a + Math.PI / 2);
  ctx.closePath();
  ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = col; ctx.fill();
  ctx.globalAlpha = 0.45; ctx.strokeStyle = col; ctx.lineWidth = Z; ctx.setLineDash(dashes([3, 4])); ctx.stroke(); ctx.restore();
}
function diamond(x, y) { const s = 5 * Z; ctx.beginPath(); ctx.moveTo(x * S, y * S - s); ctx.lineTo(x * S + s, y * S); ctx.lineTo(x * S, y * S + s); ctx.lineTo(x * S - s, y * S); ctx.closePath(); ctx.fillStyle = '#ffd47e'; ctx.fill(); ctx.strokeStyle = '#2a2414'; ctx.lineWidth = 1; ctx.stroke(); }
// Where a pill centred at (x, y) in inches lands in pixels, kept on the board. Returns the box.
function pillBox(txt, x, y, font) {
  ctx.font = font || fpx(13);
  const w = ctx.measureText(txt).width + 12 * Z, h = Math.round(21 * Z);
  const px = Math.max(w / 2 + 2, Math.min(G.W * S - w / 2 - 2, x * S)), py = Math.max(h / 2 + 2, Math.min(G.H * S - h / 2 - 2, y * S));
  return { x0: px - w / 2, y0: py - h / 2, x1: px + w / 2, y1: py + h / 2, px, py, w, h };
}
function pill(txt, x, y, col, font, border) {
  const b = pillBox(txt, x, y, font);
  ctx.fillStyle = 'rgba(14,18,15,0.86)'; rr(ctx, b.x0, b.y0, b.w, b.h, 4 * Z); ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5 * Z; ctx.stroke(); }
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, b.px, b.py + 0.5);
}
// A small burst where two enemies' bases touch.
function clash(x, y) {
  const r = S * 0.24;
  ctx.save(); ctx.translate(x * S, y * S);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i * TAU / 16, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  ctx.closePath(); ctx.fillStyle = '#ffb347'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#5a1d0c'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fillStyle = '#fff6dc'; ctx.fill();
  ctx.restore();
}

/* ---------- Movement animation and effects ---------- */
export function posOf(u, now) {
  const a = u.anim; if (!a) return u;
  const t = (now - a.t0) / a.dur;
  if (t >= 1) { u.anim = null; return u; }
  const e = 1 - Math.pow(1 - t, 3);
  if (!a.via) return { x: a.fx + (u.x - a.fx) * e, y: a.fy + (u.y - a.fy) * e };
  // A path with one turn: the same eased pace along both legs.
  const v = a.via, l1 = Math.hypot(v.x - a.fx, v.y - a.fy), l2 = Math.hypot(u.x - v.x, u.y - v.y), s = e * (l1 + l2);
  if (s <= l1) { const k = l1 ? s / l1 : 1; return { x: a.fx + (v.x - a.fx) * k, y: a.fy + (v.y - a.fy) * k }; }
  const k = l2 ? (s - l1) / l2 : 1;
  return { x: v.x + (u.x - v.x) * k, y: v.y + (u.y - v.y) * k };
}
// P.via (optional): the point where the path turns.
export function animTo(u, P, ms) {
  const now = performance.now(), cur = posOf(u, now);
  u.anim = RM ? null : { fx: cur.x, fy: cur.y, t0: now, dur: ms, via: P.via || null };
  u.x = P.x; u.y = P.y;
}
// Animates a model that the rules engine already moved, from where it stood.
export function animFrom(u, from, ms) { u.anim = RM ? null : { fx: from.x, fy: from.y, t0: performance.now(), dur: ms }; }
export function fxText(u, txt, kind, delay) { G.fx.push({ k: 'txt', x: u.x, y: u.y - u.r, txt, kind, t0: performance.now() + (delay || 0), dur: 1400 }); }
export function fxArrow(s, t) { if (!RM) G.fx.push({ k: 'arrow', x1: s.x, y1: s.y, x2: t.x, y2: t.y, t0: performance.now(), dur: 340 }); }
export function fxDeath(u) { if (!RM) G.fx.push({ k: 'death', u, t0: performance.now() + 200, dur: 700 }); }

function drawFx(now) {
  G.fx = G.fx.filter(f => now - f.t0 < f.dur);
  for (const f of G.fx) {
    const t = (now - f.t0) / f.dur;
    if (t < 0) {
      if (f.k === 'death') drawToken(ctx, f.u, f.u.x * S, f.u.y * S, f.u.r * S, {}, now, DPR);   // still standing until the dice land
      continue;
    }
    if (f.k === 'arrow') {
      const x = f.x1 + (f.x2 - f.x1) * t, y = f.y1 + (f.y2 - f.y1) * t, a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
      ctx.beginPath(); ctx.moveTo((x - Math.cos(a) * 0.8) * S, (y - Math.sin(a) * 0.8) * S); ctx.lineTo(x * S, y * S);
      ctx.strokeStyle = '#f5e9c8'; ctx.lineWidth = 2 * Z; ctx.stroke();
    } else if (f.k === 'death') {
      const u = f.u, R = u.r * S;
      drawToken(ctx, u, u.x * S, u.y * S, R, { alpha: 1 - t, scale: 1 - 0.35 * t }, now, DPR);
      ctx.beginPath(); ctx.arc(u.x * S, u.y * S, R * (1 + t * 0.9), 0, TAU);
      ctx.lineWidth = 3 * Z * (1 - t); ctx.strokeStyle = `rgba(255,120,90,${1 - t})`; ctx.stroke();
    } else {
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      pill(f.txt, f.x, f.y - 0.3 - t * 0.9, f.kind === 'bad' ? COL.bad : f.kind === 'good' ? COL.ok : '#ece6d6');
      ctx.globalAlpha = 1;
    }
  }
}

// The archer's ruler: lines of fire from the spot F.P (the planned move, or where the shooter stands) to every enemy in
// range. Green: a clear shot (diamonds mark what is In The Way); red dashed: in range but no shot (no Line of Sight,
// a friend In The Way…). A pill sums it up; planned: the lines start at the ghost, so the range ring is drawn there too.
function drawFire(F, s, planned) {
  const o = F.P;
  if (planned) ring(o.x, o.y, F.rng + s.r + 0.5, 'rgba(242,196,92,0.35)', [2, 6], 1);
  for (const sh of [...F.shots].reverse()) {
    const T = posOf(sh.t, performance.now()), ok = sh.info.ok;
    ctx.save(); ctx.globalAlpha = ok ? 0.85 : 0.5;
    seg(o.x, o.y, T.x, T.y, ok ? COL.ok : COL.bad, ok ? [] : [4, 5], ok ? 2 : 1.3);
    ctx.restore();
    if (ok) for (const ob of sh.info.itw) diamond(ob.pt.x, ob.pt.y);
  }
  const clear = F.shots.filter(sh => sh.info.ok).length, blocked = F.shots.length - clear;
  const txt = F.reason ? (/moved/.test(F.reason) ? 'cannot shoot after this move' : 'cannot shoot') : !F.shots.length ? `no target within ${F.rng}″`
    : `${clear ? `${clear} clear ${clear === 1 ? 'shot' : 'shots'}` : 'no clear shot'}${blocked ? ` · ${blocked} blocked` : ''}`;
  pill(txt, o.x, o.y + s.r + 0.6, F.reason ? COL.bad : clear ? COL.ok : '#f1eadb');
}

// The status token under the pointer (set while drawing), and its tag: the term, what it says about this model, and
// the rule's short text. A folded badge lists the tokens behind it.
let hoverTok = null;
function tokenTip(sp) {
  const t = sp.t, x = sp.x / S, y = (sp.y - sp.r) / S - 0.5;
  if (t.fold) { pill(t.lines.join(' · '), x, y, '#f1eadb', fpx(12, SANS)); return; }
  const own = t.lines.filter(l => l !== t.n);
  pill(`${t.n}: ${own.length ? own.join('; ') : t.what}`, x, y - 0.95 * Z * 21 / S, t.col, fpx(12, SANS));
  const sh = ruleShort(t.rule);
  if (sh) pill(sh.length > 110 ? sh.slice(0, 108) + '…' : sh, x, y, '#f1eadb', fpx(11, SANS));
}

function tokenState(u) {
  let dim = false;
  if (G.step === 'good' && u.side === 'good' && !G.over) {
    if (G.mode === 'move' && !canMove(u)) dim = true;
    if (G.mode === 'shoot' && (!u.bow || shooterReason(u))) dim = true;
    if (G.only && !G.only.includes(u)) dim = true;   // a Heroic Move, With Me, Heroic Shoot or Heroic Combat: only these act
  }
  const moveLeft = G.phase === 'move' && u.side === 'good' && u.movedDist > 0 && !u.done ? remaining(u) / moveVal(u) : null;
  return { dim, selected: G.sel === u, hover: G.hoverUnit === u, moveLeft, engaged: engaged(u), alpha: u.ringOn ? 0.4 : u.prone ? 0.7 : undefined };   // a Prone model looks faded, one wearing the Ring more so
}

/* ---------- Tools and auras (overlays.js) ---------- */
// The measuring tape: a line between its ends with the length, base edge to base edge when an end is on a model.
// Look from here: a line to every enemy the model can see (yellow with the number In The Way), a red cross on those
// hidden whole; pointing at an enemy names what is In The Way or what hides it.
function drawTools(P) {
  if (tool.kind === 'measure' && tool.a && tool.b) {
    const { a, b } = tool, A = a.u ? P(a.u) : a, B = b.u ? P(b.u) : b, d = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const ux = (B.x - A.x) / d, uy = (B.y - A.y) / d, ra = a.u ? a.u.r : 0, rb = b.u ? b.u.r : 0;
    const x0 = A.x + ux * ra, y0 = A.y + uy * ra, x1 = B.x - ux * rb, y1 = B.y - uy * rb;
    seg(x0, y0, x1, y1, '#ffffff', [], 2.5);
    for (let i = 1; i < tapeLength(); i++) { const tx = x0 + ux * i, ty = y0 + uy * i; seg(tx - uy * 0.15, ty + ux * 0.15, tx + uy * 0.15, ty - ux * 0.15, '#ffffff', [], 1.5); }
    pill(`${fmt(tapeLength())}″${a.u && b.u ? ' base to base' : a.u || b.u ? ' from the base' : ''}`, (x0 + x1) / 2, (y0 + y1) / 2 - 0.6, '#ffffff', fpx(13, SANS));
  }
  if (tool.kind === 'look' && tool.look && alive(tool.look)) {
    const s = tool.look, ps = P(s);
    ring(ps.x, ps.y, s.r + 0.35, COL.accent, [], 2.5);
    let tip = null;
    for (const L of lookLines()) {
      const pt = P(L.t);
      if (L.hidden.length) { const k = 0.3; seg(pt.x - k, pt.y - k, pt.x + k, pt.y + k, COL.bad, [], 2.5); seg(pt.x + k, pt.y - k, pt.x - k, pt.y + k, COL.bad, [], 2.5); }
      else seg(ps.x, ps.y, pt.x, pt.y, L.itw.length ? 'rgba(242,196,92,0.8)' : 'rgba(120,220,140,0.85)', L.itw.length ? [5, 4] : [], 1.6);
      if (G.hoverUnit === L.t) tip = L;
    }
    if (tip) { const pt = P(tip.t); pill(tip.hidden.length ? `Out of sight: ${tip.hidden.join(' and ')}` : tip.itw.length ? `In The Way: ${tip.itw.join(', ')}` : 'In sight, nothing In The Way', pt.x, pt.y + tip.t.r + 0.6, '#f1eadb', fpx(12, SANS)); }
    else pill(`Looking from ${s.name}`, ps.x, ps.y - s.r - 0.6, COL.accent, fpx(12, SANS));
  }
}
// Pointing at a Hero shows what it reaches: its shouts (6″, once Heroic Actions are in play) and Stand Fast (once
// Broken armies are; 6″, or what its profile says); the friends inside light up. Banners are drawn above.
// Auras while pointing: a Hero's shouts and Stand Fast, a caster's Magical Power ranges, an Objective Marker's
// scoring distance. The models each one reaches are lit.
function drawAuras(P) {
  if (G.mode === 'backaway' || tool.kind) return;
  drawObjectiveAura(P);
  const h = G.hoverUnit;
  if (!h || !alive(h)) return;
  const p = P(h), rings = [];
  if (h.mwf && inPlay('heroic', G)) rings.push([SHOUT_RANGE, 'shouts']);
  if (h.mwf && inPlay('standFast', G)) rings.push([h.sfRange || standFastRange(h), 'Stand Fast']);
  // Magical Powers: one ring per range (Self powers have none), named by the powers that reach that far.
  const spells = new Map();
  if (inPlay('magic', G)) for (const pw of h.T.powers || []) if (pw.rng > 0) spells.set(pw.rng, [...(spells.get(pw.rng) || []), pw.n]);
  if (!rings.length && !spells.size) return;
  for (const [R, n] of rings) {
    ring(p.x, p.y, R + h.r, 'rgba(242,196,92,0.55)', [3, 5], 1.3);
    pill(`${n} ${R}″`, p.x + (R + h.r) * 0.7071, p.y - (R + h.r) * 0.7071, COL.accent, fpx(11, SANS));
  }
  for (const [R, names] of spells) {
    ring(p.x, p.y, R + h.r, 'rgba(176,140,255,0.6)', [6, 4], 1.3);
    pill(`${names.length > 2 ? `${names.length} powers` : names.join(', ')} ${R}″`, p.x - (R + h.r) * 0.7071, p.y + (R + h.r) * 0.7071, '#c9b2ff', fpx(11, SANS));
  }
  // Lit: within a shout's reach, or within Stand Fast's and able to see the Hero; for powers, enemies in range.
  const reached = o => rings.some(([R, n]) => gap(h, o) <= R + 1e-6 && (n !== 'Stand Fast' || !losBlocked(o, h)));
  for (const o of G.units) if (o !== h && o.side === h.side && alive(o) && reached(o)) { const q = P(o); ring(q.x, q.y, o.r + 0.22, 'rgba(242,196,92,0.7)', [], 1.5); }
  const far = Math.max(0, ...spells.keys());
  if (far) for (const o of G.units) if (o.side !== h.side && alive(o) && gap(h, o) <= far + 1e-6) { const q = P(o); ring(q.x, q.y, o.r + 0.22, 'rgba(176,140,255,0.75)', [], 1.5); }
}
// The Objective Marker under the pointer: the distance within which models count for it (scenarios.js: 3″, Hold
// Ground's centre 6″, marker edge to base edge), with the models that count lit in their side's colour.
function drawObjectiveAura(P) {
  const pt = G.hoverPt, scen = G.m && G.m.scen;
  if (!pt || !['domination', 'hold', 'supplies'].includes(scen)) return;
  const o = (G.objectives || []).find(x => !x.gone && Math.hypot(x.x - pt.x, x.y - pt.y) <= x.r + 0.4);
  if (!o) return;
  const d = scen === 'hold' ? 6 : 3;
  ring(o.x, o.y, o.r + d, 'rgba(232,226,207,0.7)', [4, 4], 1.4);
  pill(`counts within ${d}″`, o.x, o.y - o.r - d - 0.3, '#e8e2cf', fpx(11, SANS));
  for (const u of G.units) {
    if (!alive(u) || u.T.siege || u.T.gate || Math.hypot(u.x - o.x, u.y - o.y) - u.r - o.r > d + 1e-6) continue;
    const q = P(u); ring(q.x, q.y, u.r + 0.22, u.side === 'good' ? 'rgba(120,170,255,0.8)' : 'rgba(230,92,66,0.8)', [], 1.5);
  }
}

/* ---------- Combats: Pairing Off, order and Strikes ---------- */
const COMBAT_COL = ['#f2c45c', '#8fd3ff', '#c9a6ff', '#9be39a', '#ff9fcf', '#ffb36b'];
// A Combat's colour: by its place in the list, or fixed (ci) while the enemy builds and numbers its Combats.
const combatCol = (c, i) => COMBAT_COL[(c.ci ?? i) % COMBAT_COL.length];
// Lines from the model in the middle of each Combat to the models it fights.
// Each Combat gets a colour: a halo under every model in it and lines from the model in the middle.
function drawCombats(P) {
  if (!G.combats || G.phase !== 'fight') return;
  G.combats.forEach((c, i) => {
    const live = c.filter(alive); if (live.length < 2) return;
    const m = centreOf(live), pm = P(m), col = combatCol(c, i);
    for (const u of live) { const p = P(u); ring(p.x, p.y, u.r + 0.13, col, [], 4); }
    for (const u of live) { if (u === m) continue; const p = P(u); seg(pm.x, pm.y, p.x, p.y, col, [], 3.5); }
    // Supporting spears and pikes: a dashed halo and a dashed line to the friend they stand behind (for a pike in the
    // third rank, the pike in front of it).
    for (const s of [...supOf(c, 'good'), ...supOf(c, 'evil')]) {
      const f = (c.via && c.via.get(s)) || live.filter(o => o.side === s.side).reduce((a, b) => (gap(a, s) <= gap(b, s) ? a : b)), ps = P(s), pf = P(f);
      ring(ps.x, ps.y, s.r + 0.13, col, [3, 3], 3); seg(pf.x, pf.y, ps.x, ps.y, col, [3, 3], 2.5);
    }
  });
}
// Number, dice on each side (yours first), chance to win and Trapped warnings for each Combat, placed where they do not
// overlap. A side that would be Trapped if it loses is named: "enemy Trapped" or "yours Trapped".
function drawCombatLabels(P) {
  if (!G.combats || G.phase !== 'fight' || G.mode === 'strike') return;
  const placed = [], bases = G.units.filter(alive).map(u => { const p = P(u); return { x0: (p.x - u.r) * S, x1: (p.x + u.r) * S, y0: (p.y - u.r) * S, y1: (p.y + u.r) * S }; });
  const over = (b, o) => b.x0 < o.x1 + 3 && b.x1 > o.x0 - 3 && b.y0 < o.y1 + 3 && b.y1 > o.y0 - 3;
  const hits = b => placed.some(o => over(b, o)) || bases.some(o => over(b, o));
  G.combats.forEach((c, i) => {
    const g = goodsOf(c), e = evilsOf(c); if (!g.length || !e.length) return;
    if (G.enemyPick && i >= G.enemyPick.shown) return;   // the enemy has not numbered this Combat yet
    const live = [...g, ...e], pts = live.map(P);
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const top = Math.min(...pts.map((p, k) => p.y - live[k].r)), bot = Math.max(...pts.map((p, k) => p.y + live[k].r));
    const dice = duelDice(c);
    const txt = `Combat ${i + 1} · ${dice.good} v ${dice.evil} dice${prefs.odds ? ` · win ${pct(combatOdds(c))}` : ''}${trappedIfLose(c, 'evil').length ? ' · enemy Trapped' : ''}${trappedIfLose(c, 'good').length ? ' · yours Trapped' : ''}`;
    const left = Math.min(...pts.map((p, k) => p.x - live[k].r)), right = Math.max(...pts.map((p, k) => p.x + live[k].r)), mid = (top + bot) / 2;
    const w = pillBox(txt, 0, 0).w / S / 2 + 0.2;
    const tries = [[x, top - 0.55], [x, bot + 0.55], [right + w, mid], [left - w, mid], [x, top - 1.5], [x, bot + 1.5], [right + w, top], [left - w, bot]];
    let b = null;
    for (const [tx, ty] of tries) { const t = pillBox(txt, tx, ty); if (!hits(t)) { b = t; break; } }
    if (!b) b = pillBox(txt, ...tries[0]);
    placed.push(b);
    const col = combatCol(c, i);
    pill(txt, b.px / S, b.py / S, col, null, G.curFight === c ? col : null);
  });
}
// Pairing Off: which models are not in a Combat yet (no hint of whom they should fight). Choosing a Strike: targets.
function drawPicks(P) {
  // A dashed yellow ring on every model that is not in a Combat yet.
  if ((G.mode === 'pair' || G.mode === 'enemyPair') && G.pairing) for (const u of G.pairing.open.flatMap(unpaired)) {
    if (u === G.sel) continue;
    const p = P(u); ring(p.x, p.y, u.r + 0.3, COL.accent, [4, 3], 2);
  }
  if (G.mode === 'backaway' && G.backAway) {
    const { l, opts } = G.backAway, pl = P(l), hp = G.hoverPt;
    ring(pl.x, pl.y, l.r + 0.3, COL.accent, [], 2);
    let near = null, bd = 0.8;
    if (hp) for (const o of opts) { const d = Math.hypot(o.x - hp.x, o.y - hp.y); if (d < bd) { bd = d; near = o; } }
    // Free spots are plain dots; a spot where a friend Makes Way carries a two-way arrow too, so colour is not the only cue.
    for (const o of opts) {
      const r = Math.max(0.17 * S, 5 * Z);
      ctx.beginPath(); ctx.arc(o.x * S, o.y * S, r, 0, TAU); ctx.fillStyle = o.makeWay ? COL.accent : COL.ok; ctx.fill(); ctx.lineWidth = 1.5 * Z; ctx.strokeStyle = '#1a1a12'; ctx.stroke();
      if (o.makeWay) { ctx.fillStyle = '#1a1a12'; ctx.font = `800 ${Math.round(r * 1.3)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇄', o.x * S, o.y * S + 0.5); }
    }
    if (near) {
      const c = near.makeWay ? COL.accent : COL.ok;
      seg(pl.x, pl.y, near.x, near.y, c, [5, 4], 2); drawGhost(ctx, l, near.x * S, near.y * S, l.r * S, c, DPR);
      if (near.makeWay) {
        const m = near.makeWay, pm = P(m.u);
        seg(pm.x, pm.y, m.x, m.y, c, [5, 4], 2); drawGhost(ctx, m.u, m.x * S, m.y * S, m.u.r * S, c, DPR);
        pill(`${m.u.name} Makes Way`, m.x, m.y + m.u.r + 0.55, c);
      }
    }
  }
  if ((G.mode === 'strike' || G.mode === 'part') && G.strike) {
    const { w, cands, trapped } = G.strike, pw = P(w);
    ring(pw.x, pw.y, w.r + 0.3, COL.accent, [], 2);
    for (const t of cands) {
      if (!alive(t)) continue;
      const p = P(t), on = G.hoverUnit === t || G.mode === 'part';
      ring(p.x, p.y, t.r + 0.3, on ? COL.ok : COL.bad, [4, 3], on ? 3 : 2);
      const D = bestPart(w, t) === 'mount' ? t.mount.d : t.d, need = G.mode === 'strike' ? needStr(woundNeed(strikeS(w), D)) : '';
      const txt = [need && `wounds on ${need}${woundBonus(w, t) ? ` +${woundBonus(w, t)}` : ''}`, trapped.has(t.id) && 'Trapped', t.prone && !trapped.has(t.id) && 'Prone', prefs.odds && G.mode === 'strike' && `${pct(strikeChance(w, t, trapped.has(t.id) || !!t.prone, bestPart(w, t)))}`].filter(Boolean).join(' · ');
      if (txt) pill(txt, p.x, p.y - t.r - 0.6, on ? COL.ok : '#f1eadb');
    }
  }
}

/* ---------- Frame ---------- */
export function draw(now) {
  if (!G || !bg) return;
  const W = G.W * S, H = G.H * S;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  ctx.translate(-camX, -camY);   // the camera: everything below is drawn in table pixels
  ctx.drawImage(bg, 0, 0, W, H);   // stretched while zooming (until it is redrawn), and when zoomed in past its resolution
  if (bgView && bgView.s === S) ctx.drawImage(bgView, bgView.ox, bgView.oy, bgView.ow, bgView.oh);
  drawRulers();
  const P = u => posOf(u, now);
  // Writhing Vines: the marker and the 3″ of Difficult Terrain around it for the caster's enemies.
  for (const v of active().filter(x => x.vine)) {
    ctx.beginPath(); ctx.arc(v.vine.x * S, v.vine.y * S, (3 + VINE_R) * S, 0, TAU); ctx.fillStyle = 'rgba(70,140,60,0.16)'; ctx.fill();
    ring(v.vine.x, v.vine.y, 3 + VINE_R, 'rgba(120,190,90,0.8)', [5, 4], 1.5);
    ctx.beginPath(); ctx.arc(v.vine.x * S, v.vine.y * S, VINE_R * S, 0, TAU); ctx.fillStyle = '#4f7d32'; ctx.fill();
  }

  // Objective Markers (scenarios.js): 25 mm markers; a Supply Marker in its side's colour.
  for (const o of G.objectives || []) {
    if (o.gone) continue;
    ctx.beginPath(); ctx.arc(o.x * S, o.y * S, o.r * S, 0, TAU);
    ctx.fillStyle = o.side === 'good' ? '#d9a93a' : o.side === 'evil' ? '#b5432f' : '#e8e2cf'; ctx.fill();
    ctx.lineWidth = Math.max(1, S * 0.06); ctx.strokeStyle = 'rgba(20,14,8,0.85)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x * S, o.y * S, o.r * S * 0.45, 0, TAU); ctx.fillStyle = 'rgba(20,14,8,0.55)'; ctx.fill();
  }
  drawFires(now);   // Storehouses: labels and fire (narrative.js)
  // Siege Engines: the 45° Arc of Sight they face, out to a short way past the base (siege.js: inArc).
  for (const e of G.units.filter(u => u.T.siege && !u.dead && !u.gone)) {
    const p = P(e), f = e.facing || 0, L = (e.r + 2.5) * S;
    ctx.beginPath(); ctx.moveTo(p.x * S, p.y * S); ctx.arc(p.x * S, p.y * S, L, f - ARC, f + ARC); ctx.closePath();
    const g = ctx.createRadialGradient(p.x * S, p.y * S, e.r * S, p.x * S, p.y * S, L);
    g.addColorStop(0, e.side === 'good' ? 'rgba(242,196,92,0.35)' : 'rgba(230,92,66,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fill();
  }

  // Matched play deployment: your zone lit, the enemy's dimmed red.
  if (G.mode === 'deploy' && G.m.zones) {
    for (const side of ['evil', 'good']) {
      const zr = G.m.zones[side], mine = side === 'good';
      ctx.fillStyle = mine ? 'rgba(242,196,92,0.14)' : 'rgba(230,92,66,0.08)'; ctx.fillRect(zr.x * S, zr.y * S, zr.w * S, zr.h * S);
      ctx.setLineDash(dashes([8, 6])); ctx.strokeStyle = mine ? 'rgba(242,196,92,0.85)' : 'rgba(244,128,104,0.55)'; ctx.lineWidth = 1.5 * Z;
      ctx.strokeRect(zr.x * S + 1, zr.y * S + 1, zr.w * S - 2, zr.h * S - 2); ctx.setLineDash([]);
      // The label sits at the back corner of the zone, clear of the front ranks.
      pill(mine ? 'your deployment zone' : 'enemy deployment zone', zr.x + 4.5, mine ? zr.y + zr.h - 0.6 : zr.y + 0.6, mine ? COL.accent : COL.threat);
    }
  }
  // A mission's scoring area (m.area: { x, y, w, h, label }), such as the ford of With Me!: lit faintly, with a dashed edge.
  if (G.m.area) {
    const A = G.m.area;
    ctx.fillStyle = 'rgba(242,196,92,0.10)'; ctx.fillRect(A.x * S, A.y * S, A.w * S, A.h * S);
    ctx.setLineDash(dashes([8, 6])); ctx.strokeStyle = 'rgba(242,196,92,0.75)'; ctx.lineWidth = 1.5 * Z;
    ctx.strokeRect(A.x * S + 1, A.y * S + 1, A.w * S - 2, A.h * S - 2); ctx.setLineDash([]);
    if (A.label) pill(A.label, A.x + A.w / 2, A.y + 0.6, COL.accent);
  }
  // Enemy Control Zones. A zone stops at walls, hedges and rocks (unless the model defends that wall), so near them
  // the ring is drawn only as far as the zone reaches in each direction.
  if (zonesShown()) {
    for (const e of G.units) {
      if (e.side !== 'evil' || !alive(e) || engaged(e)) continue;
      const p = P(e), R = e.r + 1, cs = zoneCutters(e);
      if (!cs.length) {
        ctx.beginPath(); ctx.arc(p.x * S, p.y * S, R * S, 0, TAU); ctx.fillStyle = COL.cz; ctx.fill();
        ring(p.x, p.y, R, COL.czLine, [4, 4], 1.2);
        continue;
      }
      const reach = a => {   // how far the zone reaches along the ray at angle a (in table inches from e's centre)
        const at = d => ({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d });
        let Q = at(R); if (!zoneBlocked(e, Q.x, Q.y, cs)) return R;
        let lo = e.r, hi = R;
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; Q = at(m); if (zoneBlocked(e, Q.x, Q.y, cs)) hi = m; else lo = m; }
        return lo;
      };
      const pts = [];
      for (let k = 0; k < 72; k++) { const a = k * TAU / 72, d = reach(a); pts.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, full: d >= R - 1e-6 }); }
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x * S, q.y * S) : ctx.moveTo(q.x * S, q.y * S))); ctx.closePath();
      ctx.fillStyle = COL.cz; ctx.fill();
      ctx.save(); ctx.strokeStyle = COL.czLine; ctx.lineWidth = 1.2 * Z; ctx.setLineDash([4 * Z, 4 * Z]);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const q = pts[i], n = pts[(i + 1) % pts.length]; if (q.full && n.full) { ctx.moveTo(q.x * S, q.y * S); ctx.lineTo(n.x * S, n.y * S); } }
      ctx.stroke(); ctx.restore();
      if (defends(e)) pill('defends the ' + defends(e).k, p.x, p.y - R - 0.1, COL.czLine, fpx(12, SANS));
    }
  }
  // Banners: the 3″ reach of each of your banner bearers (an enemy's only while you point at it).
  for (const b of G.units) {
    if (!b.T.banner || !alive(b) || (b.side !== 'good' && G.hoverUnit !== b)) continue;
    const p = P(b), R = b.r + BANNER_RANGE;
    ctx.beginPath(); ctx.arc(p.x * S, p.y * S, R * S, 0, TAU); ctx.fillStyle = 'rgba(242,196,92,0.06)'; ctx.fill();
    ring(p.x, p.y, R, 'rgba(242,196,92,0.6)', [2, 5], 1.3);
    if (G.hoverUnit === b) pill(`banner ${BANNER_RANGE}″`, p.x, p.y - R, COL.accent);
  }
  // Paths already walked this turn.
  if (G.phase === 'move') {
    for (const u of G.units) {
      if (!alive(u) || u.side !== 'good' || !u.trail.length) continue;
      const pts = [...u.trail, P(u)];
      for (let i = 1; i < pts.length; i++) seg(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 'rgba(242,196,92,0.55)', [3, 4], 1.5);
    }
  }
  const hu = G.hoverUnit, s = G.sel;
  if (hu && hu.side === 'evil' && alive(hu) && !['sentry', 'runner', 'hold'].includes(hu.ai) && !s && !G.over && G.running && !tool.kind) {
    const p = P(hu), R = moveVal(hu) + hu.r + 0.5;
    ring(p.x, p.y, R, COL.threat, [7, 5], 1.5);
    pill(`charge reach ${moveVal(hu)}″`, p.x, p.y - R, COL.threat);
  }
  if (s && alive(s)) {
    const p = P(s);
    if (G.mode === 'move') {
      ring(p.x, p.y, remaining(s), COL.accent, [6, 5], 1.5);
      if (s.bow && !s.bow.still && !G.m.noShoot) ring(p.x, p.y, moveVal(s) / 2 - s.movedDist, 'rgba(242,196,92,0.7)', [2, 4], 1);
      // With Me or At the Double: it must finish within 6″ of its Hero.
      const h = s.tether != null && G.units.find(o => o.id === s.tether);
      if (h && alive(h)) { const q = P(h), R = SHOUT_RANGE + h.r; ring(q.x, q.y, R, 'rgba(242,196,92,0.85)', [3, 3], 2); pill(`within 6″ of ${h.name}`, q.x, q.y - R, COL.accent); }
    }
    if ((G.mode === 'shoot' || G.aimAt) && s.bow) ring(p.x, p.y, s.bow.rng + s.r + 0.5, 'rgba(242,196,92,0.45)', [2, 6], 1);
  }
  // A Hero about to shout With Me, At the Double, Loose or Take Aim: its 6″ and the friends it would reach.
  if (G.ask && G.ask.kind === 'shout' && alive(G.ask.h)) {
    const h = G.ask.h, q = P(h), R = SHOUT_RANGE + h.r;
    ctx.beginPath(); ctx.arc(q.x * S, q.y * S, R * S, 0, TAU); ctx.fillStyle = 'rgba(242,196,92,0.07)'; ctx.fill();
    ring(q.x, q.y, R, 'rgba(242,196,92,0.85)', [6, 4], 2);
    for (const o of G.ask.reach) { const p = P(o); ring(p.x, p.y, o.r + 0.3, COL.accent, [], 2); }
    pill(`${HEROIC[G.ask.k].shout} · 6″`, q.x, q.y - R, COL.accent);
  }
  // Heroic Challenges: a gold line between the two Heroes.
  for (const c of G.challenges || []) {
    const a = G.units.find(u => u.id === c.a), t = G.units.find(u => u.id === c.t);
    if (!a || !t || !alive(a) || !alive(t)) continue;
    const pa = P(a), pt = P(t);
    seg(pa.x, pa.y, pt.x, pt.y, c.acc ? 'rgba(242,196,92,0.75)' : 'rgba(242,196,92,0.35)', [2, 6], c.acc ? 2 : 1.2);
  }
  // Previews: planned move or charge, or a line of fire.
  const pv = G.preview;
  if (pv && s) {
    const p = P(s);
    if (pv.type === 'move' || pv.type === 'charge') {
      const Q = pv.P || pv.t, V = pv.P && pv.P.via;
      const c = pv.ok ? COL.ok : COL.bad;
      if (V) { seg(p.x, p.y, V.x, V.y, c, [5, 4], 2); seg(V.x, V.y, Q.x, Q.y, c, [5, 4], 2); } else seg(p.x, p.y, Q.x, Q.y, c, [5, 4], 2);
      if (pv.type === 'move' || pv.ok) drawGhost(ctx, s, Q.x * S, Q.y * S, s.r * S, c, DPR);
      const cav = pv.type === 'charge' && pv.ok && s.cav ? (pv.t.cav || pv.t.T.mount ? ' · no bonus vs cavalry' : pv.P.over ? ' · no bonus across a Barrier' : inBrush(pv.P.x, pv.P.y, s.r) ? ' · no bonus in the brush' : ' · Cavalry Charge') : '';
      const label = pv.ok ? (pv.type === 'charge' ? `charge ${fmt(pv.cost)}″${pv.P && pv.P.over ? ` over the ${pv.P.over.T.k}` : ''}${cav}` : `${fmt(pv.cost)}″ · ${fmt(Math.max(0, remaining(s) - pv.cost))}″ left${pv.contact ? ' · base contact' : ''}`)
        : pv.cost != null ? `${fmtUp(pv.cost)}″ / ${fmtDown(remaining(s))}″` : 'not allowed';
      pill(label, Q.x, Q.y - s.r - 0.75, c);
      if (G.fire && pv.type === 'move' && pv.ok) drawFire(G.fire, s, true);
    } else if (pv.type === 'cross') {
      // A Jump, Leap or Climb Test: walk to the barrier (dashed), cross it (solid), land (ghost).
      const X = pv.X, C = X.contact, Q = X.landing, col = COL.accent;
      seg(p.x, p.y, C.x, C.y, COL.ok, [5, 4], 2); seg(C.x, C.y, Q.x, Q.y, col, [], 3);
      drawGhost(ctx, s, Q.x * S, Q.y * S, s.r * S, col, DPR);
      const name = X.kind === 'leap' ? 'Leap' : X.kind === 'jump' ? 'Jump' : 'Climb';
      pill(`${name} Test · ${fmt(pv.cost)}″${X.partial ? ' · partway' : ''}`, Q.x, Q.y - s.r - 0.75, col);
    } else if (pv.type === 'deploy') {
      const c = pv.ok ? COL.ok : COL.bad;
      drawGhost(ctx, s, pv.P.x * S, pv.P.y * S, s.r * S, c, DPR);
      if (!pv.ok) pill('not here', pv.P.x, pv.P.y - s.r - 0.75, c);
    } else if (pv.type === 'shot') {
      const T = P(pv.t), ok = pv.info.ok;
      if (pv.info.itw) viewWedge(p, T, pv.t.r, ok ? COL.ok : COL.bad);
      seg(p.x, p.y, T.x, T.y, ok ? COL.ok : COL.bad, ok ? [] : [5, 4], 2);
      for (const ob of pv.info.itw || []) diamond(ob.pt.x, ob.pt.y);
      if (ok) {
        if (prefs.odds) pill(`${pct(pv.info.p)} to wound`, (p.x + T.x) / 2, (p.y + T.y) / 2 - 0.6, COL.ok);
      }
    }
  }
  if (G.fire && s && !pv) drawFire(G.fire, s, false);
  if (G.aimAt && s) { const p = P(s), T = P(G.aimAt); seg(p.x, p.y, T.x, T.y, COL.bad, [], 2); }
  drawCombats(P);
  if (G.curFight) for (const u of G.curFight) if (alive(u)) { const p = P(u); ring(p.x, p.y, u.r + 0.34, COL.accent, [3, 3], 2); }

  // Tokens, back to front so lower tokens overlap upper ones.
  const live = G.units.filter(alive).sort((a, b) => a.y - b.y);
  for (const u of live) {
    const p = P(u);
    if (u.cav) trackHeading(u, p.x, p.y, () => live.filter(o => o.side !== u.side).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]);
    drawToken(ctx, u, p.x * S, p.y * S, u.r * S, tokenState(u), now, DPR);
  }
  // The models of a log line just opened (logview.js) pulse for a moment.
  if (G.logFlash) {
    const age = performance.now() - G.logFlash.t;
    if (age > 2000) G.logFlash = null;
    else for (const id of G.logFlash.ids) { const u = G.units.find(o => o.id === id); if (u && alive(u)) { const p = P(u); ring(p.x, p.y, u.r + 0.35 + 0.15 * Math.sin(age / 110), COL.accent, [], 3); } }
  }

  // Bursts where enemies are in base contact (in the Fight phase only inside the same Combat).
  const sameCombat = (a, b) => !G.combats || G.phase !== 'fight' || G.combats.some(c => c.includes(a) && c.includes(b));
  for (const a of live) {
    if (a.side !== 'good') continue;
    for (const b of live) {
      if (b.side !== 'evil' || !touching(a, b) || !sameCombat(a, b)) continue;
      const pa = P(a), pb = P(b), k = a.r / (a.r + b.r);
      clash(pa.x + (pb.x - pa.x) * k, pa.y + (pb.y - pa.y) * k);
    }
  }
  drawFx(now);

  drawCombatLabels(P);
  drawPicks(P);

  // Models partway up a cliff.
  for (const u of G.units) {
    if (!alive(u) || !u.climb) continue;
    const p = P(u);
    pill(`climbing ${fmt(u.climb.z - u.climb.foot)}″`, p.x, p.y - u.r - 0.5, COL.accent, fpx(12, SANS));
  }
  // Status tokens beside the bases and Might/Will/Fate pips under the Heroes, over every token (status.js, tokens.js).
  // The pips move round the base to a spot no other base or status token covers.
  hoverTok = null;
  const bases = live.map(o => { const q = P(o); return { u: o, x: q.x * S, y: q.y * S, r: o.r * S }; });
  let hoverMwf = null;
  for (const u of live) {
    const p = P(u), x = p.x * S, y = p.y * S, R = u.r * S, toks = tokensOf(u);
    if (u.mwf) {
      const obst = bases.filter(b => b.u !== u).concat(statusSpots(x, y, R, toks, Z));
      const at = drawMWF(ctx, u, x, y, R, Z, obst);
      if (u === hu) hoverMwf = at;
    }
    drawStatus(ctx, u, x, y, R, toks, Z);
    if (G.hoverPt) for (const sp of statusSpots(x, y, R, toks, Z)) if (Math.hypot(G.hoverPt.x * S - sp.x, G.hoverPt.y * S - sp.y) <= sp.r + 1) hoverTok = sp;
  }
  if (hoverTok) tokenTip(hoverTok);

  drawAuras(P);
  drawTools(P);

  // Name tag for the model under the pointer.
  if (hu && alive(hu) && G.mode !== 'backaway' && !hoverTok) { const p = P(hu); pill(hu.name, p.x, p.y + hu.r + 0.55 + (hoverMwf && hoverMwf.below ? mwfHeight(hu, hu.r * S, Z) / S : 0), '#f1eadb', fpx(14, SANS)); }
}
