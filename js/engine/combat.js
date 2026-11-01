// Fights: Pairing Off, Duel Roll odds and dice, Backing Away and Strikes. No drawing and no DOM here;
// the game flow animates these results and the balance tool (tools/balance.mjs) runs them headless.
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap } from './geometry.js';
import { alive, engaged, woundNeed, pNeed, backAwaySpot, nudgeAway, losBlocked, sideOfAlign, touching, linked, inBrush, takeWound, flee, shieldwallOn } from './rules.js';
import { nearestFree } from './terrain.js';
import { TYPES, baseRadius } from '../data/units.js';
import { spawnUnit, typeOf } from './setup.js';
import { isHero, mightUp, d6Test, woundRoll, woundRolls, fateSeq, chainOdds, courageSeq } from './dice.js';
import { fvOf, strikeS, challengeBonus, challenging } from './heroes.js';
import { rule, rules, against, hasKeyword, autoPass, timid, armyRule } from './special.js';
import { spellbound, paralysed, enchanted } from './magic.js';
import { monstrousCharge } from './monsters.js';
import { chariotA, backAwayRoles, immovable } from './beasts.js';
import { attacksPlus, savageCharge, woundPlusNamed, woundRerollNamed, namedBanners, duelRerolls, ignoreOnSix } from './named.js';

export { touching, isHero, mightUp };
export const foeSide = side => side === 'good' ? 'evil' : 'good';

/* ---------- Pairing Off (2024 rules) ---------- */
// Every legal way to Pair Off one group of models in base contact: each Combat has a single model on at least
// one side, every model is in exactly one Combat, and it only fights models it touches. Each Combat is a
// list of models; each result is a list of Combats.
export function pairings(group, cap = 300) {
  const U = group.filter(alive), n = U.length;
  const adj = U.map(a => U.map((b, j) => (a.side !== b.side && touching(a, b) ? j : -1)).filter(j => j >= 0));
  const role = new Array(n).fill(null);   // null: undecided, 'c': centre of a Combat, number: joins that centre
  const leaves = new Array(n).fill(0);
  const out = [], seen = new Set();
  const free = k => adj[k].some(j => j > k && role[j] === null);
  function rec(i) {
    if (out.length >= cap) return;
    if (i === n) {
      if (role.some((r, k) => r === 'c' && !leaves[k])) return;
      const combats = [];
      U.forEach((u, k) => { if (role[k] === 'c') combats.push([u, ...U.filter((_, j) => role[j] === k)]); });
      const key = partitionKey(combats);
      if (!seen.has(key)) { seen.add(key); out.push(sortCombats(combats)); }
      return;
    }
    if (role[i] === 'c') { rec(i + 1); return; }
    for (const j of adj[i]) {
      if (typeof role[j] === 'number') continue;
      const was = role[j];
      role[j] = 'c'; role[i] = j; leaves[j]++;
      rec(i + 1);
      leaves[j]--; role[i] = null; role[j] = was;
    }
    if (free(i)) { role[i] = 'c'; rec(i + 1); role[i] = null; }
  }
  rec(0);
  return out;
}
export const combatKey = c => c.map(u => u.id).sort((a, b) => a - b).join(',');
const partitionKey = cs => cs.map(combatKey).sort().join('|');
export const sortCombats = cs => cs.sort((a, b) => Math.min(...a.map(u => u.x)) - Math.min(...b.map(u => u.x)));
export const goodsOf = c => c.filter(u => u.side === 'good' && alive(u));
export const evilsOf = c => c.filter(u => u.side === 'evil' && alive(u));
// The model the others gather around: the single model of one side (Good if both sides have one).
export function centreOf(c) {
  const g = goodsOf(c), e = evilsOf(c);
  return g.length === 1 ? g[0] : e.length === 1 ? e[0] : c[0];
}
export const describeCombat = c => `${goodsOf(c).map(u => u.name).join(' & ')} vs ${evilsOf(c).map(u => u.name).join(' & ')}`;

/* ---------- Pairing Off by hand ---------- */
// The player builds the Combats of one group one model at a time. made: the Combats formed so far, each with
// models of both sides. A partial split is fine while some legal split (one of opts) still contains it.
const fits = (made, opts) => opts.some(p => made.every(m => p.some(c => m.every(u => c.includes(u)))));
const sideCount = c => `${goodsOf(c).length} against ${evilsOf(c).length}`;
const twoOnTwo = c => goodsOf(c).length > 1 && evilsOf(c).length > 1;
// Whether model u, not in a Combat yet, could still start one with a free enemy or join one without making 2 against 2.
function canJoin(made, all, u) {
  return all.some(e => {
    if (e.side === u.side || !touching(u, e)) return false;
    const c = made.find(x => x.includes(e));
    return !c || !twoOnTwo([...c, u]);
  });
}

