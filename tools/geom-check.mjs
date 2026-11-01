// Geometry check for turned terrain pieces (js/engine/geometry.js): node tools/geom-check.mjs
// 1. With no angle every function gives exactly what the old axis-aligned code gave (random samples).
// 2. A piece turned 90° behaves like the same piece with w and h swapped about the same centre.
// 3. A few cases at 45° worked out by hand.
import * as Gm from '../js/engine/geometry.js';

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL', what); } };
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const R = (a, b) => a + (b - a) * rnd();

// The old code, copied from rules.js / geometry.js before turning was added.
const old = {
  ptIn: (x, y, T) => x >= T.x && x <= T.x + T.w && y >= T.y && y <= T.y + T.h,
  circleRect(x, y, r, T) { const cx = Math.max(T.x, Math.min(x, T.x + T.w)), cy = Math.max(T.y, Math.min(y, T.y + T.h)); return Math.hypot(x - cx, y - cy) < r - 0.001; },
  rectGap(x, y, r, T) { const cx = Math.max(T.x, Math.min(x, T.x + T.w)), cy = Math.max(T.y, Math.min(y, T.y + T.h)); return old.ptIn(x, y, T) ? -r : Math.hypot(x - cx, y - cy) - r; },
  rectDist: (x, y, T) => Math.hypot(Math.max(T.x - x, 0, x - T.x - T.w), Math.max(T.y - y, 0, y - T.y - T.h)),
  rectNearest: (x, y, T) => ({ x: Math.max(T.x, Math.min(x, T.x + T.w)), y: Math.max(T.y, Math.min(y, T.y + T.h)) }),
  segHitsRect(x1, y1, x2, y2, T) {
    let lo = 0, hi = 1;
    for (const [p, d, a, b] of [[x1, x2 - x1, T.x, T.x + T.w], [y1, y2 - y1, T.y, T.y + T.h]]) {
      if (Math.abs(d) < 1e-9) { if (p < a || p > b) return false; continue; }
      let t1 = (a - p) / d, t2 = (b - p) / d; if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1); hi = Math.min(hi, t2); if (lo > hi) return false;
    }
    return true;
  },
  lineHitsBox(v, P, B) {
    let lo = 0, hi = 1;
    for (const [p, d, a, b] of [[v.x, P.x - v.x, B.x, B.x + B.w], [v.y, P.y - v.y, B.y, B.y + B.h]]) {
      if (Math.abs(d) < 1e-9) { if (p < a || p > b) return null; continue; }
      let t1 = (a - p) / d, t2 = (b - p) / d; if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1); hi = Math.min(hi, t2); if (lo > hi) return null;
    }
    const z = k => v.ez + (P.z - v.ez) * k, top = B.top - 1e-3;
    if (z(lo) < top) return lo; if (z(hi) >= top) return null;
    return lo + (hi - lo) * (z(lo) - top) / (z(lo) - z(hi));
  },
  boxHits: (T, x0, y0, x1, y1) => x1 > T.x && x0 < T.x + T.w && y1 > T.y && y0 < T.y + T.h,
  clear: (T, o, g) => T.x + T.w + g <= o.x || o.x + o.w + g <= T.x || T.y + T.h + g <= o.y || o.y + o.h + g <= T.y,
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const piece = () => ({ x: Math.round(R(0, 40) * 4) / 4, y: Math.round(R(0, 40) * 4) / 4, w: Math.round(R(0.5, 10) * 4) / 4, h: Math.round(R(0.5, 10) * 4) / 4, top: R(0.2, 4) });

