// Siege Engines (2024 Rules Manual, p. 140–147). No drawing and no DOM here.
//
// A Siege Engine is a model whose profile has T.siege = { large, min, max (range in inches), s, d, w, arcing, static }
// and T.crewKeys (the profiles of its Siege Veteran and crew), from tools/import-armies.mjs. It never Activates, has no
// Control Zone, is never Engaged, Prone or Trapped, and does not count for Break Points (rules.js: countAlive). It fires
// in its side's Shoot phase when enough crew (Large 2, Small 1) stand in base contact and are not Engaged, and its
// target is in range and inside the 45° Arc of Sight it faces (u.facing, radians). Turning it to face a target takes
// as many models as moving it (Large 3, Small 2; never a Static engine) and costs −1 To Hit (it is done here as it
// fires, which is the same as turning it in the Move phase and not moving it).
// A Battlefield Target that is hit scatters (D6: 1 the other player may pick any Battlefield Target within 6″ or the shot
// misses, 2–5 the other player picks one of its own models within 6″, 6 dead on; Accurate: 3″); a Siege Target is hit as
// aimed. The actual target is knocked Prone; wounded, it is slain (Fate may save it), but a model with Defence or Wounds
// 10 or more loses half its starting Wounds; a Siege Target loses 1 Wound; both parts of a Cavalry model are rolled for.
// The engines' rules: Area Effect (Strength 5 hits within 2″, Prone), Wall-breaker (two To Wound rolls, the best, D3
// Wounds against a Siege Target), Flaming Ammunition (re-roll failed To Wound against a Siege Target), Piercing Shot
// (a target of Strength 5 or less is flung D6″ straight back), Troll Loader (re-roll the To Hit with the troll firing),
// Rapid Fire (the Bolt Thrower: D6 shots like a bow, no Scatter; Swift Reload: the better of two dice).
// Requests: { k: 'scatter', side, s, t, list, kind: 'wide' | 'slight' } answered with the model picked, or null.
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, squareHits } from './geometry.js';
import { alive, sideAlive, engaged, losBlocked, alignOf, woundNeed, touching, dropLinks } from './rules.js';
import { d6Test, woundRoll, isHero } from './dice.js';