// Model a joins the Combat of model b, or forms a new Combat with enemy b. Returns { made } with the new
// Combats (and freed: models left without a Combat when a leaves), or { why } when the rules do not allow it.
export function joinCombat(made, opts, a, b) {
  const old = made.find(c => c.includes(a));
  if (old && old.includes(b)) return { why: `${a.name} and ${b.name} already fight in the same Combat.` };
  const t = made.find(c => c.includes(b));
  if (!t && b.side === a.side) return { why: `${b.name} is on the same side and not in a Combat yet. Click an enemy that ${a.name} touches.` };
  const nc = t ? [...t, a] : [b, a];
  if (!nc.some(x => x.side !== a.side && touching(a, x))) {
    return { why: `${a.name} is not in base contact with ${t ? 'any enemy in that Combat' : b.name}. A model can only fight enemies it touches.` };
  }
  if (twoOnTwo(nc)) {
    return { why: `That would be ${sideCount(nc)}. A Combat can have several models on one side, but never on both.` };
  }
  // a leaves its old Combat; what is left of it falls apart if it no longer has both sides.
  const freed = [], next = [];
  for (const c of made) {
    if (c === t) continue;
    if (c !== old) { next.push(c); continue; }
    const rest = c.filter(u => u !== a);
    if (goodsOf(rest).length && evilsOf(rest).length) next.push(rest); else freed.push(...rest);
  }
  next.push(nc);
  if (!fits(next, opts)) {
    const all = [...new Set(opts[0].flat())], free = all.filter(u => !next.some(c => c.includes(u)));
    const stuck = free.find(u => !canJoin(next, all, u));
    if (stuck) return { why: `Then ${stuck.name} would have no Combat left to join. Every model in base contact must fight in a Combat.` };
    // Each model alone could still join, but not all of them together: name those next to the new Combat.
    const near = free.filter(u => nc.some(x => x.side !== u.side && touching(u, x)));
    const list = (near.length > 1 ? near : free).map(u => u.name);
    const who = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]} could not ${list.length > 2 ? 'all' : 'both'}` : `${list[0] || 'the other models'} could not`;
    return { why: `Then ${who} join a Combat without making 2 against 2. Every model in base contact must fight in a Combat.` };
  }
  return { made: next, freed };
}
// Models of the group that are not in a Combat yet.
export const unpaired = o => o.units.filter(u => !o.made.some(c => c.includes(u)));

/* ---------- Supporting with spears and pikes (2024) ---------- */
// A spear- or pike-armed model that is not Engaged and has not shot this turn can Support a friend in base contact
// that is Engaged in Combat and has the same base size or smaller. It adds one dice to that Combat's Duel Roll with its
// own Fight Value and, if its side wins, makes one Strike at any enemy in the Combat. It is not part of the Combat:
// it cannot be struck and does not Back Away. Each model supports one Combat per Fight phase; the combats get sup.
// A pike may also Support a friendly pike that is itself Supporting: the fighter gets two Supports (p. 105).
// Spear Mastery: throwing spears fight as a spear only with the rule in play, and not after a throw this turn (it
// counts the throw on a Charge in the Move phase too; a shot in the Shoot phase already stops any Support).
const masteryOnly = u => !!u.T.thrown && (u.T.rules || []).includes('Spear Mastery');
const spearNow = u => (masteryOnly(u) ? rule(u, 'Spear Mastery') != null && !u.threw : true);
export const canSupport = u => alive(u) && (u.T.spear || u.T.pike) && spearNow(u) && !u.shot && !u.busy && !engaged(u) && !u.prone;   // u.busy: a Storehouse this turn (narrative.js)   // not when Prone (p. 105)
const supportsIn = (s, c) => c.some(f => f.side === s.side && alive(f) && f.r <= s.r + 1e-6 && touching(s, f));
// Pike p can Support through pike q (q in front of it, Supporting a fighter).
const pikeBehind = (p, q) => p !== q && p.T.pike && q.T.pike && p.side === q.side && q.r <= p.r + 1e-6 && touching(p, q);
// Supporters of `side` in Combat c (only those assigned to it).
export const supOf = (c, side) => (c.sup || []).filter(s => s.side === side && alive(s));
// Gives each Combat its supporters. A model touching friends in several Combats goes where its side needs it most.
// First the models touching a fighting friend, then pikes behind those pikes; c.via says which pike each of those
// stands behind. A model gains Support from only one spear-armed model at a time (errata, p. 104), so each fighter
// takes one supporter, and each supporting pike one pike behind it; the models with the fewest friends to Support pick
// first, so that two spears behind one line both find a fighter.
export function assignSupport(combats) {
  for (const c of combats) { c.sup = []; c.via = new Map(); }
  const live = combats.filter(c => goodsOf(c).length && evilsOf(c).length);
  const neediest = (s, opts) => {
    const odds = c => { const p = combatOdds(c); return s.side === 'good' ? p : 1 - p; };
    return opts.reduce((a, b) => (odds(b) < odds(a) ? b : a));
  };
  const backed = new Set();   // fighters (and supporting pikes) that have their one supporter already
  const free = (s, c) => c.filter(f => !backed.has(f) && supportsIn(s, [f]));
  const front = G.units.filter(canSupport).map(s => ({ s, n: live.reduce((k, c) => k + free(s, c).length, 0) })).filter(o => o.n).sort((a, b) => a.n - b.n);
  for (const { s } of front) {
    const opts = live.filter(c => free(s, c).length);
    if (!opts.length) continue;
    const c = neediest(s, opts);
    c.sup.push(s); backed.add(free(s, c)[0]);
  }
  const first = new Set(live.flatMap(c => c.sup));
  for (const s of G.units.filter(u => u.T.pike && canSupport(u) && !first.has(u))) {
    const ahead = c => c.sup.find(q => first.has(q) && !backed.has(q) && pikeBehind(s, q));
    const opts = live.filter(ahead);
    if (!opts.length) continue;
    const c = neediest(s, opts), q = ahead(c);
    c.sup.push(s); c.via.set(s, q); backed.add(q);
  }
  return combats;
}
// While the fights are still being split: every model that could Support Combat c for `side`.
function couldSupport(c, side) {
  const direct = G.units.filter(s => s.side === side && canSupport(s) && supportsIn(s, c));
  return [...direct, ...G.units.filter(s => s.side === side && canSupport(s) && !direct.includes(s) && direct.some(q => pikeBehind(s, q)))];
}

/* ---------- Banners (2024, p. 109) ---------- */
// A Combat is affected by a friendly banner when a model of that side in it, fighting or Supporting, is within 3″
// of a banner bearer and can see it. Then one model of that side may re-roll one of its dice in the Duel Roll.
export const BANNER_RANGE = 3;
const sight = new Map();   // Line of Sight from a model to a banner bearer, by both positions (bases do not move while fights are split)
function seesBanner(u, b) {
  if (u === b) return true;
  const k = `${u.id}:${b.id}:${u.x.toFixed(3)},${u.y.toFixed(3)}:${b.x.toFixed(3)},${b.y.toFixed(3)}`;
  if (!sight.has(k)) { if (sight.size > 4000) sight.clear(); sight.set(k, !losBlocked(u, b)); }
  return sight.get(k);
}
export const bannerBearers = side => G.units.filter(b => b.side === side && alive(b) && b.T.banner);
// The banner bearer that affects Combat c for `side`, or null. sup: that side's supporters (the assigned ones by default).
// Models that count as banners by a rule (named.js: Claim the Throne, Awesome Presence) have their own range and say
// which models they serve.
export function bannerFor(c, side, sup) {
  const bearers = bannerBearers(side), other = namedBanners(side);
  if (!bearers.length && !other.length) return null;
  const mine = [...c.filter(u => u.side === side && alive(u)), ...(sup || supFor(c, side))];
  return bearers.find(b => mine.some(u => gap(u, b) <= BANNER_RANGE + 1e-6 && seesBanner(u, b)))
    || (other.find(o => mine.some(u => o.for(u) && gap(u, o.b) <= o.range + 1e-6 && seesBanner(u, o.b))) || {}).b || null;
}
// The dice each side may re-roll in the Duel Roll of Combat c: one for a banner, one for The Usurper King (named.js).
export const bannersOf = (c, gs, es) => ({ good: (bannerFor(c, 'good', gs) ? 1 : 0) + duelRerolls(c, 'good'), evil: (bannerFor(c, 'evil', es) ? 1 : 0) + duelRerolls(c, 'evil') });

/* ---------- Shields and Shielding (2024, p. 111) ---------- */
// A model carries a shield (or a light shield, which adds no Defence) when its wargear lists one.
export const hasShield = u => u.T.gear.some(g => /^(light )?shield/i.test(g));
// Shielding: declared at the start of a Combat, before the Duel Roll. The side's models double their Attacks, but if
// they win they make no Strikes. All of the side's models in the Combat must do it, so all must carry a shield and
// not fight with a two-handed weapon; cavalry cannot, and a Shielding model cannot be Supported.
// When both sides could, the side with Priority declares first.
export const canShield = (c, side) => {
  const m = c.filter(u => u.side === side && alive(u));
  return m.length > 0 && m.every(u => hasShield(u) && weaponsOf(u).includes('hand') && !u.cav);
};
// shield: { good, evil }, the sides that declared Shielding in this Combat. foes: the enemy models in the Combat.
// +1 for a Cavalry Charge's Extra Attack, +1 against the Hero's Heroic Challenge opponent (p. 85).
// Monstrous Charge: +1 Attack after a Charge, not on top of a Cavalry Charge's Extra Attack (FAQ, p. 128).
const aOf = u => u.a + (monstrousCharge(u) ? 1 : 0) + chariotA(u) + attacksPlus(u);   // Monstrous Charge, a Chariot that Charged, named.js
const extraA = (u, foes) => ((chargeBonus(u, foes) || savageCharge(u, foes)) && !monstrousCharge(u) ? 1 : 0);   // Savage Charge: also against Cavalry
// The dice u rolls in a Duel Roll, part by part (as duelModParts): its Attacks and what adds to them. attacks is the sum.
export function attacksParts(u, shield, foes) {
  const mc = monstrousCharge(u) ? 1 : 0, ch = chariotA(u), named = attacksPlus(u), ex = extraA(u, foes);
  return [
    { v: u.a, t: 'Attacks on its profile', why: 'profile' },
    mc && { v: mc, t: 'Monstrous Charge', why: 'monstrousCharge' },
    ch && { v: ch, t: 'Chariot that Charged', why: 'chariot' },
    named && { v: named, t: 'its own special rule', why: 'heroRule' },
    shield && shield[u.side] && { v: aOf(u), t: 'Shielding: twice the dice', why: 'shielding' },
    ex && { v: ex, t: chargeBonus(u, foes) ? 'Cavalry Charge: Extra Attack' : 'Savage Charge', why: chargeBonus(u, foes) ? 'cavalrycharge' : null },
    challengeBonus(u, foes) && { v: 1, t: 'Heroic Challenge opponent', why: 'heroicChallenge' },
  ].filter(Boolean);
}
const attacks = (u, shield, foes) => sumParts(attacksParts(u, shield, foes));
// The Strikes winner w makes against the losers L: one per Attack, with the same bonuses (Shielding makes none at all).
export const strikesOf = (w, L) => (spellbound(w) ? 0 : aOf(w) + extraA(w, L) + challengeBonus(w, L));   // Transfix: no Strikes (p. 121)

/* ---------- Cavalry (2024, p. 67–71) ---------- */
// Cavalry Charge (p. 70): a mounted model that Charged this turn gets Extra Attack (+1 Attack) and Knock to the Ground
// (the infantry it beats is knocked Prone after Backing Away) when it fights only infantry (a Monster with the Infantry
// keyword counts for Extra Attack, p. 89, but is never knocked down), is not in Difficult Terrain
// and has not been thrown, nor when it Charged a model defending a Barrier (cavalry/#fighting-across-barriers; u.over
// links it to that defender).
// foes: the enemy models in the Combat.
export const chargeBonus = (u, foes) => !!(u.cav && !timid(u) && u.charged && !u.prone && !u.stunned && foes.length && foes.every(f => !f.cav && (!f.T.monster || hasKeyword(f, 'Infantry')) && !f.T.mount && !f.T.mountModel) && !inBrush(u.x, u.y, u.r)
  && !(u.over && foes.some(f => f.id === u.over.t)));
// After the losers Back Away: the infantry beaten by a charging Cavalry model is knocked Prone (not Monsters, not
// Strength 6 or more). Returns the models knocked down.
// Unyielding Combat Stance keeps its footing on a 4+ (down.kept: [{ u, v }], the models that stayed up and their dice).
export function knockDown(W, L) {
  const kept = [];
  if (!W.some(w => chargeBonus(w, L))) return Object.assign([], { kept });
  const down = L.filter(l => alive(l) && !l.cav && !l.T.monster && !l.T.mountModel && l.s < 6 && !l.prone).filter(l => {
    const S = staysUp(l);
    if (S) kept.push({ u: l, v: S.v, ok: S.ok });
    return !(S && S.ok);
  });
  for (const l of down) l.prone = true;
  return Object.assign(down, { kept });
}
// Unyielding Combat Stance (p. 132): a model about to be knocked Prone rolls a D6 and stays up on a 4+. Returns { v, ok },
// or null without the rule.
export function staysUp(u) {
  if (rule(u, 'Unyielding Combat Stance') == null) return null;
  const v = d6();
  return { v, ok: v >= 4 };
}
// Shieldwall (rules.js: shieldwallOn) for every model of Combat c, worked out once before Backing Away: u.swall.
export function shieldwallSnap(c) { for (const u of c) u.swall = shieldwallOn(u); }
// The Defence of the part of t a Strike hits: Shieldwall adds 1 to the model itself.
export const defOf = (t, part = 'rider') => (part === 'mount' && t.cav ? t.mount.d : t.d + (t.swall ? 1 : 0));
// Strikes at a Cavalry model go at the rider or the mount, the striker's choice (p. 71): the part with the better
// chance to wound, and the mount when both are equal (the usual table habit: a horse is the easier target, and a rider
// thrown from it is out of the fight for the turn).
export function bestPart(w, t) {
  if (!t.cav) return 'rider';
  const pm = pNeed(woundNeed(strikeS(w), t.mount.d), woundBonus(w, t)), pr = t.def6 ? pNeed(woundNeed(strikeS(w), defOf(t)), 0, true) : pNeed(woundNeed(strikeS(w), defOf(t)), woundBonus(w, t));
  return pm >= pr - 1e-9 ? 'mount' : 'rider';
}
// One Wound to a part of model t: 'wound', 'slain' (the rider: the model is gone), 'mountWound' or 'mountSlain'
// (the rider will take a Thrown Rider Test once the Strikes are over: t.mountSlain).
export function woundPart(t, part) {
  if (part === 'mount' && t.cav) {
    t.mount.w--;
    if (t.mount.w > 0) return 'mountWound';
    t.mount.w = 0; t.mountSlain = true;
    return 'mountSlain';
  }
  // A Hero's Chariot destroyed: the Hero is dismounted as if Knocked Flying (p. 153), with its own Wounds.
  if (t.T.chariot && t.T.chariot.rider && t.T.foot && t.w <= 1) { t.w = 0; t.mountSlain = true; t.mount = { n: t.T.chariot.n2 || 'Chariot' }; return 'mountSlain'; }
  return takeWound(t) ? 'slain' : 'wound';
}
// The rider loses its mount: the model becomes its infantry version on a 25 mm base where it stood, and stays Engaged
// with the enemies it was in base contact with (p. 70), though the smaller base no longer touches them.
export function dismount(u) {
  const F = typeOf(u.T.foot) || u.T;
  u.held = new Set(G.units.filter(o => alive(o) && o.side !== u.side && touching(u, o)).map(o => o.id));
  if (u.T.chariot) { u.w = F.w; Object.defineProperty(u, 'prone', { value: false, writable: true, enumerable: true, configurable: true }); }   // a Hero whose Chariot was destroyed: its own Wounds, and it can be knocked Prone again
  u.t = u.T.foot || u.t; u.T = F; u.cav = false; u.mount = null; u.mountSlain = false; u.charged = false;
  u.r = baseRadius(F); u.mv = F.mv; u.f = F.f; u.s = F.s; u.a = F.a; u.d = F.d; u.sh = F.sh; u.bow = F.bow || F.thrown || null;
  u.missiles = [F.bow, F.thrown].filter(Boolean);   // a lance stays with the horse: the foot profile has none (p. 105)
  const Q = nearestFree(u, { x: u.x, y: u.y }); u.x = Q.x; u.y = Q.y;
}
// Thrown Rider Test (p. 70), taken when the mount is slain: 1 Knocked Flying (a Strength 3 hit, then Prone and out of
// action for the turn), 2–5 Rises From the Dust (on its feet, out of action for the turn), 6 Leaps into Action.
// An Expert Rider re-rolls a 1; a Hero rider may then spend Might on the test (p. 78). Returns { rolls, v, hit, died }.
export function* thrownRiderSeq(u) {
  if (u.T.chariot) {   // a Hero's Chariot destroyed (p. 153): Knocked Flying, no test
    dismount(u);
    const { hit, died } = yield* knockedFlyingSeq(u, true);
    return { rolls: [1], v: 1, die: { n: 1, v: 1, ok: false }, hit, died, keep: null, chariot: true };
  }
  const er = !!u.T.expertRider || rule(u, 'Expert Rider') != null;   // Expert Rider (p. 124)
  const die = yield* d6Test(u, 2, { step: 'thrown', reroll: er ? 'Expert Rider' : null, goals: [6],
    label: `Thrown Rider Test: ${u.name}${er ? ' (Expert Rider re-rolls a 1)' : ''}` });
  let v = die.v, keep = null;
  const rolls = die.re ? [die.was, die.n] : [die.n], unyielding = rule(u, 'Unyielding Combat Stance') != null;   // the rider's, before it is on foot
  dismount(u);
  let hit = null, died = false;
  // Unyielding Combat Stance (p. 132): 4+ and the 1 counts as a 6.
  if (v === 1 && unyielding) {
    keep = yield* d6Test(u, 4, { step: 'unyielding', label: `Unyielding Combat Stance: ${u.name} keeps its footing on 4+` });
    if (keep.ok) v = 6;
  }
  if (v === 1) ({ hit, died } = yield* knockedFlyingSeq(u, true));
  else if (v < 6) u.stunned = true;
  return { rolls, v, die, hit, died, keep };
}
// Knocked Flying (a 1 on the Thrown Rider Table, a 1 on a Jump or Leap from the saddle, a fall): one Strength 3 hit that
// nobody can spend Might on (a Hero rider may spend Fate), then Prone and out of action for the turn. on: the rider is
// already on foot. Returns { hit: { need, dice, ok }, died }.
export function* knockedFlyingSeq(u, on = false) {
  if (!on) dismount(u);
  const w = yield* woundRoll(null, u, { s: 3, label: `${u.name} is Knocked Flying: Strength 3 hit` });
  let died = false;
  if (w.ok) died = (yield* hurtSeq(u)).r === 'slain';
  if (!died) { u.prone = true; u.stunned = true; }
  return { hit: { need: w.need, dice: w.dice, ok: w.ok }, died };
}
// A mount whose rider was slain (p. 69): a horse (Attacks 0) always flees; another mount stays on a Courage Test
// (2D6 against its Courage) and fights on as a model of its own. Returns null (fled or no test) or { dice, stays, u }.
export function separateMount(u) {
  if (!u.cav || !u.mount || u.mount.w <= 0 || u.mount.a === 0 || !u.mount.loose) return null;
  const dice = [d6(), d6()], stays = dice[0] + dice[1] >= u.mount.c;
  if (!stays) return { dice, stays, u: null };
  const n = G.units.filter(o => o.t === u.mount.loose).length + 1;
  const m = spawnUnit(G.units, u.mount.loose, u.side, u.x, u.y, `${u.mount.n} ${n}`);
  return { dice, stays, u: m };
}

// The rider Dismounts of its own will during its Move (p. 69): the mount becomes a Separated Mount (a horse flees, another
// stays on a Courage Test and cannot Move again this turn), the rider goes on foot in base contact with it, never with an
// enemy, and may finish its Move (with what it has moved so far counted against its own Move Value). It can never
// remount. Returns what separateMount returned (null: the mount fled without a test), or false when it cannot Dismount.
export const canDismount = u => !!(u.cav && alive(u) && !engaged(u) && !u.done && !u.stunned && typeOf(u.T.foot));
export function dismountAtWill(u) {
  if (!canDismount(u)) return false;
  const S = separateMount(u);
  if (S && S.u) S.u.done = true;
  dismount(u);
  u.held = new Set();
  return S;
}

/* ---------- Duel Roll dice: modifiers and re-rolls ---------- */
// The modifier on every Duel Roll dice of model u: −1 for a banner bearer (p. 109), −1 for a pike carried with a
// shield or a missile weapon (p. 105), −1 for a two-handed weapon (p. 104), which a natural 6 ignores (six).
// A modified dice never goes below 1 or above 6 (p. 18).
// A Master-forged two-handed weapon has no penalty (p. 106); an Unarmed model has −1 (p. 104).
// Burly (p. 123): no −1 for a two-handed weapon.
// Phalanx (p. army lists): a pike and a shield without the −1.
// Every modifier is also listed with its reason (duelModParts), so the game can show why a dice is what it is; duelMod
// is their sum, so the shown parts and the roll always agree. A part: { v, t: what it is, why: glossary key or null }.
export const duelModParts = u => [
  u.T.banner && { v: -1, t: 'carries a banner', why: 'banner' },
  u.T.pike && (hasShield(u) || u.bow) && !(hasShield(u) && rule(u, 'Phalanx') != null) && { v: -1, t: 'pike with a shield or a missile weapon', why: 'pike' },
  twoH(u) && !masterForged(u) && rule(u, 'Burly') == null && { v: -1, t: 'two-handed weapon (a natural 6 stays 6)', why: 'twohanded' },
  unarmed(u) && { v: -1, t: 'unarmed', why: null },
].filter(Boolean);
export const duelMod = u => sumParts(duelModParts(u));
const sumParts = ps => ps.reduce((a, p) => a + p.v, 0);
const keepsSix = u => twoH(u) && !masterForged(u);
// The To Wound bonus of w's Strikes (at t): +1 for a two-handed weapon, +1 against its Heroic Challenge opponent (p. 85),
// +1 for a lance (or a war spear) on a Cavalry model that Charged, not from within Difficult Terrain (p. 105), −1 Unarmed.
// trapped: t is Trapped (or Prone, which counts the same) for Backstabbers.
// Hadhafang: +1 against a Spirit.
// woundBonusParts lists them with their reasons (as duelModParts); woundBonus is their sum.
export function woundBonusParts(w, t, trapped = false) {
  const named = woundPlusNamed(w);   // Captain of the Citadel Guard (named.js)
  return [
    t && gearHas(w, /^hadhafang$/i) && hasKeyword(t, 'Spirit') && { v: 1, t: 'Hadhafang against a Spirit', why: null },
    twoH(w) && { v: 1, t: 'two-handed weapon', why: 'twohanded' },
    t && challenging(w, t) && { v: 1, t: 'Heroic Challenge opponent', why: 'heroicChallenge' },
    lanceCharge(w) && { v: 1, t: 'lance after a Charge', why: 'cavalrycharge' },
    unarmed(w) && { v: -1, t: 'unarmed', why: null },
    t && (against(w, 'Hatred', t) || noDawn(w, t)) && { v: 1, t: against(w, 'Hatred', t) ? 'Hatred' : 'There will be no dawn for Men', why: against(w, 'Hatred', t) ? 'hatred' : 'armyRule' },
    trapped && rule(w, 'Backstabbers') != null && { v: 1, t: 'Backstabbers (the target is Trapped or Prone)', why: 'backstabbers' },
    t && isHero(t) && rule(w, 'Glory Seekers') != null && { v: 1, t: 'Glory Seekers against a Hero', why: 'glorySeekers' },
    t && isHero(t) && hasKeyword(w, 'Dunland') && armyRule(w, 'Barbarous Killers') && { v: 1, t: 'Barbarous Killers against a Hero', why: 'armyRule' },
    named && { v: named, t: 'its own special rule', why: 'heroRule' },
  ].filter(Boolean);
}
export const woundBonus = (w, t, trapped = false) => sumParts(woundBonusParts(w, t, trapped));
// Army rules (matched play): "There will be no dawn for Men" (Muster of Isengard) gives Uruk-hai Hatred (Man).
const noDawn = (w, t) => hasKeyword(w, 'Uruk-hai') && hasKeyword(t, 'Man') && armyRule(w, 'There will be no dawn for Men');
// "Forth Eorlingas!" (Army of Edoras): once per game, at the start of a Fight phase after the General Charged, Rohan
// models within 12″ of it re-roll failed To Wound rolls until the end of the turn (G.eorl: { side, turn, gen }).
// eorlingasGeneral(side): the General that may use it now, or null; useEorlingas(gen) uses it. The computer uses it at
// once (forthEorlingas, both sides in sim.js); the player decides (flow.js).
export const eorlingasGeneral = side => (G.eorlUsed && G.eorlUsed[side] ? null
  : G.units.find(u => u.side === side && u.general && alive(u) && u.charged && armyRule(u, 'Forth Eorlingas')) || null);
export function useEorlingas(gen) { (G.eorlUsed || (G.eorlUsed = {}))[gen.side] = true; G.eorl = { side: gen.side, turn: G.turn, gen }; return gen; }
export function forthEorlingas(sides = ['good', 'evil']) {
  for (const s of sides) { const gen = eorlingasGeneral(s); if (gen) return useEorlingas(gen); }
  return null;
}
const eorlingas = w => !!(G.eorl && G.eorl.side === w.side && G.eorl.turn === G.turn && alive(G.eorl.gen) && hasKeyword(w, 'Rohan') && gap(w, G.eorl.gen) <= 12 + 1e-6);

/* ---------- Special rules on Strikes (p. 122–133) ---------- */
// The re-roll w's To Wound rolls at t get: 'fails' (Bane of Kings, Venom: every failed roll), 'ones' (Poisoned Attacks,
// Ancient Enemies (X): a natural 1) or null. shoot: a Shooting Attack (Venom is for Strikes only).
export function woundReroll(w, t, shoot = false) {
  if (rule(w, 'Bane of Kings') != null || (!shoot && (rule(w, 'Venom') != null || eorlingas(w) || enchanted(w)))) return 'fails';   // Enchant Blades (p. 117)
  if (!shoot && t && woundRerollNamed(w, t) === 'fails') return 'fails';
  if (rule(w, 'Poisoned Attacks') != null || against(w, 'Ancient Enemies', t)) return 'ones';
  // Bring the City to its Knees (Legions of Mordor): Heroes re-roll 1s against Heroes.
  if (!shoot && isHero(w) && isHero(t) && armyRule(w, 'Bring the City to its Knees')) return 'ones';
  return shoot || !t ? null : woundRerollNamed(w, t);   // rules of named Heroes (named.js)
}
// Blades of the Dead: t's Defence against w's Strikes is 10 minus its Courage (the 2D6 value), or null.
export const bladesD = (w, t) => (rule(w, 'Blades of the Dead') != null ? Math.max(1, 10 - t.T.c) : null);
// The keywords of w's Bane Weapons ('Orcbane' → 'Orc', 'Uruk-haibane' → 'Uruk-hai').
export const baneKeys = w => rules(w, 'Bane Weapons').filter(v => v !== true).map(v => v.replace(/\s*bane$/i, ''));
// The Wounds one successful Strike by w at t causes once it is not prevented (p. 122, 127): 2 with Mighty Blow, D3 with
// a Bane Weapon against its keyword (the better of the two). Returns { n, d3 } (d3: the dice, or 0).
export function strikeWounds(w, t) {
  const mb = rule(w, 'Mighty Blow') != null ? 2 : 1;
  if (!baneKeys(w).some(k => hasKeyword(t, k))) return { n: mb, d3: 0 };
  const d3 = Math.ceil(d6() / 2);
  return { n: Math.max(mb, d3), d3 };
}
// Venom (p. 133): at the end of a Combat, one enemy each Venom model wounded but did not slay rolls a D6; on a natural 6
// it suffers another Wound. hit: the Venom model's victims of this Combat (w.venomHit, set by the Strikes); the most
// valuable one is chosen. Returns [{ w, t, v, ok }] and clears the marks.
export function venomEnd(c) {
  const out = [];
  for (const w of c) {
    const L = (w.venomHit || []).filter(alive);
    w.venomHit = null;
    if (!L.length || rule(w, 'Venom') == null) continue;
    const t = L.reduce((a, b) => ((isHero(b) ? 10 : 0) - b.w > (isHero(a) ? 10 : 0) - a.w ? b : a));
    const v = d6();
    out.push({ w, t, v, ok: v === 6 });
  }
  return out;
}
// Marks t as wounded but not slain by w, for Venom.
export function venomMark(w, t) {
  if (rule(w, 'Venom') == null || !alive(t)) return;
  (w.venomHit = w.venomHit || []).includes(t) || w.venomHit.push(t);
}
export const lanceCharge = w => !!(w.cav && w.charged && gearHas(w, /^(lance|war spear)$/i) && !inBrush(w.x, w.y, w.r));
export const masterForged = u => gearHas(u, /master-forged/i);
export const unarmed = u => !!u.unarmed || gearHas(u, /^unarmed$/i);
// Fighting with an Elven weapon (p. 106): any Melee Weapon called Elven, or with 'Elf' in its name (not a bow or cloak).
export const elvenBlade = u => gearHas(u, /^elven$|^elven (?!cloak)(?!.*bow)|^elf (?!.*bow)/i);

/* ---------- Melee weapons (p. 104) ---------- */
// A model with more than one Melee Weapon picks the one it fights with in each Combat, before the Duel Roll: a hand
// weapon, or a two-handed weapon (−1 Duel Roll unless a natural 6, +1 To Wound). A hand-and-a-half weapon is either; used
// two-handed it costs a shield's +1 Defence for that Combat (p. 111). A model whose only Melee Weapon is two-handed must
// use it. The choice is in play once taught (G.specials: 'weaponChoice'); before that a two-handed weapon is always used
// and a hand-and-a-half weapon is a hand weapon. u.wpn: the weapon picked for the current Combat ('hand' or 'two').
const gearHas = (u, re) => (u.T.gear || []).some(g => re.test(g));
export const halfHand = u => gearHas(u, /hand-and-a-half|berserker blade|staff of power|^glamdring$|^hadhafang$|^andúril/i);   // a Staff of Power is one too (p. 107)
export const choiceOn = () => !G.specials || G.specials.has('weaponChoice');
export function weaponsOf(u) {
  const half = halfHand(u), two = !!u.T.twoHanded || gearHas(u, /^two-handed weapon$/i);
  const hand = half || gearHas(u, /(^|\s)hand weapons?$/i) || !two;
  if (!choiceOn()) return two ? ['two'] : ['hand'];
  return [hand && 'hand', (two || half) && 'two'].filter(Boolean);
}
export const twoH = u => (u.wpn ? u.wpn === 'two' : weaponsOf(u).length === 1 && weaponsOf(u)[0] === 'two');
// The computer's pick for u in Combat c: the two-handed weapon when its Strikes need 4+ or worse To Wound (where +1 helps
// most), a hand-and-a-half weapon with a shield only from 5+ (it gives up the +1 Defence).
export function aiWeapon(u, c) {
  const foes = c.filter(o => o.side !== u.side && alive(o));
  if (!foes.length) return 'hand';
  const d = Math.min(...foes.map(o => o.d)), need = woundNeed(strikeS(u), d);
  if (!need) return 'two';
  const hard = need.length > 1 || need[0] >= (halfHand(u) && hasShield(u) ? 5 : 4);
  return hard ? 'two' : 'hand';
}
// Sets u.wpn for every model in Combat c before the Duel Roll: a Shielding side uses hand weapons; pick(u) decides for a
// model with a choice. Returns the models that chose (for the log).
export function pickWeapons(c, shield, pick) {
  const chose = [];
  for (const u of c) {
    if (!alive(u)) continue;
    const opts = weaponsOf(u);
    u.wpn = shield[u.side] && opts.includes('hand') ? 'hand' : opts.length > 1 ? (pick(u) === 'two' ? 'two' : 'hand') : opts[0];
    if (opts.length > 1 && !shield[u.side]) chose.push(u);
    if (u.wpn === 'two' && halfHand(u) && hasShield(u) && !u.dLoss) { u.dLoss = 1; u.d -= 1; }
  }
  return chose;
}
// A Berserker Blade used two-handed (BattleScribe text): a winner may make a single Strike against every enemy it was
// Engaged with. Read here as instead of its normal Strikes (the text does not say "as well"), so it is taken when it
// reaches more enemies than its Strikes. The enemies it sweeps, or null.
export function sweepTargets(w, L) {
  if (!gearHas(w, /^berserker blade$/i) || !twoH(w)) return null;
  const foes = L.filter(t => alive(t) && touching(w, t));
  return foes.length > strikesOf(w, L) ? foes : null;
}
// After the Combat: the shield's Defence comes back, the choice is forgotten.
export function dropWeapons(c) { for (const u of c) { if (u.dLoss) { u.d += u.dLoss; u.dLoss = 0; } u.wpn = null; } }
const modded = (n, mod, six) => (six && n === 6 ? 6 : Math.max(1, Math.min(6, n + mod)));
const topF = (list, sup) => Math.max(...list.filter(u => !paralysed(u)).map(fvOf), ...sup.filter(u => !paralysed(u)).map(fvOf));   // with a Heroic Strike's D3 (p. 86); a Paralysed model gives none
// One dice per Attack of every model (twice as many when Shielding), then one per supporter:
// { n: natural roll, v: after modifiers, mod, six: a natural 6 ignores mod, u: its model }.
export function rollDuelDice(goods, evils, gs = [], es = [], shield = {}) {
  const die = u => { const n = d6(), mod = duelMod(u), six = keepsSix(u); return { n, v: modded(n, mod, six), mod, six, u }; };
  // A Paralysed model rolls no dice (p. 118): a side with nothing else loses the Duel Roll without rolling.
  const side = (list, sup, foes) => [...list.filter(u => !paralysed(u)).flatMap(u => Array.from({ length: attacks(u, shield, foes) }, () => die(u))), ...sup.filter(u => !paralysed(u)).map(die)];
  const bonus = { good: goods.filter(u => chargeBonus(u, evils)), evil: evils.filter(u => chargeBonus(u, goods)) };
  return { g: side(goods, gs, evils), e: side(evils, es, goods), gF: topF(goods, gs), eF: topF(evils, es), rerolls: [], shield, bonus };
}
export const topDice = dice => Math.max(...dice.map(d => d.v));
// The side the dice favour right now, or null when they are level (same highest dice and Fight Value: a roll-off).
export function duelLead(D) {
  const gM = topDice(D.g), eM = topDice(D.e);
  return gM !== eM ? (gM > eM ? 'good' : 'evil') : D.gF !== D.eF ? (D.gF > D.eF ? 'good' : 'evil') : null;
}
// Which dice a losing side re-rolls: only the new result matters, so the one with the best modifier, then the lowest.
export const rerollPick = dice => (!dice.length ? null : dice.reduce((a, b) => (b.mod > a.mod || (b.mod === a.mod && b.v < a.v) ? b : a)));   // none: a side without dice (all Paralysed)
export function rerollDie(D, d) {
  const was = d.v;
  d.n = d6(); d.v = modded(d.n, d.mod, d.six); d.re = true;
  D.rerolls.push({ side: d.u.side, d, was });
  return d;
}
// The result once all re-rolls are done: highest dice, then the higher Fight Value, then a roll-off.
export function settleDuel(D) {
  const gM = topDice(D.g), eM = topDice(D.e), { gF, eF } = D;
  let win, how, off = null;
  const why = ['duel'];
  if (gM !== eM) { win = gM > eM ? 'good' : 'evil'; how = `Highest dice: ${gM} vs ${eM}.`; }
  else {
    why.push('tie');
    if (gF !== eF) { win = gF > eF ? 'good' : 'evil'; how = `Tied at ${gM}, so the higher Fight Value wins: ${gF} vs ${eF}.`; }
    else {
      // An Elven weapon on one side only: Good wins the roll-off on 3+, Evil on 1–4 (p. 106).
      const elf = al => [...D.g, ...D.e].some(d => d.u && sideOfAlign(al) === d.u.side && elvenBlade(d.u));
      const ge = elf('good'), ee = elf('evil'), need = ge && !ee ? 3 : ee && !ge ? 5 : 4;
      off = d6(); win = sideOfAlign(off >= need ? 'good' : 'evil'); why.push('rolloff');
      how = `Tied at ${gM} with equal Fight Value (${gF}). Roll-off: ${off} (${need}–6 means Good${need !== 4 ? `: an Elven weapon on the ${need === 3 ? 'Good' : 'Evil'} side` : ''}).`;
    }
  }
  if (D.rerolls.length) why.push('banner');
  if (D.might && D.might.length) why.push('might');
  return Object.assign(D, { gd: D.g.map(d => d.v), ed: D.e.map(d => d.v), gM, eM, win, how, off, why });
}
// After the Duel Roll of Combat c: every model in it counts the Duel Rolls it won and lost (a mission may ask for them).
export function noteDuel(c, win) {
  if (!win) return;
  for (const u of c) { if (u.side === win) u.duelsWon = (u.duelsWon || 0) + 1; else u.duelsLost = (u.duelsLost || 0) + 1; }
}
// The Duel Roll once the dice are rolled and modified (p. 50, 77). Re-rolls first: the side that is losing decides
// whether to use its re-roll (a banner: one model of that side re-rolls one dice), then the side losing after that, until
// neither can or wants to. Then Might, always last: the side whose Hero is losing may raise one of that Hero's dice by 1
// for each point, then the other side may answer, back and forth until both pass or no dice can go higher. When the
// dice are level with equal Fight Values (a roll-off, which Might cannot touch), the side without Priority may bid first.
// Then the winner: highest dice, then Fight Value, then the roll-off. banners: { good, evil }, the sides with a re-roll.
// Requests: { k: 'duelReroll', side, D } answered with one of that side's dice, or null to keep them; { k: 'reroll',
// side, die, was }; { k: 'duelMight', side, D, heroes } answered with { u, die } (one point on one dice of Hero u) or
// null to pass; { k: 'raise', side, u, die, from, n: 1 }. Returns D, settled.
export function* duelSeq(D, banners = {}) {
  const used = {};
  for (;;) {
    const lead = duelLead(D), loser = lead && foeSide(lead);
    if (!loser || (used[loser] || 0) >= (+banners[loser] || 0)) break;
    if (!(loser === 'good' ? D.g : D.e).length) break;   // no dice to re-roll (all Paralysed)
    used[loser] = (used[loser] || 0) + 1;
    const d = yield { k: 'duelReroll', side: loser, D };
    if (!d || !(loser === 'good' ? D.g : D.e).includes(d)) break;
    const was = d.v;
    rerollDie(D, d);
    yield { k: 'reroll', step: 'duel', side: loser, die: d, was };
  }
  // The side bidding keeps its turn, one point at a time, until it leads or stops (a point that only makes the dice
  // level is half of a bid, as "2 Might: 4 → 6" at the table). A side that stops while level hands the turn over.
  const spent = [];
  let s = null, passes = 0;
  for (let guard = 0; guard < 60; guard++) {
    const lead = duelLead(D);
    if (lead) s = foeSide(lead); else if (!s) s = G.priority === 'good' ? 'evil' : 'good';
    const heroes = mightHeroes(D, s).filter(u => mightPlanDuel(D, u));
    const a = heroes.length ? yield { k: 'duelMight', side: s, D, heroes } : null;
    const ok = a && heroes.includes(a.u) && a.die && a.die.u === a.u && (s === 'good' ? D.g : D.e).includes(a.die) && mightUp(a.u, a.die);
    if (!ok) {
      if (lead) break;
      if (++passes >= 2) break;
      s = foeSide(s);
      continue;
    }
    passes = 0;
    spent.push({ u: a.u, die: a.die, from: a.die.v - 1, to: a.die.v });
    yield { k: 'raise', step: 'duel', side: s, u: a.u, die: a.die, from: a.die.v - 1, n: 1 };
  }
  D.might = spent;
  return settleDuel(D);
}
// The Heroes of `side` with dice in Duel Roll D and Might left.
export const mightHeroes = (D, side) => [...new Set((side === 'good' ? D.g : D.e).map(d => d.u))].filter(u => isHero(u) && u.might > 0);

/* ---------- Might (2024, p. 76–78) ---------- */
// The cheapest way for Hero u to lead Duel Roll D with Might: { die, k } (k points on that dice), or null when it leads
// already or cannot get there. With the higher Fight Value a tie is enough; otherwise its dice must be higher (a tie at
// equal Fight Values is a roll-off, which Might cannot touch).
export function mightPlanDuel(D, u) {
  const side = u.side, mine = side === 'good' ? D.g : D.e, theirs = side === 'good' ? D.e : D.g;
  const myF = side === 'good' ? D.gF : D.eF, foeF = side === 'good' ? D.eF : D.gF;
  const target = topDice(theirs) + (myF > foeF ? 0 : 1);
  if (target > 6 || topDice(mine) >= target) return null;
  let best = null;
  for (const d of mine) { if (d.u !== u) continue; const k = target - d.v; if (k > 0 && k <= u.might && (!best || k < best.k)) best = { die: d, k }; }
  return best;
}
// One Wound to a part of model t, after Fate (p. 88): a Hero with Fate Points may try to prevent a Wound to itself (not
// to its mount). Returns { r: 'saved' or woundPart's answer, F: the Fate rolls, or null }.
// Survival Instinct (p. 131): a model that survives a Wound takes a Courage Test (even if it passed one this turn) and
// flees on a failure: removed as a casualty (r 'slain', t.fled; FAQ: it counts as slain for a Heroic Challenge). T: the test.
export function* hurtSeq(t, part = 'rider') {
  let F = null, r, HL = null;
  // Horse Lord (p. 126): a Wound to the Mount is ignored on a natural 6, and the rider's Fate may prevent it.
  if (part === 'mount' && t.cav && rule(t, 'Horse Lord') != null) {
    const n = d6(), need = armyRule(t, 'Home of the Horse Lords') ? 5 : 6;   // a natural roll: no Might; Kingdom of Rohan 5+
    HL = { n, v: n, mt: 0, ok: n >= need };
    yield { k: 'dice', step: 'horseLord', u: t, die: HL, need, label: `Horse Lord: ${t.name}'s ${t.mount.n.toLowerCase()} ignores the Wound on a natural ${need}${need < 6 ? '+' : ''}` };
    if (HL.ok) return { r: 'saved', F, T: null, HL };
    if (isHero(t) && t.fate > 0) { F = yield* fateSeq(t); if (F.saved) return { r: 'saved', F, T: null, HL }; }
  }
  // Whipped into a frenzy (Usurpers of Edoras), Oblivious to Pain, Sigils of Defiance: a Wound ignored on a natural 6.
  const six = part === 'rider' ? ignoreOnSix(t) : null;
  if (six) {
    const n = d6();
    HL = { n, v: n, mt: 0, ok: n === 6 };
    yield { k: 'dice', step: 'frenzy', u: t, die: HL, need: 6, label: `${six}: ${t.name} ignores the Wound on a natural 6` };
    if (HL.ok) return { r: 'saved', F, T: null, HL };
  }
  if (part === 'rider' && isHero(t) && t.fate > 0) {
    F = yield* fateSeq(t);
    r = F.saved ? 'saved' : woundPart(t, part);
  } else r = woundPart(t, part);
  if (r !== 'wound' || rule(t, 'Survival Instinct') == null || autoPass(t)) return { r, F, T: null, HL };
  const T = yield* courageSeq(t, 'survivalInstinct');
  if (!T.ok) { flee(t); return { r: 'slain', F, T }; }
  return { r, F, T };
}

