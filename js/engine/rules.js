// The rules engine: what is allowed and what the odds are. No drawing and no DOM here,
// so a different renderer (for example 3D) can reuse it unchanged.
import { G } from '../state.js';
import { fmt, fmtUp, fmtDown, d6, DEG } from '../util.js';
import { dist, gap, gapXY, ptIn, circleRect, rectGap, rectDist, rectNearest, segHitsRect, lineHitsBox, pieceBox, squareHits, boxHits, toLocal, fromLocal } from './geometry.js';
export { rectGap };
import { heightOf, levelAt, zOf, straddles, hasLevels, barrierOn, isObstacle, obstacleHt, ladderRise, inDeep } from './terrain.js';
import { d6Test, woundRoll, chainOdds, isHero } from './dice.js';
import { tetherWhy } from './heroes.js';
import { rule, harbingerNear } from './special.js';
import { isSentry } from './advanced.js';
import { kindOf, isCover, obstructs, sightShapes } from './terrain-types.js';
import { WALL_Z, siegeLadders, ladderTop } from './fortress.js';
import { courageMod, dismayed, fogged, spellbound, blinded, valarShot, vinesAt, anyVines, illuminated } from './magic.js';

/* ---------- To Wound chart (identical to the 2024 Rules Manual) ---------- */
export function woundNeed(s, d) {
  const x = d - s;
  if (x <= -2) return [3];
  if (x <= 0) return [4];
  if (x <= 2) return [5];
  if (x <= 4) return [6];
  if (x === 5) return [6, 4];
  if (x === 6) return [6, 5];
  if (x === 7) return [6, 6];
  return null;
}
export const needStr = n => !n ? '—' : n.length === 1 ? n[0] + '+' : n[0] + '/' + n[1] + '+';
// bonus: a modifier on every To Wound dice (+1 for a two-handed weapon, on both rolls of a 6/x). A modified dice
// never counts as more than 6 (p. 18), and there is no rule that a natural 1 always fails.
const pOne = (need, bonus) => Math.min(1, (7 - Math.max(1, need - bonus)) / 6);
// nat6: Heroic Defence, only natural 6s wound (both natural 6s on 6+/x).
export const pNeed = (n, bonus = 0, nat6 = false) => !n ? 0 : nat6 ? (1 / 6) ** n.length : n.length === 1 ? pOne(n[0], bonus) : pOne(6, bonus) * pOne(n[1], bonus);

// One To Wound roll nobody can spend Might on (a fall, a rider Knocked Flying). The dice show the natural rolls, with
// the bonus as mod. nat6: Heroic Defence, only a natural 6 wounds (both natural 6s on 6+/x).
export function rollWound(need, bonus = 0, nat6 = false) {
  const m = v => (nat6 ? (v === 6 ? 6 : 0) : Math.min(6, v + bonus)), a = d6();
  if (need.length === 1) return { ok: m(a) >= need[0], dice: [{ v: a, ok: m(a) >= need[0], mod: bonus }] };
  if (m(a) < 6) return { ok: false, dice: [{ v: a, ok: false, mod: bonus }] };
  const b = d6();
  return { ok: m(b) >= need[1], dice: [{ v: a, ok: true, mod: bonus }, { v: b, ok: m(b) >= need[1], mod: bonus }] };
}

/* ---------- Sides ---------- */
// Side 'good' is always the player's and 'evil' the computer's. In matched play the player may lead an Evil army:
// G.align then says which side is Good and which Evil, for the rules that care (the roll-off, Good models' shooting).
export const alignOf = side => (G.align ? G.align[side] : side);
export const sideOfAlign = a => (alignOf('good') === a ? 'good' : 'evil');

/* ---------- Model state ---------- */
export const alive = u => !u.dead && !u.gone && !u.reserve;   // u.reserve: a Warband yet to arrive (scenarios.js)
// Fighting at Night (p. 136, a mission's m.night): models see only 12″, unless they are Cave Dwellers or the target is lit
// (Blinding Light); a shot at a model in the dark gets +1 To Wound (not at a Cave Dweller, nor at a lit model).
export const night = () => !!(G && G.m && G.m.night);
export const tooDark = (s, t) => night() && rule(s, 'Cave Dweller') == null && !illuminated(t) && gap(s, t) > 12 + 1e-6;
export const darkBonus = t => (night() && !illuminated(t) && rule(t, 'Cave Dweller') == null ? 1 : 0);
export const sideAlive = side => G.units.filter(u => u.side === side && alive(u));
// Two enemies are in base contact when their bases touch, or when one has Charged the other over a Barrier (p. 55):
// the charger then stands against the wall with u.over = { T, t: the defender's id } and counts as in base contact.
// A link holds while both still stand against that wall (Backing Away, crossing or a nudge apart ends it).
export const linked = (a, b) => (a.over && a.over.t === b.id && overHolds(a, b)) || (b.over && b.over.t === a.id && overHolds(b, a));
const overHolds = (a, d) => alive(a) && alive(d) && (a.over.T.k === 'door' ? gap(a, d) <= 0.08 : rectGap(a.x, a.y, a.r, a.over.T) <= 0.08 && rectGap(d.x, d.y, d.r, a.over.T) <= 0.08);
const held = (a, b) => !!(a.held && a.held.has(b.id) && gap(a, b) <= 0.45);
export const touching = (a, b) => gap(a, b) <= 0.08 || (!!(a.over || b.over) && linked(a, b)) || held(a, b) || held(b, a);
// A model that moves of its own accord gives up its link, and any link an enemy held to it.
export function dropLinks(u) { u.over = null; u.held = null; for (const o of G.units) if (o.over && o.over.t === u.id) o.over = null; }
// A Siege Engine is never Engaged and engages nobody (siege.js).
// Siege Engines and gates (fortress.js) are models that never fight back: no Control Zone, never Engaged, not counted.
export const inert = u => !!(u.T.siege || u.T.gate);
export const engaged = u => !inert(u) && G.units.some(o => alive(o) && o.side !== u.side && !inert(o) && touching(u, o));
// The models that count for Break Points and the like: Siege Engines do not (p. 147).
export const countAlive = side => sideAlive(side).filter(u => !inert(u));
// Models for the Break Point (p. 148): a Siege Engine is none, a War Beast and its Commander riding it are two.
// A mount left on the table after its rider was slain (or after the rider Dismounted) is no model of its own here: the
// Cavalry model counted as a casualty when its rider fell, whether the mount stays or flees (p. 69).
export const modelCount = u => (inert(u) || u.T.mountModel ? 0 : 1 + (u.cmd && u.cmd.w > 0 ? 1 : 0));
// Warbands yet to arrive and models that escaped the table still count (Hold Ground, Reconnoitre).
export const modelsAlive = side => G.units.reduce((n, u) => n + (u.side === side && !u.dead && (alive(u) || u.reserve || u.escaped) ? modelCount(u) : 0), 0);

/* ---------- Courage and Broken armies (p. 60–61) ---------- */
// A Courage Test: 2D6, passed on the model's Courage value or more.
// A war horn within 24″ of a friend gives +1 to its Courage Tests (p. 110): the test then needs 1 less (T.horn).
// Harbinger of Evil (p. 125): −1 within its range (harb: the enemy model). Magic (p. 116–117): Drain Courage worsens
// the value for good (u.drained), an enemy Aura of Dismay within 6″ gives −1 (dismay).
export function courageTest(u) {
  const horn = hornNear(u) ? 1 : 0, harb = harbingerNear(u), need = u.T.c - horn + (harb ? 1 : 0) + courageMod(u), a = d6(), b = d6();
  return { dice: [a, b], total: a + b, need, ok: a + b >= need, horn, harb, drained: u.drained || 0, dismay: dismayed(u) };
}
// An Intelligence Test (p. 62): 2D6, passed on the model's Intelligence value or more; mod is added to the roll (the
// rule that calls for the test may give a bonus or a penalty).
// An enemy Fog of Disarray within 6″: −1 (p. 117).
export function intelligenceTest(u, mod = 0) {
  if (fogged(u)) mod -= 1;
  const a = d6(), b = d6(), need = u.T.i;
  return { dice: [a, b], total: a + b + mod, need, ok: a + b + mod >= need, mod };
}
export const hasHorn = u => (u.T.gear || []).some(g => /^war horn$/i.test(g));
export const hornNear = u => G.units.some(o => alive(o) && o.side === u.side && hasHorn(o) && gap(u, o) <= 24 + 1e-6);
// Casualties so far (slain, escaped or fled) against the models the side started with (G.start), and its Break Point:
// half of them (a matched play army list may set its own fraction).
export const casualties = side => (G.start ? G.start[side] - modelsAlive(side) : 0);
export const breakPoint = side => (G.start ? G.start[side] * (G.m && G.m.breakAt ? G.m.breakAt[side] : 0.5) : Infinity);
// Checked at the start of every turn: an army whose casualties exceed its Break Point is Broken, and stays so.
// G.broken is null until the rule is taught (then the game ignores it). Returns the sides that broke just now.
export function checkBroken() {
  if (!G.start || !G.broken) return [];
  const now = [];
  for (const s of ['good', 'evil']) if (!G.broken[s] && casualties(s) > breakPoint(s)) { G.broken[s] = true; now.push(s); }
  return now;
}
// Whether model u must take a Courage Test before it acts this turn: its army is Broken, it has not tested yet, and it
// is not Engaged in Combat (an Engaged model does not Activate, so it does not test).
export const needsCourage = u => !!(G.broken && G.broken[u.side] && !u.tested && alive(u) && !engaged(u) && !spellbound(u));   // a Transfixed or Paralysed model does not Activate
// The models of a side that have not Activated by the end of its Activation phase Activate now without moving (p. 60:
// every model that can Activate does, and in a Broken army tests first): Heroes first, so their Stand Fast can count.
export const idleActivations = side => sideAlive(side).filter(needsCourage).sort((a, b) => isHero(b) - isHero(a));
// A model that fails: it flees the battlefield and counts as a casualty.
export function flee(u) { u.gone = true; u.fled = true; dropLinks(u); }
// A Hero raises a failed Courage Test by 1 per Will Point, and by Might too (p. 86): Will first. Spends what the pass
// needs and returns { will, might }, or null when the Hero cannot reach its Courage value.
export function courageBoost(u, T) {
  if (T.ok || !u.mwf) return null;
  const short = T.need - T.total;
  if ((u.will || 0) + (u.might || 0) < short) return null;
  const will = Math.min(u.will, short), might = short - will;
  u.will -= will; u.might -= might; T.total += short; T.ok = true; T.boost = { will, might };
  return T.boost;
}

