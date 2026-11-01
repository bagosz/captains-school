// Sieges (2024 Rules Manual, p. 158–163): fortress walls, gates and doors, Siege Ladders and the Grand Siege. No drawing
// and no DOM here.
//
// A fortress wall is a 'plateau' with fort: true and sheer: true, taller than any model (WALL_Z): it cannot be Climbed
// (terrain.js: planCross), only gone up by stairs or a ladder. T.face is the side its battlements look out on ('n': the
// attacker comes from smaller y). A gate is a model of its own (T.gate) standing in the gap of the wall: it never fights
// back, has no Control Zone and is not counted for Break Points (rules.js: inert); the defenders move through it, the
// attackers must batter it down: at the end of the Fight phase every attacker in base contact that did not fight that
// turn Strikes it, winning automatically, with two To Wound rolls per Strike (a gate counts as Trapped), and only shots
// of Strength 5 or more can damage it.
// A Siege Ladder is carried as a Heavy Object (u.carry === 'ladder': half Move) and raised as soon as its bearer stands
// against the wall: a 'ladder' piece (siege: true) from the ground to the battlements, which models go up as any ladder.
// A model Charges a defender at the top of a ladder from the ladder (rules.js: chargeLadder, u.over = { T: the ladder });
// losing, it does not Back Away but falls off on a 1–3 (so may the others on the ladder); winning, with its enemy slain,
// it steps onto the battlements. A defender at the battlements where a ladder stands, with no attacker at its top, may
// push it down in its Activation: a D6, +1 for each friend touching it that is not Engaged, −1 for each enemy on the
// ladder (a Monster ±3), 4+ and the ladder falls with everyone on it.
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, ptIn, circleRect } from './geometry.js';
import { alive, sideAlive, engaged, rectGap, inert, touching } from './rules.js';
import { levelAt } from './terrain.js';
import { woundRolls } from './dice.js';
import { strikeS } from './heroes.js';

export const WALL_Z = 3;
export const GATE = { n: 'Fortress Gate', kw: 'Gate', base: 101.6, mv: 0, f: 0, sh: 6, s: 6, d: 10, a: 0, w: 3, c: 2, i: 2, gear: [], rules: [], gate: true, icon: 'gate', ht: WALL_Z };   // as tall as the wall (Line of Sight)
export const isFort = T => !!(T && T.k === 'plateau' && T.fort);
export const isGate = u => !!(u && u.T.gate);
export const forts = () => (G.terrain || []).filter(isFort);
export const siegeLadders = () => (G.terrain || []).filter(T => T.k === 'ladder' && T.siege);

/* ---------- The fortress of the Grand Siege (p. 163) ---------- */
// The wall runs the width of the table 12″ from the defender's edge, 2″ deep, its gate in the middle; stairs go up its
// back at a quarter and three quarters of the width. defSide: the side whose edge it guards ('good': the bottom edge).
// Returns { terrain, gate: { x, y }, face (the y of the battlements' outer edge), dir (+1: the attacker comes from
// smaller y) }.
export function makeFortress(W, H, defSide) {
  const south = defSide === 'good', y0 = south ? H - 12 : 10, face = south ? H - 12 : 12, gx = W / 2, gw = 4;
  const wall = (x, w) => ({ k: 'plateau', x, y: y0, w, h: 2, z: WALL_Z, sheer: true, fort: true, face: south ? 'n' : 's' });
  const terrain = [wall(0, gx - gw / 2), wall(gx + gw / 2, W - gx - gw / 2)];
  for (const sx of [W / 4, 3 * W / 4]) for (let i = 1; i <= 4; i++) {   // stairs: four steps of 0.6″ down the back of the wall
    const y = south ? y0 + 2 + (i - 1) : y0 - i;
    terrain.push({ k: 'plateau', x: sx - 1, y, w: 2, h: 1, z: +(WALL_Z - 0.6 * i).toFixed(1), stairs: true });
  }
  return { terrain, gate: { x: gx, y: y0 + 1 }, face, dir: south ? 1 : -1 };
}
// Whether a point is on or within the walls (the Grand Siege's objective): on the wall or behind its outer face.
export const withinWalls = (u, F) => (F.dir > 0 ? u.y + u.r > F.face : u.y - u.r < F.face) || forts().some(T => ptIn(u.x, u.y, T));

