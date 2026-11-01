// Table geometry in inches. Models are circles (x, y, r); terrain pieces are rectangles {x, y, w, h}, turned by
// a degrees (clockwise on the board, y down) about their centre, or about (ox, oy) when given: the sight boxes of a
// turned piece turn about the piece's centre. {x, y, w, h} is the rectangle before it turns. Every test below moves
// the point or segment into the piece's own frame (toLocal) and does the axis-aligned sum there; with no a it takes
// exactly the old path, so unturned pieces give the same numbers to the last bit.
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Levels: terrain.js tells how high a model or a point stands (raised ground, a model partway up a cliff).
// Models on different levels never touch, and the height between them adds to the gap (so 1″ Control Zones
// do not reach up a cliff).
let levelOf = () => 0, levelAtPoint = () => 0;
export function setLevels(ofModel, atPoint) { levelOf = ofModel; levelAtPoint = atPoint; }
const lifted = (g, dz) => (dz > 0.05 ? Math.max(g, 0) + dz : g);
export const gap = (a, b) => lifted(dist(a, b) - a.r - b.r, Math.abs(levelOf(a) - levelOf(b)));   // base edge to base edge
export const gapXY = (x, y, r, b) => lifted(Math.hypot(b.x - x, b.y - y) - r - b.r, Math.abs(levelAtPoint(x, y) - levelOf(b)));

/* ---------- The piece's own frame ---------- */
const DEG = Math.PI / 180;
export const pieceCentre = T => (T.ox != null ? { x: T.ox, y: T.oy } : { x: T.x + T.w / 2, y: T.y + T.h / 2 });
// A curving river from its centreline pts ([[x, y], ...], inches) and width w: one turned piece per stretch, each
// lengthened by half the width at both ends, so a bend of up to 90 degrees leaves no gap and a slanted end still meets
// the board edge (let the line start and end on the edges; an end inside the board reaches w/2 past its point). The
// engine sees only these rectangles; they share `band` ({ pts, w }: the line with its ends lengthened the same way)
// so the board can draw the river as one smooth strip. props: shallow or deep, label.
export function riverPieces(pts, w, props = {}) {
  const ext = (a, b) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; return [a[0] + (a[0] - b[0]) / d * w / 2, a[1] + (a[1] - b[1]) / d * w / 2]; };
  const band = { pts: [ext(pts[0], pts[1]), ...pts.slice(1, -1), ext(pts[pts.length - 1], pts[pts.length - 2])], w };
  return pts.slice(1).map((p, i) => {
    const q = pts[i], dx = p[0] - q[0], dy = p[1] - q[1], L = Math.hypot(dx, dy) + w, cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2;
    return { k: 'water', ...props, x: cx - L / 2, y: cy - w / 2, w: L, h: w, a: Math.atan2(dy, dx) / DEG, band };
  });
}
// A board point in T's own frame (turned back by a about its centre), and back again.
export function toLocal(T, x, y) {
  if (!T.a) return { x, y };
  const c = pieceCentre(T), co = Math.cos(T.a * DEG), si = Math.sin(T.a * DEG), dx = x - c.x, dy = y - c.y;
  return { x: c.x + dx * co + dy * si, y: c.y - dx * si + dy * co };
}
export function fromLocal(T, u, v) {
  if (!T.a) return { x: u, y: v };
  const c = pieceCentre(T), co = Math.cos(T.a * DEG), si = Math.sin(T.a * DEG), du = u - c.x, dv = v - c.y;
  return { x: c.x + du * co - dv * si, y: c.y + du * si + dv * co };
}
// The four corners on the board, clockwise from the rectangle's own top left.
export const cornersOf = T => [[T.x, T.y], [T.x + T.w, T.y], [T.x + T.w, T.y + T.h], [T.x, T.y + T.h]].map(([u, v]) => fromLocal(T, u, v));
// The axis-aligned box around the piece on the board (the piece itself when it is not turned): for quick misses.
const boxes = new WeakMap();
export function pieceBox(T) {
  if (!T.a) return T;
  const key = `${T.x},${T.y},${T.w},${T.h},${T.a},${T.ox},${T.oy}`, c = boxes.get(T);
  if (c && c.key === key) return c.box;
  const P = cornersOf(T), xs = P.map(p => p.x), ys = P.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys);
  const box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  boxes.set(T, { key, box });
  return box;
}
// The four sides on the board, each with the unit vector pointing out of the piece: n, e, s, w in its own frame.
export function edgesOf(T) {
  const [a, b, c, d] = cornersOf(T), r = (T.a || 0) * DEG, co = Math.cos(r), si = Math.sin(r);
  const out = (nx, ny) => ({ nx: nx * co - ny * si, ny: nx * si + ny * co });
  return [
    { side: 'n', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...out(0, -1) },
    { side: 'e', x1: b.x, y1: b.y, x2: c.x, y2: c.y, ...out(1, 0) },
    { side: 's', x1: c.x, y1: c.y, x2: d.x, y2: d.y, ...out(0, 1) },
    { side: 'w', x1: d.x, y1: d.y, x2: a.x, y2: a.y, ...out(-1, 0) },
  ];
}