/* ---------- Barriers (p. 55) ---------- */
// A wall or hedge a model can defend: at least half its height, and low enough to see over (here: not taller than it).
export const canDefend = (u, T) => isObstacle(T) && obstacleHt(T) >= heightOf(u) / 2 - 1e-6 && obstacleHt(T) <= heightOf(u) + 1e-6;
// The Obstacle model u defends: one it stands in base contact with. A Prone model never defends (p. 55).
export function defends(u) {
  if (!alive(u) || u.prone) return null;
  return G.terrain.find(T => canDefend(u, T) && rectGap(u.x, u.y, u.r, T) <= 0.08) || null;
}
// Which side of a thin Obstacle a point is on: 'a' (before it along its thin axis), 'b' (beyond it) or 'in'. The axes
// are the piece's own (a turned wall: along and across it).
export function wallSide(T, x, y) {
  if (T.a) ({ x, y } = toLocal(T, x, y));
  const horiz = T.w >= T.h, v = horiz ? y : x, lo = horiz ? T.y : T.x, hi = horiz ? T.y + T.h : T.x + T.w;
  return v < lo ? 'a' : v > hi ? 'b' : 'in';
}
// A Control Zone stops where it meets an Obstacle or impassable terrain (p. 22), unless the model defends that Obstacle:
// then its zone extends over it (p. 55). The pieces that can cut model e's zone: those within reach of it.
export function zoneCutters(e) {
  const d = defends(e), R = e.r + 1.05;
  return G.terrain.filter(T => T !== d && (blocksMove(T) || isObstacle(T)) && squareHits(e.x, e.y, R, T, false));
}
// Whether something cuts e's Control Zone off from the point (x, y). cs: zoneCutters(e), when the caller has them.
export const zoneBlocked = (e, x, y, cs = zoneCutters(e)) => cs.some(T => segHitsRect(e.x, e.y, x, y, T));
// The Move Value: a Heroic March or At the Double adds 3″ (5″ for cavalry) for the Move phase (p. 83); in the Shoot phase
// "more than half its Move" counts the Move Value the model had in the Move phase (heroes.js: endMovePhase keeps it).
// Carrying a Heavy Object (a Siege Ladder): half its Move, unless a second bearer carries it along (p. 133).
export const moveVal = u => (u.mv + (u.mvPlus || 0)) / (u.carry && !carriedTogether(u) ? 2 : 1);
const carriedTogether = u => u.ladderId != null && G.units.some(o => o !== u && o.ladderId === u.ladderId && o.carry && alive(o) && gap(o, u) <= 1.2);
const shootMove = u => u.mv + (u.mvPlus || u.mvShoot || 0);
export const remaining = u => Math.max(0, moveVal(u) - u.movedDist);
export const canMove = u => alive(u) && !inert(u) && !u.done && !u.stunned && !engaged(u) && remaining(u) > 0.05 && !spellbound(u);
export const names = list => list.map(u => u.name).join(', ');
// Short names for headings: models of one kind are counted, e.g. '8 × Warrior of Minas Tirith'.
export function groupNames(list) {
  const by = new Map();
  for (const u of list) { const k = u.base; if (!by.has(k)) by.set(k, []); by.get(k).push(u); }
  return [...by.values()].map(g => g.length > 1 ? `${g.length} × ${g[0].base}` : g[0].name).join(', ');
}
// Removes one Wound; returns true if the model is slain.
export function takeWound(u) {
  u.w--; u.hurt = true;   // the scenarios count a General or Hero ever wounded (scenarios.js)
  if (u.w <= 0) { u.w = 0; u.dead = true; u.diedIn = G.phase; return true; }
  return false;
}
export const inBrush = (x, y, r) => G.terrain.some(T => T.k === 'brush' && (ptIn(x, y, T) || circleRect(x, y, r, T)));
// Difficult Terrain that does not slow model u (p. 124–131): brush is woodland, T.rocky brush is scree. Swift Movement and
// Spectral Walk ignore it all; Woodland Creature woods, Mountain Dweller rocky ground (a Cavalry model only if its Mount
// has the rule).
const terrainRule = (u, name) => (u.cav ? (u.mount.rules || []).some(r => r.trim().toLowerCase() === name.toLowerCase()) && rule(u, name) != null : rule(u, name) != null);
export const freeIn = (u, T) => rule(u, 'Swift Movement') != null || rule(u, 'Spectral Walk') != null
  || (T.rocky ? terrainRule(u, 'Mountain Dweller') : terrainRule(u, 'Woodland Creature'));
const wades = u => !(u.cav || u.T.monster || u.T.warBeast);   // Shallow Water slows all but these (p. 132)
// (the cheap geometric test first: this runs for every sample of every path)
const slowedAt = (u, x, y) => G.terrain.some(T => (T.k === 'brush' || (T.k === 'water' && T.shallow)) && (ptIn(x, y, T) || circleRect(x, y, u.r, T)) && (T.k === 'brush' ? !freeIn(u, T) : wades(u)))
  || (vinesAt(u, x, y) && rule(u, 'Swift Movement') == null && rule(u, 'Spectral Walk') == null);   // Writhing Vines (magic.js)
// Rocks and deep water cannot be entered. What terrain does to Line of Sight: terrain-types.js (hiddenBy).
// Water: a river with no depth given cannot be entered; Deep Water only by a model that has taken its Swim Test.
const blocksMove = T => T.k === 'rock' || T.k === 'building' || (T.k === 'water' && !T.shallow && !T.deep);
const blocksFor = u => T => blocksMove(T) || (T.k === 'water' && T.deep && !u.swum);
const blockedAt = (x, y, r) => G.terrain.find(T => blocksMove(T) && circleRect(x, y, r, T));
// Obstacles (low walls, hedges): nobody can stand on top of one. A low wall is under half a man's height, so models step
// over it freely; a hedge takes a Jump Test (see terrain.js).
const onWall = (x, y, r) => G.terrain.some(T => isObstacle(T) && circleRect(x, y, r, T));
// Whether anything on the table needs a Jump, Leap or Climb Test (otherwise the path check is skipped).
const anyBarriers = () => hasLevels() || G.terrain.some(T => isObstacle(T) && obstacleHt(T) > 0.5 + 1e-6);
// Why a normal move cannot cross barrier b (see barrierOn in terrain.js); rule: the rule chip to show.
function barrierWhy(u, b) {
  const what = b.T ? (b.T.k === 'hedge' ? 'hedge' : 'wall') : 'step';
  if (b.kind === 'jump') return { rule: 'jump', why: `The ${what} is taller than half of ${u.name}, so crossing it takes a Jump Test. Point beyond it: the model walks up to it and jumps.` };
  if (b.kind === 'leap') return { rule: 'leap', why: `A ${fmt(b.gapW)}″ gap lies in the way, ${fmt(b.dz)}″ deep. Crossing it takes a Leap Test: point at the far side.` };
  if (b.kind === 'climb') return { rule: 'climb', why: `The cliff is ${fmt(b.dz)}″ high, taller than ${u.name}, so going up takes a Climb Test. Point at the top: the model walks to the foot and climbs.` };
  if (b.kind === 'down') return { rule: 'climb', why: `The drop is ${fmt(b.dz)}″, deeper than ${u.name} is tall, so going down takes a Climb Test. Point below it to climb down.` };
  return { rule: 'obstacles', why: `The ${what} is taller than ${u.name}: it cannot be crossed here.` };
}
// Enemies whose Control Zone a model on level z has to respect: not Engaged, not Prone (p. 37), and on about its level.
// Invisible (p. 127): an Invisible model has no Control Zone and ignores the enemy's.
const zoneFoes = (others, u, z = zOf(u)) => (invisible(u) ? [] : others.filter(o => o.side !== u.side && !inert(o) && !invisible(o) && !engaged(o) && !o.prone && Math.abs(zOf(o) - z) <= heightOf(u) / 2 + 1e-6));
// Invisible (p. 127): the One Ring worn (advanced.js), or the special rule.
export const invisible = u => !!(u && (u.ringOn || (u.invRule ??= rule(u, 'Invisible') != null)));   // the rule, looked up once
// Backing Away and Make Way can't cross Obstacles: true if a short straight step from a to P would touch a wall.
const stepHitsWall = (a, P, r) => [0.25, 0.5, 0.75, 1].some(t => onWall(a.x + (P.x - a.x) * t, a.y + (P.y - a.y) * t, r));

/* ---------- Moving ---------- */
// What a straight move to P costs: its length plus the extra for Difficult Terrain (every 1″ in the brush costs 2″).
function moveCost(u, P) {
  const L = Math.hypot(P.x - u.x, P.y - u.y), n = Math.max(2, Math.ceil(L / 0.12));
  let br = 0;
  if (nearPath(u, P, u.r, T => (T.k === 'brush' && !freeIn(u, T)) || (T.k === 'water' && T.shallow && wades(u))).length || anyVines(u)) {
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (slowedAt(u, u.x + (P.x - u.x) * t, u.y + (P.y - u.y) * t)) br += L / n * (u.cav ? 3 : 1); }
  }
  const up = ladderRise(u, P);   // a ladder: the height counts towards the Move (p. 35)
  return { L, br, cost: L + br + up };
}
// Terrain pieces of a kind whose rectangle comes near the path from a to P (bounding boxes overlap).
const nearPath = (a, P, r, kind) => G.terrain.filter(T => kind(T)
  && boxHits(T, Math.min(a.x, P.x) - r, Math.min(a.y, P.y) - r, Math.max(a.x, P.x) + r, Math.max(a.y, P.y) + r, false));