/* ---------- The computer's siege goals ---------- */
// Where a model of the Grand Siege heads when it has nothing to Charge: a point to approach, null to stand, or undefined
// for the usual plan. The attacker carries its ladders to the wall (spread out, clear of the gate), climbs those that
// are up, or makes for the gate (through it once it is broken); the defender climbs its stairs and walks the wall
// towards the ladders and the enemy.
export function siegeGoal(u, S) {
  const F = S.F, dir = F.dir, z = levelAt(u.x, u.y), gate = G.units.find(o => o.T.gate && alive(o));
  const W = G.W, inner = F.face + dir * 1, edge = r => F.face + dir * (r + 0.03);   // the middle of the wall's top; its battlements
  if (u.side === S.att) {
    if (withinWalls(u, F) && !u.carry) return undefined;
    if (u.carry === 'ladder') return ladderSpot(u, F);
    const L = siegeLadders().filter(L => L.side === u.side);
    const mine = L.find(L => circleRect(u.x, u.y, u.r, L));
    if (mine) { const top = ladderTop(mine); return { x: top.x, y: top.y + dir * (u.r + 0.05) }; }   // up it
    const free = L.filter(L => !G.units.some(o => o !== u && alive(o) && circleRect(o.x, o.y, o.r, L))).sort((a, b) => Math.hypot(ladderTop(a).x - u.x, ladderTop(a).y - u.y) - Math.hypot(ladderTop(b).x - u.x, ladderTop(b).y - u.y))[0];
    const gx = W / 2;
    if (!gate) return { x: gx, y: F.face + dir * 4 };   // through the broken gate
    if (free && Math.hypot(ladderTop(free).x - u.x, ladderTop(free).y - u.y) < Math.hypot(gate.x - u.x, gate.y - u.y) + 6) { const top = ladderTop(free); return { x: top.x, y: top.y - dir * (u.r + 0.05) }; }
    return { x: gate.x, y: gate.y - dir * (gate.r + u.r + 0.05) };   // to the gate, to batter it
  }
  if (u.side !== S.def || u.T.siege || u.T.gate) return undefined;
  if (G.units.some(o => alive(o) && o.side === S.att && !o.T.siege && withinWalls(o, F) && levelAt(o.x, o.y) < 0.05)) return undefined;   // the enemy is inside
  const ladders = siegeLadders().filter(L => L.side !== u.side), foes = G.units.filter(o => alive(o) && o.side === S.att);
  if (z >= WALL_Z - 0.05) {   // on the wall: along it towards a ladder (or the nearest enemy), staying up
    const L = ladders.sort((a, b) => Math.abs(ladderTop(a).x - u.x) - Math.abs(ladderTop(b).x - u.x))[0];
    const tx = L ? ladderTop(L).x : foes.length ? foes.reduce((a, b) => (Math.abs(a.x - u.x) <= Math.abs(b.x - u.x) ? a : b)).x : u.x;
    if (Math.abs(tx - u.x) < 0.6 && Math.abs(u.y - edge(u.r)) < 0.1) return null;
    const side = u.x < W / 2 === tx < W / 2;   // the gate's gap cuts the wall in two
    return { x: side ? tx : (u.x < W / 2 ? W / 2 - 2 - u.r - 0.1 : W / 2 + 2 + u.r + 0.1), y: side ? edge(u.r) : inner };   // at the battlements, where the ladder is
  }
  if (u.T.bow && foes.length) return undefined;
  // Behind the wall: up the nearer stairs (their foot first, then straight up them).
  const sx = Math.abs(u.x - W / 4) <= Math.abs(u.x - 3 * W / 4) ? W / 4 : 3 * W / 4, foot = F.face + dir * 6.6;
  if (Math.abs(u.x - sx) > 0.3 && z < 0.05) return { x: sx, y: foot };
  return { x: sx, y: inner };
}
// Where a ladder bearer goes: a spot against the wall's face near it, clear of the gate and of other ladders.
export function ladderSpot(u, F) {
  const mate = u.ladderId != null && G.units.find(o => o !== u && o.ladderId === u.ladderId && o.carry && alive(o) && o.ladderX != null);
  if (mate) return { x: mate.ladderX + (u.x < mate.x ? -1.1 : 1.1), y: F.face - F.dir * (u.r + 0.05) };   // beside its fellow bearer
  const W = G.W, taken = [...siegeLadders().map(L => ladderTop(L).x), ...G.units.filter(o => o !== u && o.ladderX != null && alive(o) && o.carry && o.ladderId !== u.ladderId).map(o => o.ladderX)];
  const ok = x => x > 1.5 && x < W - 1.5 && Math.abs(x - W / 2) > 3.5 && taken.every(t => Math.abs(t - x) > 2.5);
  let x = u.ladderX != null && ok(u.ladderX) ? u.ladderX : null;
  for (let d = 0; x == null && d < W; d += 0.5) for (const c of [u.x + d, u.x - d]) if (x == null && ok(c)) x = c;
  if (x == null) return null;
  u.ladderX = x;
  return { x, y: F.face - F.dir * (u.r + 0.05) };
}

/* ---------- Gates ---------- */
// The attackers that Strike the gate at the end of the Fight phase: in base contact, not Engaged, not having fought.
export const gateFoes = g => G.units.filter(u => alive(u) && u.side !== g.side && !inert(u) && !u.fought && !u.prone && !engaged(u) && gap(u, g) <= 0.08);
// Their Strikes: no Duel Roll, two To Wound rolls each (the gate counts as Trapped). Returns [{ w, R }].
export function* gateSeq(g) {
  const out = [];
  for (const w of gateFoes(g)) {
    if (!alive(g)) break;
    const n = Math.max(1, w.a), s = strikeS(w);
    const R = yield* woundRolls(w, g, 2 * n, { s, label: `${w.name} batters ${g.name}: ${n} Strike${n > 1 ? 's' : ''}, two To Wound rolls each, Strength ${s} against Defence ${g.d}` });
    w.fought = true;
    out.push({ w, R });
  }
  return out;
}

