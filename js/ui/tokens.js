// Board tokens: a bevelled base in the side's colours with the unit's figure (see figures.js) seen from above.
// Each token is drawn once into an offscreen canvas and reused every frame.
import { TAU } from '../util.js';
import { drawFigure } from './figures.js';

const SIDE = {
  good: { rimA: '#9cbfe6', rimB: '#22446c', fieldA: '#4373ad', fieldB: '#142d4b', edge: '#0b1c31', mark: '#173357' },
  evil: { rimA: '#e09479', rimB: '#5a1b10', fieldA: '#a5402b', fieldB: '#40110a', edge: '#250804', mark: '#4a150c' },
};
const GOLD = { rimA: '#f8e2a0', rimB: '#8a6214' };

/* ---------- Custom art ---------- */
// Put your own images (for example top-down photos of your painted miniatures) in assets/tokens/
// and list them in assets/tokens/tokens.json, e.g. { "orc": "orc.jpg", "warrior": "warrior.png" }.
// A listed image replaces the icon inside the base; the rim keeps the side's colour.
const art = new Map();
export async function loadTokenArt(onReady) {
  let list = {};
  try { const r = await fetch('assets/tokens/tokens.json', { cache: 'no-store' }); if (r.ok) list = await r.json(); } catch (e) { /* no custom art */ }
  await Promise.all(Object.entries(list).map(([type, file]) => new Promise(res => {
    const img = new Image();
    img.onload = () => { art.set(type, img); res(); };
    img.onerror = () => { console.warn(`Token image for "${type}" not found: assets/tokens/${file}`); res(); };
    img.src = 'assets/tokens/' + file;
  })));
  if (art.size) { cache.clear(); if (onReady) onReady(); }
}

/* ---------- Token images ---------- */
const cache = new Map();
export function clearTokenCache() { cache.clear(); }

// The image is drawn for R rounded up to a step of about 12%, and the callers scale it to R by img.R: zooming would
// otherwise draw every figure again at each step of the wheel.
function tokenImage(u, R0, dpr) {
  const step = Math.ceil(Math.log2(R0) * 6);
  const key = `${u.t}|${u.side}|${step}|${dpr}`;
  let img = cache.get(key);
  if (img) return img;
  const R = 2 ** (step / 6);
  const size = Math.ceil(R * 2 + 6);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(size * dpr); cv.height = Math.ceil(size * dpr);
  const c = cv.getContext('2d');
  c.scale(dpr, dpr); c.translate(size / 2, size / 2);
  const P = SIDE[u.side], rim = u.T.hero ? GOLD : P;

  // Rim of the base, lit from the top left.
  let g = c.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, rim.rimA); g.addColorStop(1, rim.rimB);
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(1, R * 0.06); c.strokeStyle = P.edge; c.stroke();

  // Recessed field.
  const f = R * 0.79;
  g = c.createRadialGradient(-f * 0.3, -f * 0.35, f * 0.1, 0, 0, f);
  g.addColorStop(0, P.fieldA); g.addColorStop(1, P.fieldB);
  c.beginPath(); c.arc(0, 0, f, 0, TAU); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(1, R * 0.05); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();

  // Highlight on the rim.
  c.beginPath(); c.arc(0, 0, R * 0.9, Math.PI * 1.05, Math.PI * 1.55);
  c.lineCap = 'round'; c.lineWidth = Math.max(1, R * 0.07); c.strokeStyle = 'rgba(255,255,255,0.38)'; c.stroke();

  const pic = art.get(u.t);
  if (u.cav && !pic) {
    // Cavalry: the mount and the rider in layers of their own, so drawToken can turn the mount.
    img = { cv, size, R, mount: figureLayer(u, R, dpr, size, 'mount'), rider: figureLayer(u, R, dpr, size, 'rider') };
    cache.set(key, img);
    return img;
  }
  if (pic) {
    // Custom art, cropped to the field like a photo glued onto the base.
    c.save();
    c.beginPath(); c.arc(0, 0, f, 0, TAU); c.clip();
    const k = Math.max((2 * f) / pic.width, (2 * f) / pic.height);
    c.drawImage(pic, -pic.width * k / 2, -pic.height * k / 2, pic.width * k, pic.height * k);
    const v = c.createRadialGradient(0, 0, f * 0.6, 0, 0, f);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = v; c.fillRect(-f, -f, 2 * f, 2 * f);
    c.restore();
  } else {
    // The figure, clipped to the base so long weapons may overhang the field onto the rim.
    c.save();
    c.beginPath(); c.arc(0, 0, R * 0.985, 0, TAU); c.clip();
    const k = f * 0.95;
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = R * 0.1 * dpr; c.shadowOffsetY = R * 0.04 * dpr;
    c.scale(k, k);
    drawFigure(c, u.T, k);
    c.restore();
  }

  img = { cv, size, R };
  cache.set(key, img);
  return img;
}
// One layer of a figure on a transparent canvas the size of the token.
function figureLayer(u, R, dpr, size, part) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(size * dpr); cv.height = Math.ceil(size * dpr);
  const c = cv.getContext('2d');
  c.scale(dpr, dpr); c.translate(size / 2, size / 2);
  c.beginPath(); c.arc(0, 0, R * 0.985, 0, TAU); c.clip();
  const k = R * 0.79 * 0.95;
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = R * 0.1 * dpr; c.shadowOffsetY = R * 0.04 * dpr;
  c.scale(k, k);
  drawFigure(c, u.T, k, part);
  return cv;
}
// The base image with the figure; a cavalry model's mount turned to `a` (radians, 0 = east) and its rider upright.
function blitToken(ctx, img, x, y, s, a) {
  ctx.drawImage(img.cv, x - s / 2, y - s / 2, s, s);
  if (!img.mount) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.drawImage(img.mount, -s / 2, -s / 2, s, s); ctx.restore();
  ctx.drawImage(img.rider, x - s / 2, y - s / 2, s, s);
}

