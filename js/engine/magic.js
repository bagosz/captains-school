// Magic (2024 Rules Manual, p. 114–121; Heroic Channelling p. 82, the Resist dice of Heroic Resolve p. 84): Casting
// Tests, Resist Tests, the three durations, and what each Magical Power does. No drawing and no DOM here.
//
// A model's powers: T.powers = [{ n: 'Transfix', cast: 3, rng: 12 }] (range 0: Self), from the army lists
// (tools/import-armies.mjs). Magic is in play when G.specials is null (matched play, sandbox, tools) or has 'magic'.
// A model Casts at most one power in its Activation, before, during or after its Move (p. 114): u.cast.
// The powers in play: G.spells = [{ p: power name, by: caster id, t: target id or null, dur, side: the caster's side }].
// Temporary ones end in the End phase, Exhaustion ones when the caster has no Will left; all of them when the caster
// is slain or leaves the battlefield (p. 115).
//
// Requests the procedures yield (besides those of dice.js):
//   { k: 'dice', step: 'cast' | 'resist', u, dice, need, label }   the Casting or Resist dice
//   { k: 'might', step: 'cast' | 'resist', u, die, need, opts }    Might on the best dice (dice.js: d6Test answers alike)
//   { k: 'resist', u, by, p, high, free }   answer: how many Will Points u spends to Resist (free: free dice it has)
//   { k: 'resister', side, list, by, p }    answer: which of the targets Resists a power that hits them all
//   { k: 'compelTo', side, u, t, opts }     answer: where Compel moves t (one of opts: { kind, x, y, cost, f, label })
//   { k: 'dice', step: 'tremor' | 'winds', u, die }   the D3 of Tremor's line or Call Winds' push
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap } from './geometry.js';
import { alive, sideAlive, engaged, losBlocked, tooDark, alignOf, chargeSpot, bestApproach, dropLinks, moveVal, invisible } from './rules.js';
import { ptIn, circleRect } from './geometry.js';
import { isHero, mightUp, mightOpts, woundRoll, d6Test } from './dice.js';
import { rule, hasKeyword } from './special.js';
import { inWater } from './terrain.js';
import { isSentry } from './advanced.js';
import { hurtSeq, knockedFlyingSeq } from './combat.js';
import { deceived } from './named.js';

/* ---------- The powers ---------- */
// dur: 'instant' | 'temporary' | 'exhaustion'. aim: 'self' (the caster), 'friend', 'enemy' (one model), 'enemies'
// (every enemy within range, Line of Sight not needed). kw: the target needs this keyword. hit: one hit of that Strength.
// (every enemy within range, Line of Sight not needed), 'line' (Tremor: every model under a line towards the model
// picked). harm: the power hurts its target (the computer Resists it). todo: not played yet (card only).
export const POWERS = {
  'Aura of Command': { dur: 'exhaustion', aim: 'self' },
  'Aura of Dismay': { dur: 'exhaustion', aim: 'self' },
  'Banishment': { dur: 'instant', aim: 'enemy', kw: 'Spirit', harm: 3, part: true },
  'Black Dart': { dur: 'instant', aim: 'enemy', hit: 6, harm: 3, part: true },
  'Bladewrath': { dur: 'temporary', aim: 'friend' },
  'Blessing of the Valar': { dur: 'instant', aim: 'friend' },
  'Blinding Light': { dur: 'temporary', aim: 'self' },
  'Call Winds': { dur: 'instant', aim: 'enemy', harm: 1 },
  'Chill Soul': { dur: 'instant', aim: 'enemy', harm: 3, part: true },
  'Collapse Rocks': { dur: 'instant', aim: 'enemy', hit: 7, harm: 3 },
  'Compel': { dur: 'instant', aim: 'enemy', harm: 2 },
  'Curse': { dur: 'instant', aim: 'enemy', harm: 1, part: true },
  'Drain Courage': { dur: 'instant', aim: 'enemy', harm: 1 },
  'Enchant Blades': { dur: 'temporary', aim: 'friend' },
  'Enrage Beast': { dur: 'temporary', aim: 'friend', kw: 'Beast' },
  'Flameburst': { dur: 'instant', aim: 'enemy', hit: 6, harm: 3 },
  'Fog of Disarray': { dur: 'exhaustion', aim: 'self' },
  'Foil Magic': { dur: 'instant', aim: 'enemy', harm: 1 },
  'Fortify Spirit': { dur: 'exhaustion', aim: 'friend' },
  'Fury': { dur: 'exhaustion', aim: 'self' },
  'Instil Fear': { dur: 'temporary', aim: 'self' },
  "Nature's Wrath": { dur: 'instant', aim: 'enemies', harm: 2 },
  'Panic Steed': { dur: 'instant', aim: 'enemy', kw: 'Cavalry', harm: 3 },
  'Paralyse': { dur: 'exhaustion', aim: 'enemy', harm: 3 },
  'Protection of the Valar': { dur: 'temporary', aim: 'friend' },
  'Renew': { dur: 'instant', aim: 'friend' },
  'Sorcerous Blast': { dur: 'instant', aim: 'enemy', hit: 5, harm: 3 },
  'Strengthen Will': { dur: 'instant', aim: 'friend' },
  'Terrifying Aura': { dur: 'exhaustion', aim: 'self' },
  'Transfix': { dur: 'temporary', aim: 'enemy', harm: 2 },
  'Tremor': { dur: 'instant', aim: 'line', hit: 4, harm: 2 },
  'Wither': { dur: 'instant', aim: 'enemy', harm: 2 },
  'Wrath of Bruinen': { dur: 'instant', aim: 'enemies', hit: 2, harm: 2 },
  'Writhing Vines': { dur: 'temporary', aim: 'self' },
  'Your Staff is Broken': { dur: 'instant', aim: 'enemy', harm: 3 },
};
const ALIAS = { 'Enchanted Blades': 'Enchant Blades' };
// 'Fury (Uruk-hai)' → 'Fury'; the bracket ('Uruk-hai') is powerArg.
export const powerKey = n => { const b = n.replace(/\s*\(.*\)\s*$/, '').trim(); return ALIAS[b] || b; };
export const powerArg = n => (/\(([^)]+)\)\s*$/.exec(n) || [])[1] || null;
export const powerOf = n => POWERS[powerKey(n)] || null;
export const played = pw => !!(powerOf(pw.n) && !powerOf(pw.n).todo);
export const magicOn = () => !!(G && (!G.specials || G.specials.has('magic')));
const spells = () => (G.spells || (G.spells = []));
const byId = id => G.units.find(o => o.id === id);
const R6 = 6 + 1e-6;

