// Chariots (2024 Rules Manual, p. 152–153) and War Beasts (p. 148–151): models that Move by a Chariot Charge or a
// Trample, in a straight line, with Impact Hits on every model they run into. No drawing and no DOM here.
//
// T.chariot = { n, s } and T.warBeast = { n, s } (the Impact Hits), from tools/import-armies.mjs. Both ignore Control
// Zones, cannot Jump, Climb, Leap or Swim, are never knocked Prone (setup.js makes their `prone` always false), cannot
// be Hurled or Barged, are never Trapped and never Back Away: the enemies that beat them Back Away instead (Immovable
// Object). They pass every Courage Test for a Broken army.
// A Chariot pivots up to 45° before it Moves and again after each full 4″, Moves up to its Move Value (halved in
// Difficult Terrain, and a 1 on a D6 there costs it a Wound), crashes into Obstacles (3 Strength 6 hits each way) and
// stops; it may instead only turn. A War Beast pivots to face any way and Tramples its full Move Value, unimpeded by
// Difficult Terrain and water, over Obstacles up to 2″ high. A model run into suffers the Impact Hits (a Cavalry model
// on rider and mount); if it is slain the charge goes on, if not the model stops in base contact, Charging it.
// A Chariot that Charged has +1 Attack; a Chariot or War Beast that wins after Charging knocks the beaten Prone
// (a Chariot: Infantry and Cavalry that are not Monsters; a War Beast: those with Strength no higher than its own).
//
// Requests from rampSeq: { k: 'impact', u, t, at: { x, y } } when u runs into t (answered with whether t still
// stands, after the caller resolved the Impact Hits: impactSeq), { k: 'crash', u, at, T } when a Chariot hits an
// Obstacle (the caller resolves its 3 Strength 6 hits; the charge stops).
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, circleRect, ptIn } from './geometry.js';
import { alive, sideAlive, moveVal, woundNeed, engaged, dropLinks } from './rules.js';
import { woundRolls, isHero } from './dice.js';
import { isObstacle, obstacleHt, rollFall, fallHits, nearestFree } from './terrain.js';
import { spawnUnit } from './setup.js';

export const isChariot = u => !!(u && u.T.chariot);
export const isWarBeast = u => !!(u && u.T.warBeast);
export const rams = u => isChariot(u) || isWarBeast(u);   // Moves by a Chariot Charge or a Trample
export const immovable = rams;
export const impactOf = u => u.T.chariot || u.T.warBeast;
export const PIVOT = Math.PI / 4;   // a Chariot's pivot, up to 45°, before it Moves and after each full 4″
const STEP = 0.1;
const angleTo = (u, p) => Math.atan2(p.y - u.y, p.x - u.x);
const turnBy = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// The direction a Chariot faces after pivoting towards p (at most 45°); a War Beast turns all the way.
export const pivotTo = (u, f, p) => (isChariot(u) ? f + Math.max(-PIVOT, Math.min(PIVOT, turnBy(f, angleTo(u, p)))) : angleTo(u, p));
const hard = T => T.k === 'rock' || T.k === 'building' || T.k === 'plateau';
const rough = T => T.k === 'brush' || (T.k === 'water' && T.shallow);