/* ---------- Points, bases and lines against a piece ---------- */
export function ptIn(x, y, T) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  return x >= T.x && x <= T.x + T.w && y >= T.y && y <= T.y + T.h;
}
// Does a base of radius r at (x, y) overlap the piece (more than a hair)?
export function circleRect(x, y, r, T) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  const cx = Math.max(T.x, Math.min(x, T.x + T.w)), cy = Math.max(T.y, Math.min(y, T.y + T.h));
  return Math.hypot(x - cx, y - cy) < r - 0.001;
}
// How far the edge of a base of radius r at (x, y) is from the piece (negative when the base overlaps it).
export function rectGap(x, y, r, T) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  const cx = Math.max(T.x, Math.min(x, T.x + T.w)), cy = Math.max(T.y, Math.min(y, T.y + T.h));
  return x >= T.x && x <= T.x + T.w && y >= T.y && y <= T.y + T.h ? -r : Math.hypot(x - cx, y - cy) - r;
}
// How far the point is from the piece (0 inside it), and the nearest point of the piece.
export function rectDist(x, y, T) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  return Math.hypot(Math.max(T.x - x, 0, x - T.x - T.w), Math.max(T.y - y, 0, y - T.y - T.h));
}
export function rectNearest(x, y, T) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  const u = Math.max(T.x, Math.min(x, T.x + T.w)), v = Math.max(T.y, Math.min(y, T.y + T.h));
  return T.a ? fromLocal(T, u, v) : { x: u, y: v };
}
// The share of the way along (x1, y1)-(x2, y2) where it is inside the axis-aligned box B: [lo, hi], or null (slab test).
function slab(x1, y1, x2, y2, B) {
  let lo = 0, hi = 1;
  for (const [p, d, a, b] of [[x1, x2 - x1, B.x, B.x + B.w], [y1, y2 - y1, B.y, B.y + B.h]]) {
    if (Math.abs(d) < 1e-9) { if (p < a || p > b) return null; continue; }
    let t1 = (a - p) / d, t2 = (b - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1); hi = Math.min(hi, t2);
    if (lo > hi) return null;
  }
  return [lo, hi];
}
// Does the straight line from (x1, y1) to (x2, y2) cross the piece? (Turning does not change the share along it.)
export function segHitsRect(x1, y1, x2, y2, T) {
  if (T.a) ({ x: x1, y: y1 } = toLocal(T, x1, y1)), ({ x: x2, y: y2 } = toLocal(T, x2, y2));
  return slab(x1, y1, x2, y2, T) != null;
}
// Where (the share k of the way) the sight line from v's head (v.x, v.y, v.ez) to point P (x, y, z) first passes
// through box B below its top (B.top), or null.
export function lineHitsBox(v, P, B) {
  let x1 = v.x, y1 = v.y, x2 = P.x, y2 = P.y;
  if (B.a) ({ x: x1, y: y1 } = toLocal(B, x1, y1)), ({ x: x2, y: y2 } = toLocal(B, x2, y2));
  const s = slab(x1, y1, x2, y2, B);
  if (!s) return null;
  const [lo, hi] = s, z = k => v.ez + (P.z - v.ez) * k, top = B.top - 1e-3;
  if (z(lo) < top) return lo;
  if (z(hi) >= top) return null;
  return lo + (hi - lo) * (z(lo) - top) / (z(lo) - z(hi));   // where it dips below the top
}

/* ---------- Boxes against a piece ---------- */
// The piece's two axes on the board (unit vectors), for the separating-axis test.
const axesOf = T => { const r = T.a * DEG, co = Math.cos(r), si = Math.sin(r); return [[co, si], [-si, co]]; };
const project = (P, [ax, ay]) => { let lo = Infinity, hi = -Infinity; for (const p of P) { const d = p.x * ax + p.y * ay; if (d < lo) lo = d; if (d > hi) hi = d; } return [lo, hi]; };
// Do the axis-aligned box [x0, x1] × [y0, y1] and the piece overlap? strict: touching does not count.
export function boxHits(T, x0, y0, x1, y1, strict = true) {
  if (!T.a) return strict ? x1 > T.x && x0 < T.x + T.w && y1 > T.y && y0 < T.y + T.h : x1 >= T.x && x0 <= T.x + T.w && y1 >= T.y && y0 <= T.y + T.h;
  const P = cornersOf(T), Q = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  for (const ax of [[1, 0], [0, 1], ...axesOf(T)]) {
    const [a0, a1] = project(P, ax), [b0, b1] = project(Q, ax);
    if (strict ? !(b1 > a0 && b0 < a1) : !(b1 >= a0 && b0 <= a1)) return false;
  }
  return true;
}
// The square around a base of radius r at (x, y) against the piece (a quick, generous test).
export const squareHits = (x, y, r, T, strict = true) => boxHits(T, x - r, y - r, x + r, y + r, strict);
// Are pieces T and o at least gap apart (on some axis)? Used to lay out a table.
export function piecesClear(T, o, gap = 0) {
  if (!T.a && !o.a) return T.x + T.w + gap <= o.x || o.x + o.w + gap <= T.x || T.y + T.h + gap <= o.y || o.y + o.h + gap <= T.y;
  const P = cornersOf(T), Q = cornersOf(o);
  for (const ax of [...axesOf({ a: T.a || 0 }), ...axesOf({ a: o.a || 0 })]) {
    const [a0, a1] = project(P, ax), [b0, b1] = project(Q, ax);
    if (a1 + gap <= b0 || b1 + gap <= a0) return true;
  }
  return false;
}
