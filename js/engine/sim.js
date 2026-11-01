// The headless game: the 2024 turn sequence with every decision taken by a "brain" for each side, and every roll made
// by the same procedures the game uses (dice.js, rules.js: shotSeq, combat.js: duelSeq and strikeSeq, heroes.js).
// tools/balance.mjs plays mission strategies against the computer with it; tools/matched-check.mjs and
// tools/hero-check.mjs let the computer play both sides. js/game/flow.js goes through the same steps in the same order,
// with the player's clicks, the dice tray and the log:
//   Priority phase: Broken armies are checked (p. 61), then the roll for Priority (p. 24).
//   Move phase (p. 26): Declare Heroic Actions (p. 79), the Heroic Moves (p. 80–81, a D6 when both sides have one), the
//     Activation phase of the side with Priority, then of the other side. A model's Activation starts with its Courage
//     Test in a Broken army (p. 61); a Hero on a Heroic March may shout At the Double as it Activates (p. 83).
//   Shoot phase (p. 40): Declare Heroic Actions, the Heroic Shoots (with Loose), then each side shoots, Priority first.
//   Fight phase (p. 48): the side with Priority Pairs Off, Declare Heroic Actions, the Heroic Combats first (p. 82), then
//     the other Combats in the order the side with Priority picks. Each Combat (p. 50): Heroic Strike's D3 (p. 86),
//     Shielding (Priority first), the Duel Roll (dice, modifiers, re-rolls, Might), Backing Away, Strikes, casualties.
//   End phase.
import { G, setG } from '../state.js';
import { d6 } from '../util.js';
import * as R from './rules.js';
import * as C from './combat.js';
import * as H from './heroes.js';
import * as TR from './terrain.js';
import * as SP from './special.js';
import * as M from './magic.js';
import * as MO from './monsters.js';
import * as ADV from './advanced.js';
import * as SG from './siege.js';
import * as BE from './beasts.js';
import * as FO from './fortress.js';
import * as SC from './scenarios.js';
import * as MATCH from './matched.js';
import * as N from './named.js';
import * as NR from './narrative.js';
import { run, isHero, d6Test, courageSeq, intelligenceSeq } from './dice.js';
import { buildUnits, freshTurn } from './setup.js';
import { aiPlanMove, aiPickShot, aiMoveOrder, aiAnswer, askSide, aiShout } from './ai.js';

// Charges the computer made, and those that ended out of base contact (matched-check reports them).
export const stats = { charges: 0, missed: 0, casts: {}, brutal: {}, siege: { shots: 0, hits: 0, slain: 0, disabled: 0 }, ramps: { n: 0, impacts: 0, slain: 0, stampedes: 0 }, ladders: { up: 0, push: 0, down: 0, gate: 0 }, cross: { n: 0, ok: 0 } };   // casts: power -> [tried, Cast, Resisted]; brutal: Brutal Power Attacks and free Strikes