/* ---------- Powers in play ---------- */
// Whether spell s still works: its caster is alive and on the battlefield, and has Will left for an Exhaustion power.
const live = s => { const c = byId(s.by); return !!(c && alive(c) && (s.dur !== 'exhaustion' || (c.will || 0) > 0)); };
// Drops the spells that have ended (the caster fell or ran out of Will).
export function tidy() { if (G.spells && G.spells.length) G.spells = G.spells.filter(live); }
export const active = () => (G.spells && G.spells.length ? G.spells.filter(live) : []);
// The spell of power name on model t (cast on it), or null.
export const on = (t, name) => (G.spells && G.spells.length ? G.spells.find(s => s.t === t.id && powerKey(s.p) === name && live(s)) || null : null);
// Self-targeted spells of power name whose caster stands within 6″ of u: friends (same side as u) or enemies.
function auras(u, name, friends) {
  if (!G.spells || !G.spells.length) return [];
  return G.spells.filter(s => powerKey(s.p) === name && live(s) && (s.side === u.side) === friends && (s.by === u.id || gap(u, byId(s.by)) <= R6));
}
// Transfix (p. 121): no Activation, Heroic Actions, Active abilities or shooting, and no Strikes after winning.
export const transfixed = u => !!on(u, 'Transfix');
// Paralyse (p. 118): Prone and doing nothing until it recovers; in a Combat no dice and no Fight Value, no Strikes and it
// does not Stand Up after a win (a Paralysed model alone on its side loses without a roll).
export const paralysed = u => !!(G && G.spells && G.spells.length && on(u, 'Paralyse'));
// Transfixed or Paralysed: the model cannot Activate, shoot, declare Heroic Actions or Strike.
export const spellbound = u => !!(G && G.spells && G.spells.length && (on(u, 'Transfix') || on(u, 'Paralyse')));
// Writhing Vines (p. 121): enemies of the caster treat the area within 3″ of the Vine Marker as Difficult Terrain.
export const VINE_R = 0.49;   // a 25 mm marker
export function vinesAt(u, x, y) {
  if (!G || !G.spells || !G.spells.length) return false;
  return G.spells.some(s => s.vine && s.side !== u.side && live(s) && Math.hypot(x - s.vine.x, y - s.vine.y) - u.r - VINE_R <= 3 + 1e-6);
}
export const anyVines = u => !!(G && G.spells && G.spells.some(s => s.vine && s.side !== u.side && live(s)));
// Collapse Rocks (p. 116): a target in or against rock: rocks, a building, raised rocky ground, scree.
export const rockyAt = t => G.terrain.some(T => (T.k === 'rock' || T.k === 'building' || T.k === 'plateau' || (T.k === 'brush' && T.rocky)) && (ptIn(t.x, t.y, T) || circleRect(t.x, t.y, t.r + 0.25, T)));
// Rules a power gives (special.js: rule): Terrifying Aura → Terror, Instil Fear → Fearful near the caster, Enrage Beast →
// Fearless. Returns true or null.
export function magicRule(u, name) {
  if (!G || !G.spells || !G.spells.length) return null;
  const n = name.toLowerCase();
  if (n === 'terror' && G.spells.some(s => s.by === u.id && powerKey(s.p) === 'Terrifying Aura' && live(s))) return true;
  if (n === 'fearful' && auras(u, 'Instil Fear', false).length) return true;
  if (n === 'fearless' && on(u, 'Enrage Beast')) return true;
  return null;
}
// Aura of Command and Fury (X): the caster and the friends within 6″ (Fury: with the keyword) pass every Courage Test.
// Returns { why, h } as special.js: autoPass, or null.
export function magicPass(u) {
  if (!G || !G.spells || !G.spells.length) return null;
  const a = auras(u, 'Aura of Command', true)[0];
  if (a) return { why: 'auraOfCommand', h: byId(a.by) };
  const f = auras(u, 'Fury', true).find(s => furyKw(u, powerArg(s.p)));
  return f ? { why: 'fury', h: byId(f.by) } : null;
}
// Fury (Isengard Uruk-hai): a model with every keyword in the brackets ('Isengard' and 'Uruk-hai').
export const furyKw = (u, x) => !!x && (hasKeyword(u, x) || x.split(/\s+/).every(k => hasKeyword(u, k)));
// What powers add to a Courage Test's value (higher is harder): Drain Courage on u, an enemy Aura of Dismay within 6″.
export const courageMod = u => (u.drained || 0) + (G && G.spells && G.spells.length && auras(u, 'Aura of Dismay', false).length ? 1 : 0);
export const dismayed = u => !!(G && G.spells && G.spells.length && auras(u, 'Aura of Dismay', false).length);
// Fog of Disarray: −1 to the Intelligence Tests of enemies within 6″ of the caster.
export const fogged = u => !!(G && G.spells && G.spells.length && auras(u, 'Fog of Disarray', false).length);
// Shooting (rules.js: shotInfo): Blinding Light within 6″ of an enemy caster of the shooter hits only on a 6;
// Protection of the Valar on the target: −1 To Hit.
export const blinded = (s, t) => !!(G && G.spells && G.spells.length && G.spells.some(x => powerKey(x.p) === 'Blinding Light' && live(x) && x.side === t.side && x.side !== s.side && (x.by === t.id || gap(t, byId(x.by)) <= R6)));
export const valarShot = t => !!on(t, 'Protection of the Valar');
// Blinding Light also turns the night into day within 6″ of the caster (p. 116): such a model is lit.
export const illuminated = t => !!(G && G.spells && G.spells.length && G.spells.some(x => powerKey(x.p) === 'Blinding Light' && live(x) && (x.by === t.id || gap(t, byId(x.by)) <= R6)));
// Strikes: Bladewrath makes them Strength 6, whatever else applies; Enchant Blades re-rolls failed To Wound rolls.
export const bladewrath = u => !!on(u, 'Bladewrath');
export const enchanted = u => !!on(u, 'Enchant Blades');

