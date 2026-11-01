// Monsters (2024 Rules Manual, p. 89–91, Monstrous Charge p. 128): the free Strikes at the supporters of a model a
// Monster slays, the Brutal Power Attacks (Rend, Barge, Hurl) and Monstrous Charge. No drawing and no DOM here.
// The game (js/game/flow.js) and the headless game (sim.js) call the same procedures in the same order:
//   after the Duel Roll a winning Monster may choose a Brutal Power Attack instead of its Strikes (brutalOptions, the
//   request { k: 'brutal', side, u, opts } answered with null (Strikes) or { k: 'rend', t, part } | { k: 'barge' } |
//   { k: 'hurl', t }); Hurl is nominated before Backing Away, Barge replaces it; Rend comes before any other Strike.
//   Monstrous Charge knocks the beaten models with less Strength Prone after Backing Away (monstrousDown).
// What a Hurl yields besides the dice: { k: 'hurlAt', side, u, t, list, pass } answered with the target model (list) or
// null for none (then the Monster picks a point).
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, squareHits } from './geometry.js';
import { alive, sideAlive, losBlocked, touching, dropLinks, woundNeed, pNeed } from './rules.js';
import { woundRoll, woundRolls, intelligenceSeq, isHero } from './dice.js';
import { rule, hasKeyword } from './special.js';
import { declared } from './heroes.js';
import { spellbound } from './magic.js';
import { nearestFree } from './terrain.js';

export const isMonster = u => !!(u && (u.T.monster || hasKeyword(u, 'Monster')));
// The Monster rules are in play: everywhere but in the missions that have not taught them (key 'monsters').
export const monstersOn = () => !!(G && (!G.specials || G.specials.has('monsters')));
// Whether w gets the free Strikes at its victim's supporters (p. 89).
export const freeStrikes = w => monstersOn() && isMonster(w);
// Monstrous Charge (p. 128): a model with the rule that Charged this turn has +1 Attack in the Fight phase (it does not
// add to a Cavalry Charge's Extra Attack, FAQ).
export const monstrousCharge = u => !!(u.charged && rule(u, 'Monstrous Charge') != null);

/* ---------- Monsters in Combat (p. 89) ---------- */
// The models that were Supporting t in Combat c: in base contact with it, and the pikes behind those (FAQ: a pike behind
// a pike counts too).
export function supportersOf(c, t) {
  const sup = (c.sup || []).filter(s => s.side === t.side && alive(s));
  const set = new Set(sup.filter(s => touching(s, t)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of sup) if (!set.has(s) && c.via && set.has(c.via.get(s))) { set.add(s); grew = true; }
  }
  return [...set];
}