// The furthest point towards P that lim inches of Move can pay for (P itself if it is in reach).
// A point that would leave the base half over the edge of higher ground is pulled back until it stands on one level.
export function furthestMove(u, P, lim) {
  let t = 1;
  if (moveCost(u, P).cost > lim + 1e-6) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      if (moveCost(u, { x: u.x + (P.x - u.x) * m, y: u.y + (P.y - u.y) * m }).cost <= lim) lo = m; else hi = m;
    }
    t = lo;
  }
  const L = Math.hypot(P.x - u.x, P.y - u.y) || 1, at = k => ({ x: u.x + (P.x - u.x) * k, y: u.y + (P.y - u.y) * k });
  for (let k = t; k > 0 && hasLevels(); k -= 0.04 / L) { const Q = at(k); if (!straddles(Q.x, Q.y, u.r)) return Q; }
  return at(t);
}
export function validateMove(u, P, lim, opt = {}) {
  const r = u.r;
  if (P.x < r || P.y < r || P.x > G.W - r || P.y > G.H - r) return { ok: false, why: 'That is off the edge of the table.', rule: 'move' };
  if (flies(u)) return flyMove(u, P, lim, opt);
  const { L, br, cost } = moveCost(u, P);
  if (L < 0.05) return { ok: false, why: 'Pick a point further from the model.', rule: 'move' };
  const n = Math.max(2, Math.ceil(L / 0.12));
  if (cost > lim + 1e-6) return { ok: false, cost, inBrush: br, rule: br > 0 ? 'terrain' : 'move',
    why: `Too far: ${fmtUp(cost)}″, but only ${fmtDown(lim)}″ of Move left${br > 0 ? ` (Difficult Terrain adds ${fmt(br)}″)` : ''}.` };
  if (onWall(P.x, P.y, r)) return { ok: false, cost, why: 'A model can\'t stand on top of a wall or hedge. Stop in front of it, or cross it.', rule: 'move' };
  if (straddles(P.x, P.y, r)) return { ok: false, cost, why: 'A model can\'t stand half over the edge of higher ground. Stop before the edge, or cross it.', rule: 'climb' };
  // Terrain is sampled along the path; models and Control Zones are circles, so the path is tested against them exactly.
  const dx = P.x - u.x, dy = P.y - u.y, LL = dx * dx + dy * dy, solid = nearPath(u, P, r, blocksFor(u));
  if (solid.length) for (let i = 1; i <= n; i++) {
    const x = u.x + dx * i / n, y = u.y + dy * i / n, T = solid.find(T => circleRect(x, y, r, T));
    if (T) return { ok: false, cost, why: T.k === 'water' ? (T.deep ? 'Deep Water: point into it to walk to the edge and take a Swim Test.' : 'The river is too deep to cross here.') : 'Rocks are impassable. Go around them.', rule: T.deep ? 'swim' : 'move' };
  }
  // Hedges, cliffs and gaps: a normal move (or a Charge) cannot cross them; that takes a test (terrain.js).
  if (anyBarriers()) { const b = barrierOn(u, P); if (b) return { ok: false, cost, barrier: b, ...barrierWhy(u, b) }; }
  // The point of the path closest to o (t from 0 to 1) and its distance; where the path first comes within R of o.
  const closest = o => { const t = Math.max(0, Math.min(1, ((o.x - u.x) * dx + (o.y - u.y) * dy) / LL)); return { t, d: Math.hypot(u.x + dx * t - o.x, u.y + dy * t - o.y) }; };
  const entry = (o, R) => {
    const fx = u.x - o.x, fy = u.y - o.y, b = 2 * (dx * fx + dy * fy), c = fx * fx + fy * fy - R * R;
    if (c < 0) return 0;
    const disc = b * b - 4 * LL * c; if (disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / (2 * LL);
    return t >= 0 && t <= 1 ? t : Infinity;
  };
  // opt.pre: the other models and the enemies with a Control Zone, computed once by a caller that tries many paths.
  const others = opt.pre ? opt.pre.others : G.units.filter(o => o !== u && alive(o));
  let blk = null, bt = Infinity;
  const through = o => invisible(o) || invisible(u) || (o.T.gate && o.side === u.side);   // an Invisible model; the defenders' own gate (p. 159)
  for (const o of others) { if (through(o)) continue; const c = closest(o); if (c.t > 0 && c.d < r + o.r - 0.03 && c.t < bt) { bt = c.t; blk = o; } }   // through an Invisible model, or as one
  if (blk) return { ok: false, cost, blocker: blk, why: `${blk.name} is in the way. Models can't move through other models.`, rule: 'move' };
  // Objective Markers (p. 156): models move over them but never end a move on one.
  if (G.objectives && G.objectives.some(o => !o.gone && Math.hypot(o.x - P.x, o.y - P.y) < r + o.r - 0.03)) return { ok: false, cost, why: 'A model may move over an Objective Marker, but not end its move on it.', rule: 'move' };
  const over = others.find(o => through(o) && Math.hypot(o.x - P.x, o.y - P.y) < r + o.r - 0.03);
  if (over) return { ok: false, cost, blocker: over, why: `A model may move through ${invisible(u) ? 'others while Invisible' : 'an Invisible model'}, but not end its Move on ${over.name}.`, rule: 'invisible' };
  const czFoes = opt.pre ? opt.pre.czFoes : zoneFoes(others, u);
  const zone = e => r + e.r + 1 - 1e-6;   // centre distance at which u's base touches e's Control Zone
  // Walls, hedges and rocks cut a Control Zone short (p. 22), so near them the path is sampled through the zone: it only
  // enters where nothing stands between the enemy and the model. cutters: those pieces, per enemy, found once.
  const cutters = new Map(), cut = e => { if (!cutters.has(e)) cutters.set(e, zoneCutters(e)); return cutters.get(e); };
  const entryT = e => {
    const R = zone(e), t0 = entry(e, R);
    if (t0 === Infinity) return Infinity;
    const cs = cut(e); if (!cs.length) return t0;
    const step = 0.1 / Math.sqrt(LL);
    for (let t = t0; t <= 1 + 1e-9; t += step) {
      const x = u.x + dx * t, y = u.y + dy * t;
      if (Math.hypot(x - e.x, y - e.y) >= R && t > t0) break;
      if (!zoneBlocked(e, x, y, cs)) return t;
    }
    return Infinity;
  };
  const tgt = opt.charge;
  if (tgt) {
    // Charges and Control Zones (2024): a model must Charge the first enemy whose zone it enters; once inside its
    // target's zone it may ignore the others. A target already Engaged has no zone, so the path must keep out of
    // every other zone, except those of enemies that other models make impossible to Charge. Zones entered within
    // 0.12″ of each other count as entered together, and then the model may choose.
    const tz = czFoes.includes(tgt) ? entryT(tgt) : Infinity, eps = 0.12 / Math.sqrt(LL);
    const first = czFoes.filter(e => e !== tgt && (gap(u, e) >= 1 - 1e-6 || zoneBlocked(e, u.x, u.y, cut(e)))).map(e => ({ e, t: entryT(e) }))
      .filter(x => x.t < tz - eps).sort((a, b) => a.t - b.t).find(x => canBeCharged(u, x.e));
    if (first) { const e = first.e; return { ok: false, cost, rule: 'cz', why: `On the way, this model would enter ${e.name}'s Control Zone first, and a model that enters an enemy's Control Zone must Charge that enemy. Charge ${e.name}, or come at ${tgt.name} from a side that keeps out of other zones.` }; }
    const tw = tetherWhy(u, P.x, P.y);
    if (tw) return { ok: false, cost, why: tw, rule: 'heroicMove' };
    return { ok: true, cost, inBrush: br };
  }
  for (const e of czFoes) {
    const g0 = gap(u, e), c = closest(e);
    if (g0 < 1 - 1e-6 && !zoneBlocked(e, u.x, u.y, cut(e))) {
      // Move Away (p. 22): no closer to that enemy, measured across the table like the path (g0 may include a height).
      if (c.d < dist(u, e) - 1e-6) return { ok: false, cost, why: `This model is inside ${e.name}'s Control Zone. Inside it, it may only move without getting closer to that enemy.`, rule: 'cz' };
    } else if (entryT(e) < Infinity) return { ok: false, cost, why: u.noCharge ? `This path enters ${e.name}'s Control Zone, and a model on ${u.noCharge} may not Charge this turn.` : `This path enters ${e.name}'s Control Zone${defends(e) && cut(e).length ? ` (it defends the ${defends(e).k}, so its zone reaches over it)` : ''}. The only way in is a Charge: click the enemy.`, rule: 'cz' };
  }
  // Stairs and steps: an enemy on the level where the move ends has a Control Zone there, even if it was out of reach
  // from the level where the move began (zoneFoes looks at the start). The model may not stop inside it.
  const zEnd = levelAt(P.x, P.y);
  if (Math.abs(zEnd - zOf(u)) > 1e-6) for (const e of zoneFoes(others, u, zEnd)) {
    if (czFoes.includes(e) || gapXY(P.x, P.y, r, e) >= 1 - 1e-6 || zoneBlocked(e, P.x, P.y, cut(e))) continue;
    return { ok: false, cost, why: `This move ends inside ${e.name}'s Control Zone. A model may only enter it to Charge ${e.name}.`, rule: 'cz' };
  }
  const tw = tetherWhy(u, P.x, P.y);
  if (tw) return { ok: false, cost, why: tw, rule: 'heroicMove' };
  return { ok: true, cost, inBrush: br };
}
// Fly (p. 124): the model flies over models and terrain and ignores Control Zones on the way; it pays only the straight
// distance. It may not land on another model, in a wood, or on terrain nobody could reach (rocks, a building, water),
// and if it lands in an enemy's Control Zone it must Charge that enemy (a Charge may land anywhere next to its target).
export const flies = u => rule(u, 'Fly') != null;
function flyMove(u, P, lim, opt) {
  const r = u.r, cost = Math.hypot(P.x - u.x, P.y - u.y) + (u.prone ? 0 : 0);
  if (cost < 0.05) return { ok: false, why: 'Pick a point further from the model.', rule: 'move' };
  if (cost > lim + 1e-6) return { ok: false, cost, rule: 'fly', why: `Too far: ${fmtUp(cost)}″, but only ${fmtDown(lim)}″ of Move left.` };
  if (G.terrain.some(T => (T.k === 'rock' || T.k === 'building' || T.k === 'water' || (T.k === 'brush' && !T.rocky)) && circleRect(P.x, P.y, r, T)))
    return { ok: false, cost, rule: 'fly', why: 'A flying model cannot land there: not in a wood, nor on rocks, a building or water.' };
  if (onWall(P.x, P.y, r) || straddles(P.x, P.y, r)) return { ok: false, cost, rule: 'fly', why: 'A flying model needs level ground to land on.' };
  const others = opt.pre ? opt.pre.others : G.units.filter(o => o !== u && alive(o));
  const on = others.find(o => Math.hypot(o.x - P.x, o.y - P.y) < r + o.r - 0.03);
  if (on) return { ok: false, cost, rule: 'fly', why: `It cannot land on ${on.name}.` };
  if (!opt.charge) {
    const cz = (opt.pre ? opt.pre.czFoes : zoneFoes(others, u)).find(e => Math.hypot(e.x - P.x, e.y - P.y) - r - e.r < 1 - 1e-6);
    if (cz) return { ok: false, cost, rule: 'cz', why: `Landing in ${cz.name}'s Control Zone means Charging it: click the enemy.` };
  }
  const tw = tetherWhy(u, P.x, P.y);
  if (tw) return { ok: false, cost, why: tw, rule: 'heroicMove' };
  return { ok: true, cost, inBrush: 0, fly: true };
}
// Whether any spot around enemy e is free for u's base (models and impassable terrain can make a Charge impossible).
function canBeCharged(u, e) {
  const R = u.r + e.r + 0.02;
  for (let k = 0; k < 36; k++) {
    const a = k * 10 * DEG, x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R;
    if (x < u.r || y < u.r || x > G.W - u.r || y > G.H - u.r || blockedAt(x, y, u.r) || onWall(x, y, u.r) || straddles(x, y, u.r)) continue;
    if (!G.units.some(o => o !== u && o !== e && alive(o) && gapXY(x, y, u.r, o) < -0.01)) return true;
  }
  return false;
}

// A move that ends just short of a low wall or a hedge (within 0.35″), or with its base over one, stops in base
// contact with it instead: that is where a model stands to shoot over a wall (Shooting From Behind Cover), or to Jump
// a hedge next turn. Clicked on top of a wall, the model stops on whichever side the click is nearer (the far side
// means it steps over; a hedge can only be crossed with a Jump Test, so that spot fails validateMove). Returns the
// spots to try, nearest first: [{ x, y, wall }].
export function wallSpots(u, P) {
  const res = [];
  for (const T of G.terrain) {
    if (!isObstacle(T)) continue;
    const g = rectGap(P.x, P.y, u.r, T);
    if (g > 0.05 && g < 0.35) {
      const { x: cx, y: cy } = rectNearest(P.x, P.y, T), d = Math.hypot(P.x - cx, P.y - cy);
      res.push({ x: cx + (P.x - cx) / d * (u.r + 0.03), y: cy + (P.y - cy) / d * (u.r + 0.03), wall: T });
    } else if (circleRect(P.x, P.y, u.r, T) && !circleRect(u.x, u.y, u.r + 0.03, T)) {
      const at = k => ({ x: u.x + (P.x - u.x) * k, y: u.y + (P.y - u.y) * k }), hits = k => { const Q = at(k); return circleRect(Q.x, Q.y, u.r + 0.03, T); };
      let lo = 0, hi = 1;   // back along the path to where the base first comes within 0.03″ of the wall
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (hits(m)) hi = m; else lo = m; }
      res.push({ ...at(lo), wall: T });
      const L = Math.hypot(P.x - u.x, P.y - u.y) || 1;   // on along the path to where the base is clear of it
      let k = 1;
      while (hits(k) && k < 1 + (2 * u.r + T.w + T.h) / L) k += 0.01 / L;
      if (!hits(k)) res.push({ ...at(k), wall: T });
    }
  }
  return res.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
}