/* ---------- Brains ---------- */
// A brain decides for one side. Every method is optional: what a brain leaves out, the computer decides.
//   takePriority()        whether to take Priority after winning the roll
//   move(side)            moves the side's models in its Activation phase (each through applyMove, which Activates it)
//   shoot(s)              the shot model s takes ({ t, i } as from ai.js: aiPickShot) or null
//   shield(c, side, o)    whether its models in Combat c declare Shielding (o: what the other side declared so far)
//   weapon(u, c)          'hand' or 'two': the Melee Weapon model u fights with in Combat c, when it has a choice
//   throwAt(u, t)         whether u, Charging t, throws its throwing weapon first
//   answer(q)             the answer to a question from a rolling procedure or a Declare Heroic Actions step
//   pair(opts)            which way to Pair Off a group of fighting models (one of the legal ways)
//   pickHeroic(list, k)   which of its Heroes performs its Heroic Move, Shoot or Combat next
//   shout(h, k)           whether Hero h shouts With Me, At the Double, Loose or Take Aim
//   cast(u)               the Magical Power u Casts as it Activates ({ pw, t, n, part } as from magic.js: aiCast) or null
//   heroicMove(list)      moves the models of a Heroic Move (the Hero, then those its With Me reached), or the
//                         winners of a successful Heroic Combat (they may only Move or Charge)
export const COMPUTER = {
  takePriority: () => true,
  move(side) {
    for (const u of aiMoveOrder(R.sideAlive(side).filter(R.canMove))) {
      if (!R.canMove(u)) continue;
      if (H.declared(u, 'march') && !u.shouted) {   // At the Double is shouted as the marching Hero Activates
        if (!activate(u)) continue;
        if (u.drum || brainOf(side).shout(u, 'march')) H.shout(u, 'march');   // a war drum always shouts
      }
      if (ADV.ringbearer(u)) {   // the One Ring: Sauron's Will first, then on or off
        run(ADV.sauronSeq(u), answer);
        const a = ADV.aiRing(u);
        if (a === 'on') { if (!activate(u)) continue; if (ADV.putOnRing(u) === 'mounted') run(C.thrownRiderSeq(u), answer); if (!R.alive(u) || !R.canMove(u)) { u.done = true; continue; } }
        else if (a === 'off') run(ADV.removeRingSeq(u), answer);
      }
      const c = M.castable(u).length ? brainOf(side).cast(u) : null;   // a Magical Power before it moves
      if (c) { if (!activate(u)) continue; cast(u, c); if (!R.alive(u) || !R.canMove(u)) { u.done = true; continue; } }
      if (BE.rams(u)) { if (activate(u) && R.canMove(u)) ramp(u, BE.aiRamp(u)); u.done = true; continue; }   // a Chariot Charge or a Trample
      const Lp = FO.pushable(u);   // a defender at the top of an enemy Siege Ladder pushes it down
      if (Lp) { if (!activate(u)) continue; const P = run(FO.pushSeq(u, Lp), answer); stats.ladders.push++; if (P.ok) { stats.ladders.down++; for (const o of P.fell) if (R.alive(o)) { o.over = null; fall(o, Lp.z); } } continue; }
      const act = aiPlanMove(u);
      if (!act) { if (u.shouted) u.done = true; continue; }
      computerMove(u, act);
    }
  },
  cast: u => M.aiCast(u),
  shoot: s => aiPickShot(s),
  shield: (c, side, other) => C.shieldPays(c, side, other),
  weapon: (u, c) => C.aiWeapon(u, c),
  throwAt: () => true,
  answer: q => aiAnswer(q),
  pair: (opts, side) => C.bestPartition(opts, side),
  pickHeroic: list => list[0],
  shout: (h, k) => aiShout(h, k),
  heroicMove(list) { for (const u of list) { if (!R.canMove(u)) { u.done = true; continue; } const act = aiPlanMove(u); if (act) computerMove(u, act); u.done = true; } },
};
function computerMove(u, act) {
  if (act.cross) return crossMove(u, act.cross);
  applyMove(u, act.p, act.cost);
  if (act.charge && !R.alive(act.charge) && R.canMove(u)) { const again = aiPlanMove(u); if (again) return computerMove(u, again); u.done = true; }   // its throw slew the target
  if (act.charge && !R.alive(act.charge)) { u.done = true; return; }   // its throw slew the target and nothing else is in reach
  if (act.charge && R.alive(u) && !u.frozen) { stats.charges++; if (!R.engaged(u)) { stats.missed++; (stats.misses || (stats.misses = [])).push(`${u.name}${u.cav ? ' (mounted)' : ''}${SP.rule(u, 'Fly') != null ? ' (flying)' : ''} → ${act.charge.name}, gap ${R.alive(act.charge) ? (Math.hypot(u.x - act.charge.x, u.y - act.charge.y) - u.r - act.charge.r).toFixed(2) : 'dead'}`); } }
  if (u.ai === 'runner' && G.m.escapeX != null && u.x >= G.m.escapeX) u.gone = true;
}
// The computer's Jump, Leap or Climb (ai.js: crossPlan, the same steps as flow.js: doCross): it Activates, Stands Up
// if Prone, walks up to the barrier and takes the test. A 1 stays put, falls (Falling Damage) or throws a rider; a 2–5
// ends the Move across, with a Charge if it landed in an enemy's Control Zone (p. 33–35); a 6 may carry on.
function crossMove(u, X) {
  if (!activate(u)) return;
  if (!u.moveStart) u.moveStart = { x: u.x, y: u.y };
  R.dropLinks(u);
  if (X.stand) { u.prone = false; u.movedDist += X.stand; }
  if (X.approach > 0.01) { u.x = X.contact.x; u.y = X.contact.y; u.movedDist += X.approach; }
  const res = TR.applyCross(u, X, run(TR.crossTestSeq(u, X), answer));
  stats.cross.n++; if (res.result !== 'fail') stats.cross.ok++;
  if (res.thrown && !res.fall) { run(C.thrownRiderSeq(u), answer); u.done = true; return; }
  if (res.fall) { fall(u, res.fall.f); u.done = true; return; }
  if (res.result === 'stop' && res.landed) {
    const fc = TR.forcedCharge(u);
    if (fc && fc.spot) { R.dropLinks(u); u.charged = true; N.charged(u); u.x = fc.spot.x; u.y = fc.spot.y; u.movedDist += fc.spot.cost; }
  }
  if (res.result === 'go' && R.canMove(u)) { const again = aiPlanMove(u); if (again && !again.cross) { u.done = false; return computerMove(u, again); } }
  u.done = true;
}
let brains = { good: COMPUTER, evil: COMPUTER };
const brainOf = side => new Proxy(brains[side] || COMPUTER, { get: (b, k) => (b[k] !== undefined ? b[k] : COMPUTER[k]) });
// Every question goes to the brain of the side it asks; questions a brain does not answer go to the computer.
export function answer(q) {
  const side = askSide(q);
  if (!side) return undefined;
  const b = brains[side];
  const a = b && b.answer ? b.answer(q) : undefined;
  return a === undefined ? aiAnswer(q) : a;
}
const order = () => (G.priority === 'good' ? ['good', 'evil'] : ['evil', 'good']);

