// Advanced rules (2024 Rules Manual, p. 132–136) that are not about water (terrain.js) or night (rules.js): Sentries.
// No drawing and no DOM here.
//
// A Sentry is a model with u.sentry (a mission's unit entry: sentry: true). Until its side's alarm is raised
// (G.alarm[side]) it Activates first in its side's Move phase after a roll on the Sentry Chart, cannot shoot, Cast or use
// special rules that target enemies. The alarm goes up in the End phase when a Sentry is within 3″ of an enemy it can
// see, or was hit by a Shooting Attack and survived.
// Requests: { k: 'sentryMove', side, u, opts } answered with one of opts (where the other side moves the Sentry) or null.
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap } from './geometry.js';
import { alive, sideAlive, losBlocked, bestApproach, moveVal, engaged, invisible } from './rules.js';
import { d6Test, courageSeq } from './dice.js';

export const isSentry = u => !!(u && u.sentry && G && !(G.alarm && G.alarm[u.side]));
// The Sentries of a side still on watch.
export const sentries = side => sideAlive(side).filter(isSentry);
// The Sentry Chart (p. 135): 1 it may not Move; 2–3 the other player Moves it up to half its Move; 4–5 its own player,
// half; 6 its own player, normally. Returns { v, who: null | 'foe' | 'own', lim }.
export function sentryRoll(u) {
  const v = d6();
  if (v === 1) return { v, who: null, lim: 0 };
  if (v <= 3) return { v, who: 'foe', lim: moveVal(u) / 2 };
  if (v <= 5) return { v, who: 'own', lim: moveVal(u) / 2 };
  return { v, who: 'own', lim: moveVal(u) };
}
// Where the other player may move a Sentry: plain moves (no Charge) in eight directions, each as far as lim allows.
export function sentryOptions(u, lim) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, P = bestApproach(u, { x: u.x + Math.cos(a) * 40, y: u.y + Math.sin(a) * 40 }, lim);
    if (P && P.cost > 0.3) out.push({ x: P.x, y: P.y, cost: P.cost, label: ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][k] });
  }
  return out;
}
// The computer moving the other side's Sentry: as far from its own models as it can.
export function aiSentryMove(q) {
  const mine = sideAlive(q.side);
  const score = o => Math.min(99, ...mine.map(m => Math.hypot(m.x - o.x, m.y - o.y)));
  return q.opts.slice().sort((a, b) => score(b) - score(a))[0] || null;
}
// End phase: the sides whose alarm goes up now. Returns [{ side, by: the Sentry, why: 'near' | 'shot', e }].
export function alarmCheck() {
  const out = [];
  if (!G.units.some(u => u.sentry)) return out;
  G.alarm = G.alarm || {};
  for (const side of ['good', 'evil']) {
    if (G.alarm[side]) continue;
    for (const s of sentries(side)) {
      const e = sideAlive(side === 'good' ? 'evil' : 'good').find(o => gap(s, o) <= 3 + 1e-6 && !losBlocked(s, o));
      if (e || s.shotHit === G.turn) { G.alarm[side] = true; out.push({ side, by: s, why: e ? 'near' : 'shot', e }); break; }
    }
  }
  return out;
}

/* ---------- The One Ring (p. 111) ---------- */
// Who carries the Ring when several could: the highest on the table keeps it (both, if two share the top place).
const RING_RANK = [/^The Dark Lord Sauron/, /^Isildur/, /^Bilbo Baggins(, Master Burglar)?$/, /^Frodo/, /^Bilbo Baggins, Ageing/, /^Gollum/];
const ringRank = u => { const k = RING_RANK.findIndex(re => re.test(u.T.n)); return k < 0 ? 99 : k; };
export function settleRing(units) {
  const rb = units.filter(u => u.T.ring);
  if (rb.length < 2) return;
  const top = Math.min(...rb.map(ringRank));
  for (const u of rb) if (ringRank(u) !== top) u.noRing = true;
}
export const ringbearer = u => !!(u && u.T.ring && !u.noRing && alive(u));
const awoken = u => !(u.T.rules || []).includes('It Has Not Yet Awoken');   // Bilbo: no Sauron's Will, no My Precious
// Putting the Ring on during the model's Activation (not while Engaged): it is Invisible. A mount bolts and leaves the
// battlefield, and the rider takes the Thrown Rider Test (the caller). Returns 'mounted' or true.
export const canWearRing = u => ringbearer(u) && !u.ringOn && !engaged(u);
export function putOnRing(u) {
  u.ringOn = true;
  if (u.cav) { u.mountSlain = true; u.mount.loose = null; return 'mounted'; }
  return true;
}
// Sauron's Will: a Ringbearer that starts its Activation wearing the Ring rolls a D6 (Might may raise it); on a 1–2 the
// other player Moves it this turn (it passes Terror tests to Charge). Returns the dice, or null with no test.
export function* sauronSeq(u) {
  if (!u.ringOn || !awoken(u) || u.sauronAt === G.turn) return null;
  u.sauronAt = G.turn;
  const die = yield* d6Test(u, 3, { step: 'sauron', label: `Sauron's Will: ${u.name} keeps control on 3+` });
  u.sauron = !die.ok;
  return die;
}
// Taking the Ring off: a Courage Test; on a failure it stays on until next turn.
export function* removeRingSeq(u) {
  if (u.ringTried === G.turn) return { ok: false, again: true };
  u.ringTried = G.turn;
  const T = yield* courageSeq(u, 'ring');
  if (T.ok) u.ringOn = false;
  return T;
}
// The computer's choice for its Ringbearer as it Activates: on when an enemy could reach it this turn, off again when
// none is within 12″. Returns 'on', 'off' or null.
export function aiRing(u) {
  if (!ringbearer(u)) return null;
  const foes = G.units.filter(o => alive(o) && o.side !== u.side);
  const near = d => foes.some(o => gap(o, u) <= d);
  if (!u.ringOn && !engaged(u) && near(10)) return 'on';
  if (u.ringOn && !near(12) && u.ringTried !== G.turn) return 'off';
  return null;
}
// My Precious (matched play): a Ringbearer wearing the Ring as the last model of its side is lost to it.
export function myPrecious() {
  const out = [];
  for (const side of ['good', 'evil']) {
    const left = sideAlive(side);
    if (left.length === 1 && ringbearer(left[0]) && invisible(left[0]) && awoken(left[0])) { left[0].dead = true; out.push(left[0]); }
  }
  return out;
}