// On the table you simply push bases together. Here a point that leaves the base within `reach` (0.35″, more when
// the table is zoomed out) of friendly models (or slightly overlapping them) snaps to exact base contact. Returns the
// spots to try, best first: in contact with two friends at once where the point lies between them, and for a model
// with a spear or pike, in contact with a friend that is fighting (so that it can Support), then the closest.
export function snapSpots(u, P, reach = 0.35) {
  const near = [];
  for (const o of G.units) {
    if (o === u || !alive(o) || o.side !== u.side) continue;
    const g = gapXY(P.x, P.y, u.r, o);
    if (g < reach && g > -u.r) near.push(o);
  }
  if (!near.length) return [];
  const out = [], R = o => o.r + u.r + 0.01;
  for (const o of near) {
    const dx = P.x - o.x, dy = P.y - o.y, L = Math.hypot(dx, dy) || 1;
    out.push({ x: o.x + dx / L * R(o), y: o.y + dy / L * R(o), friend: o });
  }
  // Two friends: the touching spot on both circles closest to the point.
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const a = near[i], b = near[j], d = Math.hypot(b.x - a.x, b.y - a.y), ra = R(a), rb = R(b);
    if (d < 1e-6 || d > ra + rb || d < Math.abs(ra - rb)) continue;
    const k = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - k * k));
    const mx = a.x + (b.x - a.x) * k / d, my = a.y + (b.y - a.y) * k / d, nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
    const c = [{ x: mx + nx * h, y: my + ny * h }, { x: mx - nx * h, y: my - ny * h }]
      .sort((p, q) => Math.hypot(p.x - P.x, p.y - P.y) - Math.hypot(q.x - P.x, q.y - P.y))[0];
    if (Math.hypot(c.x - P.x, c.y - P.y) <= reach + u.r * 0.5) out.push({ ...c, friend: a, also: b });
  }
  const supports = !!(u.T.spear || u.T.pike);
  const fights = o => supports && o.r <= u.r + 1e-6 && engaged(o);
  const score = sp => (fights(sp.friend) || (sp.also && fights(sp.also)) ? 0 : 2) + (sp.also ? 0 : 1) + Math.hypot(sp.x - P.x, sp.y - P.y) / 10;
  // A spot overlapping a third model is no good.
  return out.filter(sp => !G.units.some(o => o !== u && alive(o) && gapXY(sp.x, sp.y, u.r, o) < -0.01)).sort((p, q) => score(p) - score(q));
}
export const snapToFriend = (u, P, reach) => snapSpots(u, P, reach)[0] || null;

// Where a charger ends in base contact with t. Bases are packed tightly: spots that touch another
// friend already fighting t are preferred, so as many models as possible fit around the enemy.
// `hint` (an angle around t, from the pointer) lets the player choose the side to attack from.
// When no straight path is free, the charger may go round its friends with one turn: the spot then has `via`,
// the point where the path turns (a model does not have to move in a straight line).
// A Prone model Stands Up first, for half its Move (p. 37): the spot then has stand, and its cost includes it.
export function chargeSpot(u, t, lim, hint) {
  if (u.noCharge) return null;   // a Heroic March or At the Double: no Charge this Move phase (p. 83)
  if (u.prone) {
    const stand = moveVal(u) / 2;
    u.prone = false;
    try { const c = chargeSpot(u, t, lim - stand, hint); return c && { ...c, cost: c.cost + stand, stand }; } finally { u.prone = true; }
  }
  // Fell Sight (p. 124): no Line of Sight needed to Charge.
  if (gap(u, t) > lim + 1e-6 || (rule(u, 'Fell Sight') == null && losBlocked(u.moveStart || u, t, u))) return null;
  const D = defends(t);
  if (D && wallSide(D, u.x, u.y) !== wallSide(D, t.x, t.y)) return chargeOver(u, t, D, lim);
  const Lr = ladderFor(u, t);
  if (Lr) return chargeLadder(u, t, Lr, lim);
  const E = elevatedFor(u, t);
  if (E) return chargeUp(u, t, E, lim);
  const Dr = doorOf(t);
  if (Dr && !circleRect(u.x, u.y, u.r, Dr)) return chargeDoor(u, t, Dr, lim);
  const R = u.r + t.r + 0.02;
  const mates = G.units.filter(o => o !== u && alive(o) && o.side === u.side && touching(o, t));
  const isSnug = P => mates.some(o => { const g = gapXY(P.x, P.y, u.r, o); return g > -0.005 && g < 0.07; });
  const others = G.units.filter(o => o !== u && alive(o)), pre = { others, czFoes: zoneFoes(others, u) };
  const cands = [], round = [];   // round: free spots whose straight path a model blocks
  for (let k = 0; k < 180; k++) {
    const a = k * 2 * DEG, P = { x: t.x + Math.cos(a) * R, y: t.y + Math.sin(a) * R };
    if (dist(u, P) > lim + 1e-6) continue;
    // Models on different levels never touch: a spot at the foot of a low step below the target (or on top of it, above
    // a target standing below) is no Charge.
    if (Math.abs(levelAt(P.x, P.y) - zOf(t)) > 1e-6) continue;
    const v = validateMove(u, P, lim, { charge: t, pre });
    if (!v.ok) { if (v.blocker && !G.units.some(o => o !== u && alive(o) && gapXY(P.x, P.y, u.r, o) < -0.01)) round.push(k); continue; }
    cands.push({ x: P.x, y: P.y, a, cost: v.cost, inBrush: v.inBrush, snug: isSnug(P), charge: t });
  }
  if (!cands.length) {
    const x0 = u.x, y0 = u.y;
    for (const k of round) {
      const a = k * 2 * DEG, P = { x: t.x + Math.cos(a) * R, y: t.y + Math.sin(a) * R };
      for (const out of [1.2, 2.4]) {
        const W = { x: t.x + Math.cos(a) * (R + out), y: t.y + Math.sin(a) * (R + out) };
        if (dist(u, W) + out > lim + 1e-6 || dist(u, W) < 0.05) continue;
        const v1 = validateMove(u, W, lim, { charge: t, pre });
        if (!v1.ok) continue;
        u.x = W.x; u.y = W.y;
        const v2 = validateMove(u, P, lim - v1.cost, { charge: t, pre });
        u.x = x0; u.y = y0;
        if (!v2.ok) continue;
        cands.push({ x: P.x, y: P.y, a, cost: v1.cost + v2.cost, inBrush: v1.inBrush + v2.inBrush, snug: isSnug(P), via: W, charge: t });
        break;
      }
    }
  }
  if (!cands.length) return null;
  const angDist = c => { const d = Math.abs(c.a - hint) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  if (hint != null) {
    const near = cands.reduce((a, b) => angDist(a) <= angDist(b) ? a : b);
    const snug = cands.filter(c => c.snug && angDist(c) <= angDist(near) + 30 * DEG);
    return snug.length ? snug.reduce((a, b) => angDist(a) <= angDist(b) ? a : b) : near;
  }
  const cheapest = Math.min(...cands.map(c => c.cost));
  const snug = cands.filter(c => c.snug && c.cost <= cheapest + 1);
  return (snug.length ? snug : cands).reduce((a, b) => a.cost <= b.cost ? a : b);
}
// Charging a model that defends a Barrier from the other side of it (p. 55): the charger stops in base contact with the
// Obstacle as close to the defender as possible, and only one model may Charge a defender over it. The spot carries
// over: { T, t }, the link doMove records on the charger. A model more than twice the Obstacle's height ignores it;
// here it would simply need to Jump it first, so it cannot Charge over it either.
function chargeOver(u, t, T, lim) {
  if (G.units.some(o => o !== u && alive(o) && o.over && o.over.t === t.id && linked(o, t))) return null;
  if (heightOf(u) > 2 * obstacleHt(T) + 1e-6) return null;
  const horiz = T.w >= T.h, side = wallSide(T, u.x, u.y), r = u.r + 0.03, tl = toLocal(T, t.x, t.y);   // in the wall's own frame
  const face = horiz ? (side === 'a' ? T.y - r : T.y + T.h + r) : (side === 'a' ? T.x - r : T.x + T.w + r);   // the charger's centre line along the wall
  const along = horiz ? tl.x : tl.y, lo = (horiz ? T.x : T.y) + u.r, hi = (horiz ? T.x + T.w : T.y + T.h) - u.r;
  const others = G.units.filter(o => o !== u && alive(o)), pre = { others, czFoes: zoneFoes(others, u) };
  let best = null;
  for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.25, -1.25, 1.5, -1.5]) {
    const a = along + off;
    if (a < lo || a > hi) continue;
    const P = horiz ? fromLocal(T, a, face) : fromLocal(T, face, a);
    if (dist(u, P) > lim + 1e-6 || dist(u, P) < 0.05) continue;
    if (Math.abs(levelAt(P.x, P.y) - zOf(t)) > 1e-6) continue;
    const v = validateMove(u, P, lim, { charge: t, pre });
    if (!v.ok) continue;
    best = { x: P.x, y: P.y, cost: v.cost, inBrush: v.inBrush, over: { T, t: t.id }, charge: t };
    break;
  }
  return best;
}
// Elevated Positions (p. 57): a model on raised ground at least half the charger's height above it and no more than its
// height defends it like a Barrier. The plateau t stands on (at its edge), or null. In play once taught
// (G.specials: 'elevated'); a higher ledge is out of reach for a Charge, as before.
export function elevatedFor(u, t) {
  if (G.specials && !G.specials.has('elevated')) return null;
  const dz = zOf(t) - zOf(u), h = heightOf(u);
  if (dz < h / 2 - 1e-6 || dz > h + 1e-6 || t.prone) return null;
  return (G.terrain || []).find(T => T.k === 'plateau' && Math.abs(T.z - zOf(t)) < 1e-6 && ptIn(t.x, t.y, T)) || null;
}
// Fighting up a Siege Ladder (p. 161): a defender on the wall at the top of one of the charger's ladders. The charger
// stands on the ladder against the wall (paying its height), linked to the defender, one charger per ladder.
function ladderFor(u, t) {
  if (zOf(u) > 0.05 || zOf(t) < WALL_Z - 0.05) return null;
  return siegeLadders().find(L => L.side === u.side && rectGap(t.x, t.y, t.r, L) <= 0.08) || null;
}
function chargeLadder(u, t, L, lim) {
  if (G.units.some(o => o !== u && alive(o) && o.over && o.over.T === L)) return null;
  const top = ladderTop(L), dir = L.wall.face === 'n' ? -1 : 1, P = { x: top.x, y: top.y + dir * (u.r + 0.02) };
  const others = G.units.filter(o => o !== u && alive(o)), pre = { others, czFoes: zoneFoes(others, u) };
  const v = Math.hypot(P.x - u.x, P.y - u.y) < 0.05 ? { ok: true, cost: 0, inBrush: 0 } : validateMove(u, P, lim - L.z, { charge: t, pre });
  if (!v.ok) return null;
  return { x: P.x, y: P.y, cost: v.cost + L.z, inBrush: v.inBrush, over: { T: L, t: t.id }, charge: t, ladder: true };
}
// The Charge up to a defender of an Elevated Position: a spot on the charger's own level, in base contact with the
// defender across the edge; one charger only (unless it is attacked from both sides), as over a Barrier.
function chargeUp(u, t, T, lim) {
  if (G.units.some(o => o !== u && alive(o) && o.over && o.over.t === t.id && linked(o, t))) return null;
  // The two bases cannot quite touch across the edge (the charger may not stand over it): base contact here is the
  // charger against the foot of the edge, the defender at its top, at most half an inch apart.
  const z = zOf(u), R0 = u.r + t.r + 0.02;
  const others = G.units.filter(o => o !== u && alive(o)), pre = { others, czFoes: zoneFoes(others, u) };
  let best = null;
  const tl = toLocal(T, t.x, t.y), edge = Math.min(tl.x - T.x, T.x + T.w - tl.x, tl.y - T.y, T.y + T.h - tl.y) - t.r;   // the defender stands at the edge
  if (edge <= 0.5) for (let k = 0; k < 180; k++) for (let R = R0; R <= R0 + 0.5 + 1e-6; R += 0.05) {
    const a = k * 2 * DEG, P = { x: t.x + Math.cos(a) * R, y: t.y + Math.sin(a) * R }, rg = rectGap(P.x, P.y, u.r, T);
    if (rg < -1e-6 || rg > 0.08) continue;
    if (dist(u, P) > lim + 1e-6 || Math.abs(levelAt(P.x, P.y) - z) > 1e-6 || straddles(P.x, P.y, u.r)) continue;
    const v = validateMove(u, P, lim, { charge: t, pre });
    if (!v.ok) continue;
    if (!best || v.cost < best.cost) best = { x: P.x, y: P.y, cost: v.cost, inBrush: v.inBrush, over: { T, t: t.id }, charge: t };
    break;
  }
  return best;
}
// Doorways (p. 57): a 'door' piece is the opening in a 'building' wall (its long side is the opening). A model standing
// in a doorway too narrow for two models defends it like a Barrier against a Charge: the charger stops in the mouth of
// the doorway, one from each side.
export function doorOf(t) {
  if (!alive(t) || t.prone) return null;
  return (G.terrain || []).find(T => T.k === 'door' && Math.max(T.w, T.h) < 4 * t.r && circleRect(t.x, t.y, t.r, T) && (L => ptIn(L.x, L.y, { x: T.x - 0.3, y: T.y - 0.3, w: T.w + 0.6, h: T.h + 0.6 }))(toLocal(T, t.x, t.y))) || null;
}
function chargeDoor(u, t, T, lim) {
  const along = T.w >= T.h, side = wallSide(T, u.x, u.y);   // the passage runs across the long side
  if (G.units.some(o => o !== u && alive(o) && o.side === u.side && o.over && o.over.t === t.id && linked(o, t) && wallSide(T, o.x, o.y) === side)) return null;
  const R = u.r + t.r + 0.02, sg = side === 'a' ? -1 : 1;
  const tl = toLocal(T, t.x, t.y), P = along ? fromLocal(T, tl.x, tl.y + sg * R) : fromLocal(T, tl.x + sg * R, tl.y);
  if (dist(u, P) > lim + 1e-6) return null;
  const others = G.units.filter(o => o !== u && alive(o)), v = validateMove(u, P, lim, { charge: t, pre: { others, czFoes: zoneFoes(others, u) } });
  return v.ok ? { x: P.x, y: P.y, cost: v.cost, inBrush: v.inBrush, over: { T, t: t.id }, charge: t } : null;
}
export function chargeFail(u, t) {
  if (u.noCharge) return `${u.name} is on ${u.noCharge === 'Heroic March' ? 'a Heroic March' : u.noCharge}: it moves 3″ further this turn, but it may not Charge.`;
  const hid = hiddenBy(u.moveStart || u, t, u);
  if (hid.length) return `No Line of Sight: ${hiddenWhy(hid)}. A model can only charge an enemy it could see at the start of its move.`;
  const need = gap(u, t), rem = remaining(u);
  if (need > rem) return `Too far to charge: ${fmtUp(need)}″ to the target, but only ${fmtDown(rem)}″ of Move left.`;
  const D = defends(t);
  if (D && wallSide(D, u.x, u.y) !== wallSide(D, t.x, t.y)) {
    const other = G.units.find(o => o !== u && alive(o) && o.over && o.over.t === t.id && linked(o, t));
    if (other) return `${t.name} defends the ${D.k} and ${other.name} already fights it over it: only one model may Charge a defender over a Barrier. Attack it from its own side, or Charge another defender.`;
    return `${t.name} defends the ${D.k}, so the charger must stop against the ${D.k} as close to it as possible: no free spot there is in reach, or another enemy's Control Zone lies on the way.`;
  }
  // The straight approach often says why: another enemy's Control Zone on the way.
  const d = dist(u, t) || 1, R = u.r + t.r + 0.02;
  const v = validateMove(u, { x: t.x + (u.x - t.x) / d * R, y: t.y + (u.y - t.y) / d * R }, rem, { charge: t });
  if (!v.ok && v.rule === 'cz') return v.why;
  return 'No way through: models or rocks block the path or the space next to the target, or Difficult Terrain makes the path too long.';
}