/* ---------- Odds ---------- */
// Chance that the Good side wins the Duel Roll of Combat c, counting its supporters and banners.
// shield: { good, evil }, the sides Shielding (their supporters do not count then). might: { good, evil }, the sides
// whose Heroes spend Might in the bidding wherever it wins the fight (see duelOdds).
// The dice each side of Combat c rolls in its Duel Roll, counted as rollDuelDice throws them: every Attack (twice when
// Shielding), one per supporter, none for a Paralysed model. { good, evil }. For the Combat labels on the table.
export function duelDice(c, shield = {}) {
  const goods = goodsOf(c), evils = evilsOf(c);
  const gs = shield.good ? [] : supOf(c, 'good'), es = shield.evil ? [] : supOf(c, 'evil');
  const n = (list, sup, foes) => list.filter(u => !paralysed(u)).reduce((a, u) => a + attacks(u, shield, foes), 0) + sup.filter(u => !paralysed(u)).length;
  return { good: n(goods, gs, evils), evil: n(evils, es, goods) };
}
export function combatOdds(c, shield = {}, might = {}) {
  const gs = shield.good ? [] : supOf(c, 'good'), es = shield.evil ? [] : supOf(c, 'evil');
  return duelOdds(goodsOf(c), evilsOf(c), gs, es, bannersOf(c, gs, es), shield, might);
}
// What one dice can show: p[v] for v = 1..6. k: { mod, six, plus } as for a rolled dice; plus: Might added at the end.
function dieDist(k) { const p = [0, 0, 0, 0, 0, 0, 0]; for (let n = 1; n <= 6; n++) p[Math.min(6, modded(n, k.mod, k.six) + (k.plus || 0))] += 1 / 6; return p; }
// The chances of a side's highest dice: p[k] for k = 1..6.
function topDist(kinds) {
  const dists = kinds.map(dieDist), cdf = k => dists.reduce((s, p) => s * p.slice(1, k + 1).reduce((a, b) => a + b, 0), 1), p = [0];
  for (let k = 1; k <= 6; k++) p.push(cdf(k) - cdf(k - 1));
  return p;
}
// The dice a side would re-roll: the one with the best modifier (one whose natural 6 ignores the penalty breaks a tie).
const bestKind = kinds => kinds.reduce((a, b) => (b.mod > a.mod || (b.mod === a.mod && b.six && !a.six) ? b : a));
// Chance that the Good side wins the Duel Roll: highest dice, then the higher Fight Value, then a roll-off.
// gs, es: Supporting models, one dice each with their own Fight Value. banners: { good, evil } re-rolls: a side that is
// losing re-rolls one dice, and then only that dice matters, so its new highest is the better of the old and the new.
// shield: { good, evil }, the sides Shielding: their models roll twice as many dice.
// might: { good, evil }, the sides whose Heroes bid all the Might it takes (p. 77). In the bidding each side ends up with
// its best dice raised by as much as its Hero can spend, so a Hero's dice count as if all its Might were on them.
export function duelOdds(goods, evils, gs = [], es = [], banners = {}, shield = {}, might = {}) {
  const kind = u => ({ mod: duelMod(u), six: keepsSix(u), plus: might[u.side] && isHero(u) ? u.might : 0 });
  const kinds = (list, sup, foes) => [...list.flatMap(u => Array(attacks(u, shield, foes)).fill(kind(u))), ...sup.map(kind)];
  const gm = kinds(goods, gs, evils), em = kinds(evils, es, goods), gF = topF(goods, gs), eF = topF(evils, es);
  const tie = gF > eF ? 1 : gF < eF ? 0 : 0.5, W = (g, e) => (g > e ? 1 : g < e ? 0 : tie);
  const pg = topDist(gm), pe = topDist(em);
  const rg = banners.good && gm.length ? dieDist(bestKind(gm)) : null, re = banners.evil && em.length ? dieDist(bestKind(em)) : null;   // a side with no dice (all Transfixed) re-rolls nothing
  const val = (g, e, gu, eu) => {
    const w = W(g, e);
    let s = 0;
    if (w === 0 && rg && !gu) { for (let r = 1; r <= 6; r++) if (rg[r]) s += rg[r] * val(Math.max(g, r), e, true, eu); return s; }
    if (w === 1 && re && !eu) { for (let r = 1; r <= 6; r++) if (re[r]) s += re[r] * val(g, Math.max(e, r), gu, true); return s; }
    return w;
  };
  let p = 0;
  for (let g = 1; g <= 6; g++) for (let e = 1; e <= 6; e++) if (pg[g] && pe[e]) p += pg[g] * pe[e] * val(g, e, false, false);
  return p;
}
// The chance that one Strike by w wounds t (two rolls against a Trapped or Prone model), with Heroic Strength, the
// two-handed and Heroic Challenge bonuses and Heroic Defence; m: Might Points w spends on it (0: none).
// Re-rolls count (Might with a re-roll is taken as without it).
export function strikeChance(w, t, trapped, part = 'rider', m = 0) {
  const mount = part === 'mount' && t.cav, bd = mount ? null : bladesD(w, t), nat6 = !mount && !!t.def6;
  const need = woundNeed(strikeS(w), bd != null ? bd : defOf(t, part)), bonus = woundBonus(w, t, trapped);
  const p = m ? chainOdds([{ wound: need, bonus, nat6 }], m) : pRolled(need, bonus, nat6, woundReroll(w, t));
  return trapped ? 1 - (1 - p) ** 2 : p;
}
// The Wounds a successful Strike by w at the part of t is worth, for choosing targets: Mighty Blow and Bane Weapons
// (D3, taken as 2) do more, never more than the part has.
export const strikeWorth = (w, t, part = 'rider') => {
  const n = rule(w, 'Mighty Blow') != null || baneKeys(w).some(k => hasKeyword(t, k)) ? 2 : 1;
  return Math.min(n, part === 'mount' && t.cav ? t.mount.w : t.w);
};
// The chance of one To Wound roll with a re-roll (woundReroll) on each dice.
function pRolled(need, bonus, nat6, rr) {
  if (!need) return 0;
  const one = want => {
    const p = nat6 ? 1 / 6 : Math.min(1, (7 - Math.max(1, want - bonus)) / 6);
    return rr === 'fails' ? 1 - (1 - p) ** 2 : rr === 'ones' ? Math.min(1, p + p / 6) : p;
  };
  return need.length === 1 ? one(need[0]) : one(6) * one(need[1]);
}

