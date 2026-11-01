// Terrain heights and the moves that cross them (2024 Rules Manual, p. 32–37): Obstacles, Jump, Leap, Climb,
// Descending, falls and Falling Damage. No drawing and no DOM here, so the balance tool can run it headless.
// Raised ground is a 'plateau' (a rectangle whose top is z inches high); everything else stands at level 0, so a
// gap between two plateaus is a chasm. Obstacles are 'wall' (low, ht 0.5″) and 'hedge' (ht 1″).
import { G } from '../state.js';
import { ptIn, circleRect, setLevels, gap, gapXY } from './geometry.js';
import { alive, engaged, validateMove, chargeSpot, woundNeed, rollWound, remaining, zoneBlocked, moveVal } from './rules.js';
import { d6Test } from './dice.js';
import { rule } from './special.js';

/* ---------- Heights ---------- */
// A model's true height with its base (p. 32), in inches: a man about 1.2″, a monster on a 60 mm base about 2.5″.
export const heightOf = u => u.T.ht || (u.T.base >= 50 ? 2.5 : 1.2);
export const isObstacle = T => T.k === 'wall' || T.k === 'hedge';
// Water features (p. 132): a 'water' piece is Shallow Water (T.shallow: Difficult Terrain except for Cavalry, Monsters and
// War Beasts), Deep Water (T.deep: a Swim Test to enter it and at the start of each Activation in it), or, with neither
// flag, a river too deep and fast to enter at all (the missions' rivers).
export const waterAt = (x, y) => (G.terrain || []).find(T => T.k === 'water' && ptIn(x, y, T)) || null;
export const inDeep = u => { const T = waterAt(u.x, u.y); return !!(T && T.deep); };
export const inShallow = u => { const T = waterAt(u.x, u.y); return !!(T && T.shallow); };
export const inWater = u => !!waterAt(u.x, u.y);
// Swim Test modifiers (p. 132): +1 Cavalry, −1 heavy armour, −1 a shield (not a light shield), −1 a banner.
export function swimMod(u) {
  const g = (u.T.gear || []).map(x => x.toLowerCase());
  return (u.cav ? 1 : 0) - (g.some(x => x === 'heavy armour' || x === 'heavy dwarf armour') ? 1 : 0) - (g.includes('shield') ? 1 : 0) - (u.T.banner ? 1 : 0);
}
// The Swim Test: 1 sinks (the model drowns), 2–5 swims half its remaining Move, 6 swims all of it. A Hero may use Might.
export function* swimSeq(u, extra = 0) {
  const mod = swimMod(u) + extra;
  const die = yield* d6Test(u, 2, { step: 'swim', goals: [6], mod, reroll: u.cav && rule(u, 'Expert Rider') != null ? 'Expert Rider' : null, label: `Swim Test: ${u.name}, 1 sinks, 2–5 half the remaining Move, 6 all of it${mod ? ` (${mod > 0 ? '+' : '−'}${Math.abs(mod)})` : ''}` });
  return die.v;
}
// Applies a Swim Test result to u: drowned (removed), or how much Move it keeps for swimming this Activation.
export function applySwim(u, roll) {
  u.swum = true;
  if (roll <= 1) { u.dead = true; u.drowned = true; return 'sink'; }
  if (roll < 6) u.movedDist += remaining(u) / 2;
  return roll < 6 ? 'half' : 'all';
}
// A model that must take a Swim Test as it Activates: in Deep Water, or Prone in Shallow Water.
export const needsSwim = u => !!(alive(u) && !u.swum && (inDeep(u) || (u.prone && inShallow(u))));
export const obstacleHt = T => T.ht ?? (T.k === 'hedge' ? 1 : 0.5);
let platTerrain = null, platList = [];
const plateaus = () => {
  const t = G && G.terrain;
  if (t !== platTerrain) { platTerrain = t; platList = (t || []).filter(T => T.k === 'plateau'); }
  return platList;
};
export const hasLevels = () => plateaus().length > 0;
// The height of the ground at a point.
export const levelAt = (x, y) => { let z = 0; for (const T of plateaus()) if (T.z > z && ptIn(x, y, T)) z = T.z; return z; };
// The level a model is at: the ground under it, or how high it hangs partway up a cliff (u.climb.z).
export const zOf = u => (u.climb ? u.climb.z : levelAt(u.x, u.y));
setLevels(zOf, levelAt);
// Whether a base at (x, y) would stand half over an edge, on two levels at once (a model cannot stop there).
export function straddles(x, y, r) {
  if (!hasLevels()) return false;
  const z = levelAt(x, y);
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    if (Math.abs(levelAt(x + Math.cos(a) * (r - 0.02), y + Math.sin(a) * (r - 0.02)) - z) > 1e-6) return true;
  }
  return false;
}
// Falling Damage (p. 36): none for a fall up to the model's height, otherwise one Strength 3 hit plus one for every
// full inch beyond its height. A model that falls is Prone at the bottom either way.
export const fallHits = (u, f) => (f > heightOf(u) + 1e-6 ? 1 + Math.floor(f - heightOf(u) + 1e-6) : 0);
// The To Wound rolls for those hits.
// A Cavalry model's fall hurts the mount (p. 68): the rolls go against the mount's Defence (part 'mount').
export function rollFall(u, hits) {
  const part = u.cav ? 'mount' : 'rider', need = woundNeed(3, part === 'mount' ? u.mount.d : u.d), rolls = [];
  let wounds = 0;
  for (let i = 0; i < hits && need; i++) { const r = rollWound(need, 0, part === 'rider' && !!u.def6); rolls.push(...r.dice); if (r.ok) wounds++; }
  return { need, rolls, wounds, part };
}