/* ---------- Who may Cast, and at what ---------- */
// Will a model may spend on a Casting Test: Will of Evil keeps its last point (p. 133).
export const castWill = u => Math.max(0, (u.will || 0) - (rule(u, 'Will of Evil') != null ? 1 : 0));
// The powers model u can Cast now (p. 114): magic in play, Will to spend, not Prone, not Transfixed, not Cast yet in
// this Activation, in its own side's Move phase. Whether it is still Activating is the caller's business.
export function castable(u) {
  if (!magicOn() || !alive(u) || !u.T.powers || u.cast || isSentry(u) || u.prone || u.stunned || spellbound(u) || castWill(u) < 1) return [];
  return u.T.powers.filter(played);
}
const protectedFrom = (t, by) => t.side !== by.side && !!on(t, 'Protection of the Valar');
// The models power pw of u can target now: in range (base to base), in Line of Sight, of the right side and keyword.
export function targets(u, pw) {
  const P = powerOf(pw.n);
  if (!P) return [];
  if (P.aim === 'self') return [u];
  const mine = P.aim === 'friend';
  // Tremor: the direction towards an enemy within the longest line (6″); a Good caster never risks hitting a friend.
  if (P.aim === 'line') return G.units.filter(t => alive(t) && t.side !== u.side && gap(u, t) <= TREMOR_MAX + 1e-6
    && !(alignOf(u.side) === 'good' && lineTargets(u, t, TREMOR_MAX).some(o => o.side === u.side)));
  // A Siege Engine ignores every effect but damage (p. 147): it is no target for a power here.
  // A War Beast ignores powers that would stop it Activating or Moving, or Move it; a Chariot those that Move it (p. 149, 152).
  const still = ['Compel', 'Paralyse', 'Transfix'].includes(pw.n), moved = pw.n === 'Compel';
  return G.units.filter(t => alive(t) && !t.T.siege && !t.T.gate && (t === u || !invisible(t)) && !(t.T.warBeast && still) && !(t.T.chariot && moved) && (mine ? t.side === u.side : t.side !== u.side) && (t !== u || mine) && (t === u || !tooDark(u, t))
    && gap(u, t) <= pw.rng + 1e-6 && (P.aim === 'enemies' || t === u || !losBlocked(u, t)) && !protectedFrom(t, u) && fits(P, pw, t, u));
}
function fits(P, pw, t, u) {
  const k = powerKey(pw.n);
  if (P.kw === 'Cavalry') return !!t.cav;
  if (P.kw && !hasKeyword(t, P.kw)) return false;
  if (k === 'Foil Magic') return spells().some(s => s.by === t.id && s.dur === 'exhaustion' && live(s));
  if (k === 'Your Staff is Broken') return (t.T.gear || []).some(g => /^staff of power$/i.test(g));
  if (k === 'Blessing of the Valar') return isHero(t) && t.fate < t.mwf[2];
  if (k === 'Strengthen Will') return isHero(t) && t.will < t.mwf[1];
  if (k === 'Renew') return t.w < t.maxW || !!(t.cav && t.mount && t.mount.w < t.mount.maxW);
  if (k === 'Curse') return isHero(t) && t.fate > 0;
  if (k === 'Compel') return !engaged(t);   // it cannot be moved out of a Combat
  if (k === 'Collapse Rocks') return rockyAt(t);
  if (k === 'Paralyse') return !paralysed(t);
  if (k === 'Bladewrath' || k === 'Enchant Blades' || k === 'Enrage Beast' || k === 'Protection of the Valar' || k === 'Fortify Spirit') return !on(t, k);
  return true;
}
// The chance that n dice reach the Casting Value (Heroic Channelling: a 6 without rolling).
export const castChance = (u, pw, n) => (u.channel ? 1 : 1 - ((pw.cast - 1) / 6) ** n);
// Tremor's line: from the caster's base edge towards model t (its centre), len inches; every model whose base it crosses
// (and, for one Engaged in Combat, the whole Combat). Models that Fly are never hit.
export const TREMOR_MAX = 6;
export function lineTargets(u, t, len) {
  const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const x0 = u.x + ux * u.r, y0 = u.y + uy * u.r, x1 = x0 + ux * len, y1 = y0 + uy * len;
  const hit = G.units.filter(o => o !== u && alive(o) && rule(o, 'Fly') == null && segDist(o.x, o.y, x0, y0, x1, y1) <= o.r);
  const all = new Set(hit);
  for (const o of hit) if (engaged(o)) for (const m of combatMates(o)) if (m !== u && rule(m, 'Fly') == null) all.add(m);
  return [...all];
}
function segDist(px, py, x0, y0, x1, y1) {
  const vx = x1 - x0, vy = y1 - y0, w = ((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy || 1), k = Math.max(0, Math.min(1, w));
  return Math.hypot(px - (x0 + vx * k), py - (y0 + vy * k));
}

/* ---------- Casting and Resisting (p. 114–115) ---------- */
// Free Resist dice of model t (p. 84, 131, 117): Heroic Resolve within 6″ this turn, Resistant to Magic, Fortify Spirit.
export const freeDice = t => (t.resolveDie ? 1 : 0) + (rule(t, 'Resistant to Magic') != null || rule(t, 'Sigils of Defiance') != null ? 1 : 0) + (on(t, 'Fortify Spirit') ? 1 : 0);   // Sigils of Defiance: Resistant to Magic
const harmful = P => P.aim === 'enemy' || P.aim === 'enemies' || P.aim === 'line';
// Model u Casts power pw at t (null: itself, or every enemy in range), spending n Will Points: the Casting Test (Might
// raises the best dice), then a Resist Test by the target if it is an enemy. Returns { ok, cast, resisted, dice,
// rdice, high, by: the model that Resisted, targets }.
export function* castSeq(u, pw, t, n) {
  const P = powerOf(pw.n), k = powerKey(pw.n);
  n = u.channel ? 1 : Math.max(1, Math.min(n | 0, castWill(u)));   // Heroic Channelling: one Will Point, no roll
  u.cast = pw.n; u.will -= n;
  const chan = !!u.channel;
  if (chan) u.channel = false;
  const dice = chan ? [{ n: 6, v: 6, mt: 0, ok: true, chan: true }] : Array.from({ length: n }, () => { const v = d6(); return { n: v, v, mt: 0, ok: v >= pw.cast }; });
  const best = () => dice.reduce((a, b) => (b.v > a.v ? b : a));
  const label = `Casting Test: ${u.name}, ${pw.n} ${pw.cast}+${chan ? ' (Heroic Channelling: counts as a 6)' : ''}`;
  yield { k: 'dice', step: 'cast', u, dice, need: pw.cast, label, p: pw.n };
  // Might raises the best dice, before the target Resists (p. 114).
  const b = best(), opts = !b.ok ? mightOpts(u, b.v, [pw.cast]) : [];
  if (opts.length) {
    const m = Math.min(+((yield { k: 'might', step: 'cast', u, die: b, need: pw.cast, opts, label, ctx: { pw, t } }) || 0), 6 - b.v, u.might || 0);
    if (m > 0) { const from = b.v; for (let i = 0; i < m; i++) mightUp(u, b); b.ok = b.v >= pw.cast; yield { k: 'raise', step: 'cast', u, die: b, from, n: m }; }
  }
  const high = best().v;
  let all = P.aim === 'enemies' ? targets(u, pw) : t ? [t] : [];
  const R = { ok: high >= pw.cast, cast: high >= pw.cast, resisted: false, dice, rdice: [], high, by: null, targets: all, k };
  if (!R.ok) return R;
  if (P.aim === 'line') {   // Tremor: the line is D3+3″ long; the models under it are its targets
    const die = { n: d6(), v: 0, ok: true }; die.v = die.n; R.len = 3 + Math.ceil(die.n / 2);
    yield { k: 'dice', step: 'tremor', u, die, label: `Tremor: the line is D3+3″ long: ${R.len}″` };
    all = R.targets = lineTargets(u, t, R.len);
  }
  // The Resist Test: only against a power that targets enemies (p. 115); with several targets, one of them Resists.
  const foes = all.filter(o => o.side !== u.side);
  if (harmful(P) && foes.length) {
    let r = foes[0];
    if (foes.length > 1) r = (yield { k: 'resister', side: foes[0].side, list: foes, by: u, p: pw.n }) || foes[0];
    const free = freeDice(r), will = Math.min(+((yield { k: 'resist', u: r, by: u, p: pw.n, high, free }) || 0), r.will || 0);
    if (will + free > 0) {
      r.will = (r.will || 0) - will;
      // Saruman's Deceit (named.js): −1 on each dice, a natural 6 still a 6.
      const dm = deceived(r, u) ? -1 : 0;
      const rd = Array.from({ length: will + free }, (_, i) => { const v = d6(); return { n: v, v, mt: 0, mod: dm, ok: (v === 6 ? 6 : v + dm) >= high, free: i >= will }; });
      R.rdice = rd; R.by = r;
      yield { k: 'dice', step: 'resist', u: r, dice: rd, need: high, label: `Resist Test: ${r.name}, ${high}+ (${will ? `${will} Will` : ''}${will && free ? ' and ' : ''}${free ? `${free} free` : ''})` };
      // A Hero regains the Will Point of each natural 6 (not on a free dice).
      if (isHero(r)) { const back = rd.filter(d => d.n === 6 && !d.free).length; if (back) { r.will += back; R.back = back; } }
      const rb = rd.reduce((a, c) => (c.v > a.v ? c : a)), ro = !rb.ok ? mightOpts(r, rb.v, [high]) : [];
      if (ro.length) {
        const m = Math.min(+((yield { k: 'might', step: 'resist', u: r, die: rb, need: high, opts: ro, label: `Resist Test: ${r.name}`, ctx: { pw, by: u } }) || 0), 6 - rb.v, r.might || 0);
        if (m > 0) { const from = rb.v; for (let i = 0; i < m; i++) mightUp(r, rb); rb.ok = rb.v >= high; yield { k: 'raise', step: 'resist', u: r, die: rb, from, n: m }; }
      }
      if (rd.some(d => d.ok)) { R.ok = false; R.resisted = true; }
    }
  }
  // The Ring of Barahir: after the Resist Test, a natural 6 and Aragorn is not affected.
  const bar = R.ok && foes.find(o => (o.T.gear || []).some(g => /^ring of barahir$/i.test(g)));
  if (bar) { const die = { n: d6(), v: 0, ok: false }; die.v = die.n; die.ok = die.n === 6; yield { k: 'dice', step: 'barahir', u: bar, die, label: `Ring of Barahir: ${bar.name}, a natural 6` }; if (die.ok) { R.ok = false; R.barahir = bar; } }
  return R;
}

/* ---------- What the powers do ---------- */
// The effect of power pw Cast by u on t (or on R.targets), once Cast and not Resisted. part: 'rider' or 'mount' for a
// power that lets the caster choose on a Cavalry model. Returns { slain: [models slain], text: what happened } and
// leaves the spell in G.spells for powers that last.
export function* effectSeq(u, pw, t, R, part = 'rider') {
  const P = powerOf(pw.n), k = powerKey(pw.n), out = { slain: [], notes: [], wounded: [] };
  if (P.dur !== 'instant') {
    // The same power on the same model again replaces the old one.
    G.spells = spells().filter(s => !(powerKey(s.p) === k && s.t === (t ? t.id : null) && s.by === u.id));
    spells().push({ p: pw.n, by: u.id, t: t ? t.id : null, dur: P.dur, side: u.side, ...(k === 'Writhing Vines' ? { vine: vineSpot(u) } : {}) });
  }
  const pt = t && t.cav && P.part ? part : 'rider';
  // Knocked Prone: a Cavalry model's rider is Knocked Flying instead (p. 70).
  const down = function* (x) {
    if (!alive(x)) return;
    if (x.cav) { const K = yield* knockedFlyingSeq(x); if (K.died) out.slain.push(x); else out.notes.push(`${x.name} is Knocked Flying.`); }
    else { x.prone = true; out.notes.push(`${x.name} is knocked Prone.`); }
  };
  const hurt = function* (x, prt = 'rider') {
    const H = yield* hurtSeq(x, prt);
    if (H.r === 'slain' || (prt === 'rider' && !alive(x))) out.slain.push(x);
    else if (H.r === 'mountSlain') { out.notes.push(`${x.name}'s ${x.mount.n.toLowerCase()} is slain.`); out.mountSlain = x; }
    else if (H.r !== 'saved') out.wounded.push(x);
    return H.r;
  };
  switch (k) {
    case 'Banishment': case 'Chill Soul': yield* hurt(t, pt); break;
    case 'Black Dart': case 'Flameburst': case 'Sorcerous Blast': {
      const W = yield* woundRoll(u, t, { s: P.hit, part: pt, label: `${pw.n}: Strength ${P.hit} hit on ${t.name}` });
      out.hit = W;
      if (W.ok) yield* hurt(t, pt);
      if (k === 'Sorcerous Blast' && alive(t)) {
        // Knocked Prone (a Cavalry model: Knocked Flying), and every other model in its Combat with Strength 5 or less.
        const near = engaged(t) ? G.units.filter(o => o !== t && alive(o) && combatMates(t).includes(o) && o.s <= 5) : [];
        if (t.cav && !out.mountSlain) { const K = yield* knockedFlyingSeq(t); if (K.died) out.slain.push(t); else out.notes.push(`${t.name} is Knocked Flying.`); }
        else if (!t.cav) { t.prone = true; out.notes.push(`${t.name} is knocked Prone.`); }
        for (const o of near) { if (!o.cav) { o.prone = true; out.notes.push(`${o.name} is knocked Prone.`); } }
      }
      break;
    }
    case 'Wrath of Bruinen': case "Nature's Wrath":
      for (const x of R.targets) {
        if (!alive(x)) continue;
        const s = k === 'Wrath of Bruinen' && inWater(x) ? 8 : P.hit;   // Strength 8 in a water feature
        if (s) { const W = yield* woundRoll(u, x, { s, label: `${pw.n}: Strength ${s} hit on ${x.name}` }); if (W.ok) yield* hurt(x); }
        if (!alive(x)) continue;
        if (x.cav) { const K = yield* knockedFlyingSeq(x); if (K.died) out.slain.push(x); } else x.prone = true;
      }
      out.notes.push('Every target is knocked Prone (riders are Knocked Flying).');
      break;
    case 'Panic Steed': {
      out.notes.push(`${t.name}'s ${t.mount.n.toLowerCase()} bolts and is removed; the rider is Knocked Flying.`);
      t.mount.w = 0;
      const K = yield* knockedFlyingSeq(t);
      if (K.died) out.slain.push(t);
      break;
    }
    case 'Collapse Rocks': {
      const W = yield* woundRoll(u, t, { s: 7, label: `Collapse Rocks: Strength 7 hit on ${t.name}` });
      out.hit = W;
      if (W.ok) yield* hurt(t);
      yield* down(t);
      break;
    }
    case 'Tremor':
      out.notes.push(`The line runs ${R.len}″.`);
      for (const x of R.targets) {
        if (!alive(x)) continue;
        const W = yield* woundRoll(u, x, { s: 4, label: `Tremor: Strength 4 hit on ${x.name}` });
        if (W.ok) yield* hurt(x);
        yield* down(x);
      }
      break;
    case 'Call Winds': {
      const die = { n: d6(), v: 0, ok: true }; die.v = die.n;
      const d = 3 + Math.ceil(die.n / 2);
      yield { k: 'dice', step: 'winds', u, die, label: `Call Winds: ${t.name} is blown D3+3″: ${d}″` };
      const from = { x: t.x, y: t.y }, moved = blow(t, u, d);
      out.moved = [{ u: t, from }];
      out.notes.push(`${t.name} is blown ${moved.toFixed(1)}″ away from ${u.name}${moved < d - 0.05 ? ' and stops against what is in the way' : ''}.`);
      yield* down(t);
      break;
    }
    case 'Paralyse':
      if (t.cav) yield* down(t); else t.prone = true;
      out.notes.push(`${t.name} is Paralysed: Prone, and it can do nothing until it recovers (a 6 at the end of each End phase, or a 6 from a friend in base contact).`);
      break;
    case 'Compel': {
      const opts = compelOptions(u, t);
      if (!opts.length) { out.notes.push(`${t.name} has nowhere it can be moved.`); break; }
      const o = (yield { k: 'compelTo', side: u.side, u, t, opts }) || opts[0];
      const from = { x: t.x, y: t.y };
      dropLinks(t);
      if (o.over) t.over = { T: o.over.T, t: o.over.t };
      if (o.stand) t.prone = false;
      t.x = o.x; t.y = o.y; t.done = true; t.compelled = true;
      if (o.kind === 'charge') t.charged = true;
      out.moved = [{ u: t, from }];
      out.notes.push(o.kind === 'charge' ? `${u.name} makes ${t.name} Charge ${o.f.name}; it cannot move again this turn.` : `${t.name} is moved ${o.cost.toFixed(1)}″ (${o.label}); it cannot move again this turn.`);
      break;
    }
    case 'Writhing Vines': out.notes.push('The Vine Marker is placed: enemies treat the ground within 3″ of it as Difficult Terrain until the End phase.'); break;
    case 'Curse': t.fate = Math.max(0, t.fate - 1); out.notes.push(`${t.name} loses a Fate Point (${t.fate} left).`); break;
    case 'Drain Courage': t.drained = (t.drained || 0) + 1; out.notes.push(`${t.name}'s Courage worsens to ${t.T.c + t.drained}+ for the rest of the battle.`); break;
    case 'Wither':
      t.s = Math.max(0, t.s - 1); t.withered = (t.withered || 0) + 1;
      out.notes.push(`${t.name}'s Strength drops to ${t.s} for the rest of the battle.`);
      if (t.s <= 0) { t.w = 0; t.dead = true; out.slain.push(t); }
      break;
    case 'Foil Magic': {
      const s = spells().filter(x => x.by === t.id && x.dur === 'exhaustion' && live(x)).pop();
      if (s) { G.spells = spells().filter(x => x !== s); out.notes.push(`${t.name}'s ${s.p} ends.`); }
      break;
    }
    case 'Your Staff is Broken': t.T = { ...t.T, gear: (t.T.gear || []).filter(g => !/^staff of power$/i.test(g)) }; out.notes.push(`${t.name}'s Staff of Power is destroyed.`); break;
    case 'Blessing of the Valar': t.fate = Math.min(t.mwf[2], t.fate + 1); out.notes.push(`${t.name} regains a Fate Point (${t.fate}).`); break;
    case 'Strengthen Will': t.will = Math.min(t.mwf[1], t.will + 1); out.notes.push(`${t.name} regains a Will Point (${t.will}).`); break;
    case 'Renew':
      if (pt === 'mount' || (t.w >= t.maxW && t.cav)) { t.mount.w = Math.min(t.mount.maxW, t.mount.w + 1); out.notes.push(`${t.name}'s mount regains a Wound.`); }
      else { t.w = Math.min(t.maxW, t.w + 1); out.notes.push(`${t.name} regains a Wound (${t.w}/${t.maxW}).`); }
      break;
    case 'Enrage Beast': t.f += 2; t.s += 2; t.a += 2; t.enraged = u.id; out.notes.push(`${t.name}: Fight Value, Strength and Attacks +2 and Fearless until the End phase, then it suffers a Wound.`); break;
    default: break;
  }
  return out;
}
// The models in the same Combat as t (base contact, both sides, and their own contacts), for Sorcerous Blast.
function combatMates(t) {
  const seen = new Set([t]), q = [t];
  while (q.length) { const a = q.pop(); for (const o of G.units) if (!seen.has(o) && alive(o) && o.side !== a.side && gap(a, o) <= 0.08) { seen.add(o); q.push(o); } }
  return [...seen];
}

// Call Winds: t goes straight away from the caster, d inches, stopping at another model or at terrain it cannot cross
// (a wall, a hedge, rocks, water, a building). It leaves any Combat. Returns how far it went.
function blow(t, u, d) {
  if (t.T.chariot || t.T.warBeast) return 0;   // never Moved against its will
  const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const stops = G.terrain.filter(T => ['rock', 'building', 'water', 'wall', 'hedge'].includes(T.k));
  let go = 0;
  for (let s = 0.1; s <= d + 1e-6; s += 0.1) {
    const x = t.x + ux * s, y = t.y + uy * s;
    if (x < t.r || y < t.r || x > G.W - t.r || y > G.H - t.r) break;
    if (stops.some(T => circleRect(x, y, t.r, T))) break;
    if (G.units.some(o => o !== t && alive(o) && Math.hypot(o.x - x, o.y - y) < o.r + t.r - 0.02)) break;
    go = s;
  }
  dropLinks(t);
  t.x += ux * go; t.y += uy * go;
  return go;
}
// Where the Vine Marker goes: wholly within 3″ of the caster, towards the nearest enemy.
function vineSpot(u) {
  const f = sideAlive(u.side === 'good' ? 'evil' : 'good').sort((a, b) => gap(u, a) - gap(u, b))[0];
  const dx = f ? f.x - u.x : 0, dy = f ? f.y - u.y : -1, L = Math.hypot(dx, dy) || 1, r = u.r + 3 - VINE_R * 2;
  return { x: Math.max(VINE_R, Math.min(G.W - VINE_R, u.x + dx / L * r)), y: Math.max(VINE_R, Math.min(G.H - VINE_R, u.y + dy / L * r)) };
}
// Where Compel may move t (p. 116): up to half its Move Value, even if it moved already; a Charge into a friend of the
// caster (no Terror test), or a plain move (towards or away from the caster, or to either side). No Jump, Climb or
// Leap; not out of a Combat. Each: { kind: 'charge' | 'move', x, y, cost, f, label, over, stand }.
export function compelOptions(u, t) {
  const lim = moveVal(t) / 2, out = [];
  if (engaged(t) || lim <= 0.05) return out;
  const was = { noCharge: t.noCharge, tether: t.tether, movedDist: t.movedDist };
  t.noCharge = null; t.tether = null; t.movedDist = 0;
  try {
    for (const f of sideAlive(u.side)) {
      if (gap(t, f) > lim + 2) continue;
      const c = chargeSpot(t, f, lim);
      if (c) out.push({ kind: 'charge', x: c.x, y: c.y, cost: c.cost, f, over: c.over || null, stand: c.stand || 0, label: `Charge ${f.name}` });
    }
    const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    for (const [lbl, vx, vy] of [['towards ' + u.name, -ux, -uy], ['away from ' + u.name, ux, uy], ['to one side', -uy, ux], ['to the other side', uy, -ux]]) {
      const P = bestApproach(t, { x: t.x + vx * 30, y: t.y + vy * 30 }, lim);
      if (P && P.cost > 0.3) out.push({ kind: 'move', x: P.x, y: P.y, cost: P.cost, label: lbl });
    }
  } finally { Object.assign(t, was); }
  return out;
}
// The computer's choice for Compel: a Charge into the friend with most others around it (the target ends outnumbered),
// else the move away from its own side's models.
export function aiCompel(q) {
  const near = f => sideAlive(f.side).filter(o => o !== f && gap(o, f) <= 3).length;
  const ch = q.opts.filter(o => o.kind === 'charge').sort((a, b) => near(b.f) - near(a.f))[0];
  if (ch && near(ch.f) >= 1) return ch;
  return q.opts.find(o => o.label.startsWith('towards')) || q.opts[0];
}
// The end of the End phase (p. 118): each Paralysed model rolls a D6 (Might may raise it) and recovers on a 6; then,
// one at a time, each friend in base contact rolls (a Hero with its own Might). Yields the d6Test requests.
// Returns [{ u, rolls: [{ by, die }], ok }].
export function* paralyseSeq() {
  const out = [];
  for (const s of spells().filter(x => powerKey(x.p) === 'Paralyse' && live(x))) {
    const u = byId(s.t);
    if (!u || !alive(u)) continue;
    const rolls = [];
    let ok = false;
    for (const by of [u, ...sideAlive(u.side).filter(o => o !== u && gap(o, u) <= 0.08)]) {
      const die = yield* d6Test(by, 6, { step: 'paralyse', label: `Paralyse: ${by === u ? u.name : `${by.name} helps ${u.name}`}, a 6 to recover` });
      rolls.push({ by, die });
      if (die.ok) { ok = true; break; }
    }
    if (ok) G.spells = spells().filter(x => x !== s);
    out.push({ u, rolls, ok });
  }
  return out;
}

/* ---------- Staff of Power (p. 107) ---------- */
// The wielder gains a free Will Point at the start of each turn; unspent, it is lost at the end of the turn.
export const hasStaff = u => (u.T.gear || []).some(g => /^staff of power$/i.test(g));
export function staffTurn(units) { for (const u of units) if (alive(u) && u.mwf && hasStaff(u)) { u.will = (u.will || 0) + 1; u.staffBase = u.will - 1; } }
function staffEnd() { for (const u of G.units) if (u.staffBase != null) { if (u.will > u.staffBase) u.will = Math.max(u.staffBase, u.will - 1); u.staffBase = null; } }

/* ---------- End phase (p. 115, 133) ---------- */
// Temporary powers end; an Enraged Beast loses its bonus and suffers a Wound; Will of Evil: a model with it that was in
// a Combat this turn gives up a Will Point, and at 0 Will it is banished. Returns { hurt: [Enraged Beasts to wound],
// banished: [models] , willOfEvil: [models that gave up a point] }.
export function endPhase() {
  const out = { hurt: [], banished: [], willOfEvil: [] };
  staffEnd();   // the Staff of Power's free Will Point, if unspent
  for (const u of G.units) if (u.enraged != null && alive(u)) { u.f -= 2; u.s -= 2; u.a -= 2; u.enraged = null; out.hurt.push(u); }
  if (G.spells) G.spells = G.spells.filter(s => s.dur !== 'temporary' && live(s));
  for (const u of G.units) {
    if (!alive(u) || !u.fought || rule(u, 'Will of Evil') == null) continue;
    u.will = Math.max(0, (u.will || 0) - 1); out.willOfEvil.push(u);
    if (u.will <= 0) { u.dead = true; u.banished = true; out.banished.push(u); }
  }
  tidy();
  return out;
}
// Enrage Beast's Wound at the End phase (callers run it for each of endPhase().hurt).
export function* enrageWoundSeq(u) { return yield* hurtSeq(u, 'rider'); }

/* ---------- The computer's choices ---------- */
const worth = t => (isHero(t) ? 3 + (t.might || 0) * 0.3 + (t.will || 0) * 0.1 : 1) * (t.cav ? 1.4 : 1) * (t.T.monster ? 2 : 1);
const pWound = (s, d) => { const need = s - d >= 5 ? [2] : s - d >= 3 ? [3] : s - d >= 1 ? [4] : s === d ? [4] : d - s <= 1 ? [5] : d - s <= 3 ? [6] : d - s <= 5 ? [6, 4] : d - s <= 7 ? [6, 5] : [6, 6]; return need.reduce((p, v) => p * (7 - v) / 6, 1); };
const foesNear = (u, d) => sideAlive(u.side === 'good' ? 'evil' : 'good').filter(f => gap(u, f) <= d + 1e-6);
// What Casting power pw at t is worth to the computer (0: not worth the Will).
function castValue(u, pw, t) {
  const k = powerKey(pw.n), P = powerOf(pw.n), broken = side => !!(G.broken && G.broken[side]);
  const fighting = x => engaged(x) || foesNear(x, 2).length > 0;
  switch (k) {
    case 'Black Dart': case 'Flameburst': return pWound(P.hit, t.cav ? Math.min(t.d, t.mount.d) : t.d) * worth(t) * (isHero(t) && t.fate ? 0.7 : 1);
    case 'Sorcerous Blast': return pWound(5, t.d) * worth(t) + (engaged(t) ? 0.5 : 0.2);
    case 'Banishment': case 'Chill Soul': return worth(t) * (isHero(t) && t.fate ? 0.6 : 1) * (t.w <= 1 ? 1.2 : 0.8);
    // A target that has already moved this turn is only hurt in a fight (no Strikes if it wins).
    case 'Transfix': return (engaged(t) ? 1 : t.done || t.movedDist > 0 ? 0 : foesNear(t, 12).length ? 0.6 : 0) * worth(t) * (isHero(t) ? 1 : 0.5);
    case 'Panic Steed': return worth(t) * 0.9;
    case 'Curse': return isHero(t) && t.fate ? 0.6 : 0;
    case 'Wither': return isHero(t) || t.T.monster ? 0.7 : 0;
    case 'Drain Courage': return broken(t.side) && isHero(t) ? 0.8 : 0;
    case 'Foil Magic': return 0.8;
    case 'Your Staff is Broken': return (t.T.powers ? 0.8 : 0.2) * worth(t);   // a free Will Point every turn for the rest of the game
    case 'Terrifying Aura': return foesNear(u, 12).length ? 0.9 : 0;
    case 'Instil Fear': return foesNear(u, 6).filter(f => !engaged(f)).length >= 2 ? 0.7 : 0;
    case 'Aura of Command': return broken(u.side) ? 0.3 * sideAlive(u.side).filter(o => gap(u, o) <= 6).length : 0;
    case 'Fury': return broken(u.side) ? 0.25 * sideAlive(u.side).filter(o => gap(u, o) <= 6 && furyKw(o, powerArg(pw.n))).length : 0;
    case 'Aura of Dismay': return broken(u.side === 'good' ? 'evil' : 'good') ? 0.2 * foesNear(u, 6).length : 0;
    case 'Fog of Disarray': return 0;
    case 'Bladewrath': return fighting(t) && t.s < 6 ? (isHero(t) ? 0.9 : 0.5) * (6 - t.s) / 2 : 0;
    case 'Enchant Blades': return fighting(t) ? (isHero(t) ? 0.8 : 0.4) : 0;
    case 'Enrage Beast': return fighting(t) ? 1 : 0;
    case 'Strengthen Will': case 'Blessing of the Valar': return 0.6;
    case 'Renew': return isHero(t) ? 0.8 : 0.3;
    case 'Fortify Spirit': return isHero(t) && G.units.some(o => alive(o) && o.side !== u.side && o.T.powers) ? 0.5 : 0;
    case 'Protection of the Valar': return isHero(t) && foesNear(t, 24).some(f => f.bow) ? 0.5 : 0;
    case 'Blinding Light': return foesNear(u, 24).filter(f => f.bow).length >= 2 ? 0.6 : 0;
    case "Nature's Wrath": case 'Wrath of Bruinen': return 0.4 * targets(u, pw).length;
    case 'Paralyse': return worth(t) * (engaged(t) ? 1.2 : 0.8);
    case 'Collapse Rocks': return pWound(7, t.d) * worth(t) + 0.3;
    case 'Call Winds': return engaged(t) && isHero(t) ? 0.8 : 0;
    case 'Tremor': { const L = lineTargets(u, t, 4); return L.reduce((s, o) => s + (o.side === u.side ? -1 : 1) * pWound(4, o.d) * worth(o), 0) + 0.2 * L.filter(o => o.side !== u.side).length; }
    case 'Compel': { if (worth(t) < 2 || !sideAlive(u.side).some(f => f !== u && gap(f, t) <= moveVal(t) / 2 + 1)) return 0; const c = compelOptions(u, t).filter(o => o.kind === 'charge' && sideAlive(u.side).filter(x => x !== o.f && gap(x, o.f) <= 3).length >= 1); return c.length ? worth(t) * 0.5 : 0; }
    case 'Writhing Vines': return foesNear(u, 8).filter(f => !engaged(f)).length >= 2 ? 0.5 : 0;
    default: return 0;
  }
}
// The computer's Cast for model u now, or null: { pw, t, n, part }. Spends as many Will Points as give about a 2 in 3
// chance (at most 3), and only when the power is worth it (a Ringwraith with a dozen Will Points Casts more freely).
export function aiCast(u) {
  let best = null;
  const cost = 0.15 * Math.min(1, 3 / Math.max(1, castWill(u)));   // a Will Point weighs less for a model with many
  for (const pw of castable(u)) {
    const P = powerOf(pw.n);
    if (P.aim === 'self' && spells().some(s => s.by === u.id && powerKey(s.p) === powerKey(pw.n) && live(s))) continue;
    for (const t of targets(u, pw)) {
      if (P.dur !== 'instant' && t !== u && on(t, powerKey(pw.n))) continue;   // already under it
      const v = castValue(u, pw, t);
      if (v < 0.5) continue;
      let n = 1;
      while (n < Math.min(3, castWill(u)) && castChance(u, pw, n) < 0.66) n++;
      const score = v * castChance(u, pw, n) - cost * n;
      if (score > 0.25 && (!best || score > best.score)) best = { pw, t: P.aim === 'self' || P.aim === 'enemies' ? null : t, tl: t, n, score };
      if (P.aim === 'self' || P.aim === 'enemies') break;
    }
  }
  if (best && powerOf(best.pw.n).aim === 'line') best.t = best.tl;
  if (best && best.t && best.t.cav && powerOf(best.pw.n).part) best.part = best.t.mount.d < best.t.d ? 'mount' : 'rider';
  return best;
}
// How many Will Points the computer spends to Resist: one against a harmful power, two against a serious one when it
// has Will to spare; none for a Warrior (it has none) unless free dice come anyway.
export function aiResist(q) {
  const r = q.u, P = powerOf(q.p) || {}, will = r.will || 0;
  if (!will || !P.harm) return 0;
  if (P.harm >= 3 && will >= 3 && q.high >= 5) return 2;
  if (P.harm >= 2 || will >= 3) return 1;
  return 0;
}
// Which target Resists a power that hits them all: the one with the most Will (and free dice).
export const aiResister = q => q.list.slice().sort((a, b) => ((b.will || 0) + freeDice(b)) - ((a.will || 0) + freeDice(a)))[0];