// 1. No angle: bit for bit the old results (a: 0 too).
let n1 = 0;
for (let i = 0; i < 4000; i++) {
  const T = piece(); if (i % 2) T.a = 0;
  const x = R(-5, 55), y = R(-5, 55), r = R(0.3, 2), x2 = R(-5, 55), y2 = R(-5, 55), v = { x, y, ez: R(0, 4) }, P = { x: x2, y: y2, z: R(0, 3) }, o = piece();
  const checks = [
    ['ptIn', Gm.ptIn(x, y, T), old.ptIn(x, y, T)], ['circleRect', Gm.circleRect(x, y, r, T), old.circleRect(x, y, r, T)],
    ['rectGap', Gm.rectGap(x, y, r, T), old.rectGap(x, y, r, T)], ['rectDist', Gm.rectDist(x, y, T), old.rectDist(x, y, T)],
    ['rectNearest', Gm.rectNearest(x, y, T), old.rectNearest(x, y, T)], ['segHitsRect', Gm.segHitsRect(x, y, x2, y2, T), old.segHitsRect(x, y, x2, y2, T)],
    ['lineHitsBox', Gm.lineHitsBox(v, P, T), old.lineHitsBox(v, P, T)], ['squareHits', Gm.squareHits(x, y, r, T), old.boxHits(T, x - r, y - r, x + r, y + r)],
    ['piecesClear', Gm.piecesClear(T, o, 2.2), old.clear(T, o, 2.2)], ['pieceBox', Gm.pieceBox(T) === T, true],
  ];
  for (const [k, a, b] of checks) { n1++; ok(same(a, b), `a=0 ${k} ${JSON.stringify({ T, x, y, r, x2, y2 })}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }
}

// 2. Turned 90° = w and h swapped about the same centre.
const swapped = T => { const cx = T.x + T.w / 2, cy = T.y + T.h / 2; return { x: cx - T.h / 2, y: cy - T.w / 2, w: T.h, h: T.w, top: T.top }; };
const near = (a, b, e = 1e-9) => (typeof a === 'number' ? Math.abs(a - b) < e : typeof a === 'object' && a ? Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e : a === b);
let n2 = 0, edge = 0;
for (let i = 0; i < 4000; i++) {
  const T = { ...piece(), a: i % 2 ? 90 : -90 }, S = swapped(T);
  const x = R(-5, 55), y = R(-5, 55), r = R(0.3, 2), x2 = R(-5, 55), y2 = R(-5, 55), v = { x, y, ez: R(0, 4) }, P = { x: x2, y: y2, z: R(0, 3) };
  // Skip points within a hair of a side, where rounding in the turn can tip a comparison either way.
  const d = Gm.rectDist(x, y, S), g = Math.abs(d - r);
  if (g < 1e-6 || (d === 0 && Math.min(x - S.x, S.x + S.w - x, y - S.y, S.y + S.h - y) < 1e-6)) { edge++; continue; }
  const checks = [
    ['ptIn', Gm.ptIn(x, y, T), Gm.ptIn(x, y, S)], ['circleRect', Gm.circleRect(x, y, r, T), Gm.circleRect(x, y, r, S)],
    ['rectGap', Gm.rectGap(x, y, r, T), Gm.rectGap(x, y, r, S)], ['rectDist', Gm.rectDist(x, y, T), Gm.rectDist(x, y, S)],
    ['rectNearest', Gm.rectNearest(x, y, T), Gm.rectNearest(x, y, S)], ['segHitsRect', Gm.segHitsRect(x, y, x2, y2, T), Gm.segHitsRect(x, y, x2, y2, S)],
    ['lineHitsBox', Gm.lineHitsBox(v, P, T), Gm.lineHitsBox(v, P, S)], ['squareHits', Gm.squareHits(x, y, r, T), Gm.squareHits(x, y, r, S)],
  ];
  const bx = Gm.pieceBox(T);
  checks.push(['pieceBox', near(bx.x, S.x) && near(bx.y, S.y) && near(bx.w, S.w) && near(bx.h, S.h), true]);
  for (const [k, a, b] of checks) { n2++; ok(a === b || near(a, b) || (a == null && b == null), `90° ${k} ${JSON.stringify({ T, x, y, r })}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }
}

// 3. By hand at 45°: a 4×2 piece centred on (10, 10).
const D = { x: 8, y: 9, w: 4, h: 2, a: 45, top: 2 }, s2 = Math.SQRT2;
ok(Gm.ptIn(10, 10, D), '45° centre inside');
ok(Gm.ptIn(10 + 1.9 / s2, 10 + 1.9 / s2, D), '45° along the long axis (down right) inside');
ok(!Gm.ptIn(12, 10, D), '45° (12, 10): beyond the short half-width 1 of the turned piece');
ok(!Gm.ptIn(10 + 2.1 / s2, 10 + 2.1 / s2, D), '45° past the end of the long axis');
ok(near(Gm.rectDist(10 - 2 / s2, 10 + 2 / s2, D), 1), '45° 2″ off the centre across the long side: 1″ away');
ok(near(Gm.rectGap(10 - 2 / s2, 10 + 2 / s2, 0.5, D), 0.5), '45° base gap');
ok(Gm.circleRect(10 - 2 / s2, 10 + 2 / s2, 1.1, D) && !Gm.circleRect(10 - 2 / s2, 10 + 2 / s2, 0.9, D), '45° base overlap at 1″');
ok(near(Gm.rectNearest(10 - 2 / s2, 10 + 2 / s2, D), { x: 10 - 1 / s2, y: 10 + 1 / s2 }), '45° nearest point on the long side');
ok(Gm.segHitsRect(5, 15, 15, 5, D), '45° line across the middle');
ok(!Gm.segHitsRect(12, 7, 14, 9, D), '45° line beside it (the bounding box would say yes)');
ok(Gm.squareHits(12.3, 8.3, 0.3, D) === false && Gm.boxHits(Gm.pieceBox(D), 12, 8, 12.6, 8.6), '45° square in the corner of the bounding box misses the piece');
const bx = Gm.pieceBox(D), half = (4 + 2) / 2 / s2;
ok(near(bx.x, 10 - half) && near(bx.w, 2 * half) && near(bx.h, 2 * half), '45° bounding box 6/√2 across');
const E = Gm.edgesOf(D);
ok(E.length === 4 && near(E[0].nx, 1 / s2) && near(E[0].ny, -1 / s2) && near(E[2].nx, -1 / s2) && near(E[2].ny, 1 / s2), '45° edge normals (n side faces up right)');
ok(near(Gm.toLocal(D, ...Object.values(Gm.fromLocal(D, 9, 9.5))), { x: 9, y: 9.5 }), 'toLocal undoes fromLocal');
ok(Gm.piecesClear(D, { x: 12.5, y: 6, w: 1, h: 1 }, 0.1) && !Gm.piecesClear(D, { x: 11, y: 10.5, w: 1, h: 1 }, 0), '45° separating axes');
ok(Gm.lineHitsBox({ x: 5, y: 15, ez: 1 }, { x: 15, y: 5, z: 1 }, D) != null && Gm.lineHitsBox({ x: 5, y: 15, ez: 3 }, { x: 15, y: 5, z: 3 }, D) == null, '45° sight line below and above the top');
const sub = { x: 8, y: 9, w: 2, h: 2, a: 45, ox: 10, oy: 10, top: 2 };   // the left half, turned about the piece's centre
ok(Gm.ptIn(10 - 1 / s2, 10 - 1 / s2, sub) && !Gm.ptIn(10 + 1 / s2, 10 + 1 / s2, sub), '45° sub-box turns about the piece centre (ox, oy)');

// 4. The rules engine on a turned piece: a piece turned 90° plays exactly like the same piece with w and h swapped
// (moving, Control Zones, Line of Sight and In The Way, charging, defending), and charges over walls turned 45°.
globalThis.matchMedia = () => ({ matches: false });
process.removeAllListeners('warning');
const st = await import('../js/state.js');
const Ru = await import('../js/engine/rules.js');
const Si = await import('../js/engine/sim.js');
const He = await import('../js/engine/heroes.js');
function table(units, terrain) {
  Si.startGame({ board: [24, 18], terrain, units, check: () => null, status: () => '', priority: 'good' }, { heroics: He.HEROIC_KEYS, broken: true, shielding: true, standFast: true });
  st.G.units.forEach(u => { u.decl = {}; });
  return st.G.units;
}
const f5 = v => (typeof v === 'number' ? +v.toFixed(5) : v);
const KINDS = [
  () => ({ k: 'rock', w: R(1, 4), h: R(1, 4) }), () => ({ k: 'brush', w: R(2, 5), h: R(2, 5) }),
  () => ({ k: 'wall', w: R(3, 7), h: 0.5 }), () => ({ k: 'hedge', w: R(3, 7), h: 0.6, ht: 1 }),
  () => ({ k: 'building', house: true, w: R(3, 6), h: R(2.5, 4.5) }), () => ({ k: 'plateau', w: R(3, 7), h: R(3, 7), z: 1 }),
];
function probe(units, piece, pts) {
  const [a, b] = table(units, [piece]), i = Ru.shotInfo(a, b), c = Ru.chargeSpot(b, a, 10);
  return JSON.stringify({
    shot: [i.ok, i.rule || '', (i.itw || []).map(o => o.name).join(), (i.ignored || []).map(o => o.k).join()],
    moves: pts.map(P => { const v = Ru.validateMove(a, P, 6); return [v.ok, v.rule || '', f5(v.cost)]; }),
    zone: pts.map(P => Ru.zoneBlocked(b, P.x, P.y)),
    charge: c && [f5(c.x), f5(c.y), f5(c.cost), !!c.over],
    defends: [!!Ru.defends(a), !!Ru.defends(b)],
  });
}
let n4 = 0;
for (let i = 0; i < 400; i++) {
  const K = KINDS[i % KINDS.length](), cx = R(8, 16), cy = R(6, 12);
  const S = { ...K, x: cx - K.w / 2, y: cy - K.h / 2 }, T = { ...K, w: K.h, h: K.w, x: cx - K.h / 2, y: cy - K.w / 2, a: i % 2 ? 90 : -90 };
  // Half the samples put the bowman against the piece (defending a wall, shooting over it).
  const near = i % 4 < 2, sx = near ? cx + (rnd() < 0.5 ? -1 : 1) * (S.w / 2 + 0.55) : R(1, 23), sy = near ? R(S.y, S.y + S.h) : R(1, 17);
  const units = [{ t: 'warriorOfRohanBow', side: 'good', x: sx, y: sy }, { t: 'mordorOrc', side: 'evil', x: R(1, 23), y: R(1, 17) }];
  const pts = [0, 1, 2].map(() => ({ x: R(1, 23), y: R(1, 17) }));
  const a = probe(units, S, pts), b = probe(units, T, pts);
  n4++; ok(a === b, `90° play ${K.k} ${JSON.stringify({ S, units, pts })}:\n  plain  ${a}\n  turned ${b}`);
}
// A wall turned 45°: the defender stands against it; a charger on the other side stops against the wall on its own side.
{
  const W = { k: 'wall', x: 9, y: 8.75, w: 6, h: 0.5, ht: 0.75, a: 45 }, n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };   // the wall's n side faces up right
  const at = d => ({ x: 12 + n.x * d, y: 9 + n.y * d });
  const [def, att] = table([{ t: 'warriorOfRohan', side: 'good', ...at(0.25 + 0.52) }, { t: 'mordorOrc', side: 'evil', ...at(-4) }], [W]);
  const c = Ru.chargeSpot(att, def, 10);
  ok(!!Ru.defends(def), '45° wall: the man against it defends it');
  ok(Ru.wallSide(W, def.x, def.y) !== Ru.wallSide(W, att.x, att.y), '45° wall: the two models are on opposite sides');
  ok(c && c.over && Math.abs(Ru.rectGap(c.x, c.y, att.r, W) - 0.03) < 1e-6 && Ru.wallSide(W, c.x, c.y) === Ru.wallSide(W, att.x, att.y),
    `45° wall: the charger stops against the wall on its own side ${JSON.stringify(c && { x: c.x, y: c.y })}`);
  const [d2] = table([{ t: 'warriorOfRohan', side: 'good', x: 12 + 1.2, y: 9 - 1.2 }], [W]);   // the bounding box corner, clear of the wall
  ok(!Ru.defends(d2), '45° wall: a man in the corner of its bounding box does not touch it');
}