/* ---------- What stands in the way of a move ---------- */
const STEP = 0.04;
// The first barrier a straight move from u towards P meets, or null if it meets none before P:
// { kind, T, dz, contact: where the base touches it, landing: where the base stands fully past it, gapW }.
// kind: 'jump' (an Obstacle, or a step up, taller than half the model and not taller than it), 'climb' (a cliff
// taller than the model), 'down' (a drop deeper than the model: it must Climb down), 'leap' (a gap between two high
// places, no wider than twice the model's height), 'high' (an Obstacle taller than the model: not crossable here).
// Lower steps and Obstacles are crossed by a normal move; a drop up to the model's height is Descended for free.
export function barrierOn(u, P) {
  const x0 = u.x, y0 = u.y, L = Math.hypot(P.x - x0, P.y - y0);
  if (L < 0.05) return null;
  const ux = (P.x - x0) / L, uy = (P.y - y0) / L, r = u.r, h = heightOf(u);
  const at = s => ({ x: x0 + ux * s, y: y0 + uy * s });
  const ahead = s => levelAt(x0 + ux * (s + r - 0.03), y0 + uy * (s + r - 0.03));   // the ground just in front of the base
  const standsOn = (s, z) => { const c = at(s); return Math.abs(levelAt(c.x, c.y) - z) < 1e-6 && !straddles(c.x, c.y, r); };
  const tall = (G.terrain || []).filter(T => isObstacle(T) && obstacleHt(T) > h / 2 + 1e-6);
  const far = L + 4 * h + 2;   // how far past P to look for the landing spot
  let z = zOf(u);
  const swim = !u.swum && !inDeep(u) && (G.terrain || []).some(T => T.k === 'water' && T.deep);
  for (let s = STEP; s <= L + 1e-6; s += STEP) {
    // Only a path that runs through an Obstacle crosses it (its centre line enters the piece); a base that merely
    // brushes the side of a hedge on its way past walks on, though it cannot stop overlapping it.
    const c = at(s), T = tall.find(T => ptIn(c.x, c.y, T));
    if (swim) {   // entering Deep Water: the contact is where the base still stays dry
      const W = waterAt(c.x, c.y);
      if (W && W.deep) { let a = s; while (a > 0 && circleRect(at(a).x, at(a).y, r, W)) a -= STEP; return { kind: 'swim', T: W, contact: at(Math.max(0, a)), landing: c }; }
    }
    if (T) {
      let a = s, e = s;
      while (a > STEP + 1e-9 && circleRect(at(a - STEP).x, at(a - STEP).y, r, T)) a -= STEP;   // back to where the base first touches it
      while (e < s + far && circleRect(at(e).x, at(e).y, r, T)) e += STEP;
      return { kind: obstacleHt(T) <= h + 1e-6 ? 'jump' : 'high', T, dz: obstacleHt(T), contact: at(a - STEP), landing: at(e) };
    }
    const za = ahead(s);
    if (Math.abs(za - z) < 1e-6) continue;
    const d = za - z;
    if (onLadder(c.x, c.y, r)) { z = za; continue; }   // a ladder or rope: up or down as a normal move (p. 35)
    if (d > 0 && d <= h / 2 + 1e-6) { z = za; continue; }       // a low step: walk up it
    if (d < 0 && -d <= h + 1e-6) { z = za; continue; }          // a drop no deeper than the model: Descend for free
    const contact = at(s - STEP);
    if (d > 0) {
      let e = s;
      while (e < s + far && !standsOn(e, za)) e += STEP;
      return { kind: d <= h + 1e-6 ? 'jump' : 'climb', dz: d, contact, landing: at(e), from: z, to: za };
    }
    // A deep drop: a gap to Leap if the ground rises back near the same height within twice the model's height.
    let e = s;
    while (e < s + 2 * h + 0.1 && ahead(e) < z - h / 2) e += STEP;
    if (ahead(e) >= z - h / 2) {
      const top = ahead(e);
      let f = e;
      while (f < e + far && !standsOn(f, top)) f += STEP;
      return { kind: 'leap', dz: -d, gapW: e - s, contact, landing: at(f), from: z, to: top, bottom: za };
    }
    e = s;
    while (e < s + far && !standsOn(e, za)) e += STEP;
    return { kind: 'down', dz: -d, contact, landing: at(e), from: z, to: za };
  }
  return null;
}