// Expected harm (in models) a winning side does to the losers, counting who would be Trapped.
// S: the winners' supporters, one Strike each at any loser.
function harm(W, L, contacts, S = []) {
  // A fight over a Barrier, one against one (p. 55): nobody is Trapped, and the attacker's Strikes need In The Way 4+.
  const over = W.length === 1 && L.length === 1 && linked(W[0], L[0]);
  const itw = over && W[0].over ? 0.5 : 1;
  const trapped = new Set(over ? [] : L.filter(l => !immovable(l) && !backAwaySpot(l, W, contacts)).map(l => l.id));
  // A Cavalry Charge knocks the beaten infantry Prone: two dice per Strike, and one Strike more.
  const down = W.some(w => chargeBonus(w, L));
  const dbl = t => trapped.has(t.id) || t.prone || (down && !t.cav && !t.T.monster && t.s < 6);
  const best = (w, t) => strikeChance(w, t, dbl(t), bestPart(w, t)) * strikeWorth(w, t, bestPart(w, t)) / (bestPart(w, t) === 'mount' ? 1 : t.w);
  let h = 0;
  for (const w of W) {
    if (w.prone || w.stunned) continue;   // a Prone winner makes no Strikes (p. 52), nor a thrown rider
    const cands = L.filter(l => contacts.has(w.id + ':' + l.id));
    if (cands.length) h += strikesOf(w, L) * itw * Math.max(...cands.map(t => best(w, t)));
  }
  for (const s of S) h += itw * Math.max(...L.map(t => best(s, t)));
  return h;
}
// Supporters of one side for Combat c: the assigned ones, or while the split is still open every model that could.
const supFor = (c, side) => (c.sup ? supOf(c, side) : couldSupport(c, side));
// Models of `side` in this Combat that would be Trapped if they lost it right now (never in a fight over a Barrier).
export function trappedIfLose(c, side) {
  const B = barrierOf(c);
  if (B && B.mode === 'barrier') return [];
  const g = goodsOf(c), e = evilsOf(c), k = contactsIn(g, e);
  const L = side === 'good' ? g : e, W = side === 'good' ? e : g;
  return L.filter(l => !backAwaySpot(l, W, k));
}
// How good one Combat is for `side`: chance to win times harm done, minus the same for the enemy.
// shield: { good, evil }, the sides Shielding: no supporters, and no harm done when they win.
export function combatValue(c, side, shield = {}) {
  const g = goodsOf(c), e = evilsOf(c);
  if (!g.length || !e.length) return 0;
  const gs = shield.good ? [] : supFor(c, 'good'), es = shield.evil ? [] : supFor(c, 'evil');
  const k = contactsIn(g, e), p = duelOdds(g, e, gs, es, bannersOf(c, gs, es), shield);
  const v = p * (shield.good ? 0 : harm(g, e, k, gs)) - (1 - p) * (shield.evil ? 0 : harm(e, g, k, es));
  return side === 'good' ? v : -v;
}
// Whether Shielding is the better choice for `side` in Combat c: the losses it saves by winning more often are worth
// more than the Strikes it gives up. other: the other side's choice, if it declared first.
export function shieldPays(c, side, other = {}) {
  if (!canShield(c, side)) return false;
  return combatValue(c, side, { ...other, [side]: true }) > combatValue(c, side, other) + 1e-9;
}
export function bestPartition(opts, side) {
  let best = opts[0], bs = -Infinity;
  for (const p of opts) { const s = p.reduce((t, c) => t + combatValue(c, side), 0); if (s > bs + 1e-9) { bs = s; best = p; } }
  return best;
}
// The order the side with Priority fights its Combats in: Combats where the enemy would be Trapped first,
// while the models blocking its escape are still standing.
export function orderCombats(cs, side) {
  return cs.map(c => ({ c, v: combatValue(c, side) })).sort((a, b) => b.v - a.v).map(x => x.c);
}