/* ---------- Brutal Power Attacks (p. 90–91) ---------- */
// What Monster w may do instead of its Strikes once its side won Combat c (L: the losers): null when it may not use a
// Brutal Power Attack (not a Monster, used one this turn, Prone, thrown, Transfixed, Shielding: FAQ, only a Monster that
// could make Strikes). { rend: [targets], hurl: [targets], barge: true | false }.
export function brutalOptions(w, L, shield = {}) {
  if (!monstersOn() || !isMonster(w) || !alive(w) || w.bpa === G.turn || w.prone || w.stunned || spellbound(w) || shield[w.side]) return null;
  const foes = L.filter(l => alive(l) && touching(w, l));
  if (!foes.length) return null;
  const heroic = declared(w, 'combat');   // no Barge or Hurl in a Heroic Combat
  // A Chariot or War Beast can never be Hurled or Barged (Immovable Object).
  return { rend: foes, hurl: heroic ? [] : foes.filter(l => l.s < w.s && !l.T.chariot && !l.T.warBeast), barge: !heroic && !foes.some(l => l.T.chariot || l.T.warBeast) };
}
// Rend: To Wound rolls equal to w's Attacks (with what changes them) against t's Strength instead of its Defence.
export const rendRolls = (w, L) => w.a + (monstrousCharge(w) ? 1 : 0);
export function* rendSeq(w, t, n, part = 'rider') {
  const s = part === 'mount' && t.cav ? t.mount.s : t.s;
  return yield* woundRolls(w, t, n, { s: w.s, d: s, part, label: `Rend: ${w.name} against ${t.name}'s Strength ${s}` });
}
// Barge: every enemy in the Combat and every enemy that Supported Backs Away 3″, straight away from the Monster or as
// near that as gives the full 3″; one that cannot go 3″ goes as far as it can and is knocked Prone. Returns
// { moves: [{ u, from }], down: [models knocked Prone] }.
export function barge(w, c) {
  const L = [...c.filter(u => u.side !== w.side && alive(u)), ...(c.sup || []).filter(s => s.side !== w.side && alive(s))];
  const moves = [], down = [];
  for (const l of L) {
    const from = { x: l.x, y: l.y }, a0 = Math.atan2(l.y - w.y, l.x - w.x);
    let best = null;
    for (const off of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
      const a = a0 + off * Math.PI / 180;
      let go = 0;
      for (let s = 0.1; s <= 3 + 1e-6; s += 0.1) { if (!clear(l, l.x + Math.cos(a) * s, l.y + Math.sin(a) * s)) break; go = s; }
      if (!best || go > best.go + 1e-6) best = { a, go };
      if (go >= 3 - 1e-6) break;
    }
    dropLinks(l);
    l.x += Math.cos(best.a) * best.go; l.y += Math.sin(best.a) * best.go;
    moves.push({ u: l, from });
    if (best.go < 3 - 1e-6) down.push(l);
  }
  return { moves, down };
}
// Whether model u could stand at (x, y): on the table, off blocking terrain, not overlapping another model.
function clear(u, x, y) {
  if (x < u.r || y < u.r || x > G.W - u.r || y > G.H - u.r) return false;
  if (G.terrain.some(T => ['rock', 'building', 'water', 'wall', 'hedge'].includes(T.k) && squareHits(x, y, u.r, T))) return false;
  return !G.units.some(o => o !== u && alive(o) && Math.hypot(o.x - x, o.y - y) < o.r + u.r - 0.02);
}
// The D3+3″ a Monster may Move after a Barge (it may Charge again).
export function bargeMove() { const v = d6(); return { v, d: 3 + Math.ceil(v / 2) }; }
// Hurl: the D3 plus the Strength difference gives the Hurl Distance; an Intelligence Test; then the target (picked by the
// Monster on a pass, by the Hurled model's side on a failure), else a point within the distance. The Hurled model
// suffers two Strength 6 hits (both parts of a Cavalry model; Knocked Flying unless Strength 6+), lands Prone in base
// contact with the target, which is knocked Prone if Strength 5 or less (Knocked Flying on horseback) and suffers one
// Strength 6 hit. Returns { d3, dist, T, target, hits: [{ u, part, W }] , flying: [models to throw] , slain: [] }.
export function* hurlSeq(w, t) {
  const die = { n: d6(), v: 0, ok: true }; die.v = die.n;
  const d3 = Math.ceil(die.n / 2), dist = d3 + Math.max(0, w.s - t.s);
  yield { k: 'dice', step: 'hurl', u: w, die, label: `Hurl: D3 (${d3}) + Strength ${w.s} − ${t.s} = ${dist}″` };
  const T = yield* intelligenceSeq(w, 'Hurl');
  const list = sideAlive(t.side).filter(o => o !== t && o.hurledAt !== G.turn && gap(w, o) <= dist + 1e-6 && !losBlocked(w, o));
  let target = list.length ? yield { k: 'hurlAt', side: T.ok ? w.side : t.side, u: w, t, list, pass: T.ok } : null;
  if (target && !list.includes(target)) target = list[0];
  if (!target && list.length) target = list[0];
  const out = { d3, dist, T, target, hits: [], flying: [], slain: [], point: null };
  dropLinks(t);
  const from = { x: t.x, y: t.y };
  if (target) {
    target.hurledAt = G.turn;
    const dx = w.x - target.x, dy = w.y - target.y, L = Math.hypot(dx, dy) || 1, r = target.r + t.r + 0.01;
    const Q = nearestFree(t, { x: target.x + dx / L * r, y: target.y + dy / L * r });
    t.x = Q.x; t.y = Q.y;
  } else {
    // No target: a point within the Hurl Distance, away from the Monster's own side.
    const a = Math.atan2(t.y - w.y, t.x - w.x), Q = nearestFree(t, { x: Math.max(t.r, Math.min(G.W - t.r, w.x + Math.cos(a) * (w.r + dist))), y: Math.max(t.r, Math.min(G.H - t.r, w.y + Math.sin(a) * (w.r + dist))) });
    t.x = Q.x; t.y = Q.y; out.point = Q;
  }
  out.from = from;
  const hit = function* (x, n) {
    for (const part of x.cav ? ['rider', 'mount'] : ['rider']) for (let i = 0; i < n; i++) {
      const W = yield* woundRoll(null, x, { s: 6, part, label: `Hurl: Strength 6 hit on ${x.name}${x.cav ? (part === 'mount' ? ` (its ${x.mount.n.toLowerCase()})` : ' (the rider)') : ''}` });
      out.hits.push({ u: x, part, W });
    }
  };
  yield* hit(t, 2);
  if (t.cav) { if (t.s < 6 && t.mount.s < 6) out.flying.push(t); } else t.prone = true;
  if (target) {
    if (target.cav) out.flying.push(target); else if (target.s <= 5) target.prone = true;
    yield* hit(target, 1);
  }
  return out;
}
// Monstrous Charge after a won Duel Roll: every beaten model with less Strength than a charging winner with the rule is
// knocked Prone before the Strikes; Cavalry are Knocked Flying. Returns { down: [infantry], flying: [cavalry] }.
export function monstrousDown(W, L) {
  const mc = W.filter(w => alive(w) && monstrousCharge(w));
  const out = { down: [], flying: [] };
  if (!mc.length) return out;
  const s = Math.max(...mc.map(w => w.s));
  for (const l of L.filter(l => alive(l) && l.s < s)) {
    if (l.cav) out.flying.push(l);
    else if (!l.prone) { l.prone = true; out.down.push(l); }
  }
  return out;
}