// Ladders, ropes and the like (p. 35): a 'ladder' piece set against the edge of raised ground. A model goes up or down it
// with no Climb Test and no Difficult Terrain, paying the height in inches (rules.js: moveCost). A plateau with sheer
// cannot be Climbed at all (Unscalable Terrain, p. 35).
export const onLadder = (x, y, r) => (G.terrain || []).some(T => T.k === 'ladder' && circleRect(x, y, r, T));
export const plateauAt = (x, y) => (G.terrain || []).filter(T => T.k === 'plateau' && ptIn(x, y, T)).sort((a, b) => b.z - a.z)[0] || null;
// The inches a move from a to P climbs or descends on ladders.
export function ladderRise(a, P) {
  if (!(G.terrain || []).some(T => T.k === 'ladder')) return 0;
  const L = Math.hypot(P.x - a.x, P.y - a.y), n = Math.max(2, Math.ceil(L / 0.1));
  let z = levelAt(a.x, a.y), up = 0;
  for (let i = 1; i <= n; i++) {
    const x = a.x + (P.x - a.x) * i / n, y = a.y + (P.y - a.y) * i / n, zi = levelAt(x, y);
    if (Math.abs(zi - z) > 1e-6) { if (onLadder(x, y, a.r || 0.5)) up += Math.abs(zi - z); z = zi; }
  }
  return up;
}
// Whether a model of radius r could stand at P (no model, impassable terrain, Obstacle or edge in the way).
function freeSpot(u, P) {
  const r = u.r;
  if (P.x < r || P.y < r || P.x > G.W - r || P.y > G.H - r) return false;
  if ((G.terrain || []).some(T => (T.k === 'rock' || T.k === 'water' || T.k === 'building' || isObstacle(T)) && circleRect(P.x, P.y, r, T))) return false;
  if (straddles(P.x, P.y, r)) return false;
  return !G.units.some(o => o !== u && alive(o) && gapXY(P.x, P.y, r, o) < -0.01);
}
// The nearest free spot to P (a model that falls onto another is moved the minimum distance out of the way, p. 36).
export function nearestFree(u, P) {
  if (freeSpot(u, P)) return P;
  for (let d = 0.1; d <= 3; d += 0.1) for (let k = 0; k < 24; k++) {
    const Q = { x: P.x + Math.cos(k * Math.PI / 12) * d, y: P.y + Math.sin(k * Math.PI / 12) * d };
    if (freeSpot(u, Q) && Math.abs(levelAt(Q.x, Q.y) - levelAt(P.x, P.y)) < 1e-6) return Q;
  }
  return P;
}