/* ---------- A game ---------- */
// Starts a game of mission m without drawing anything. opt: { mi: the mission's index, broken: Broken armies are in
// play, shielding: models may Shield, heroics: the Heroic Actions in play (keys of heroes.js: HEROIC), align: Good and
// Evil sides for matched play, standFast: Stand Fast is in play, units: models built already, specials: the special rules
// in play (keys of special.js: SPECIALS; left out: all of them) }.
// Fog of War: the computer's secret picks for a side that has none yet (the player picks in the game).
function fogFor(m) { if (m.scen === 'fog' && m.fog) for (const s of ['good', 'evil']) if (!m.fog[s]) m.fog[s] = MATCH.fogPicks(s, G.units, G.terrain, G.H); }
export function startGame(m, opt = {}) {
  setG({ mi: opt.mi || 0, m, W: m.board[0], H: m.board[1], units: opt.units || buildUnits(m), terrain: m.terrain, turn: 1, priority: 'good', chooser: null, phase: null,
    align: opt.align || m.align || null, start: m.start || { good: m.units.filter(u => u.side === 'good').length, evil: m.units.filter(u => u.side === 'evil').length },
    broken: opt.broken ? { good: false, evil: false } : null, shielding: !!opt.shielding, heroics: new Set(opt.heroics || []), challenges: [],
    standFastOn: !!opt.standFast, standFast: null, combats: null, specials: opt.specials ? new Set(opt.specials) : null, objectives: m.objectives || null });
  fogFor(m);
  return G;
}
// Plays one turn. b: { good, evil } brains. Returns the mission's result ('win', 'lose', 'draw') when it ends, else null.
export function playTurn(b = {}) {
  brains = { good: b.good || COMPUTER, evil: b.evil || COMPUTER };
  const g = G, m = g.m, trace = b.trace;
  g.units.forEach(freshTurn); g.units.forEach(H.mightyHero); M.staffTurn(g.units); g.standFast = g.standFastOn ? { good: [], evil: [] } : null; g.combats = null;
  // Priority phase (p. 24). Broken armies are checked at the start of the turn (p. 61).
  g.phase = 'priority';
  R.checkBroken();
  const fixed = typeof m.priority === 'string' ? m.priority : m.priority && m.priority[g.turn];
  if (fixed) g.priority = fixed;
  else {
    // "Do you think the eyes of the white tower are blind?" (named.js): Denethor's side wins the roll.
    const claim = N.priorityClaim();
    let a, c;
    do { a = d6(); c = d6(); } while (a === c && g.turn === 1);
    const chooser = claim && claim !== 'roll' ? claim : a > c ? 'good' : c > a ? 'evil' : (g.chooser === 'good' ? 'evil' : 'good');
    g.chooser = chooser;
    g.priority = brainOf(chooser).takePriority(g) ? chooser : H.foeOf(chooser);
    N.priorityGiven(chooser);
  }
  // Move phase (p. 26).
  g.phase = 'move';
  run(H.declareSeq('move'), answer);
  let r = heroicMoves();
  if (r) return r;
  for (const side of order()) {
    H.resolveStandFast(side);
    sentryActs(side);   // Sentries Activate first (p. 135)
    for (const u of R.sideAlive(side).filter(BE.isWarBeast)) beastStart(u);   // a Stampede first; a War Beast Trampling those that Charged it
    brainOf(side).move(side);
    if (reinforce(side).length) brainOf(side).move(side);   // Warbands arriving (Hold Ground, Reconnoitre) Activate at once
    if (hordes(side).length) brainOf(side).move(side);   // a Narrative Scenario's slain coming back (narrative.js)
    for (const u of R.idleActivations(side)) activate(u);   // the models that stood still Activate too
    quench(side);
    if (trace) trace(`move ${side}`);
    r = m.check(false); if (r) return r;
  }
  light();
  H.endMovePhase();
  // Shoot phase (p. 40).
  g.phase = 'shoot';
  R.readyStones(g.units);
  if (!m.noShoot) {
    run(H.declareSeq('shoot'), answer);
    takeAim();
    r = heroicShoots(); if (r) return r;
    for (const side of order()) {
      for (const e of R.sideAlive(side).filter(SG.isSiege)) { const best = SG.aiSiegeShot(e); if (best) siegeFire(e, best.t); }   // the crew firing an engine do not shoot themselves
      for (const s of R.sideAlive(side).filter(u => (u.bow || u.missiles.length) && !u.shot)) {
        while (R.alive(s) && !s.shot && !R.shooterReason(s)) { const best = brainOf(side).shoot(s); if (!best) break; fire(s, best.t, best.i); }   // a sling may shoot twice
      }
      r = m.check(false); if (r) return r;
    }
  }
  // Fight phase (p. 48).
  g.phase = 'fight';
  C.forthEorlingas();   // Army of Edoras: once per game, after the General Charged
  N.warriorPoet(R.engaged);   // Háma may spend a Will Point
  r = fightPhase(trace); if (r) return r;
  batterGates();   // the attackers touching a gate that did not fight Strike it (p. 159)
  g.phase = 'end';
  endMagic();
  ADV.alarmCheck();
  stats.siege.disabled += SG.disableCheck().length;
  if (G.m.matched) ADV.myPrecious();   // My Precious: a lone Ringbearer wearing the Ring is lost
  if (G.m.scen === 'supplies') SC.destroySupplies();
  return m.check(false) || m.check(true);
}
// Plays until the mission ends (or maxTurns), returns { r, turn }.
export function playGame(b = {}, maxTurns = 60) {
  for (;;) {
    const r = playTurn(b);
    if (r) return { r, turn: G.turn };
    if (G.turn >= maxTurns) return { r: 'unfinished', turn: G.turn };
    G.turn++;
  }
}

