// Special rules of Narrative Scenarios (the Battle of Edoras booklet, docs/edoras/): burning buildings, slain models
// coming back as Reinforcements, a Hero escaping off any board edge (scenarios.js: escapes). A mission switches each on:
//   fire: true        terrain pieces with store: true are Storehouses (Torch the City, p. 11). At the end of the Move
//                     Phase an Evil model in base contact with one that is not burning, and not Engaged, may roll a D6
//                     to set it alight: 6+, +1 with a flaming brand. A Good model ending its Activation in base contact
//                     with a burning one, not Engaged, may roll to put it out: 5+. Either way the model may not shoot
//                     or Support a Combat this turn (u.busy; rules.js: shooterReason, combat.js: canSupport).
//   hordes: name      a slain model of that name is kept aside; at the end of each Evil Activation Phase a D6 for each,
//                     on 4+ it enters from any point on any board edge via the rules for Reinforcements (Last Stand of
//                     the Princes, p. 13; move_phase/#reinforcements-20: it moves on but may not Charge).
// The burning Storehouses are G.fires (indices into G.terrain), so a mission's terrain list is never changed.
// No drawing and no DOM here. Requests are the d6Test ones (dice.js).
import { G } from '../state.js';
import { alive, sideAlive, engaged, alignOf, sideOfAlign } from './rules.js';
import { rectDist } from './geometry.js';
import { d6Test } from './dice.js';
import { arrive } from './scenarios.js';

/* ---------- Storehouses ---------- */
export const stores = () => (G.terrain || []).filter(T => T.store);
const fires = () => G.fires || (G.fires = new Set());
export const burning = T => fires().has(G.terrain.indexOf(T));
export const burningCount = () => stores().filter(burning).length;
// Base contact with a terrain piece: the base edge within a hair of its side.
export function touches(u, T) {
  return rectDist(u.x, u.y, T) <= u.r + 0.15;
}
export const brand = u => (u.T.gear || []).some(g => /flaming brand/i.test(g));
const free = u => alive(u) && !engaged(u) && !u.busy;
// The Storehouse model u could set alight / put out now (or undefined).
// By alignment (rules.js: alignOf): the player may command either side (missions.js: flipSide).
export const toLight = u => (G.m && G.m.fire && alignOf(u.side) === 'evil' && free(u) ? stores().find(T => !burning(T) && touches(u, T)) : undefined);
export const toQuench = u => (G.m && G.m.fire && alignOf(u.side) === 'good' && free(u) ? stores().find(T => burning(T) && touches(u, T)) : undefined);
export const lighters = () => sideAlive(sideOfAlign('evil')).filter(u => toLight(u));
export const quenchers = () => sideAlive(sideOfAlign('good')).filter(u => toQuench(u));
// Set Alight the City: one model's D6. Returns { T, die } (die.ok: the Storehouse burns).
export function* lightSeq(u) {
  const T = toLight(u);
  u.busy = 'set a Storehouse alight';
  const die = yield* d6Test(u, 6, { step: 'fire', label: `${u.name}: set the Storehouse alight${brand(u) ? ' (flaming brand +1)' : ''}`, mod: brand(u) ? 1 : 0 });
  if (die.ok && T) fires().add(G.terrain.indexOf(T));
  return { T, die };
}
// Put the Fires Out: one model's D6, 5+.
export function* quenchSeq(u) {
  const T = toQuench(u);
  u.busy = 'put out a fire';
  const die = yield* d6Test(u, 5, { step: 'fire', label: `${u.name}: put the fire out` });
  if (die.ok && T) fires().delete(G.terrain.indexOf(T));
  return { T, die };
}

/* ---------- Hordes: the slain come back ---------- */
export const keptAside = side => (G.m && G.m.hordes && alignOf(side) === 'evil' ? G.units.filter(u => u.side === side && u.dead && !u.fled && u.T.n === G.m.hordes) : []);
// The D6 for one model kept aside: 4+ it comes back (a mission's hordeNeed may ask more).
export const hordeNeed = () => (G.m && G.m.hordeNeed) || 4;
export function* hordeSeq(u) {
  return yield* d6Test(u, hordeNeed(), { step: 'horde', label: `${u.name}: back into the fight` });
}
// The edge point a returning model enters from: the computer picks the one nearest to the enemy it wants (the
// mission's hordeTarget, else the nearest enemy model).
export function hordePoint(u) {
  const foes = sideAlive(u.side === 'good' ? 'evil' : 'good');
  const aim = (G.m.hordeTarget && G.m.hordeTarget()) || foes[0] || { x: G.W / 2, y: G.H / 2 };
  const pts = [{ x: aim.x, y: 0 }, { x: aim.x, y: G.H }, { x: 0, y: aim.y }, { x: G.W, y: aim.y }];
  return pts.sort((a, b) => Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y))[0];
}
// Brings u back on at an edge point: a fresh model, placed just inside the edge, that may Move but not Charge.
// Returns true when there was room.
export function hordeReturn(u, p = hordePoint(u)) {
  Object.assign(u, { dead: false, reserve: true, w: u.maxW, prone: false, anim: null, busy: false });
  const placed = arrive({ models: [u] }, p);
  if (!placed.length) { u.dead = true; u.reserve = false; return false; }
  u.noCharge = 'Reinforcements';
  return true;
}