/* ---------- Which way a mount faces ---------- */
// Drawing only: Cavalry has no facing rule. The way the model last moved; before its first move, towards aim()
// (the nearest enemy), else up the board.
const heading = new WeakMap();
export function trackHeading(u, x, y, aim) {
  let h = heading.get(u);
  if (!h) { const t = aim && aim(); h = { x, y, a: t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2 }; heading.set(u, h); }
  if (Math.hypot(x - h.x, y - h.y) > 0.05) { h.a = Math.atan2(y - h.y, x - h.x); h.x = x; h.y = y; }
  return h.a;
}
const headingNow = u => (heading.get(u) || { a: -Math.PI / 2 }).a;

// st: { dim, selected, hover, alpha, scale, moveLeft (0..1 or null) }
export function drawToken(ctx, u, x, y, R, st, now, dpr) {
  const lift = st.selected ? R * 0.14 : st.hover ? R * 0.06 : 0;
  const cy = y - lift;
  ctx.save();
  if (st.dim) ctx.globalAlpha = 0.5;
  if (st.alpha != null) ctx.globalAlpha *= st.alpha;

  // Soft shadow on the table; it spreads as the token lifts.
  const sx = x + lift * 0.35, sy = y + R * 0.14 + lift * 0.4, sr = R * 1.12 + lift * 0.8;
  const sg = ctx.createRadialGradient(sx, sy, R * 0.45, sx, sy, sr);
  sg.addColorStop(0, `rgba(0,0,0,${0.5 - lift / R * 0.8})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();

  const img = tokenImage(u, R, dpr);
  const sc = (st.scale || 1) * (1 + lift / R * 0.35);
  const s = img.size * (R / img.R) * sc;
  blitToken(ctx, img, x, cy, s, headingNow(u));

  // Wound pips along the bottom edge; a mount's Wounds beside the rider's, in brown.
  const rows = [u.maxW > 1 && [u.w, u.maxW, '#f2c45c'], u.cav && u.mount.maxW > 1 && [u.mount.w, u.mount.maxW, '#c89b6a']].filter(Boolean);
  const step = 0.42, span = rows.reduce((n, r) => n + r[1], 0) + (rows.length - 1) * 0.6;
  let at = -(span - 1) / 2;
  for (const [w, max, col] of rows) {
    for (let i = 0; i < max; i++, at++) {
      const a = Math.PI / 2 - at * step, px = x + Math.cos(a) * R * sc * 0.97, py = cy + Math.sin(a) * R * sc * 0.97;
      ctx.beginPath(); ctx.arc(px, py, Math.max(2.6, R * 0.15), 0, TAU);
      ctx.fillStyle = i < w ? col : '#2b2b2b'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
    }
    at += 0.6;
  }
  ctx.restore();

  // Engaged in Combat: a second, contrasting ring outside the base.
  if (st.engaged) {
    ctx.beginPath(); ctx.arc(x, cy, R * sc + 2.5, 0, TAU);
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff7a45'; ctx.stroke();
  }

  // Move left this turn, as an arc around the base.
  if (st.moveLeft != null && st.moveLeft > 0.01) {
    ctx.beginPath(); ctx.arc(x, cy, R * sc + 4, -Math.PI / 2, -Math.PI / 2 + TAU * st.moveLeft);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(242,196,92,0.95)'; ctx.stroke(); ctx.lineCap = 'butt';
  }
  if (st.selected) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 260);
    ctx.save(); ctx.shadowColor = 'rgba(242,196,92,0.9)'; ctx.shadowBlur = 10 * pulse;
    ctx.beginPath(); ctx.arc(x, cy, R * sc + (st.moveLeft != null ? 8 : 4), 0, TAU);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#f2c45c'; ctx.stroke(); ctx.restore();
  } else if (st.hover) {
    ctx.beginPath(); ctx.arc(x, cy, R * sc + 3, 0, TAU);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  }
}

// A see-through copy of the token at a planned position, outlined in the preview colour.
export function drawGhost(ctx, u, x, y, R, color, dpr) {
  const img = tokenImage(u, R, dpr);
  ctx.save();
  ctx.globalAlpha = 0.45;
  const S = R / u.r, dx = x / S - u.x, dy = y / S - u.y;   // a planned move: the mount faces where it goes
  blitToken(ctx, img, x, y, img.size * (R / img.R), Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) : headingNow(u));
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, R + 2, 0, TAU);
  ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
}

/* ---------- Status tokens and Might/Will/Fate pips ---------- */
// The status tokens of one model (status.js: tokensOf) as round counters touching the base edge, each kind at its own
// clock position. z: the board's text scale, the floor of a token's size so it stays legible. When the base is too
// small on screen for them, they fold into one "+n" badge (the cards list them); zooming in brings them back.
const tokenR = (R, z) => Math.max(R * 0.3, 4.5 * z);
const folds = (R, z, n) => n > 1 && R < 7.5 * z;
// Where each token of a model lands in pixels: [{ t, x, y, r }] (t: the token, or { fold: n } for the badge).
export function statusSpots(x, y, R, toks, z) {
  if (!toks.length) return [];
  const r = tokenR(R, z), d = R + r * 0.35;
  const at = (deg, t) => { const a = (deg - 90) * Math.PI / 180; return { t, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r }; };
  return folds(R, z, toks.length) ? [at(45, { fold: toks.length, lines: toks.map(t => t.n) })] : toks.map(t => at(t.at, t));
}
const GLYPH = {
  heroic: (c, g) => letter(c, 'H', g),
  courage: (c, g) => letter(c, '!', g),
  prone: (c, g) => { c.beginPath(); c.roundRect ? c.roundRect(-g * 0.55, -g * 0.17, g * 1.1, g * 0.34, g * 0.17) : c.rect(-g * 0.55, -g * 0.17, g * 1.1, g * 0.34); c.fill(); },
  thrown: (c, g) => stroke(c, g, [[-0.45, -0.35], [0, 0.25], [0.45, -0.35]]),
  trapped: (c, g) => { stroke(c, g, [[-0.38, -0.38], [0.38, 0.38]]); stroke(c, g, [[0.38, -0.38], [-0.38, 0.38]]); },
  spell: (c, g) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? g * 0.22 : g * 0.62; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); },
  moved: (c, g) => { stroke(c, g, [[-0.45, -0.35], [-0.1, 0], [-0.45, 0.35]]); stroke(c, g, [[0.05, -0.35], [0.4, 0], [0.05, 0.35]]); },
  shot: (c, g) => { stroke(c, g, [[-0.4, 0.4], [0.4, -0.4]]); stroke(c, g, [[0, -0.42], [0.42, -0.42], [0.42, 0]]); },
};
function letter(c, ch, g) { c.font = `800 ${Math.round(g * 1.25)}px "Segoe UI", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 0, g * 0.06); }
function stroke(c, g, pts) { c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px * g, py * g) : c.moveTo(px * g, py * g))); c.lineWidth = Math.max(1.4, g * 0.24); c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
// One token disc at (x, y), radius r. side: an enemy's Heroic Action is drawn red.
export function drawStatusToken(ctx, t, x, y, r, side) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = t.fold ? '#f1eadb' : t.k === 'heroic' && side !== 'good' ? '#e86a5a' : t.col; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = '#14100a'; ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle = '#1a140c';
  if (t.fold) letter(ctx, `+${t.fold}`, r * (t.fold > 9 ? 0.62 : 0.8));
  else if (GLYPH[t.k]) GLYPH[t.k](ctx, r * 0.8);
  ctx.restore();
}
export function drawStatus(ctx, u, x, y, R, toks, z) {
  for (const s of statusSpots(x, y, R, toks, z)) drawStatusToken(ctx, s.t, s.x, s.y, s.r, u.side);
}