/* ---------- Activations ---------- */
// The start of model u's Activation (p. 26, 61): in a Broken army a Courage Test before anything else, unless Heroic
// Resolve or a Hero's Stand Fast passes it; a Hero may add Will and Might. A Hero that passes calls Stand Fast.
// Returns false when u fled.
export function activate(u) {
  if (TR.needsSwim(u) && TR.applySwim(u, run(TR.swimSeq(u), answer)) === 'sink') return false;   // Deep Water: a Swim Test first (p. 132)
  if (!R.needsCourage(u)) return true;
  u.tested = true;
  const ok = H.autoCourage(u) ? true : run(courageSeq(u, 'broken'), answer).ok;
  if (!ok) { R.flee(u); return false; }
  if (isHero(u)) H.callStandFast(u);
  return true;
}
// The Courage Tests at the start of a Move that Charges t (special.js: chargeTests): Terror, Fearful. A model that fails
// one cannot Move this turn (p. 124, 130) but may still shoot. Returns whether u may Charge.
export function chargeNerve(u, t) {
  for (const k of SP.chargeTests(u, t)) {
    if (u.sauron && k === 'terror') continue;   // a Ringbearer Moved by the other player passes Terror (p. 111)
    // Timid: no rule passes the Mount's test for it (p. 132).
    if (!((k !== 'timid' && SP.autoPass(u)) || run(courageSeq(u, k), answer).ok)) { u.frozen = true; u.done = true; return false; }
    u.passed.add(k);
  }
  return true;
}
// A throw as u Charges along to P (rules.js: throwSpot): u stops 1″ from the target and throws. Returns true when the
// target still stands (the Charge goes on as planned, or to a new spot it returns when the target moved), false when it
// fell: u stays there with the rest of its Move.
function throwFirst(u, P, cost) {
  const t = P.charge, Q = R.throwSpot(u, P, t), from = { x: u.x, y: u.y };
  u.x = Q.x; u.y = Q.y;
  const info = R.throwInfo(u, t);
  if (!info.ok) { u.x = from.x; u.y = from.y; return true; }
  u.threw = true; u.throwing = true;
  try { fire(u, t, info); } finally { u.throwing = false; }
  if (R.alive(t)) {   // the Charge goes on; if the throw moved the target (a rider thrown from its mount), aim anew
    u.x = from.x; u.y = from.y;
    return R.chargeSpot(u, t, R.remaining(u)) || true;
  }
  if (!u.moveStart) u.moveStart = from;
  R.dropLinks(u); u.movedDist += cost * Q.frac;
  return false;
}
// An Intelligence Test model u takes for rule why (p. 62): a test passed for the same rule this turn counts as passed
// again (Taking Multiple Intelligence Tests). mod: the rule's bonus or penalty. Returns whether it passed.
export function intelligence(u, why, mod = 0) {
  const k = `int:${why}`;
  if (u.passed.has(k)) return true;
  const ok = run(intelligenceSeq(u, why, mod), answer).ok;
  if (ok) u.passed.add(k);
  return ok;
}
// Moves model u to P (Activating it first, see activate). Mission strategies call it for every move they make.
export function applyMove(u, P, cost) {
  if (!activate(u)) return;
  if (P.charge && !chargeNerve(u, P.charge)) return;
  // Charging an Invisible model: an Intelligence Test, −1 for each full inch to it (p. 127); a failure ends the Move.
  if (P.charge && R.invisible(P.charge) && !intelligence(u, `invisible:${P.charge.id}`, -Math.floor(Math.hypot(u.x - P.charge.x, u.y - P.charge.y) - u.r - P.charge.r + 1e-9))) { u.done = true; u.frozen = true; return; }
  if (P.charge && R.throwWeapon(u, P.charge) && brainOf(u.side).throwAt(u, P.charge)) {
    const r = throwFirst(u, P, cost);
    if (!r) return;
    if (r !== true) { P = r; cost = r.cost; }
  }
  if (!u.moveStart) u.moveStart = { x: u.x, y: u.y };
  R.dropLinks(u); if (P.over) u.over = { T: P.over.T, t: P.over.t };   // a Charge over a Barrier links the charger to the defender
  if (P.charge) { u.charged = true; N.charged(u); }   // the Cavalry Charge bonus; Faramir's Charge
  u.x = P.x; u.y = P.y; u.movedDist += cost; u.done = true; if (P.stand) u.prone = false;
  if (u.carry) FO.raiseLadder(u);   // a Siege Ladder carried against the wall goes up (p. 160)
  SC.escapes(u);   // Reconnoitre: off the enemy's edge
}
// The Heroic Moves (p. 80–81), before either side's Activation phase: in the order of the D6 when both sides have one.
// The Hero Activates (and shouts With Me as it does); the friends its shout reached then Activate, finishing within 6″
// of it, or forego their Activation. A Hero Charged before its turn loses its Heroic Move.
function heroicMoves() {
  const Q = H.heroicQueue('move');
  for (let s; (s = Q.next()); ) {
    const B = brainOf(s), h = B.pickHeroic(Q.left(s), 'move');
    Q.done(h);
    if (!H.stillPossible(h, 'move')) { H.cancel(h, 'move'); continue; }
    if (!activate(h)) continue;   // fled: the Heroic Move and its With Me are cancelled
    const withMe = B.shout(h, 'move') ? H.shout(h, 'move') : [];
    B.heroicMove([h]);
    h.done = true;
    if (!R.alive(h)) { withMe.forEach(o => { o.tether = null; }); continue; }   // the Hero fell: With Me is cancelled
    // Every model With Me reached Activates now, even one that gives up its move, so in a Broken army it takes its
    // Courage Test (FAQ, Rules Manual p. 60).
    B.heroicMove(withMe.filter(o => R.alive(o) && activate(o)));
    withMe.forEach(o => { o.done = true; });
    const r = G.m.check(false); if (r) return r;
  }
  return null;
}

/* ---------- Sentries (advanced.js) ---------- */
// Each Sentry on watch Activates before the side's other models, after its roll on the Sentry Chart.
function sentryActs(side) {
  for (const u of ADV.sentries(side)) {
    if (u.done || !R.alive(u) || !activate(u)) continue;
    const S = ADV.sentryRoll(u);
    if (S.who && R.canMove(u)) {
      if (S.who === 'own') { u.movedDist = Math.max(0, R.moveVal(u) - S.lim); brainOf(side).heroicMove([u]); }
      else { const o = answer({ k: 'sentryMove', side: H.foeOf(side), u, opts: ADV.sentryOptions(u, S.lim) }); if (o) { R.dropLinks(u); u.x = o.x; u.y = o.y; } }
    }
    u.done = true;
  }
}

/* ---------- Magic (magic.js) ---------- */
// Model u Casts c = { pw, t, n, part }: the Casting and Resist Tests, then what the power does. Returns the Casting
// result (magic.js: castSeq) with the effect (E).
export function cast(u, c) {
  const Rc = run(M.castSeq(u, c.pw, c.t, c.n), answer), k = M.powerKey(c.pw.n), s = stats.casts[k] || (stats.casts[k] = [0, 0, 0]);
  s[0]++; if (Rc.cast) s[1]++; if (Rc.resisted) s[2]++;
  if (!Rc.ok) return Rc;
  const E = run(M.effectSeq(u, c.pw, c.t, Rc, c.part), answer);
  for (const x of E.slain) if (!x.fled) C.separateMount(x);
  if (E.mountSlain && R.alive(E.mountSlain)) run(C.thrownRiderSeq(E.mountSlain), answer);
  Rc.E = E;
  return Rc;
}
// The End phase (p. 115, 133): Temporary powers end, an Enraged Beast suffers its Wound, Will of Evil.
function endMagic() {
  const E = M.endPhase();
  for (const u of E.hurt) if (R.alive(u)) wound(u, 'rider', null);
  run(M.paralyseSeq(), answer);   // at the end of the End phase
}