/* ---------- Planning a crossing ---------- */
const NAMES = { jump: 'Jump', leap: 'Leap', climb: 'Climb', down: 'Climb', swim: 'Swim' };
export const testName = k => NAMES[k];
// What a click at P would do when a barrier stands between the model and P: walk up to it (a normal move; a Prone
// model first Stands Up for half its Move), then the test. Returns null if no barrier is in the way, otherwise
// { ok, why, kind, contact, landing, stand, approach (inches walked first), cost (inches the crossing itself takes
// from the Move: the horizontal distance, plus twice the height climbed, as climbing counts as Difficult Terrain),
// full (what the whole climb costs), partial (the climb stops partway up), b (the barrier) }.
export function planCross(u, P) {
  if (u.climb) {   // partway up (or down) a cliff: carry on with a new Climb Test (p. 35)
    const c = u.climb, full = 2 * Math.abs(c.to - c.z) + c.hor, left = remaining(u);
    return { ok: left > 0.05, why: 'No Move left to carry on climbing.', kind: c.dir === 'up' ? 'climb' : 'down', cont: true,
      contact: { x: u.x, y: u.y }, landing: c.landing, stand: 0, approach: 0, cost: Math.min(left, full), full, partial: left < full - 1e-6, b: c };
  }
  const b = barrierOn(u, P);
  if (!b) return null;
  const name = b.T ? (b.T.k === 'hedge' ? 'hedge' : 'wall') : b.kind === 'leap' ? 'gap' : b.kind === 'down' ? 'drop' : 'cliff';
  const no = why => ({ ok: false, why, kind: b.kind, b, contact: b.contact, landing: b.landing });
  if (u.cav && (b.kind === 'climb' || b.kind === 'down')) return no(`A Cavalry model cannot take a Climb Test (p. 68): ${u.name} must find another way.`);
  if (b.kind === 'climb' || b.kind === 'down') {
    const C = plateauAt(b.kind === 'climb' ? b.landing.x : b.contact.x, b.kind === 'climb' ? b.landing.y : b.contact.y);
    // A fortress wall: only Swift Movement climbs it (p. 158), all the way in one go.
    if (C && C.sheer && !(C.fort && b.kind === 'climb' && rule(u, 'Swift Movement') != null)) return no(`The ${name} is a sheer face with no handholds: it cannot be Climbed (Unscalable Terrain).`);
  }
  if (b.kind === 'swim') {   // walk to the water's edge, then the Swim Test (p. 132)
    const stand = u.prone ? moveVal(u) / 2 : 0, rem = remaining(u) - stand;
    if (rem <= 0.05) return no(`${u.name} has no Move left for that.`);
    let approach = Math.hypot(b.contact.x - u.x, b.contact.y - u.y);
    if (approach > 0.1) { const v = validateMove(u, b.contact, rem); if (!v.ok) return no(v.why); approach = v.cost; }
    return { ok: true, kind: 'swim', b, contact: b.contact, landing: b.landing, stand, approach, cost: 0, full: 0, partial: false };
  }
  if (b.kind === 'high') return no(`The ${name} is taller than ${u.name}, so it would need a Climb Test over it, and this one has no handholds.`);
  const stand = u.prone ? moveVal(u) / 2 : 0, rem = remaining(u) - stand;
  if (rem <= 0.05) return no(`${u.name} has no Move left for that.`);
  // A model already (almost) touching the barrier just shuffles up to it; further away it walks there as a normal move.
  let approach = Math.hypot(b.contact.x - u.x, b.contact.y - u.y);
  if (approach > 0.1) {
    const v = validateMove(u, b.contact, rem);
    if (!v.ok) return no(v.why);
    approach = v.cost;
  }
  if (!freeSpot(u, b.landing)) return no(`There is no room to land on the other side of the ${name} there.`);
  const left = rem - approach, hor = Math.hypot(b.landing.x - b.contact.x, b.landing.y - b.contact.y);
  if (b.kind === 'jump' || b.kind === 'leap') {
    if (left < hor - 1e-6) return no(`Not enough Move left: the ${b.kind === 'leap' ? 'Leap across the gap' : 'Jump'} takes ${hor.toFixed(1)}″ and only ${Math.max(0, left).toFixed(1)}″ would be left at the ${name}.`);
    return { ok: true, kind: b.kind, b, contact: b.contact, landing: b.landing, stand, approach, cost: hor, full: hor, partial: false };
  }
  const full = 2 * b.dz + hor;
  if (left < 0.1) return no(`No Move left to start climbing once ${u.name} reaches the ${name}.`);
  return { ok: true, kind: b.kind, b, contact: b.contact, landing: b.landing, stand, approach, cost: Math.min(left, full), full, partial: left < full - 1e-6 };
}