/* ---------- The computer's choice ---------- */
// Strikes, Rend, Hurl or Barge, whichever looks best: Rend when the target's Strength is much lower than its Defence,
// Hurl when it can throw a light model at another enemy, Barge only against three or more.
export function aiBrutal(q) {
  const w = q.u, o = q.opts, n = rendRolls(w);
  const val = t => (isHero(t) ? 3 : 1) / Math.max(1, t.w);
  const strikeV = Math.max(...o.rend.map(t => n * pNeed(woundNeed(w.s, t.d)) * val(t)));
  let best = null, bv = strikeV + 0.05;
  for (const t of o.rend) { const v = n * pNeed(woundNeed(w.s, t.cav ? Math.min(t.s, t.mount.s) : t.s)) * val(t); if (v > bv) { bv = v; best = { k: 'rend', t, part: t.cav && t.mount.s < t.s ? 'mount' : 'rider' }; } }
  for (const t of o.hurl) { const v = 2 * pNeed(woundNeed(6, t.d)) * val(t) + 0.6; if (v > bv) { bv = v; best = { k: 'hurl', t }; } }
  if (o.barge && o.rend.length >= 3 && bv < 1) best = { k: 'barge' };
  return best;
}
// The target of a Hurl: the Monster aims at the enemy that would suffer most; the victim's side at the toughest.
export function aiHurlAt(q) {
  const score = x => (isHero(x) ? 3 : 1) * pNeed(woundNeed(6, x.d)) + (x.s <= 5 ? 0.5 : 0);
  const L = q.list.slice().sort((a, b) => score(b) - score(a));
  return q.side === q.u.side ? L[0] : L[L.length - 1];
}