// A doorway (p. 57): the charger stops in its mouth, across the long side, turned with the door.
{
  const D0 = { k: 'door', x: 11.4, y: 8.85, w: 1.2, h: 0.3 }, D90 = { k: 'door', x: 11.85, y: 8.4, w: 0.3, h: 1.2, a: 90 };
  const units = [{ t: 'warriorOfRohan', side: 'good', x: 12, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 13, y: 13 }];
  const pts = [{ x: 12, y: 12 }, { x: 10, y: 6 }, { x: 15, y: 9 }];
  n4++; ok(probe(units, D0, pts) === probe(units, D90, pts), 'door turned 90° plays like the plain one');
  const D45 = { ...D0, a: 45 }, [def, att] = table(units, [D45]), c = Ru.chargeSpot(att, def, 10);
  const L = c && Gm.toLocal(D45, c.x, c.y);
  ok(Ru.doorOf(def) === D45 && c && c.over && Math.abs(L.x - 12) < 1e-6 && L.y > 9, `door turned 45°: the charger stands across its long side ${JSON.stringify(L)}`);
}

console.log(`no angle: ${n1} comparisons; 90°: ${n2} comparisons (${edge} samples on a side skipped); rules engine at 90°: ${n4} tables`);
console.log(`${pass} checks passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