/* ---------- Carrying out a crossing ---------- */
// The Jump, Leap or Climb Test of crossing X (p. 33–35): 1 fails, 2–5 crosses and the move ends, 6 crosses and the model
// may carry on. A Hero may raise the roll with Might (p. 78): to a 2 to get across, or to a 6 to carry on. Returns the
// roll to pass to applyCross.
const RESULTS = { jump: '1 stays put, 2–5 lands and stops, 6 lands and goes on', leap: '1 falls into the gap, 2–5 lands and stops, 6 lands and goes on', climb: '1 falls, 2–5 climbs and stops, 6 climbs and goes on' };
// Special rules (p. 123–131): Spectral Walk always counts as a 6, and so does Swift Movement over an Obstacle (no test);
// Mountain Dweller re-rolls a failed test, Cave Dweller adds 1. X.auto: the rule that passed it without a roll.
export function* crossTestSeq(u, X) {
  if (X.kind === 'swim') return yield* swimSeq(u);
  const kind = X.kind === 'down' ? 'climb' : X.kind;
  const auto = rule(u, 'Spectral Walk') != null ? 'Spectral Walk' : rule(u, 'Swift Movement') != null && X.b && X.b.T ? 'Swift Movement' : null;
  if (auto) { X.auto = auto; return 6; }
  const re = rule(u, 'Mountain Dweller') != null ? 'Mountain Dweller' : null, mod = rule(u, 'Cave Dweller') != null ? 1 : 0;
  const die = yield* d6Test(u, 2, { step: kind, goals: [6], reroll: re, mod, label: `${NAMES[X.kind]} Test: ${RESULTS[kind]}${mod ? ' (Cave Dweller +1)' : ''}${re ? ' (Mountain Dweller re-rolls a fail)' : ''}`, ctx: { X } });
  return die.v;
}
// After the model has walked to the barrier (and Stood Up, if it was Prone), the test result: roll 1, 2–5 or 6.
// Moves the model and returns { result, fall, landed }: result 'fail' (stays, or falls), 'stop' (across, Move over),
// 'go' (across and may carry on), 'partial' (still climbing); fall: { f: inches fallen, hits } when it fell.
export function applyCross(u, X, roll) {
  if (X.kind === 'swim') {   // into the Deep Water: the test decides how much Move is left for swimming
    u.x = X.landing.x; u.y = X.landing.y; u.movedDist += Math.hypot(X.landing.x - X.contact.x, X.landing.y - X.contact.y);
    const s = applySwim(u, roll);
    if (s === 'sink') return { result: 'fail', fall: null, drowned: true };
    if (remaining(u) > 0.05) return { result: 'go', fall: null, landed: true, swim: s };
    u.done = true; return { result: 'stop', fall: null, landed: true, swim: s };
  }
  u.crossTried = true;   // no Shooting Attacks this turn after a Jump, Leap or Climb Test (Shoot phase: Moving and Shooting)
  const done = () => { u.done = true; };
  const land = P => { const Q = nearestFree(u, P); u.x = Q.x; u.y = Q.y; };
  const fallTo = (P, from) => {
    land(P);
    const f = Math.max(0, from - levelAt(u.x, u.y));
    u.climb = null; u.prone = true; done();
    return { f, hits: fallHits(u, f) };
  };
  if (X.kind === 'jump' || X.kind === 'leap') {
    if (roll === 1) {
      // A mounted model that rolls a 1 is also Knocked Flying, as on the Thrown Rider Table (p. 68): the caller throws it.
      if (X.kind === 'jump') { done(); return { result: 'fail', fall: null, thrown: !!u.cav }; }
      // A failed Leap: the model falls to the bottom of the gap, halfway between where it leapt from and to (p. 34).
      u.movedDist += X.cost / 2;
      const mid = { x: (X.contact.x + X.landing.x) / 2, y: (X.contact.y + X.landing.y) / 2 };
      return { result: 'fail', fall: fallTo(mid, X.b.from), thrown: !!u.cav };
    }
    u.x = X.landing.x; u.y = X.landing.y; u.movedDist += X.cost;
    if (roll === 6 && remaining(u) > 0.05) return { result: 'go', fall: null, landed: true };
    done();
    return { result: 'stop', fall: null, landed: true };
  }
  // Climbing up or down (p. 35). A 1 means a fall from wherever the model hangs now; a model still at the bottom
  // just becomes Prone there.
  const c = u.climb || { z: X.b.from, to: X.b.to, hor: Math.hypot(X.landing.x - X.contact.x, X.landing.y - X.contact.y), landing: X.landing, dir: X.kind === 'climb' ? 'up' : 'down', foot: X.kind === 'climb' ? X.b.from : X.b.to };
  if (roll === 1) {
    const at = c.dir === 'up' ? { x: u.x, y: u.y } : c.landing;   // the foot of the cliff
    return { result: 'fail', fall: fallTo(at, c.z) };
  }
  const left = remaining(u), need = 2 * Math.abs(c.to - c.z) + c.hor;
  if (left >= need - 1e-6) {
    u.climb = null; u.x = c.landing.x; u.y = c.landing.y; u.movedDist += need;
    if (roll === 6 && remaining(u) > 0.05) return { result: 'go', fall: null, landed: true };
    done();
    return { result: 'stop', fall: null, landed: true };
  }
  const up = Math.max(0, left) / 2;   // inches climbed: each costs 2″ of Move
  u.climb = { ...c, z: c.dir === 'up' ? Math.min(c.to, c.z + up) : Math.max(c.to, c.z - up) };
  u.movedDist += left; done();
  return { result: 'partial', fall: null };
}

// After landing with a 2–5 inside an enemy's Control Zone, the model must Charge that enemy by the shortest way,
// if its Move reaches (p. 33–35); with several, the closest. Returns { e, spot } (spot null if it cannot reach).
export function forcedCharge(u) {
  const zone = G.units.filter(e => alive(e) && e.side !== u.side && !engaged(e) && !e.prone && gap(u, e) < 1 - 1e-6 && !zoneBlocked(e, u.x, u.y))
    .sort((a, b) => gap(u, a) - gap(u, b));
  if (!zone.length) return null;
  const e = zone[0];
  return { e, spot: chargeSpot(u, e, remaining(u) + 1e-6) };
}