// The Chariot Charge or Trample of u towards point aim (aim.lim: stop after that many inches, for a Chariot that does
// not go all the way). Moves u along; returns { d (inches), hit: [models run into], stop: the model it stopped
// against or null, why: 'model' | 'edge' | 'terrain' | 'crash' | 'beast' | null, rough: the D6 for Difficult Terrain }.
export function* rampSeq(u, aim) {
  const chariot = isChariot(u), mv = Math.min(moveVal(u), aim.lim ?? Infinity), start = { x: u.x, y: u.y };
  let f = pivotTo(u, u.facing || 0, aim), used = 0, since = 0, wasRough = false;
  const out = { d: 0, hit: [], stop: null, why: null, rough: null }, met = new Set();
  const inside = new Set(G.terrain.filter(T => circleRect(u.x, u.y, u.r, T)));   // terrain it starts in does not stop it
  dropLinks(u);
  while (used < mv - 1e-6) {
    const x = u.x + Math.cos(f) * STEP, y = u.y + Math.sin(f) * STEP;
    if (x < u.r || y < u.r || x > G.W - u.r || y > G.H - u.r) { out.why = 'edge'; if (aim.stampede) out.off = true; break; }   // a Stampede off the table: removed
    const T = G.terrain.find(T => !inside.has(T) && circleRect(x, y, u.r, T) && (hard(T) || isObstacle(T) || (T.k === 'water' && !T.shallow)));
    if (T) {
      if (isObstacle(T) && !chariot && obstacleHt(T) <= 2) inside.add(T);   // a War Beast steps over an Obstacle up to 2″
      else if (T.k === 'water' && !chariot) inside.add(T);   // and wades through water
      else if (isObstacle(T) && chariot) { out.why = 'crash'; yield { k: 'crash', u, at: { x: u.x, y: u.y }, T }; break; }
      else { out.why = 'terrain'; break; }
    }
    const o = G.units.find(o => o !== u && alive(o) && !o.on && !met.has(o) && Math.hypot(o.x - x, o.y - y) < o.r + u.r - 0.02);
    if (o) {
      toContact(u, o, f);
      met.add(o); out.hit.push(o);
      if (isWarBeast(u) && isWarBeast(o)) { out.stop = o; out.why = 'beast'; yield { k: 'impact', u, t: o, at: { x: u.x, y: u.y }, beast: true }; break; }
      const stands = yield { k: 'impact', u, t: o, at: { x: u.x, y: u.y } };
      if (stands && alive(o)) { out.stop = o; out.why = 'model'; break; }
      continue;   // slain: on it goes (the same step again)
    }
    const slow = chariot && G.terrain.some(T => rough(T) && circleRect(x, y, u.r, T));
    if (slow) wasRough = true;
    const cost = slow ? 2 * STEP : STEP;
    if (used + cost > mv + 1e-6) break;
    u.x = x; u.y = y; used += cost; since += STEP;
    // A Chariot pivots again after each full 4″ (towards its aim, up to 45°).
    if (chariot && since >= 4 - 1e-6) { since = 0; if (Math.hypot(aim.x - u.x, aim.y - u.y) > u.r) f = pivotTo(u, f, aim); }
  }
  u.facing = f;
  out.d = Math.hypot(u.x - start.x, u.y - start.y);
  u.moveStart = start; u.movedDist = moveVal(u); u.done = true;
  if (out.stop && out.stop.side !== u.side) u.charged = true;
  if (wasRough) {   // a Chariot that went through Difficult Terrain: a Wound on a 1
    const die = { n: d6(), v: 0, mt: 0, ok: false }; die.v = die.n; die.ok = die.n > 1;
    yield { k: 'dice', step: 'rough', u, die, need: 2, label: `${u.name} went through Difficult Terrain: a 1 costs it a Wound` };
    out.rough = die;
  }
  return out;
}
// Moves u along direction f until its base just touches o's.
function toContact(u, o, f) {
  let lo = 0, hi = STEP;
  for (let i = 0; i < 12; i++) { const s = (lo + hi) / 2; if (Math.hypot(o.x - u.x - Math.cos(f) * s, o.y - u.y - Math.sin(f) * s) > o.r + u.r + 0.02) lo = s; else hi = s; }
  u.x += Math.cos(f) * lo; u.y += Math.sin(f) * lo;
}
// The Impact Hits on t: a Cavalry model suffers them on rider and mount (nobody may spend Might on them). Two War
// Beasts that meet: three Strength 8 hits each way. Returns [{ t, part, R (woundRolls) }].
export function* impactSeq(u, t, beast = false) {
  const I = beast ? { n: 3, s: 8 } : impactOf(u), out = [];
  for (const part of t.cav ? ['rider', 'mount'] : ['rider']) {
    const R = yield* woundRolls(null, t, I.n, { s: I.s, part, label: `${u.name}: ${I.n} Impact Hits, Strength ${I.s}, on ${t.name}${t.cav ? ` (${part === 'mount' ? t.mount.n.toLowerCase() : 'rider'})` : ''}` });
    out.push({ t, part, R });
  }
  if (beast) { const R = yield* woundRolls(null, u, 3, { s: 8, label: `${t.name} hits back: 3 Strength 8 hits on ${u.name}` }); out.push({ t: u, part: 'rider', R }); }
  return out;
}
// A Chariot's crash into an Obstacle: three Strength 6 hits on it.
export function* crashSeq(u) {
  const R = yield* woundRolls(null, u, 3, { s: 6, label: `${u.name} crashes into the Obstacle: 3 Strength 6 hits` });
  return [{ t: u, part: 'rider', R }];
}
// +1 Attack for a Chariot that Charged (p. 153).
export const chariotA = u => (isChariot(u) && u.charged ? 1 : 0);
// Knocked Prone by a Chariot or War Beast that won after Charging. Returns { down, flying } (Cavalry are thrown).
export function rampDown(W, L) {
  const out = { down: [], flying: [] };
  const r = W.filter(w => alive(w) && rams(w) && w.charged);
  if (!r.length) return out;
  const s = Math.max(...r.map(w => w.s));
  for (const l of L.filter(l => alive(l) && !rams(l))) {
    const hit = r.some(w => (isChariot(w) ? !l.T.monster : l.s <= s));
    if (!hit) continue;
    if (l.cav) out.flying.push(l); else if (!l.prone) { l.prone = true; out.down.push(l); }
  }
  return out;
}
// Immovable Object: who Backs Away after a Combat. The losers that are not Chariots or War Beasts Back Away as usual;
// the winners in base contact with a Chariot or War Beast that lost Back Away from it instead.
export function backAwayRoles(W, L, contacts) {
  const stay = L.filter(l => immovable(l) && alive(l));
  const away = stay.length ? W.filter(w => alive(w) && !immovable(w) && stay.some(s => contacts.has(w.id + ':' + s.id))) : [];
  // A model fighting up a Siege Ladder never Backs Away either: it may fall instead (fortress.js: afterLadder).
  return { losers: L.filter(l => !immovable(l) && !(l.over && l.over.T.siege)), stay, away };
}