// The furthest legal point towards a goal, trying a fan of directions. Used by the enemy AI.
export function bestApproach(u, goal, lim) {
  const base = Math.atan2(goal.y - u.y, goal.x - u.x), d0 = Math.hypot(goal.x - u.x, goal.y - u.y);
  let best = null;
  for (const off of [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90]) {
    for (let s = lim; s >= 0.5; s -= 0.5) {
      const a = base + off * DEG, P = { x: u.x + Math.cos(a) * s, y: u.y + Math.sin(a) * s };
      const v = validateMove(u, P, lim);
      if (!v.ok) continue;
      const sc = Math.hypot(goal.x - P.x, goal.y - P.y);
      if (!best || sc < best.sc - 1e-6) best = { x: P.x, y: P.y, cost: v.cost, sc };
      break;
    }
  }
  if (!best || best.sc >= d0 - 0.2) return null;
  return best;
}

/* ---------- Shooting ---------- */
// Missile Weapons (p. 106–107). u.missiles: every one the model carries (setup.js); u.bow: the one it shoots with now
// (shotInfo readies the best one for the target). A weapon: { n, rng, s } and its kind: still (a crossbow: no shot after
// moving), sling (two shots after not moving at all), thrown (a throwing weapon: shoots after any move, may be thrown as
// the model Charges), poison (a blowpipe: Poisoned Attacks).
// Thrown stones only while Throw Stones is in play (special.js).
const weaponsOfU = u => (u.missiles && u.missiles.length ? u.missiles : u.bow ? [u.bow] : []).filter(w => !w.stones || rule(u, 'Throw Stones') != null);
function reasonFor(u, w) {
  if (u.stunned) return 'was thrown from the saddle this turn and cannot act';
  if (inDeep(u)) return 'is swimming in Deep Water and cannot shoot';
  if (isSentry(u)) return 'is a Sentry, and Sentries do not shoot until the alarm is raised';
  if (spellbound(u)) return 'is Transfixed or Paralysed and cannot shoot';
  if (u.shot) return 'has already shot this turn';
  if (u.prone) return 'is Prone, and Prone models never shoot';
  if (u.crossTried) return 'tried a Jump, Leap or Climb this turn, so it cannot shoot';
  if (engaged(u)) return 'is Engaged in Combat and cannot shoot';
  if (w.still && u.movedDist > 0) return `moved this turn, and a ${w.n.toLowerCase()} cannot shoot after moving`;
  if (!w.thrown && !freeShot(u) && u.movedDist > shootMove(u) / 2 + 1e-6) return `moved ${fmt(u.movedDist)}″, more than half its Move (${fmt(shootMove(u) / 2)}″)`;
  return null;
}
// Why model u cannot shoot now with any of its Missile Weapons, or null.
export function shooterReason(u) {
  if (u.busy) return `tried to ${u.busy} this turn`;   // narrative.js: Storehouses
  const L = weaponsOfU(u);
  if (!L.length) return 'has no missile weapon';
  const rs = L.map(w => reasonFor(u, w));
  return rs.includes(null) ? null : rs[0];
}
// Light armour: +1 Defence against Shooting Attacks only (p. 110). An Elven cloak on an Infantry model: −1 To Hit for
// shots at it, and Stalk Unseen (p. 109, 131): partly hidden by terrain, it cannot be seen from more than 6″.
// Light armour (+1 against shooting) and Shieldwall.
export const shotArmour = t => ((t.T.gear || []).some(g => /^light armour$/i.test(g)) ? 1 : 0) + (shieldwallOn(t) ? 1 : 0);
// Shieldwall (p. 129): +1 Defence for a model with the rule and a shield in base contact with two or more friends that
// have both too; not Prone, not Cavalry (neither the model nor the friends). In Combat it is worked out before Backing
// Away (combat.js: shieldwallSnap; FAQ: a model knocked Prone by a Cavalry Charge keeps it for that Combat).
const walls = u => alive(u) && !u.prone && !u.cav && rule(u, 'Shieldwall') != null && (u.T.gear || []).some(g => /^(light )?shield/i.test(g));
export const shieldwallOn = u => walls(u) && G.units.filter(o => o !== u && o.side === u.side && walls(o) && touching(u, o)).length >= 2;
const hasCloak = t => (t.T.gear || []).some(g => /^elven cloak$/i.test(g));
export const cloaked = t => !t.cav && hasCloak(t);
export const stalks = t => !t.cav && (hasCloak(t) || rule(t, 'Stalk Unseen') != null);
const concealed = (s, t) => inTheWay(s, t).some(o => o.kind !== 'model') || coverIgnored(s, t).length > 0;
// Throwing as it Charges (p. 107): once per turn a model with a throwing weapon that Charges t may stop 1″ from it and
// throw (no penalty for moving), then finish the Charge if t survives. The weapon, or null when it cannot throw now.
export function throwWeapon(u, t) {
  const w = weaponsOfU(u).find(x => x.thrown);
  if (!w || u.threw || u.shot || u.prone || u.stunned || !t || !alive(t)) return null;
  return w;
}
// Where model u, moving straight towards its Charge spot P, comes within 1″ of t: { x, y, frac } (frac: the share of
// the move made), or u's own spot when it starts within 1″.
export function throwSpot(u, P, t) {
  if (gap(u, t) <= 1 + 1e-6) return { x: u.x, y: u.y, frac: 0 };
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (gapXY(u.x + (P.x - u.x) * m, u.y + (P.y - u.y) * m, u.r, t) <= 1) hi = m; else lo = m; }
  return { x: u.x + (P.x - u.x) * hi, y: u.y + (P.y - u.y) * hi, frac: hi };
}
// The shot of a throw at t from where u stands now, with the throwing weapon readied.
export function throwInfo(u, t) {
  const w = throwWeapon(u, t); if (!w) return { ok: false };
  u.bow = w; u.throwing = true;
  try { const i = shotInfoWith(u, t); i.wpn = w; return i; } finally { u.throwing = false; }
}
// Shooting Attacks a model may make this phase: a sling twice when the model did not move at all (p. 107).
// Throw Stones (p. 131): at the start of the Shoot phase a model without another Missile Weapon that did not Move
// readies its stones (u.bow), so it shoots like an archer; freshTurn (setup.js) puts them away.
export function readyStones(units) {
  for (const u of units) {
    const st = (u.missiles || []).find(w => w.stones);
    if (st && !u.bow && alive(u) && !(u.movedDist > 0) && rule(u, 'Throw Stones') != null) u.bow = st;
  }
}
// Expert Shot (p. 124): two Shooting Attacks, one at a time, with the same weapon.
export const shotsAllowed = u => (u.bow && u.bow.howdah ? Math.max(1, u.howdahW ?? u.T.warBeast.howdah.w) : u.bow && u.bow.sling && !(u.movedDist > 0) ? 2 : rule(u, 'Expert Shot') != null && !(u.bow && u.bow.stones) ? 2 : 1);
// A Shooting Attack made: the model is done shooting once it has made all it may.
export function spendShot(u) { u.shots = (u.shots || 0) + 1; u.shot = u.shots >= shotsAllowed(u); }
// The Shoot Value: 1 worse after moving, except for a weapon thrown as the model Charges (u.throwing).
export const shootVal = s => Math.min(6, s.sh + (s.movedDist > 0 && !s.throwing && !freeShot(s) ? 1 : 0));
// The To Hit roll of s at t with its parts ({ value, parts: [{ v, t, why }] }, as combat.js: duelModParts): the Shoot
// Value, 1 worse after moving (shootVal), 1 worse at a model in an elven cloak or under Blessing of the Valar, never
// worse than 6+; Blinding Light makes it 6+. shotInfo takes its value, so the shown parts and the roll always agree.
export function hitParts(s, t) {
  if (blinded(s, t)) return { value: 6, parts: [{ v: 6, t: 'blinded: only a 6 hits', why: 'magic' }] };
  const parts = [
    { v: s.sh, t: 'Shoot Value', why: 'hit' },
    s.movedDist > 0 && !s.throwing && !freeShot(s) && { v: 1, t: 'moved this turn', why: 'hit' },
    cloaked(t) && { v: 1, t: 'target wears an elven cloak', why: null },
    valarShot(t) && { v: 1, t: 'Blessing of the Valar', why: 'magic' },
  ].filter(Boolean);
  return { value: Math.min(6, parts.reduce((a, p) => a + p.v, 0)), parts };
}
// A Chariot or the Great Beast's Howdah shoots however far it Moved, with no −1 (p. 150, 153).
const freeShot = u => !!(u.T.chariot || (u.bow && u.bow.howdah));