export const isSiege = u => !!(u && u.T.siege);
const has = (e, r) => (e.T.rules || []).includes(r);
export const ARC = Math.PI / 8;   // half of the 45° Arc of Sight
// Crew in base contact that can work the engine now (any friendly model can, as untrained crew: Shoot Value 6+).
export const crewAt = e => sideAlive(e.side).filter(o => o !== e && !isSiege(o) && touching(o, e) && !engaged(o));
export const crewNeeded = e => (e.T.siege.large ? 2 : 1);
const trained = (e, o) => (e.T.crewKeys || []).includes(o.t);
// Whether model t lies inside engine e's Arc of Sight (its base touches the 45° wedge).
export function inArc(e, t) {
  const a = Math.atan2(t.y - e.y, t.x - e.x), f = e.facing || 0, L = Math.hypot(t.x - e.x, t.y - e.y);
  let d = Math.abs(a - f) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
  return d <= ARC + Math.asin(Math.min(1, t.r / Math.max(t.r, L)));
}
const canTurn = e => !e.T.siege.static && crewAt(e).length >= (e.T.siege.large ? 3 : 2);
export const siegeTarget = t => (isSiege(t) ? !!t.T.siege.large : !!(t.T.warBeast || t.T.gate));
// Why engine e cannot fire (at t) now, or null.
export function siegeWhy(e, t) {
  const S = e.T.siege;
  if (!alive(e)) return 'is destroyed';
  if (e.shot) return 'has already shot';
  if (G.units.some(o => alive(o) && o.side !== e.side && touching(o, e))) return 'has an enemy in base contact';
  const crew = crewAt(e);
  if (crew.length < crewNeeded(e)) return `needs ${crewNeeded(e)} crew in base contact who are not Engaged (it has ${crew.length})`;
  if (!t) return null;
  const g = gap(e, t);
  if (g < S.min - 1e-6 || g > S.max + 1e-6) return `${t.name} is out of its range (${S.min}–${S.max}″; it is ${g.toFixed(1)}″ away)`;
  if (!inArc(e, t) && !canTurn(e)) return `${t.name} is outside its Arc of Sight, and ${S.static ? 'it is Static' : `turning it takes ${S.large ? 3 : 2} models in base contact`}`;
  if (!S.arcing && losBlocked(e, t)) return `it cannot see ${t.name}`;
  if (S.arcing && losBlocked(e, t) && !sideAlive(e.side).some(o => o !== e && !losBlocked(o, t))) return `no friend can see ${t.name} for its Arcing Shot`;
  if (alignOf(e.side) === 'good' && (engaged(t) || (has(e, 'Area Effect') && G.units.some(o => alive(o) && o.side === e.side && gap(o, t) <= 2 + 1e-6)))) return 'a Good Siege Engine never risks hitting friends';
  return null;
}
// To Hit: the worst Shoot Value of the crew firing (untrained crew 6+), −1 if the engine was turned this turn.
// The crew firing it: trained crew first, the best shots first.
export const firingCrew = e => crewAt(e).sort((a, b) => trained(e, b) - trained(e, a) || a.sh - b.sh).slice(0, crewNeeded(e));
export function siegeHitNeed(e, turn = e.rotated) {
  const sv = Math.max(...firingCrew(e).map(o => (trained(e, o) ? o.sh : 6)));
  return Math.min(6, sv + (turn ? 1 : 0));
}
// The Siege Veteran among the crew firing (it may spend Might on the rolls).
export const veteran = e => crewAt(e).find(o => isHero(o) && trained(e, o)) || null;
// Before the first shot: the engine turns to face its target if it must (−1 To Hit), the crew firing it are busy, and
// a Rapid Fire engine rolls how many shots it makes. Returns the number of shots.
export function* siegeAimSeq(e, t) {
  e.shot = true;
  if (!inArc(e, t)) { e.facing = Math.atan2(t.y - e.y, t.x - e.x); e.rotated = true; }
  for (const o of firingCrew(e)) o.shot = true;   // the crew firing it do not shoot themselves
  if (!has(e, 'Rapid Fire')) return 1;
  const a = d6(), b = has(e, 'Swift Reload') ? d6() : 0, n = Math.max(a, b);   // D6 shots like a Missile Weapon
  yield { k: 'dice', step: 'volley', u: e, dice: [{ n: a, v: a, ok: true }, ...(b ? [{ n: b, v: b, ok: true }] : [])], label: `${e.name}: Rapid Fire, ${n} shot${n > 1 ? 's' : ''}${b ? ' (Swift Reload: the better of two dice)' : ''}` };
  return n;
}
// One shot at t (the caller applies its Wounds before the next shot of a volley). Returns { hit, scatter, target,
// rolls: [{ t, part, W, n, outright }], area: [{ t, W }], flung } (n: the Wounds a successful roll does; outright: the
// actual Battlefield Target is slain).
export function* siegeShotSeq(e, t) {
  const vet = veteran(e), need = siegeHitNeed(e), S = e.T.siege;
  const troll = has(e, 'Troll Loader') && crewAt(e).some(o => o.T.monster) ? 'Troll Loader' : null;
  const shot = { hit: null, scatter: null, target: null, rolls: [], area: [] };
  shot.hit = yield* d6Test(vet || e, need, { step: 'hit', reroll: troll, label: `${e.name}: To Hit ${need}+${e.rotated ? ' (turned: −1)' : ''}` });
  if (!shot.hit.ok) return shot;
  let target = t;
  if (!siegeTarget(t) && !has(e, 'Rapid Fire')) {
    const sc = yield* d6Test(vet || e, 6, { step: 'scatter', label: `${e.name}: Scatter, 1 wide, 2–5 slight deviation, 6 dead on` });
    shot.scatter = sc.v;
    const R = has(e, 'Accurate') ? 3 : 6;
    const near = G.units.filter(o => o !== t && o !== e && alive(o) && !siegeTarget(o) && gap(o, t) <= R + 1e-6 && (S.arcing || !losBlocked(e, o)));
    if (sc.v === 1) target = (yield { k: 'scatter', side: t.side, s: e, t, list: near, kind: 'wide' }) || null;
    else if (sc.v < 6) { const own = near.filter(o => o.side === t.side); if (own.length) target = (yield { k: 'scatter', side: t.side, s: e, t, list: own, kind: 'slight' }) || t; }
  }
  shot.target = target;
  if (!target) return shot;
  const siegeT = siegeTarget(target), rapid = has(e, 'Rapid Fire');
  for (const part of target.cav && !rapid ? ['rider', 'mount'] : ['rider']) {
    const reroll = siegeT && has(e, 'Flaming Ammunition') ? 'fails' : null;
    let W = yield* woundRoll(vet, target, { s: S.s, part, reroll, label: `${e.name}: Strength ${S.s} against ${target.name}${target.cav ? ` (${part})` : ''}` });
    if (!W.ok && siegeT && has(e, 'Wall-breaker')) W = yield* woundRoll(vet, target, { s: S.s, part, label: 'Wall-breaker: the second To Wound roll' });
    const nW = !W.ok ? 0 : rapid ? 1 : siegeT ? (has(e, 'Wall-breaker') ? Math.ceil(d6() / 2) : 1) : bigOne(target) ? Math.ceil(target.maxW / 2) : 0;
    shot.rolls.push({ t: target, part, W, n: nW, outright: W.ok && !rapid && !siegeT && !bigOne(target) });
  }
  if (!siegeT && !rapid && !target.cav) target.prone = true;
  // Piercing Shot: unless the hit slays it (Fate aside), the target is flung.
  if (has(e, 'Piercing Shot') && alive(target) && !siegeT && target.s <= 5 && !shot.rolls.some(r => r.outright)) {
    const f = shot.flung = fling(target, e, d6());
    f.wounds = [];
    for (const o of f.over) { f.wounds.push({ t: o, s: 5, W: yield* woundRoll(null, o, { s: 5, label: `Piercing Shot: ${target.name} is flung over ${o.name}, a Strength 5 hit` }) }); if (!o.cav) o.prone = true; }
    if (f.stop || f.wall) {
      f.wounds.push({ t: target, s: 6, W: yield* woundRoll(null, target, { s: 6, label: `Piercing Shot: ${target.name} crashes into ${f.stop ? f.stop.name : 'the terrain'}, a Strength 6 hit` }) });
      if (f.stop) f.wounds.push({ t: f.stop, s: 6, W: yield* woundRoll(null, f.stop, { s: 6, label: `Piercing Shot: ${f.stop.name} is hit by ${target.name}, a Strength 6 hit` }) });
    }
    target.prone = !target.cav;
  }
  if (has(e, 'Area Effect') && !siegeT) {   // everyone else within 2″ of the actual target
    for (const o of G.units.filter(o => o !== target && o !== e && alive(o) && !isSiege(o) && gap(o, target) <= 2 + 1e-6)) {
      const W = yield* woundRoll(null, o, { s: 5, label: `Area Effect: Strength 5 hit on ${o.name}` });
      shot.area.push({ t: o, W });
      if (!o.cav) o.prone = true;
    }
  }
  return shot;
}
const bigOne = t => t.d >= 10 || t.maxW >= 10;
// Piercing Shot: a model of Strength 5 or less that is hit (and not slain) is flung D6″ straight away from the engine.
// The models it passes over (Strength 5 or less) suffer a Strength 5 hit and are knocked Prone; impassable terrain or a
// model of Strength 6 or more stops it, and then it and that model suffer a Strength 6 hit each. It lands Prone.
// Returns { from, d, over: [models], stop: model or null, wall }.
function fling(t, e, d) {
  const dx = t.x - e.x, dy = t.y - e.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const over = new Set(), out = { from: { x: t.x, y: t.y }, d: 0, over: [], stop: null, wall: false };
  const hits = (x, y) => G.units.filter(o => o !== t && alive(o) && Math.hypot(o.x - x, o.y - y) < o.r + t.r - 0.02);
  let go = 0;
  for (let s = 0.1; s <= d + 1e-6; s += 0.1) {
    const x = t.x + ux * s, y = t.y + uy * s;
    if (x < t.r || y < t.r || x > G.W - t.r || y > G.H - t.r) break;
    if (G.terrain.some(T => ['rock', 'building', 'wall'].includes(T.k) && squareHits(x, y, t.r, T))) { out.wall = true; break; }
    const big = hits(x, y).find(o => o.s >= 6 || isSiege(o));
    if (big) { out.stop = big; break; }
    hits(x, y).forEach(o => over.add(o));
    go = s;
  }
  while (go > 0 && hits(t.x + ux * go, t.y + uy * go).length) go -= 0.1;   // it lands clear of the models it passed over
  go = Math.max(0, go);
  dropLinks(t); t.x += ux * go; t.y += uy * go;
  out.d = go; out.over = [...over];
  return out;
}
// The computer's choice: the shot with the best chance at the most valuable target. Returns { t } or null.
export function aiSiegeShot(e) {
  if (siegeWhy(e, null)) return null;
  let best = null, bv = 0;
  for (const t of G.units.filter(o => alive(o) && o.side !== e.side && !siegeWhy(e, o))) {
    const need = woundNeed(e.T.siege.s, t.d), p = need ? need.reduce((p, v) => p * (7 - v) / 6, 1) : 0;
    const v = p * (isHero(t) ? 3 : 1) * (t.cav ? 1.5 : 1) * (siegeTarget(t) ? 1.5 : 1) * (inArc(e, t) ? 1 : 0.7)
      + (has(e, 'Area Effect') ? 0.3 * G.units.filter(o => o !== t && alive(o) && o.side !== e.side && gap(o, t) <= 2).length : 0);
    if (v > bv) { bv = v; best = { t }; }
  }
  return best;
}
// The other player's pick on the Scatter Table: on a 1 any model it likes (its enemy's, if one is near), on a 2–5 its
// own model that would suffer least.
export const aiScatter = q => (q.kind === 'wide' ? q.list.filter(o => o.side === q.s.side).sort((a, b) => b.w - a.w)[0] || null : q.list.slice().sort((a, b) => (isHero(a) - isHero(b)) || (a.w - b.w))[0]);
// End phase (p. 147): an enemy that did nothing but Move this turn and stands in base contact disables the engine.
export function disableCheck() {
  const out = [];
  for (const e of G.units.filter(u => alive(u) && isSiege(u))) {
    const by = G.units.find(o => alive(o) && o.side !== e.side && touching(o, e) && !o.shot && !o.cast && !o.fought && !isSiege(o));
    if (by) { e.w = 0; e.dead = true; out.push({ e, by }); }
  }
  return out;
}