/* ---------- Resolving a Combat ---------- */
// Losers Back Away 1″ one after another (positions change at once); those that cannot are Trapped.
// madeWay lists the friends that stepped aside so a loser could Back Away: [{ u, for }]. falls: losers that must Back
// Away over the edge of a drop, [{ u, to, f }]; they stay put for the Strikes and fall afterwards (p. 51).
// Immovable Object (beasts.js): a Chariot or War Beast that loses stays, and the winners touching it Back Away instead.
export function backAwayAll(W, L, contacts) {
  const { losers, stay, away } = backAwayRoles(W, L, contacts);
  const res = backAwayOf(W, losers, contacts);
  if (away.length) { const r = backAwayOf(stay, away, contacts); res.moves.push(...r.moves); res.madeWay.push(...r.madeWay); res.falls.push(...r.falls); res.away = away; }
  return res;
}
function backAwayOf(W, L, contacts) {
  const moves = [], trapped = new Set(), madeWay = [], falls = [];
  for (const l of L) {
    const P = backAwaySpot(l, W, contacts);
    if (!P) { trapped.add(l.id); continue; }
    if (P.fall != null) { falls.push({ u: l, to: { x: P.x, y: P.y }, f: P.fall }); continue; }
    if (P.makeWay) {
      const m = P.makeWay;
      moves.push({ u: m.u, from: { x: m.u.x, y: m.u.y } }); m.u.x = m.x; m.u.y = m.y;
      madeWay.push({ u: m.u, for: l });
    }
    moves.push({ u: l, from: { x: l.x, y: l.y } }); l.x = P.x; l.y = P.y;
  }
  return { moves, trapped, madeWay, falls };
}
export const strikeTargets = (w, L, contacts) => L.filter(l => alive(l) && contacts.has(w.id + ':' + l.id));
export function bestStrikeTarget(w, cands, trapped) {
  let t = cands[0], bs = -1;
  for (const c of cands) { const sc = strikeChance(w, c, trapped.has(c.id) || c.prone, bestPart(w, c)) * strikeWorth(w, c) / c.w; if (sc > bs) { bs = sc; t = c; } }
  return t;
}
// n Strikes at one target: one To Wound roll each, two each against a Trapped or Prone model (p. 51–52). Strength is
// doubled by Heroic Strength; +1 on each dice for a two-handed weapon and against a Heroic Challenge opponent; Heroic
// Defence lets only natural 6s wound; a Hero striker may spend Might on each roll (dice.js). part: 'rider' (the model
// itself) or 'mount' (a Cavalry model's steed, with its own Defence). Returns { need, rolls, wounds, rollsN, bonus, s }.
// Special rules: Hatred and Backstabbers add to the bonus, Bane of Kings, Venom, Poisoned Attacks and Ancient Enemies
// re-roll (reroll), Blades of the Dead replaces the Defence (d).
export function* strikeSeq(w, t, n, dbl, part = 'rider') {
  const S = strikeS(w), bonus = woundBonus(w, t, dbl), reroll = woundReroll(w, t), bd = part === 'mount' && t.cav ? null : bladesD(w, t);
  let d = bd != null ? bd : t.swall && !(part === 'mount' && t.cav) ? defOf(t) : null;
  // Andúril: Aragorn never needs more than a 4+ To Wound (Strength against equal Defence).
  if (gearHas(w, /^andúril/i)) { const D0 = d != null ? d : part === 'mount' && t.cav ? t.mount.d : t.d, nd = woundNeed(S, D0); if (!nd || nd.length > 1 || nd[0] > 4) d = S; }
  const R = yield* woundRolls(w, t, n * (dbl ? 2 : 1), { s: S, bonus, part, reroll, d });
  return { ...R, bonus, s: S, reroll, d };
}
// 2024 rules: a Trapped model that survives is separated slightly from its enemies.
export function separateTrapped(W, survivors) {
  const moves = [];
  for (const t of survivors) {
    for (const w of W) {
      if (!alive(w) || !touching(w, t)) continue;
      const P = nudgeAway(w, t, 0.15);
      if (P) { moves.push({ u: w, from: { x: w.x, y: w.y } }); w.x = P.x; w.y = P.y; continue; }
      const Q = nudgeAway(t, w, 0.15);
      if (Q) { moves.push({ u: t, from: { x: t.x, y: t.y } }); t.x = Q.x; t.y = Q.y; }
    }
  }
  return moves;
}
/* ---------- Fighting over a Barrier (2024, p. 55) ---------- */
// The Barrier fought over in Combat c, or null: { T, def, att, mode }. mode 'barrier': the defender against a single
// attacker across the Obstacle, so Strikes come before Backing Away, the attacker's Strikes take an In The Way test
// each, nobody is Trapped, a surviving defender holds its place (the attacker Backs Away instead) and a slain defender's
// place is taken by the attacker. 'bothSides': the defender is also attacked on its own side, so the Barrier gives it no
// protection (a normal Combat), though the attacker across may still cross if the defender is slain. 'flanked': the
// attacker across is also fought by a friend of the defender on its own side: a normal Combat, and no crossing.
export function barrierOf(c) {
  const live = c.filter(alive);
  const att = live.find(a => a.over && live.some(d => d.id === a.over.t && linked(a, d)));
  if (!att) return null;
  const def = live.find(d => d.id === att.over.t), T = att.over.T;
  const others = live.filter(u => u !== att && u !== def);
  if (T.k === 'ladder' && T.siege) return { T, def, att, mode: 'ladder' };   // fighting up a Siege Ladder (fortress.js)
  if (!others.length) return { T, def, att, mode: 'barrier' };
  return { T, def, att, mode: others.some(o => o.side === att.side && gap(o, def) <= 0.08) ? 'bothSides' : 'flanked' };
}
// The In The Way test the attacker's Strike takes over a Barrier: 4+ carries on.
export const itwStrike = () => { const v = d6(); return { v, ok: v >= 4 }; };
// Whether the attacker may cross after the Combat: the defender was slain and the attacker won (not when flanked).
export const mayCross = (B, win) => !!B && B.mode !== 'flanked' && !alive(B.def) && alive(B.att) && win === B.att.side;
// The attacker crosses the Barrier to where the defender stood (p. 55). Returns the move { u, from }.
export function crossBarrier(B) {
  const att = B.att, from = { x: att.x, y: att.y }, Q = nearestFree(att, { x: B.def.x, y: B.def.y });
  att.x = Q.x; att.y = Q.y; att.over = null;
  return { u: att, from };
}
// After a Combat over a Barrier (mode 'barrier'): who Backs Away. A beaten attacker Backs Away; a beaten defender that
// survives holds its ground and the attacker Backs Away instead (p. 55); nobody is ever Trapped.
export function barrierBackAway(B, win, contacts) {
  const { att, def } = B;
  if (!alive(att) || !alive(def)) return { moves: [], trapped: new Set(), madeWay: [], falls: [], held: false };
  const r = backAwayAll([def], [att], contacts);
  r.trapped = new Set(); r.held = win !== def.side;
  return r;
}

export function contactsIn(goods, evils) {
  const set = new Set();
  for (const a of goods) for (const b of evils) if (touching(a, b)) { set.add(a.id + ':' + b.id); set.add(b.id + ':' + a.id); }
  return set;
}