/* ---------- Shooting ---------- */
// Take Aim (p. 84): a Hero on a Heroic Accuracy may shout it; its friends within 6″ re-roll failed In The Way Tests too.
function takeAim() {
  for (const h of G.units) if (R.alive(h) && H.declared(h, 'accuracy') && !h.shouted && brainOf(h.side).shout(h, 'accuracy')) H.shout(h, 'accuracy');
}
// The Heroic Shoots (p. 82), before either side shoots: the Hero shoots, and with Loose its friends within 6″ shoot at the
// same time; a friend that does not shoot then cannot shoot later in the phase.
function heroicShoots() {
  const Q = H.heroicQueue('shoot');
  for (let s; (s = Q.next()); ) {
    const B = brainOf(s), h = B.pickHeroic(Q.left(s), 'shoot');
    Q.done(h);
    if (!H.stillPossible(h, 'shoot')) { H.cancel(h, 'shoot'); continue; }
    const loose = B.shout(h, 'shoot') ? H.shout(h, 'shoot') : [];
    for (const u of [h, ...loose]) {
      if (!R.alive(u) || !u.bow || u.shot || R.shooterReason(u)) { if (loose.includes(u)) u.shot = true; continue; }
      const best = B.shoot(u);
      if (best) fire(u, best.t, best.i); else if (loose.includes(u)) u.shot = true;
    }
    const r = G.m.check(false); if (r) return r;
  }
  return null;
}
// One Shooting Attack (rules.js: shotSeq) and the Wound it may cause.
export function fire(s, t, info) {
  const S = run(R.shotSeq(s, t, info, info.aim), answer);
  R.spendShot(s);
  if (S.wound && wound(S.target, S.part, s) === 'mountSlain') run(C.thrownRiderSeq(S.target), answer);
}
// A Siege Engine's shot (siege.js: siegeShotSeq) and what it does (p. 145): the actual Battlefield Target that is
// wounded is slain unless it prevents the Wound (Fate), a model with Defence or Wounds 10 or more loses half its
// Wounds instead, a Siege Target loses the Wounds rolled; Area Effect hits do 1 Wound each. The mount of a Cavalry
// model is resolved first; a rider whose mount is slain and who was not wounded is thrown.
export function siegeFire(e, t) {
  const n = run(SG.siegeAimSeq(e, t), answer), was = R.sideAlive(H.foeOf(e.side)).length;
  for (let i = 0; i < n && R.alive(t); i++) {   // a volley stops once its target is slain
    const sh = run(SG.siegeShotSeq(e, t), answer);
    stats.siege.shots++; if (sh.hit && sh.hit.ok) stats.siege.hits++;
    const rolls = sh.rolls.slice().sort((a, b) => (a.part === 'mount' ? -1 : 0) - (b.part === 'mount' ? -1 : 0));
    let thrown = false;
    for (const r of rolls) {
      const u = r.t;
      if (!R.alive(u) || (r.part === 'mount' && !u.cav)) continue;
      if (!r.W.ok) { if (r.part === 'rider' && thrown) run(C.thrownRiderSeq(u), answer); continue; }
      let res = wound(u, r.part, null);
      if (res === 'saved') { if (r.part === 'rider' && thrown) run(C.thrownRiderSeq(u), answer); continue; }
      const more = r.outright ? 99 : r.n - 1;
      for (let k = 0; k < more && R.alive(u) && res !== 'slain' && res !== 'mountSlain'; k++) res = wound(u, r.part, null, false);
      if (res === 'mountSlain') { thrown = true; u.prone = false; }
    }
    // Area Effect, and the models a Piercing Shot flings a model into.
    for (const a of [...sh.area, ...(sh.flung ? sh.flung.wounds : [])]) if (a.W.ok && R.alive(a.t)) { const res = wound(a.t, 'rider', null); if (res === 'mountSlain') run(C.thrownRiderSeq(a.t), answer); }
  }
  stats.siege.slain += Math.max(0, was - R.sideAlive(H.foeOf(e.side)).length);
}
// Reinforcements (Hold Ground's Maelstrom of Battle, Reconnoitre): at the end of a side's Activations, a roll for each
// Warband still off the table; one that arrives is placed at the edge point its chart gives (the computer chooses for
// either side) and Activates. Reconnoitre: +1 a turn for each failed roll, all in by turn 4. Returns the models placed.
export function reinforce(side) {
  const scen = G.m && G.m.scen;
  if (scen !== 'hold' && scen !== 'recon') return [];
  const out = [];
  for (const band of SC.warbands(side).filter(b => b.models.some(u => u.reserve && !u.dead))) {
    const c = band.captain || band.models[0];
    c.waited = c.waited || 0;
    const v = scen === 'recon' && G.turn >= 4 ? 6 : run(SC.arrivalSeq(band, scen, c.waited), answer);
    const p = SC.arrivalPoint(v, side, scen, (list, chooser) => SC.aiArrival(list, chooser, side));
    if (!p) { c.waited++; continue; }
    out.push(...SC.arrive(band, p));
  }
  return out;
}
// Narrative Scenarios (narrative.js): the slain kept aside rolling to come back; Storehouses put out by the Good side
// as its models end their Activations (the brain's quench(u) may say no), set alight at the end of the Move Phase.
function hordes(side) {
  const back = [];
  for (const u of NR.keptAside(side)) if (run(NR.hordeSeq(u), answer).ok && NR.hordeReturn(u)) back.push(u);
  return back;
}
function quench(side) {
  if (R.alignOf(side) !== 'good') return;   // by alignment: the player may command either side (missions.js: flipSide)
  for (const u of NR.quenchers()) if (!brainOf(side).quench || brainOf(side).quench(u)) run(NR.quenchSeq(u), answer);
}
function light() { for (const u of NR.lighters()) if (!brainOf(u.side).light || brainOf(u.side).light(u)) run(NR.lightSeq(u), answer); }
// The Fight phase's end in a siege: every gate is Struck by the attackers touching it that did not fight (fortress.js).
function batterGates() {
  for (const g of G.units.filter(u => FO.isGate(u) && R.alive(u))) {
    for (const { w, R: Rw } of run(FO.gateSeq(g), answer)) for (let k = 0; k < Rw.wounds && R.alive(g); k++) { wound(g, 'rider', w); if (!R.alive(g)) stats.ladders.gate++; }
  }
}
// A Chariot Charge or Trample of u towards aim (beasts.js: rampSeq), resolving the Impact Hits on each model it runs
// into as it goes. aim null: a Chariot only turns. Returns what rampSeq returned.
export function ramp(u, aim) {
  if (!aim) { BE.faceOnly(u); return null; }
  stats.ramps.n++;
  const was = R.sideAlive(H.foeOf(u.side)).length;
  const out = run(BE.rampSeq(u, aim), q => {
    if (q.k === 'impact') { stats.ramps.impacts++; hits(run(BE.impactSeq(u, q.t, q.beast), answer)); return R.alive(q.t); }
    if (q.k === 'crash') { hits(run(BE.crashSeq(u), answer)); return undefined; }
    return answer(q);
  });
  if (out.rough && !out.rough.ok && R.alive(u)) hits([{ t: u, part: 'rider', R: { wounds: 1 } }]);
  stats.ramps.slain += Math.max(0, was - R.sideAlive(H.foeOf(u.side)).length);
  return out;
}
// A War Beast at the start of its side's Activations (p. 149–151): with nobody riding it, a Courage Test; a Stampede
// (the other side picks the heading; off the table it is lost with its riders); Charged by models of no more combined
// Strength than its own, it Tramples them first and then Moves on if they all fell.
function beastStart(u) {
  if (!R.alive(u) || u.done) return;
  if (!BE.ridden(u) && !u.stampede) run(BE.stampedeSeq(u), answer);
  if (u.stampede) {
    u.stampede = false; stats.ramps.stampedes++;
    const out = ramp(u, BE.aiStampede(u));
    if (out && out.off) { u.dead = true; if (u.cmd) u.cmd.w = 0; }
    u.done = true; u.shot = true;   // its riders cannot shoot this turn
    return;
  }
  const by = BE.chargedBy(u);
  if (!by) return;
  for (const t of by) { stats.ramps.impacts++; hits(run(BE.impactSeq(u, t), answer)); }
  if (!R.engaged(u)) ramp(u, BE.aiRamp(u)); else u.done = true;
}
// Wounds from hits (Impact Hits, a crash): [{ t, part, R: { wounds } }], the mount's first; a rider whose mount is
// slain is thrown.
function hits(list) {
  for (const h of list.slice().sort((a, b) => (b.part === 'mount') - (a.part === 'mount'))) {
    for (let k = 0; k < h.R.wounds && R.alive(h.t); k++) {
      if (h.part === 'mount' && !h.t.cav) break;
      const r = wound(h.t, h.part, null);
      if (r === 'mountSlain') { run(C.thrownRiderSeq(h.t), answer); break; }
    }
  }
}
// One Wound to t (its rider or its mount) caused by w (null: nobody, as in a fall): a Hero's Fate first (p. 88); a
// Hero that slays its Heroic Challenge opponent gains a Might Point (p. 85); a rider slain in the saddle leaves its mount
// (p. 69). Returns 'saved' or what combat.js: woundPart returned.
// fate false: a Wound Fate cannot prevent (the extra Wounds of Mighty Blow and Bane Weapons).
export function wound(t, part, w, fate = true) {
  const { r } = fate ? run(C.hurtSeq(t, part), answer) : { r: C.woundPart(t, part) };
  if (r === 'slain') { if (w) { H.challengeSlain(w, t); if (G.phase === 'fight') H.hunterSlain(w, t); N.slain(w, t); } if (!t.fled) C.separateMount(t); }   // Survival Instinct: fled whole
  if (BE.isWarBeast(t)) { if (r === 'wound') run(BE.stampedeSeq(t), answer); else if (r === 'slain') BE.cmdFalls(t); }   // Stampede; its Commander falls
  return r;
}
// A fall of f inches (terrain.js): Prone at the bottom, Falling Damage deeper than the model's height (p. 36). A Cavalry
// model's fall hurts its mount and throws the rider.
export function fall(u, f) {
  u.prone = u.cav || !(C.staysUp(u) || {}).ok;   // Unyielding Combat Stance: 4+ stays up
  const Rf = TR.rollFall(u, TR.fallHits(u, f));
  if (u.cav) { for (let i = 0; i < Rf.wounds; i++) C.woundPart(u, 'mount'); u.prone = false; run(C.knockedFlyingSeq(u), answer); return; }
  for (let i = 0; i < Rf.wounds && R.alive(u); i++) wound(u, 'rider', null);
}