/* ---------- War Beasts: the Commander, Stampede (p. 148–151) ---------- */
export const ridden = u => !!(u.cmd && u.cmd.w > 0);
// The Courage Test after each Wound (and at the start of an Activation with nobody riding it): 2D6 against the
// Commander's Courage (the beast's own with nobody riding), −1 with Foul Temperament; the Commander spends Will to
// pass if it can. A failure: the beast Stampedes at the start of its next Activation. Returns { dice, need, ok, will }.
export function* stampedeSeq(u) {
  const c = ridden(u) ? u.cmd.c : u.c, mod = u.T.warBeast.foul ? -1 : 0, dice = [d6(), d6()], total = dice[0] + dice[1] + mod;
  let ok = total >= c, will = 0;
  if (!ok && ridden(u) && u.cmd.will >= c - total) { will = c - total; u.cmd.will -= will; ok = true; }
  yield { k: 'dice', step: 'stampede', u, dice: dice.map(v => ({ n: v, v, ok })), label: `${u.name}: Courage ${c}+ (${ridden(u) ? `${u.cmd.name}'s` : 'its own, nobody rides it'}${mod ? ', Foul Temperament −1' : ''})${will ? `, ${will} Will` : ''}, or it Stampedes` };
  if (!ok) u.stampede = true;
  return { dice, need: c, ok, will, total };
}
// The other player's heading for a Stampede: off the table if it can reach the edge, else through the most of the
// beast's own side and the fewest of its own models.
export function aiStampede(u) {
  let best = null, bv = -Infinity;
  for (let k = 0; k < 16; k++) {
    const f = k * Math.PI / 8, aim = { x: u.x + Math.cos(f) * 60, y: u.y + Math.sin(f) * 60, stampede: true };
    const p = rampPlan(u, aim);
    const v = (p.off ? 100 : 0) + p.hit.filter(o => o.side === u.side).length - 1.5 * p.hit.filter(o => o.side !== u.side).length;
    if (v > bv) { bv = v; best = aim; }
  }
  return best;
}
// Trampling the models that Charged it (p. 149): if their combined Strength is no more than its own, all of them
// suffer its Impact Hits at once before it pivots. Returns the models it may Trample, or null.
export function chargedBy(u) {
  if (!isWarBeast(u) || !engaged(u) || u.done) return null;
  const foes = G.units.filter(o => alive(o) && o.side !== u.side && !o.T.siege && !o.T.gate && gap(o, u) <= 0.08);
  return foes.length && foes.reduce((s, o) => s + o.s, 0) <= u.s ? foes : null;
}
// A slain War Beast's Commander falls (p. 151): Falling Damage, then Prone within its footprint; the Great Beast's
// Orc Commander dies with it (Plenty of Orcs). Returns { u (the Commander on foot), wounds, died } or null.
export function cmdFalls(b) {
  if (!ridden(b)) return null;
  const C = b.cmd; b.cmd = { ...C, w: 0 };
  if (b.T.warBeast.cmdDies) return { u: null, died: true, name: C.name };
  const n = G.units.filter(o => o.t === C.t).length + 1;
  const u = spawnUnit(G.units, C.t, b.side, b.x, b.y, n > 1 ? `${C.name} ${n}` : C.name);
  u.w = C.w; u.might = C.might; u.will = C.will; u.fate = C.fate;
  const Q = nearestFree(u, { x: b.x, y: b.y }); u.x = Q.x; u.y = Q.y;
  const F = rollFall(u, fallHits(u, b.T.warBeast.howdah ? 4 : 2.5));
  for (let i = 0; i < F.wounds && u.w > 0; i++) { u.w--; if (u.w <= 0) { u.dead = true; } }
  if (!u.dead) { u.prone = true; u.done = true; u.shot = true; }
  return { u, wounds: F.wounds, died: !!u.dead, name: C.name };
}
// Shooting from a Chariot or the Great Beast's Howdah: never slowed by how far it Moved (p. 150, 153).
export const freeShooter = u => !!(u.T.chariot || (u.bow && u.bow.howdah));
// The Orc archers in the Great Beast's Howdah: as many shots as it has Wounds left.
export const howdahShots = u => (u.bow && u.bow.howdah ? (u.howdahW ?? u.T.warBeast.howdah.w) : 0);

/* ---------- The computer's Chariot Charges and Tramples ---------- */
// A dry run of the charge towards aim, assuming every model it runs into stands (it stops at the first one).
export function rampPlan(u, aim) {
  const save = { x: u.x, y: u.y, facing: u.facing, moveStart: u.moveStart, movedDist: u.movedDist, done: u.done, charged: u.charged, over: u.over, held: u.held };
  const g = rampSeq(u, aim);
  let r = g.next(), first = null;
  while (!r.done) { if (r.value.k === 'impact' && !first) first = r.value.t; r = g.next(true); }
  const plan = { ...r.value, first, end: { x: u.x, y: u.y }, facing: u.facing };
  Object.assign(u, save);
  return plan;
}
const killP = (u, t) => { const I = impactOf(u), need = woundNeed(I.s, t.d); if (!need) return 0; const p = need.reduce((p, v) => p * (7 - v) / 6, 1); return Math.min(1, I.n * p / Math.max(1, t.w)); };
// The aim the computer picks: straight at an enemy it can run into with good odds, or a heading that closes in on the
// enemy without running into friends (a Chariot stops short of them; a War Beast must go its full Move, so it turns
// away from them). Returns { x, y, lim? }, or null: a Chariot then only turns to face the nearest enemy (faceOnly).
export function aiRamp(u) {
  const foes = G.units.filter(o => alive(o) && o.side !== u.side && !o.on);
  if (!foes.length) return null;
  const chariot = isChariot(u), mv = moveVal(u);
  const near = foes.reduce((a, b) => (gap(u, a) <= gap(u, b) ? a : b)), g0 = gap(u, near);
  const aims = foes.filter(t => gap(u, t) <= mv + 0.5).map(t => ({ x: t.x, y: t.y }));
  const base = chariot ? u.facing || 0 : angleTo(u, near);
  for (let k = -6; k <= 6; k++) {
    if (chariot && Math.abs(k) > 3) continue;   // a Chariot pivots up to 45°
    const f = base + k * Math.PI / 12;
    aims.push({ x: u.x + Math.cos(f) * 40, y: u.y + Math.sin(f) * 40 });
  }
  let best = null, bv = chariot ? 0.02 : -Infinity;
  for (const aim of aims) {
    let p = rampPlan(u, aim);
    if (p.first && p.first.side === u.side) {
      if (!chariot) continue;   // a War Beast would trample its friends
      aim.lim = Math.max(0, p.d - 0.15); p = rampPlan(u, aim);
      if (p.first) continue;
    }
    let v = p.why === 'crash' ? -1 : 0;
    if (p.first) v += 1 + killP(u, p.first) * (isHero(p.first) ? 2 : 1);
    else { const e = foes.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.end.x, o.y - p.end.y) - o.r - u.r), Infinity); v += (g0 - e) / Math.max(1, mv) * 0.5 - (chariot && e > 0 && e < 1.5 ? 0.3 : 0); }
    if (v > bv) { bv = v; best = { ...aim }; }
  }
  // A War Beast that can only run into friends must still Move: the heading that hurts the fewest.
  if (!best && !chariot) best = aims.map(aim => ({ aim, n: rampPlan(u, aim).hit.length })).sort((x, y) => x.n - y.n)[0].aim;
  return best;
}
// A Chariot that forgoes its Chariot Charge turns to face the nearest enemy instead.
export function faceOnly(u) {
  const foes = G.units.filter(o => alive(o) && o.side !== u.side && !o.on);
  if (foes.length) u.facing = angleTo(u, foes.reduce((a, b) => (gap(u, a) <= gap(u, b) ? a : b)));
  u.done = true;
}
// Whether u may Move by a Chariot Charge or Trample now (not Engaged; a War Beast Charged by models of no greater
// combined Strength may still Trample, those first: not played yet, it stays).
export const canRamp = u => rams(u) && alive(u) && !engaged(u) && !u.done;