/* ---------- Siege Ladders ---------- */
// The battlements a model on the ground stands against (the outer face of a wall it touches), or null.
export function wallAgainst(u) {
  if (levelAt(u.x, u.y) > 0.05) return null;
  return forts().find(T => rectGap(u.x, u.y, u.r, T) <= 0.12 && (T.face === 'n' ? u.y < T.y : u.y > T.y + T.h)) || null;
}
// A carried ladder goes up as soon as its bearer stands against the wall: the ladder piece, 1″ wide, from the face out.
// Returns the ladder, or null.
export function raiseLadder(u) {
  if (u.carry !== 'ladder') return null;
  const T = wallAgainst(u);
  if (!T) return null;
  const x = Math.max(T.x + 0.6, Math.min(T.x + T.w - 0.6, u.x)), out = 1.4;
  const L = { k: 'ladder', siege: true, side: u.side, z: T.z, x: x - 0.5, y: T.face === 'n' ? T.y - out : T.y + T.h, w: 1, h: out, wall: T };
  G.terrain = [...G.terrain, L];
  u.carry = null;
  for (const o of G.units) if (o.carry && o.ladderId != null && o.ladderId === u.ladderId && o.side === u.side) o.carry = null;   // its second bearer is free too
  if (G.m && G.m.siege) G.m.siege.raised = (G.m.siege.raised || 0) + 1;
  return L;
}
// The battlements where ladder L meets the wall (the point at the top of the ladder).
export const ladderTop = L => ({ x: L.x + L.w / 2, y: L.wall.face === 'n' ? L.y + L.h : L.y });
// The models on ladder L (their bases on it, on the ground or at its top).
export const onSiegeLadder = L => G.units.filter(u => alive(u) && !inert(u) && levelAt(u.x, u.y) < 0.05 && circleRect(u.x, u.y, u.r, L));
// A defender that could push ladder L down now: on the wall, touching the battlements where it stands, not Engaged,
// and no attacker at its top (fighting there).
export function pushable(u) {
  if (!alive(u) || engaged(u) || u.done || levelAt(u.x, u.y) < WALL_Z - 0.05) return null;
  return siegeLadders().find(L => L.side !== u.side && rectGap(u.x, u.y, u.r, L) <= 0.12 && !G.units.some(o => o.over && o.over.T === L && alive(o))) || null;
}
// The push: a D6 with its modifiers, 4+ and the ladder falls. Returns { die, mod, ok, fell: [models on it] }.
export function* pushSeq(u, L) {
  const friends = sideAlive(u.side).filter(o => o !== u && !engaged(o) && gap(o, u) <= 0.08);
  const on = onSiegeLadder(L).filter(o => o.side !== u.side);
  const mod = (u.T.monster ? 3 : 0) + friends.reduce((n, o) => n + (o.T.monster ? 3 : 1), 0) - on.reduce((n, o) => n + (o.T.monster ? 3 : 1), 0);
  const die = { n: d6(), v: 0, mt: 0, ok: false };
  die.v = die.n; die.ok = die.n + mod >= 4;
  yield { k: 'dice', step: 'pushLadder', u, die, need: 4 - mod, label: `${u.name} pushes the ladder down: 4+${mod ? ` (${mod > 0 ? '+' : '−'}${Math.abs(mod)})` : ''}` };
  u.done = true;
  if (die.ok) G.terrain = G.terrain.filter(T => T !== L);
  return { die, mod, ok: die.ok, fell: die.ok ? onSiegeLadder(L).map(o => o) : [] };
}
// After a Combat at the top of a ladder (combat.js: barrierOf, mode 'ladder'): the attacker that lost falls on a 1–3,
// and so may each other model on the ladder; the attacker that won with its enemy slain steps onto the battlements.
// Returns { falls: [{ u, die }], steps: { u, from } | null }.
export function afterLadder(B, win) {
  const L = B.T, out = { falls: [], steps: null };
  if (win === B.att.side && !alive(B.def) && alive(B.att)) {
    const top = ladderTop(L), dir = L.wall.face === 'n' ? 1 : -1, P = { x: top.x, y: top.y + dir * (B.att.r + 0.05) };
    if (!G.units.some(o => o !== B.att && alive(o) && Math.hypot(o.x - P.x, o.y - P.y) < o.r + B.att.r - 0.02)) {
      out.steps = { u: B.att, from: { x: B.att.x, y: B.att.y } };
      B.att.x = P.x; B.att.y = P.y; B.att.over = null;
    }
    return out;
  }
  if (win !== B.att.side && alive(B.att)) {
    for (const u of [B.att, ...onSiegeLadder(L).filter(o => o !== B.att && o.side === B.att.side)]) {
      const die = d6();
      out.falls.push({ u, die, fell: die <= 3 });
    }
  }
  return out;
}