/* ---------- The Fight phase ---------- */
// Pairs Off the fighting models (the side with Priority decides where there is a choice) and gives each Combat its
// spears and pikes. fought: models whose Combat is over (a group made only of them is not fought again).
function pairAll(fought = new Set()) {
  const side = G.priority, B = brainOf(side);
  const cs = R.findFights().filter(g => g.some(u => !fought.has(u.id))).flatMap(g => { const o = C.pairings(g); return o.length > 1 ? B.pair(o, side) : (o[0] || []); });
  return C.assignSupport(cs);
}
function fightPhase(trace) {
  if (!R.findFights().length) return null;
  let cs = pairAll();
  G.combats = cs;
  run(H.declareSeq('fight'), answer);
  const fought = new Set();
  const finish = (c, res) => { c.done = true; c.forEach(u => fought.add(u.id)); if (trace) trace(`fight ${C.describeCombat(c)}: ${res.win}`); return G.m.check(false); };
  // Heroic Combats first, in the order of the D6 when both sides have one (p. 80, 82).
  const Q = H.heroicQueue('combat');
  for (let s; (s = Q.next()); ) {
    const h = brainOf(s).pickHeroic(Q.left(s), 'combat');
    Q.done(h);
    const c = cs.find(x => !x.done && x.includes(h));
    if (!c || !H.stillPossible(h, 'combat')) { H.cancel(h, 'combat'); continue; }
    const res = fightCombat(c);
    const r = finish(c, res); if (r) return r;
    // A successful Heroic Combat: the Hero and its friends from that Combat may Move or Charge, then the side with
    // Priority Pairs Off again.
    const movers = H.heroicCombatMovers(c, res.win);
    if (!movers.length) continue;
    for (const u of movers) { u.heroicMoved = true; u.movedDist = 0; u.done = false; u.moveStart = null; fought.delete(u.id); }
    brainOf(res.win).heroicMove(movers);
    movers.forEach(u => { u.done = true; });
    cs = [...cs.filter(x => x.done), ...pairAll(fought)];
    G.combats = cs;
  }
  // The other Combats, in the order the side with Priority picks. A Monster that Barged and Charged again fights again
  // (monsters.js): then the side with Priority Pairs Off once more.
  for (;;) {
    const c = C.orderCombats(cs.filter(x => !x.done), G.priority)[0];
    if (!c) break;
    const res = fightCombat(c);
    const r = finish(c, res); if (r) return r;
    if (res.again && R.alive(res.again) && R.engaged(res.again)) { fought.delete(res.again.id); cs = [...cs.filter(x => x.done), ...pairAll(fought)]; G.combats = cs; }
  }
  return null;
}
// One Combat (p. 50–55). Returns { win, D }.
export function fightCombat(c) {
  const goods = C.goodsOf(c), evils = C.evilsOf(c);
  if (!goods.length || !evils.length) return { win: null };
  c.forEach(u => { u.fought = true; });   // Will of Evil (magic.js: endPhase)
  run(H.combatStartSeq(c), answer);   // Heroic Strike: the D3 at the start of the Hero's first Combat
  // Shielding is declared before the Duel Roll, the side with Priority first.
  const shield = {};
  if (G.shielding) for (const s of order()) if (C.canShield(c, s) && brainOf(s).shield(c, s, { ...shield })) shield[s] = true;
  C.pickWeapons(c, shield, u => brainOf(u.side).weapon(u, c));   // the Melee Weapon each model fights with (p. 104)
  try { return fightCombatWith(c, goods, evils, shield); } finally { C.dropWeapons(c); }
}
function fightCombatWith(c, goods, evils, shield) {
  const gs = shield.good ? [] : C.supOf(c, 'good'), es = shield.evil ? [] : C.supOf(c, 'evil');
  const k = C.contactsIn(goods, evils);
  [...gs, ...es].forEach(s => { s.supported = true; });   // Destroy the Supplies: a supporter did more than Move
  const D = run(C.duelSeq(C.rollDuelDice(goods, evils, gs, es, shield), C.bannersOf(c, gs, es)), answer);
  C.noteDuel(c, D.win);
  const W = D.win === 'good' ? goods : evils, L = D.win === 'good' ? evils : goods, B = C.barrierOf(c);
  C.shieldwallSnap(c);   // Shieldwall: before Backing Away (p. 129)
  if (B && B.mode === 'barrier') {   // Strikes first (the attacker's each after In The Way 4+), nobody Trapped, then Backing Away
    const attWon = D.win === B.att.side;
    if (!shield[D.win]) for (const w of [...W.filter(w => !w.prone), ...(D.win === 'good' ? gs : es)]) {
      for (let i = 0; i < (W.includes(w) ? w.a + H.challengeBonus(w, L) : 1); i++) {
        const t = L.find(R.alive); if (!t) break;
        if (attWon && !run(d6Test(w, 4, { step: 'itw', label: `In The Way: the ${B.T.k} 4+`, ctx: { ob: { kind: 'terrain', name: B.T.k } } }), answer).ok) continue;
        strike(w, t, 1, new Set());
      }
    }
    venom(c);
    thrownRiders(c);
    if (C.mayCross(B, D.win)) C.crossBarrier(B); else C.barrierBackAway(B, D.win, k);
    return { win: D.win, D };
  }
  // Brutal Power Attacks (monsters.js): each winning Monster may use one instead of its Strikes; Hurl is nominated
  // before Backing Away, Barge replaces it, and both end the Combat.
  const brutal = [];
  if (!shield[D.win]) for (const w of W) {
    const o = MO.brutalOptions(w, L, shield); if (!o) continue;
    const a = answer({ k: 'brutal', side: D.win, u: w, opts: o });
    if (!a) continue;
    w.bpa = G.turn; brutal.push({ w, a }); stats.brutal[a.k] = (stats.brutal[a.k] || 0) + 1;
    if (a.k !== 'rend') break;
  }
  const end = brutal.find(b => b.a.k !== 'rend');
  if (end) return brutalEnd(c, end, W, L, k, D);
  const { trapped, falls } = C.backAwayAll(W, L, k);
  C.knockDown(W, L);   // a Cavalry Charge knocks the beaten infantry Prone
  const rd = BE.rampDown(W, L);   // a Chariot or War Beast that Charged and won
  for (const x of rd.flying) if (R.alive(x) && x.cav) run(C.knockedFlyingSeq(x), answer);
  const md = MO.monstrousDown(W, L);   // Monstrous Charge
  for (const x of md.flying) if (R.alive(x) && x.cav) run(C.knockedFlyingSeq(x), answer);
  const proneW = W.filter(w => w.prone);   // a Prone winner makes no Strikes and Stands Up
  for (const { w, a } of brutal) if (R.alive(a.t)) rend(w, a.t, a.part);   // Rend, before every Strike
  for (const w of shield[D.win] ? [] : W.filter(w => !proneW.includes(w) && !w.stunned && !brutal.some(b => b.w === w))) {
    const sw = C.sweepTargets(w, L);
    if (sw) { for (const t of sw) if (R.alive(t)) strike(w, t, 1, trapped); continue; }   // Berserker Blade
    for (let i = 0, n = C.strikesOf(w, L); i < n; i++) {
      const cands = C.strikeTargets(w, L, k); if (!cands.length) break;
      const t = C.bestStrikeTarget(w, cands, trapped);
      strike(w, t, 1, trapped);
      // A Monster that slays with a Strike strikes once more at each model that Supported its victim (p. 89).
      if (!R.alive(t) && MO.freeStrikes(w)) for (const s of MO.supportersOf(c, t)) if (R.alive(s)) { stats.brutal.free = (stats.brutal.free || 0) + 1; strike(w, s, 1, trapped); }
    }
  }
  for (const sp of D.win === 'good' ? gs : es) {   // a Supporting spear or pike: one Strike at any enemy in the Combat
    const cands = L.filter(R.alive); if (!cands.length) break;
    strike(sp, C.bestStrikeTarget(sp, cands, trapped), 1, trapped);
  }
  proneW.forEach(w => { if (!M.paralysed(w)) w.prone = false; });   // a Paralysed model stays down
  for (const fl of falls || []) if (R.alive(fl.u)) { const Q = TR.nearestFree(fl.u, fl.to); fl.u.x = Q.x; fl.u.y = Q.y; fall(fl.u, fl.f); }   // over the edge, after the Strikes
  C.separateTrapped(W, L.filter(l => trapped.has(l.id) && R.alive(l)));
  if (C.mayCross(B, D.win)) C.crossBarrier(B);
  if (B && B.mode === 'ladder') for (const f of FO.afterLadder(B, D.win).falls) if (f.fell && R.alive(f.u)) { f.u.over = null; fall(f.u, B.T.z); }   // lost at the top of a ladder
  venom(c);
  thrownRiders(c);
  return { win: D.win, D };
}
// Rend (monsters.js): To Wound rolls against t's Strength; each success is one Wound.
function rend(w, t, part) {
  const S = run(MO.rendSeq(w, t, MO.rendRolls(w), part), answer);
  for (let j = 0; j < S.wounds && R.alive(t); j++) if (wound(t, part, w) === 'mountSlain') break;
}
// Knocked Prone by a Monster's Barge or Hurl: a Cavalry model's rider is Knocked Flying (p. 70).
function knock(x) { if (!R.alive(x)) return; if (x.cav) run(C.knockedFlyingSeq(x), answer); else x.prone = true; }
// A Barge or a Hurl, which ends the Combat (p. 90–91). Returns the Combat's result; again: the Monster that Charged again
// after its Barge.
function brutalEnd(c, b, W, L, k, D) {
  const w = b.w;
  let again = null;
  if (b.a.k === 'barge') {
    const B2 = MO.barge(w, c);
    B2.down.forEach(knock);
    // Then the Monster may Move D3+3″, and Charge again.
    const m = MO.bargeMove();
    if (R.alive(w)) {
      w.movedDist = R.moveVal(w) - m.d; w.done = false; w.moveStart = null;
      brainOf(w.side).heroicMove([w]);
      w.done = true;
      if (R.engaged(w)) again = w;
    }
  } else {
    const t = b.a.t;
    C.backAwayAll(W, L.filter(l => l !== t), k);   // the others Back Away as normal
    const Hh = run(MO.hurlSeq(w, t), answer);
    for (const h of Hh.hits) if (h.W.ok && R.alive(h.u) && !(h.part === 'mount' && !h.u.cav)) wound(h.u, h.part, w);
    for (const x of [t, Hh.target].filter(Boolean)) if (R.alive(x) && x.mountSlain) run(C.thrownRiderSeq(x), answer);
    for (const x of Hh.flying) if (R.alive(x) && x.cav) run(C.knockedFlyingSeq(x), answer);
  }
  venom(c);
  thrownRiders(c);
  return { win: D.win, D, again };
}
// n Strikes by w at t (combat.js: strikeSeq), then the Wounds they cause.
function strike(w, t, n, trapped) {
  const part = C.bestPart(w, t), dbl = trapped.has(t.id) || !!t.prone;
  const S = run(C.strikeSeq(w, t, n, dbl, part), answer);
  for (let j = 0; j < S.wounds && R.alive(t); j++) {
    let r = wound(t, part, w);
    if (r === 'saved') continue;
    // Mighty Blow, Bane Weapons: a Strike Fate did not prevent does more Wounds (p. 122, 127).
    for (let k = C.strikeWounds(w, t).n - 1; k > 0 && R.alive(t) && r !== 'mountSlain'; k--) r = wound(t, part, w, false);
    if (r === 'mountSlain') break;
    if (part === 'rider') C.venomMark(w, t);
  }
}
// Venom (p. 133): at the end of Combat c, a natural 6 gives one wounded enemy another Wound.
function venom(c) { for (const v of C.venomEnd(c)) if (v.ok && R.alive(v.t)) wound(v.t, 'rider', v.w); }
// Riders whose mount was slain in Combat c take the Thrown Rider Test once the Strikes are over (p. 70–71).
function thrownRiders(c) { for (const u of c) if (R.alive(u) && u.mountSlain) run(C.thrownRiderSeq(u), answer); }
