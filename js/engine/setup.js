// Building the models for a mission. Shared by the game and the balance tool.
import { TYPES, baseRadius } from '../data/units.js';
import { ARMY_TYPES } from '../data/army-lists.js';
// A profile by key: the missions' (units.js) or the matched play army lists' (a Cavalry model's foot and loose mount).
export const typeOf = k => TYPES[k] || ARMY_TYPES[k];
import { assignGuards, assignGenerals, rule } from './special.js';
import { settleRing } from './advanced.js';

export function freshTurn(u) {
  if (u.bow && u.bow.stones) u.bow = null;   // Throw Stones: only readied in a Shoot phase (rules.js: readyStones)
  u.movedDist = 0; u.done = false; u.moveStart = null; u.trail = []; u.shot = false; u.charged = false; u.stunned = false; u.tested = false;
  u.passed = new Set(); u.frozen = false; u.shots = 0; u.threw = false; u.throwing = false; u.sfRange = 0; u.sfHorn = null; u.drum = false; u.crossTried = false;   // Courage Tests passed this turn, by rule (special.js); a failed Terror Test
  // Heroic Actions last one turn (engine/heroes.js): what each Hero declared, and what a shout gave the models it reached.
  u.decl = {}; u.mvPlus = 0; u.mvShoot = 0; u.noCharge = null; u.tether = null; u.resolve = false; u.itwReroll = null; u.sharp = !!u.T.sharpshooter || rule(u, 'Sharpshooter') != null;
  u.fvPlus = null; u.sx2 = false; u.def6 = false; u.shouted = null; u.heroicMoved = false;
  // Magic (engine/magic.js): the power Cast this turn, Heroic Channelling, Heroic Resolve's free Resist dice, a Combat fought.
  u.cast = null; u.channel = false; u.resolveDie = false; u.fought = false; u.swum = false; u.rotated = false; u.sauron = false; u.supported = false; u.busy = false;   // u.busy: tried to set alight or put out a Storehouse (narrative.js); u.swum: a Swim Test taken this turn
}

// A Cavalry model (p. 67): it moves with its mount's Move Value and fights with the better Fight Value, Strength and
// Attacks of rider and mount; the mount has Wounds and Defence of its own (u.mount).
export function mountUp(u) {
  const T = u.T, M = T.mount;
  u.cav = true; u.mount = { ...M, w: M.w, maxW: M.w };
  u.mv = M.mv; u.f = Math.max(T.f, M.f); u.s = Math.max(T.s, M.s); u.a = Math.max(T.a, M.a);
}
// A fresh model of type t for side, at (x, y): a mount that lost its rider and stays (p. 69).
export function spawnUnit(units, t, side, x, y, name) {
  const T = typeOf(t), id = units.reduce((m, o) => Math.max(m, o.id), -1) + 1;
  const u = { id, t, T, side, x, y, r: baseRadius(T), mv: T.mv, f: T.f, sh: T.sh, s: T.s, d: T.d, a: T.a, w: T.w, maxW: T.w,
    bow: T.bow || T.thrown || null, missiles: [T.bow, T.thrown].filter(Boolean), ai: null, base: T.n, name, dead: false, gone: false, anim: null };
  freshTurn(u); u.done = true;
  units.push(u);
  return u;
}

// Throw Stones (p. 131): 'Throw Stones (range 8", Strength 1)' as a Missile Weapon that cannot be used after moving.
export function stonesOf(T) {
  const r = (T.rules || []).find(x => /^throw stones/i.test(x));
  if (!r) return null;
  const rng = /range\s*(\d+)/i.exec(r), s = /str\w*\s*(\d+)/i.exec(r);
  return { n: 'Thrown stones', rng: rng ? +rng[1] : 8, s: s ? +s[1] : 1, still: true, stones: true };
}
// Models from a mission's unit list, numbered when several share a name (Hill Tribesman 1, 2, ...).
// An entry names its profile in TYPES (t), or brings it along (T: matched play profiles from data/army-lists.js).
export function buildUnits(m) {
  const units = m.units.map((d, k) => {
    const T = d.T || TYPES[d.t];
    const u = { id: k, t: d.t, T, side: d.side, x: d.x, y: d.y, r: baseRadius(T), mv: T.mv, f: T.f, sh: T.sh, s: T.s, d: T.d, a: T.a, w: d.w || T.w, maxW: T.w,
      bow: T.bow || T.thrown || null, missiles: [T.bow, T.thrown, stonesOf(T)].filter(Boolean), ai: d.ai || null, sentry: !!d.sentry, facing: d.facing || 0, crew: !!d.crew, carry: d.carry || null, ladderId: d.ladder ?? null, reserve: !!d.reserve, base: d.n || T.n, name: '', dead: false, gone: false, anim: null };
    if (T.mount) mountUp(u);
    // Chariots and War Beasts (beasts.js): never knocked Prone for any reason (Immovable Object).
    if (T.chariot || T.warBeast) Object.defineProperty(u, 'prone', { get: () => false, set: () => {}, enumerable: true, configurable: true });
    // A War Beast's Commander rides it (beasts.js): its own Wounds, Courage, Might, Will and Fate.
    if (T.warBeast && T.cmd) { const C = typeOf(T.cmd); u.cmd = { t: T.cmd, name: C.n, w: C.w, maxW: C.w, c: C.c, might: C.mwf[0], will: C.mwf[1], fate: C.mwf[2] }; }
    if (T.mwf) { u.mwf = T.mwf; u.might = T.mwf[0]; u.will = T.mwf[1]; u.fate = T.mwf[2]; }   // a Hero's Might, Will and Fate (p. 76)
    freshTurn(u);
    return u;
  });
  const tally = {}, idx = {};
  units.forEach(u => { const k = u.side + u.base; tally[k] = (tally[k] || 0) + 1; });
  units.forEach(u => { const k = u.side + u.base; if (tally[k] > 1) { idx[k] = (idx[k] || 0) + 1; u.name = `${u.base} ${idx[k]}`; } else u.name = u.base; });
  assignGenerals(units);
  assignGuards(units);
  settleRing(units);   // only one Ringbearer, unless two share the top of the table (advanced.js)
  return units;
}