// Might, Will and Fate as three short rows of pips beside a Hero's base (rows of 0 are left out). Returns the height
// the block takes, so a name tag can go below it.
export function mwfHeight(u, R, z) {
  if (!u.mwf || folds(R, z, 2)) return 0;
  const p = Math.max(1.7 * z, R * 0.09);
  return u.mwf.filter(n => n > 0).length * p * 2.6 + p;
}
const MWF_COL = ['#e8803a', '#6fa8f0', '#5cc47a'];
// Where the block goes: under the base unless something covers that spot (obst: circles {x, y, r} in pixels, such as
// other bases and the model's own status tokens); then above, to the right, to the left or on a diagonal, whichever
// is clear, or the least covered when none is. below: it is under the base (the name tag then goes under it).
export function mwfPlace(u, x, y, R, z, obst = []) {
  if (!mwfHeight(u, R, z)) return null;
  const p = Math.max(1.7 * z, R * 0.09), rows = u.mwf.filter(n => n > 0).length, cols = Math.max(...u.mwf);
  const w = (cols - 1) * p * 2.5 + 2 * p, h = (rows - 1) * p * 2.6 + 2 * p, g = R + p * 1.2;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let best = null;
  for (const [dx, dy] of dirs) {
    const k = dx && dy ? Math.SQRT1_2 : 1;
    const cx = x + dx * (g * k + w / 2), cy = y + dy * (g * k + h / 2);
    let cover = 0;
    for (const o of obst) {
      const nx = Math.max(cx - w / 2, Math.min(o.x, cx + w / 2)), ny = Math.max(cy - h / 2, Math.min(o.y, cy + h / 2));
      const d = Math.hypot(o.x - nx, o.y - ny);
      if (d < o.r + p * 0.5) cover += o.r + p * 0.5 - d;
    }
    if (!best || cover < best.cover - 0.01) best = { cx, cy, w, h, p, cover, below: dx === 0 && dy === 1 };
    if (cover === 0) break;
  }
  return best;
}
export function drawMWF(ctx, u, x, y, R, z, obst) {
  const at = mwfPlace(u, x, y, R, z, obst);
  if (!at) return null;
  const { p } = at, have = [u.might, u.will, u.fate];
  let row = 0;
  for (let k = 0; k < 3; k++) {
    const max = u.mwf[k];
    if (!max) continue;
    const py = at.cy - at.h / 2 + p + row * p * 2.6;
    for (let i = 0; i < max; i++) {
      const px = at.cx + (i - (max - 1) / 2) * p * 2.5;
      ctx.beginPath(); ctx.arc(px, py, p, 0, TAU);
      ctx.fillStyle = i < have[k] ? MWF_COL[k] : 'rgba(20,20,20,0.85)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
    }
    row++;
  }
  return at;
}

// A token drawn alone (the legend in the Rules tab), as a data URL.
export function statusIcon(t, px = 40) {
  const c = document.createElement('canvas'), d = window.devicePixelRatio || 1;
  c.width = c.height = Math.round(px * d);
  const x = c.getContext('2d'); x.scale(d, d);
  drawStatusToken(x, t, px / 2, px / 2, px / 2 - 2, 'good');
  return c.toDataURL();
}