// Every model in the same fight as t (connected by base contact with enemies).
export function combatOf(t) {
  const set = new Set([t.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of G.units) {
      if (!alive(a) || set.has(a.id)) continue;
      if (G.units.some(b => set.has(b.id) && alive(b) && b.side !== a.side && touching(a, b))) { set.add(a.id); grew = true; }
    }
  }
  return set;
}
/* The shooter's view. A model looks from its head (the centre of its base) at the whole target, so anything that
   hides any part of the target's base is In The Way, not only what the line between the centres crosses.
   From above that view is a wedge: all points between the shooter's centre and the target's base. A fraction k of
   the way along, the wedge is a circle around the point k of the way between the centres, k × the target's radius wide. */
const VIEW_EPS = 0.01;   // overlaps thinner than this (bases that only touch the wedge) hide nothing
// Where the wedge from s to t first overlaps a shape, given the shape's distance function (0 or less inside) and its
// nearest point. Returns { at: inches from the shooter's centre, pt: the shape's point nearest the wedge there } or null.
function wedgeHit(s, t, distTo, nearest) {
  const dx = t.x - s.x, dy = t.y - s.y;
  const g = k => distTo(s.x + dx * k, s.y + dy * k) - t.r * k;   // convex in k, below 0 where the wedge overlaps
  let lo = 0, hi = 1;
  for (let i = 0; i < 36; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (g(a) < g(b)) hi = b; else lo = a; }
  let b = (lo + hi) / 2, a = 0;
  if (g(b) > -VIEW_EPS) return null;
  for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (g(m) <= -VIEW_EPS) b = m; else a = m; }
  return { at: b * Math.hypot(dx, dy), pt: nearest(s.x + dx * b, s.y + dy * b) };
}
function wedgeHitsRect(s, t, T) {
  // Quick miss: the wedge lies inside the box around the shooter's centre and the target's base.
  const B = pieceBox(T);
  if (B.x > Math.max(s.x, t.x + t.r) || B.x + B.w < Math.min(s.x, t.x - t.r) || B.y > Math.max(s.y, t.y + t.r) || B.y + B.h < Math.min(s.y, t.y - t.r)) return null;
  return wedgeHit(s, t, (x, y) => rectDist(x, y, T), (x, y) => rectNearest(x, y, T));
}
function wedgeHitsModel(s, t, o) {
  // Quick miss: the wedge is never wider than the target's base, and o must be between the two models.
  const dx = t.x - s.x, dy = t.y - s.y, L = Math.hypot(dx, dy);
  const along = ((o.x - s.x) * dx + (o.y - s.y) * dy) / L, side = Math.abs((o.x - s.x) * dy - (o.y - s.y) * dx) / L;
  if (along < -o.r || along > L + o.r || side >= o.r + t.r) return null;
  return wedgeHit(s, t, (x, y) => Math.hypot(x - o.x, y - o.y) - o.r, (x, y) => {
    const d = Math.hypot(x - o.x, y - o.y);
    return d <= o.r ? { x, y } : { x: o.x + (x - o.x) / d * o.r, y: o.y + (y - o.y) / d * o.r };
  });
}
/* Sight in three dimensions (Line of Sight, p. 18; Prone, p. 36; In The Way, p. 41). A model looks from its head, near
   the top of its true height on the ground it stands on, at every part of the target from its feet to its head: the
   sight lines run from the viewer's head to points spread across the target's base and up its height. A model hides a
   line that passes through it below the top of its head; terrain as terrain-types.js says (sightShapes): rocks and
   buildings up to their top, raised ground where the line dips below it, cover only for In The Way. So a man on a
   hill sees over the men in front of him, a cliff hides the men below it, and a man can't hide a troll. */
const sightHt = u => { const h = Math.max(heightOf(u), u.cav ? 2 : 0); return u.prone ? h / 2 : h; };   // a Prone model: half its height
// The viewer: model `self` looking from point s (its own spot, or where it stood: a charger's start).
function viewer(s, self) {
  const z = s === self ? zOf(self) : levelAt(s.x, s.y);
  return { x: s.x, y: s.y, r: self.r, side: self.side, ez: z + 0.9 * sightHt(self) };
}
const LAT = 7, VERT = 4;   // 15 points across the target's base, 5 from its feet to its head
function sightLines(v, t) {
  const dx = t.x - v.x, dy = t.y - v.y, L = Math.hypot(dx, dy) || 1e-9, ux = -dy / L, uy = dx / L, z0 = zOf(t), ht = sightHt(t), out = [];
  for (let i = 0; i <= 2 * LAT; i++) {
    const j = (i / LAT - 1) * 0.98 * t.r;
    for (let m = 0; m <= VERT; m++) out.push({ x: t.x + ux * j, y: t.y + uy * j, z: z0 + 0.05 + (ht * 0.95 - 0.05) * m / VERT });
  }
  return out;
}
// The same for model o: a column on its base (less VIEW_EPS), from its level up to the top of its head.
function lineHitsModel(v, P, o) {
  const dx = P.x - v.x, dy = P.y - v.y, fx = v.x - o.x, fy = v.y - o.y, r = o.r - VIEW_EPS;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r, D = b * b - 4 * a * c;
  if (a < 1e-12 || D <= 0) return null;
  const k1 = Math.max(0, (-b - Math.sqrt(D)) / (2 * a)), k2 = Math.min(1, (-b + Math.sqrt(D)) / (2 * a));
  if (k1 > k2) return null;
  const z1 = v.ez + (P.z - v.ez) * k1, z2 = v.ez + (P.z - v.ez) * k2, bot = zOf(o), top = bot + sightHt(o);
  return Math.min(z1, z2) < top && Math.max(z1, z2) > bot ? k1 : null;
}
// The ground a terrain piece stands on (a rock on a hill stands higher).
const groundUnder = T => (T.k === 'plateau' || !hasLevels() ? 0 : levelAt(T.x + T.w / 2, T.y + T.h / 2));
const shapesOf = T => sightShapes(T, groundUnder(T));
// The name of a piece in messages: as before for the old kinds, the library's name for raised ground.
const pieceName = T => (T.k === 'plateau' ? kindOf(T).name : T.k);
const hideName = T => (T.k === 'plateau' ? (T.fort ? 'the wall' : 'the high ground') : T.k === 'building' ? 'the building' : 'the rocks');
// The first place piece T hides a sight line from v to t: { at: inches from v, pt: the point } or null.
function pieceHit(v, t, T, lines) {
  const S = shapesOf(T).filter(B => wedgeHitsRect(v, t, B));
  if (!S.length) return null;
  return firstHit(v, lines, P => S.reduce((m, B) => { const k = lineHitsBox(v, P, B); return k != null && (m == null || k < m) ? k : m; }, null));
}
function firstHit(v, lines, hit) {
  let best = null;
  for (const P of lines) { const k = hit(P); if (k != null && (!best || k < best.k)) best = { k, P }; }
  if (!best) return null;
  const { k, P } = best;
  return { at: k * Math.hypot(P.x - v.x, P.y - v.y), pt: { x: v.x + (P.x - v.x) * k, y: v.y + (P.y - v.y) * k } };
}
// What hides the whole target t from a model at s (names; empty if it can see some part of t, so it has Line of Sight).
// Rocks, buildings, raised ground and models hide; cover never hides a target whole. Friends the viewer could shoot
// over the shoulder of don't hide anything. `self` is the viewing model when s is only where it stood (a charger's start).
export function hiddenBy(s, t, self = s) {
  if (t === self) return [];
  const v = viewer(s, self), blocks = [];
  for (const T of G.terrain) for (const B of shapesOf(T)) if (B.role !== 'cover' && wedgeHitsRect(v, t, B)) blocks.push({ B, name: hideName(T) });
  const models = G.units.filter(o => o !== self && o !== t && alive(o) && !overShoulder(v, o) && wedgeHitsModel(v, t, o));
  if (!blocks.length && !models.length) return [];
  const used = new Set();
  for (const P of sightLines(v, t)) {
    const m = models.find(o => lineHitsModel(v, P, o) != null), b = m ? null : blocks.find(x => lineHitsBox(v, P, x.B) != null);
    if (!m && !b) return [];
    used.add(m ? m.name : b.name);
  }
  return [...used];
}
export const losBlocked = (s, t, self) => hiddenBy(s, t, self).length > 0;
const hiddenWhy = list => `${list.join(' and ')} ${list.length > 1 || list[0] === 'the rocks' ? 'hide' : 'hides'} the whole target`;
// Shooting From Behind Friends: a friend in base contact with the shooter, with the same base size or smaller and not
// Engaged in Combat, is ignored (the shooter shoots over its shoulder).
const overShoulder = (s, o) => o !== s && alive(o) && o.side === s.side && gap(s, o) <= 0.08 && o.r <= s.r && !engaged(o);
// Every model and piece of terrain that hides part of t from shooter s, closest first: { kind: 'model' | 'terrain',
// u | T, name, at, pt }.
export function inTheWay(s, t) {
  const res = [], v = viewer(s, s), lines = sightLines(v, t);
  const fight = engaged(t) ? combatOf(t) : null;
  // Large Target (p. 126): only Monsters, Siege Engines and War Beasts are In The Way of a shot at it.
  const large = rule(t, 'Large Target') != null;
  for (const o of G.units) {
    if (o === s || o === t || !alive(o)) continue;
    if (large && !o.T.monster && !/(Monster|Siege Engine|War Beast)/.test(o.T.kw || '')) continue;
    if (fight && fight.has(o.id)) continue;
    if (overShoulder(s, o) || !wedgeHitsModel(v, t, o)) continue;
    const h = firstHit(v, lines, P => lineHitsModel(v, P, o));
    if (h) res.push({ kind: 'model', u: o, name: o.name, ...h });
  }
  const over = shoulderFriends(s, t);
  for (const T of G.terrain) {
    if (!obstructs(T) || ignoresCover(s, T, over)) continue;
    const h = pieceHit(v, t, T, lines);
    if (h) res.push({ kind: 'terrain', name: pieceName(T), T, ...h });
  }
  return res.sort((a, b) => a.at - b.at);
}
// Shooting From Behind Cover: a shooter in base contact with cover it can see over or around (or standing in it)
// ignores that cover. A rock it touches is ignored too while it can still see the target around it. Raised ground is
// ignored only by a model standing on it (it shoots down over the edge), never by one at its foot.
const touchesCover = (s, T) => (T.k === 'plateau'
  ? ptIn(s.x, s.y, T) && Math.abs(levelAt(s.x, s.y) - T.z) < 1e-6
  : ptIn(s.x, s.y, T) || circleRect(s.x, s.y, s.r + 0.08, T));
// The friends the shooter fires over the shoulder of on this shot: ignored friends that would otherwise be In The Way.
const shoulderFriends = (s, t) => G.units.filter(o => o !== t && overShoulder(s, o) && wedgeHitsModel(s, t, o));
// A Barrier (here a low wall) that such a friend touches is ignored too, as if the shooter touched it.
const viaFriend = (T, over) => T.k === 'wall' ? over.find(f => touchesCover(f, T)) : null;
const ignoresCover = (s, T, over) => touchesCover(s, T) || !!viaFriend(T, over);
// The cover a model is touching (names), e.g. ['wall'].
export const coverTouched = u => G.terrain.filter(T => isCover(T) && touchesCover(u, T)).map(T => T.k);
// Cover that hides part of the target but that the shooter ignores: { k: kind, by: the friend's name when the
// shooter ignores it because it fires over the shoulder of a friend touching it }.
export function coverIgnored(s, t) {
  const over = shoulderFriends(s, t), res = [], v = viewer(s, s);
  let lines = null;
  for (const T of G.terrain) {
    if (!obstructs(T) || !shapesOf(T).some(B => wedgeHitsRect(v, t, B))) continue;
    const mine = touchesCover(s, T), f = mine ? null : viaFriend(T, over);
    if (!mine && !f) continue;
    // Touched cover the shot passes over is named even when it hides nothing from up here (the lesson of cover).
    if (!(mine && isCover(T)) && !pieceHit(v, t, T, lines ??= sightLines(v, t))) continue;
    res.push(mine ? { k: pieceName(T) } : { k: pieceName(T), by: f.name });
  }
  return res;
}
export const coverNote = c => c.by
  ? `shoots over the shoulder of ${c.by}, who is touching the ${c.k}, so it ignores the ${c.k} too`
  : `is touching the ${c.k}, so it shoots ${c.k === 'rock' ? 'around' : 'over'} it`;
export function shotInfo(s, t) {
  const L = weaponsOfU(s);
  if (L.length === 1 && s.bow !== L[0]) s.bow = L[0];   // thrown stones: the only weapon of a model without a bow
  if (L.length < 2) return shotInfoWith(s, t);
  // Several Missile Weapons: the one with the best chance at t is readied (s.bow), a shot that can be made first.
  let best = null;
  for (const w of L) {
    s.bow = w;
    const i = shotInfoWith(s, t); i.wpn = w;
    if (!best || (i.ok && !best.ok) || (i.ok === best.ok && (i.p || 0) > (best.p || 0))) best = i;
  }
  s.bow = best.wpn;
  return best;
}
// The range of a shot (p. 40): shooting down from higher ground, from the shooter's base to the closest part of the
// target (the top of its head when that is closest); shooting up, base to base. On one level: the gap between the bases.
export function shotGap(s, t) {
  const dz = zOf(s) - zOf(t);
  if (Math.abs(dz) < 0.05) return gap(s, t);
  const flat = Math.max(0, dist(s, t) - s.r - t.r), up = dz > 0 ? Math.max(0, dz - sightHt(t)) : -dz;
  return Math.hypot(flat, up);
}
function shotInfoWith(s, t) {
  const r0 = s.bow ? reasonFor(s, s.bow) : 'has no missile weapon';
  if (r0) return { ok: false, why: `${s.name} ${r0}.`, rule: 'shoot' };
  if (invisible(t)) return { ok: false, why: `${t.name} is Invisible: it cannot be targeted, nor seen.`, rule: 'invisible' };
  if (t.T.gate && s.bow.s < 5) return { ok: false, why: `Only a shot of Strength 5 or more can damage ${t.name}.`, rule: 'siege' };
  const tEng = engaged(t);
  if (tEng && alignOf(s.side) === 'good') return { ok: false, why: `${t.name} is Engaged in Combat. Good models never shoot into a fight.`, rule: 'shootFight' };
  const g = shotGap(s, t);
  if (stalks(t) && rule(s, 'Fell Sight') == null && g > 6 + 1e-6 && concealed(s, t)) return { ok: false, why: `${t.name} stalks unseen: partly hidden by terrain, it cannot be seen from more than 6″ (it is ${fmt(g)}″ away).`, rule: 'stalkUnseen', g };
  if (tooDark(s, t)) return { ok: false, why: `It is night: ${s.name} cannot see ${t.name}, ${fmt(g)}″ away (models see 12″ in the dark).`, rule: 'night', g };
  if (g > s.bow.rng + 1e-6) return { ok: false, why: `Out of range: ${fmt(g)}″, and the ${s.bow.n.toLowerCase()} only reaches ${s.bow.rng}″.`, rule: 'shoot', g };
  const hid = hiddenBy(s, t);
  if (hid.length) return { ok: false, why: `No Line of Sight: ${hiddenWhy(hid)}.`, rule: 'shoot', itw: inTheWay(s, t) };
  const itw = inTheWay(s, t);
  if (alignOf(s.side) === 'good') {
    const own = itw.find(o => o.kind === 'model' && o.u.side === s.side);
    if (own) {
      if (gap(s, own.u) <= 0.08 && engaged(own.u)) return { ok: false, rule: 'itw', itw, why: `${own.name} is in base contact with the shooter, but it is Engaged in Combat, so the shooter cannot shoot over its shoulder. It counts as In The Way, and Good models never risk hitting a friend.` };
      const near = gap(s, own.u) < 0.8 && own.u.r <= s.r && !engaged(own.u);
      return { ok: false, rule: 'itw', itw, why: `Your own model (${own.name}) hides part of the target, so it is In The Way. Good models cannot shoot past friends.${near ? ` Move the shooter into base contact with ${own.name} and it will be ignored.` : ''}` };
    }
    const brawl = itw.find(o => o.kind === 'model' && engaged(o.u));
    if (brawl) return { ok: false, itw, why: `${brawl.name} is In The Way and is fighting one of your models. Good models never risk hitting a friend.`, rule: 'itw' };
  }
  // A Cavalry model: the shot is aimed at the rider, but on a 1–3 it hits the mount instead (p. 70), so the chance to
  // wound is the mean of the two parts (needM: the mount's To Wound). A Sharpshooter (Heroic Accuracy) aims at either
  // part and hits it without that test (p. 130): aim, the part with the better chance.
  const need = woundNeed(s.bow.s, t.d + shotArmour(t)), needM = t.cav ? woundNeed(s.bow.s, t.mount.d) : null;
  if (!need && !needM) return { ok: false, why: `The ${s.bow.n.toLowerCase()} (Strength ${s.bow.s}) cannot wound Defence ${t.d}.`, rule: 'wound' };
  // Magic: Blinding Light near the target, only a 6 hits; Protection of the Valar on it, −1 To Hit (p. 116, 119).
  const hit = hitParts(s, t), sv = hit.value, re = !!s.itwReroll, pT = re ? 0.75 : 0.5;   // an In The Way Test, with a re-roll of a failure or without
  const aim = t.cav && s.sharp && pNeed(needM) > pNeed(need) ? 'mount' : 'rider';
  const w1 = rule(s, 'Master Archer') != null ? 5 / 6 : 0.5, pItw = re ? 1 - (1 - w1) ** 2 : w1;   // Master Archer: In The Way fails only on a 1
  const pH = (7 - sv) / 6, pI = Math.pow(pItw, itw.length) * (tEng ? pT : 1);
  const db = darkBonus(t), pW = !t.cav ? pNeed(need, db) : s.sharp ? pNeed(aim === 'mount' ? needM : need, db) : pT * pNeed(need, db) + (1 - pT) * pNeed(needM, db);
  // Cover In The Way that the shooter stands close to but does not touch: in base contact it would be ignored.
  const close = itw.filter(o => o.T && o.T.k === 'wall' && rectGap(s.x, s.y, s.r, o.T) < 0.6).map(o => ({ k: o.T.k, gap: Math.max(0.01, rectGap(s.x, s.y, s.r, o.T)) }));
  // Friends in base contact the shooter fires over the shoulder of, and which would otherwise hide part of the target.
  const v = viewer(s, s), lines = sightLines(v, t);
  const over = shoulderFriends(s, t).filter(o => firstHit(v, lines, P => lineHitsModel(v, P, o))).map(o => o.name);
  const info = { ok: true, g, itw, ignored: coverIgnored(s, t), over, close, need, needM, sv, hit: hit.parts, tEng, pH, pI, pW, p: pH * pI * pW, reroll: re, sharp: !!(t.cav && s.sharp), aim };
  // A Hero may spend Might on its To Hit, In The Way and To Wound rolls: pM, the chance when it spends its points wherever
  // a roll falls short (only shown when it has any).
  if (isHero(s) && s.might > 0) info.pM = shotChance(s, t, info, s.might);
  return info;
}
// The chance that a shot from s wounds t (aimed at part aim), with m Might Points to spend where a roll falls short.
export function shotChance(s, t, info, m, aim = info.aim) {
  const pre = [{ need: info.sv }, ...info.itw.map(() => ({ need: 4, reroll: info.reroll })), ...(info.tEng ? [{ need: 4, reroll: info.reroll }] : [])];
  const part = p => [...pre, { wound: woundNeed(s.bow.s, p === 'mount' ? t.mount.d : t.d + shotArmour(t)), nat6: p === 'rider' && !!t.def6 }];
  if (!t.cav) return chainOdds(part('rider'), m);
  if (info.sharp) return chainOdds(part(aim), m);
  const pT = info.reroll ? 0.75 : 0.5, other = aim === 'mount' ? 'rider' : 'mount';
  return pT * chainOdds(part(aim), m) + (1 - pT) * chainOdds(part(other), m);
}

// The archer's ruler: what model u could shoot at from P after a move costing `cost` (its position is borrowed for the
// check and put back). shots: every enemy within the weapon's range, clear shots first (best chance first), then the
// blocked ones with the reason; reason: why it could not shoot at all after that move (moved too far, a crossbow…).
export function shotsFrom(u, P, cost) {
  const { x, y, movedDist } = u;
  u.x = P.x; u.y = P.y; u.movedDist = movedDist + cost;
  try {
    const reason = shooterReason(u);
    const shots = reason ? [] : sideAlive(u.side === 'good' ? 'evil' : 'good')
      .map(t => ({ t, g: shotGap(u, t), info: shotInfo(u, t) })).filter(s => s.g <= u.bow.rng + 1e-6)
      .sort((a, b) => (b.info.ok ? 1 : 0) - (a.info.ok ? 1 : 0) || (b.info.p || 0) - (a.info.p || 0) || a.g - b.g);
    return { reason, rng: u.bow.rng, shots, P: { x: P.x, y: P.y } };
  } finally { u.x = x; u.y = y; u.movedDist = movedDist; }
}

// A Shooting Attack, step by step (p. 40–45, 70–71, 77–78, 84): the To Hit roll; an In The Way Test for each obstruction,
// closest first (a model that stops the shot is hit instead); the special In The Way Test of a shot into a fight (1–3:
// the shooter's friend nearest to it is hit); the special In The Way Test that tells whether a Cavalry model's rider or
// mount is hit (none for a Sharpshooter, which hits the part it aimed at); then To Wound against what was hit. A failed
// In The Way Test is re-rolled first when the shooter may (Heroic Accuracy, Take Aim), and the shooter's own Might comes
// last on every roll (dice.js). aim: the part of a Cavalry target the shot is aimed at. Returns { steps, target, part,
// need, wound, stopAt }: target null for a miss or a shot stopped by terrain (stopAt: where), the To Wound roll is the
// last step ({ k: 'wound', need, dice, ok }).
export function* shotSeq(s, t, info, aim = info.aim || 'rider') {
  if (info.wpn) s.bow = info.wpn;
  const steps = [], re = s.itwReroll || null, ctx = { s, t, info };
  const h = yield* d6Test(s, info.sv, { step: 'hit', label: `To Hit ${info.sv}+${s.movedDist > 0 ? ' (moved)' : ''}`, ctx });
  steps.push({ k: 'hit', v: h.v, ok: h.ok, die: h });
  if (!h.ok) return { steps, target: null };
  let target = t;
  for (const ob of info.itw) {
    const n = rule(s, 'Master Archer') != null ? 2 : 4;   // Master Archer (King's Huntsman): fails only on a natural 1
    const r = yield* d6Test(s, n, { step: 'itw', reroll: re, label: `In The Way: ${ob.name} ${n}+`, ctx: { ...ctx, ob } });
    steps.push({ k: 'itw', ob, v: r.v, ok: r.ok, die: r });
    if (r.ok) continue;
    if (ob.kind !== 'model') return { steps, target: null, stopAt: ob.pt };
    target = ob.u; break;
  }
  if (target === t && info.tEng) {
    const fight = combatOf(t), mates = G.units.filter(o => alive(o) && o.side === s.side && fight.has(o.id));
    const mate = mates.length ? mates.reduce((a, b) => (dist(s, a) <= dist(s, b) ? a : b)) : null;
    const r = yield* d6Test(s, 4, { step: 'fight', reroll: re, label: 'Into the fight 4+', ctx: { ...ctx, mate } });
    if (!r.ok && mate) target = mate;
    steps.push({ k: 'fight', v: r.v, ok: r.ok, target, die: r });
  }
  // A Cavalry model: 4+ hits the part aimed at, 1–3 the other part (p. 71). A Sharpshooter needs no test (p. 130).
  let part = 'rider';
  if (target.cav) {
    const aimed = target === t ? aim : 'rider', other = aimed === 'mount' ? 'rider' : 'mount';
    if (s.sharp && target === t) { part = aimed; steps.push({ k: 'sharp', part }); }
    else {
      const mount = target.mount.n.toLowerCase();
      const r = yield* d6Test(s, 4, { step: 'cav', reroll: re, label: `Rider or ${mount}? 4+ the ${aimed === 'mount' ? mount : 'rider'}`, ctx: { ...ctx, target, aimed } });
      part = r.ok ? aimed : other;
      steps.push({ k: 'cav', v: r.v, ok: r.ok, part, aimed, die: r });
    }
  }
  target.shotHit = G.turn;   // a Sentry that survives a hit raises the alarm (advanced.js)
  const plus = part === 'mount' ? 0 : shotArmour(target), d = (part === 'mount' ? target.mount.d : target.d) + plus, need = woundNeed(s.bow.s, d);
  if (!need) return { steps, target, part, need: null, wound: false };
  // Re-rolls (p. 122, 128): Bane of Kings every failed roll, Poisoned Attacks (or a poisoned weapon) a natural 1.
  const reroll = rule(s, 'Bane of Kings') != null ? 'fails' : s.bow.poison || rule(s, 'Poisoned Attacks') != null ? 'ones' : null;
  const rrText = reroll === 'fails' ? ' (Bane of Kings: re-roll fails)' : reroll ? ' (Poisoned: re-roll 1s)' : '';
  const db = darkBonus(target);   // a shot in the dark: +1 To Wound
  const w = yield* woundRoll(s, target, { s: s.bow.s, part, dPlus: plus, reroll, bonus: db, label: `To Wound S${s.bow.s} vs D${d}: ${needStr(need)}${rrText}${db ? ' (+1 in the dark)' : ''}` });
  steps.push({ k: 'wound', need, dice: w.dice, ok: w.ok });
  return { steps, target, part, need, wound: w.ok };
}

/* ---------- Fighting ---------- */
// Groups of models in base contact with enemies. Each group is one fight.
export function findFights() {
  const A = G.units.filter(u => alive(u) && !inert(u)), parent = new Map(A.map(u => [u.id, u.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (a.side !== b.side && touching(a, b)) parent.set(find(a.id), find(b.id));
  }
  const groups = new Map();
  for (const u of A) { const r = find(u.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(u); }
  return [...groups.values()].filter(g => g.some(u => u.side === 'good') && g.some(u => u.side === 'evil'))
    .sort((a, b) => Math.min(...a.map(u => u.x)) - Math.min(...b.map(u => u.x)));
}

// A spot a short distance d further away from `from`, or null if that spot is blocked.
export function nudgeAway(m, from, d) {
  const dx = m.x - from.x, dy = m.y - from.y, L = Math.hypot(dx, dy) || 1;
  const P = { x: m.x + dx / L * d, y: m.y + dy / L * d };
  if (P.x < m.r || P.y < m.r || P.x > G.W - m.r || P.y > G.H - m.r) return null;
  if (blockedAt(P.x, P.y, m.r) || stepHitsWall(m, P, m.r) || straddles(P.x, P.y, m.r) || Math.abs(levelAt(P.x, P.y) - zOf(m)) > 1e-6) return null;
  for (const o of G.units) { if (o !== m && alive(o) && gapXY(P.x, P.y, m.r, o) < -0.01) return null; }
  return P;
}

const offTable = (x, y, r) => x < r || y < r || x > G.W - r || y > G.H - r;
// Models that stop a model of radius r (ignoring `skip`) from standing at x, y: any overlap, or base contact with an enemy.
const standBlockers = (x, y, r, side, skip) => G.units.filter(o => !skip.includes(o) && alive(o) && (gapXY(x, y, r, o) < -0.01 || (o.side !== side && gapXY(x, y, r, o) <= 0.08)));

// Where a loser can Back Away 1″, or null if it is Trapped. When only a friend blocks the way, that friend may
// Make Way (2024 rules): one friendly model that is not Engaged moves up to 1″ to clear the path. The spot then
// carries makeWay: { u, x, y }, where the friend goes.
export const backAwaySpot = (l, W, contacts) => backAwayOptions(l, W, contacts, true)[0] || null;
// Every spot a loser can Back Away to, most direct first: free spots, then spots where one friend has to Make Way
// (those carry makeWay). An empty list means the loser is Trapped. first: stop at the first spot found.
// The rules only say "1″ in a straight line, not necessarily directly away"; the app allows up to 60° off straight back.
// A Prone loser is always Trapped (p. 52). Backing Away may walk down a drop no deeper than the model, but not cross an
// Obstacle or take a test; with nowhere else to go, a loser at the edge of a deeper drop must Back Away over it and
// falls (p. 51): such a spot carries fall (inches) and is where it lands.
export function backAwayOptions(l, W, contacts, first) {
  if (l.prone) return [];
  const opp = W.filter(w => contacts.has(w.id + ':' + l.id));
  let vx = 0, vy = 0;
  for (const w of opp) { const d = dist(l, w) || 1; vx += (l.x - w.x) / d; vy += (l.y - w.y) / d; }
  const mag = Math.hypot(vx, vy);
  const base = mag > 0.15 ? Math.atan2(vy, vx) : 0;
  const angs = mag > 0.15 ? [0, 15, -15, 30, -30, 45, -45, 60, -60] : [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const h = heightOf(l), z = zOf(l), drops = [];
  const level = P => {   // can the loser stand at P after a 1″ step? Over a deep drop, where it would land.
    if (!hasLevels()) return true;
    const d = levelAt(P.x, P.y) - z;
    if (!straddles(P.x, P.y, l.r) && d <= h / 2 + 1e-6 && d >= -h - 1e-6) return true;
    const dx = P.x - l.x, dy = P.y - l.y;
    for (let k = 0; k <= 40; k++) {
      const Q = { x: P.x + dx * k * 0.05, y: P.y + dy * k * 0.05 };
      if (offTable(Q.x, Q.y, l.r)) break;
      if (!straddles(Q.x, Q.y, l.r) && levelAt(Q.x, Q.y) < z - h - 1e-6) { drops.push({ x: Q.x, y: Q.y, fall: z - levelAt(Q.x, Q.y) }); break; }
    }
    return false;
  };
  // Besides the fixed angles: the 1″ steps that end in base contact with a friend, so the line keeps together (and a
  // spear behind the loser can still Support it). Those touching a friend with a spear or pike come first.
  const steps = angs.map(a => ({ x: l.x + Math.cos(base + a * DEG), y: l.y + Math.sin(base + a * DEG) }));
  const keep = [];
  for (const f of G.units) {
    if (f === l || !alive(f) || f.side !== l.side) continue;
    const d = dist(l, f), rf = f.r + l.r + 0.01;
    if (d < 1e-6 || d > 1 + rf || d < Math.abs(rf - 1)) continue;
    const k = (1 + d * d - rf * rf) / (2 * d), hh = Math.sqrt(Math.max(0, 1 - k * k)), ux = (f.x - l.x) / d, uy = (f.y - l.y) / d;
    for (const sg of [1, -1]) {
      const P = { x: l.x + ux * k - uy * hh * sg, y: l.y + uy * k + ux * hh * sg, spear: !!(f.T.spear || f.T.pike) && f.r >= l.r - 1e-6 };
      let off = Math.abs(Math.atan2(P.y - l.y, P.x - l.x) - base) / DEG; if (off > 180) off = 360 - off;
      if (mag <= 0.15 || off <= 60 + 1e-6) keep.push(P);
    }
  }
  keep.sort((a, b) => b.spear - a.spear);
  const spots = [...keep.filter(P => P.spear), ...steps, ...keep.filter(P => !P.spear)]
    .filter(P => !offTable(P.x, P.y, l.r) && !blockedAt(P.x, P.y, l.r) && !stepHitsWall(l, P, l.r) && level(P));
  const free = [], mw = [];
  for (const P of spots) {
    const block = standBlockers(P.x, P.y, l.r, l.side, [l]);
    if (!block.length) { free.push({ x: P.x, y: P.y }); if (first) return free; continue; }
    if (block.length !== 1 || block[0].side !== l.side || engaged(block[0]) || (first && free.length)) continue;
    const Q = makeWaySpot(block[0], P, l);
    if (Q) mw.push({ x: P.x, y: P.y, makeWay: { u: block[0], x: Q.x, y: Q.y } });
  }
  if (!free.length && !mw.length && drops.length) return first ? [drops[0]] : drops;
  return first ? (free.length ? free : mw) : [...free, ...mw];
}
// Where friend f can step (up to 1″, not over impassable terrain, not into base contact with an enemy)
// so that l fits at P. A friend standing right where l is going steps back the same way (it keeps the line).
function makeWaySpot(f, P, l) {
  const base = Math.hypot(f.x - P.x, f.y - P.y) > 0.3 ? Math.atan2(f.y - P.y, f.x - P.x) : Math.atan2(P.y - l.y, P.x - l.x);
  // First the step that leaves the friend in base contact with the loser (it keeps the line), then the usual ones.
  const fit = l.r + f.r + 0.01 - Math.hypot(f.x - P.x, f.y - P.y);
  const ds = fit > 0 && fit <= 1 ? [fit, 0.5, 0.75, 1] : [0.5, 0.75, 1];
  for (const d of ds) for (const a of [0, 20, -20, 40, -40, 60, -60, 90, -90]) {
    const ang = base + a * DEG, Q = { x: f.x + Math.cos(ang) * d, y: f.y + Math.sin(ang) * d };
    if (offTable(Q.x, Q.y, f.r) || blockedAt(Q.x, Q.y, f.r) || blockedAt((Q.x + f.x) / 2, (Q.y + f.y) / 2, f.r) || stepHitsWall(f, Q, f.r)) continue;
    if (Math.hypot(Q.x - P.x, Q.y - P.y) < f.r + l.r - 0.01) continue;
    if (!standBlockers(Q.x, Q.y, f.r, f.side, [f, l]).length) return Q;
  }
  return null;
}
