// Enemy decisions. Returns a plan; the game flow carries it out. With "AI plays for you" (Options) the same
// planner moves the player's side (side 'good'), with a little more care about where to Charge.
import { G } from '../state.js';
import { dist, gap } from './geometry.js';
import { alive, sideAlive, shotInfo, chargeSpot, bestApproach, engaged, remaining, validateMove, inBrush, moveVal, woundNeed } from './rules.js';
import { isHero } from './dice.js';
import { aiResist, aiResister, aiCast, aiCompel } from './magic.js';
import { aiBrutal, aiHurlAt } from './monsters.js';
import { aiSentryMove } from './advanced.js';
import { aiScatter } from './siege.js';
import { siegeGoal } from './fortress.js';
import { scenarioGoal } from './scenarios.js';
import { combatOdds, mightPlanDuel, rerollPick, goodsOf, evilsOf, strikeChance } from './combat.js';
import { mustChargeAny } from './named.js';
import { HEROIC, mustCharge, shoutReach, challengeTargets, strikeS, fvOf, foeOf, SHOUT_RANGE } from './heroes.js';
import { planCross } from './terrain.js';

// The order a side moves its models in: fighters first, so that spears and pikes can then step in behind the
// friends that charged, and banners can follow the line; shooters last.
const ROLE = u => (u.bow ? 3 : u.T.banner ? 2 : u.T.spear || u.T.pike ? 1 : 0);
// A Hero on a Heroic March goes first, so that its At the Double reaches the friends around it before they move.
export const aiMoveOrder = list => [...list].sort((a, b) => (b.decl && b.decl.move === 'march' ? 1 : 0) - (a.decl && a.decl.move === 'march' ? 1 : 0) || ROLE(a) - ROLE(b));

export function aiPlanMove(u) {
  const mv = remaining(u);
  if (u.prone) return { p: { x: u.x, y: u.y, stand: moveVal(u) / 2 }, cost: moveVal(u) / 2, stand: true };   // a Prone model Stands Up first (p. 37)
  if (u.ai === 'hold') {   // a holding model never moves, except for the Charge an accepted Heroic Challenge forces (p. 68)
    const duel = mustCharge(u), c = duel && !engaged(u) && chargeSpot(u, duel, mv);
    return c ? { p: c, cost: c.cost, charge: duel } : null;
  }
  if (u.ai === 'sentry') return null;   // a sentry never moves
  if (u.climb) { const X = planCross(u, u); return X && X.ok ? { cross: X } : null; }   // partway up a cliff: it climbs on (p. 35)
  if (u.ai === 'runner') { const p = bestApproach(u, { x: G.W + 3, y: u.y }, mv); return p ? { p, cost: p.cost } : null; }
  // A scenario with an exit (The Scout): the player's model heads for it.
  if (u.side === 'good' && G.m.exitX != null) { const p = bestApproach(u, { x: G.m.exitX + 1.5, y: u.y }, mv); return p ? { p, cost: p.cost } : null; }
  const foes = sideAlive(u.side === 'good' ? 'evil' : 'good');
  if (!foes.length) return null;
  // An accepted Heroic Challenge: the two Heroes must Charge each other when they can (p. 85).
  const duel = mustCharge(u);
  if (duel) { const c = chargeSpot(u, duel, mv); if (c) return { p: c, cost: c.cost, charge: duel }; }   // into its fight too
  const eager = mustChargeAny(u);   // The Price of Grief, Reckless Charge, ... (named.js)
  // A mission's goal for an archer (aiGoal: a marker to reach): it walks there, only half its Move while it has a shot.
  if (u.bow && !eager && G.m.aiGoal) {
    const g = G.m.aiGoal(u), shot = foes.some(f => shotInfo(u, f).ok);
    if (g === null && shot) return null;
    if (g) { const p = bestApproach(u, g, shot && !u.bow.still ? Math.max(0, moveVal(u) / 2 - u.movedDist) : mv); return p && p.cost > 0.05 ? { p, cost: p.cost } : null; }
  }
  if (u.bow && !eager && foes.some(f => shotInfo(u, f).ok)) return null;   // archers stay put if they can already shoot
  // A spear or pike stays behind a fighting friend it already Supports, or steps in behind one (no mission enemy has one).
  if ((u.T.spear || u.T.pike) && !eager) {
    const s = supportSpot(u);
    if (s === 'stay') return null;
    if (s) return { p: s, cost: s.cost };
  }
  // A banner bearer follows the line, close enough to the fights for its re-roll, and does not Charge.
  if (u.T.banner) { const p = bannerSpot(u, foes); if (p !== undefined) return p && { p, cost: p.cost }; }
  let best = null;
  if (!G.m.noCharge && !u.noCharge) {   // a scenario rule may forbid Charges, and so does a Heroic March
    // The enemy takes the cheapest Charge. The player's side (when the app plays it) prefers an enemy its friends
    // already fight, for more dice in that Combat, and a softer target.
    const mates = f => sideAlive(u.side).filter(o => o !== u && gap(o, f) <= 0.08).length;
    for (const f of foes.filter(o => !o.T.siege && !o.T.gate)) {   // a Siege Engine or a gate can never be Engaged (p. 147, 159)
      const c = chargeSpot(u, f, mv); if (!c) continue;
      // A mounted model wants the Cavalry Charge bonus: infantry targets, and a spot outside Difficult Terrain.
      const cav = u.cav ? (f.cav || f.T.mount ? -3 : inBrush(c.x, c.y, u.r) ? -2 : 4) : 0;
      const sc = (u.side === 'good' ? mates(f) * 3 - c.cost * 0.1 - f.d * 0.2 : -c.cost) + cav;
      if (!best || sc > best.sc) best = { p: c, cost: c.cost, charge: f, sc };
    }
  }
  if (best || u.ai === 'guard') return best;   // a guard only leaves its post to charge
  // The Grand Siege: the way in for the attacker (ladders, the gate), the walls for the defender (fortress.js).
  const sg = G.m && G.m.siege ? siegeGoal(u, G.m.siege) : G.m && (G.m.scen || G.m.aiGoal) ? scenarioGoal(u, G.m) : undefined;   // or the scenario's objectives
  if (sg !== undefined) { if (!sg) return null; const p = bestApproach(u, sg, mv); return p ? { p, cost: p.cost } : null; }
  // An enemy Siege Engine in reach: Move into base contact and disable it in the End phase (p. 147).
  for (const e of foes.filter(o => o.T.siege || o.T.gate)) { const c = chargeSpot(u, e, mv); if (c) return { p: c, cost: c.cost }; }   // a gate: to batter it
  // Walk towards the nearest enemy; if terrain blocks the way, towards the next nearest instead. A bow keeps to half
  // its Move so it can still shoot; a crossbow cannot shoot after moving anyway.
  // An Obstacle, a gap or a cliff on the way: a Jump, Leap or Climb Test over it when that lands the model closer than
  // walking round would (an archer only when it cannot walk closer at all, as the test stops it shooting).
  const lim = u.bow && !u.bow.still ? Math.max(0, moveVal(u) / 2 - u.movedDist) : mv;
  for (const f of [...foes].sort((a, b) => dist(u, a) - dist(u, b))) {
    const p = bestApproach(u, f, lim);
    const X = !u.crossTried && (!u.bow || !p) ? crossPlan(u, f, p, mv) : null;
    if (X) return { cross: X };
    if (p) return { p, cost: p.cost };
  }
  // A model that must finish within 6″ of a Hero (With Me, At the Double) and cannot get closer to the enemy that way
  // keeps close to the Hero instead.
  const h = u.tether != null && G.units.find(o => o.id === u.tether);
  if (h && alive(h)) { const p = bestApproach(u, h, lim); if (p) return { p, cost: p.cost }; }
  return null;
}

// The crossing (terrain.js: planCross) of the barrier between u and enemy f, aiming the Move straight at f, when it
// would leave u at least 1″ closer to f than walk (bestApproach's spot, or null: u cannot walk closer); else null.
// A Climb that will not reach the top this turn counts from where u starts climbing.
function crossPlan(u, f, walk, mv) {
  const d = dist(u, f);
  if (d < 1e-6 || mv <= 0.05) return null;
  const k = Math.min(mv, d) / d, X = planCross(u, { x: u.x + (f.x - u.x) * k, y: u.y + (f.y - u.y) * k });
  if (!X || !X.ok || X.kind === 'swim') return null;
  return dist(X.partial ? X.contact : X.landing, f) < (walk ? dist(walk, f) : d) - 1 ? X : null;
}

// Behind a friend that is fighting (on the side away from its enemies), with the same base size or smaller and no
// other spear behind it yet. 'stay' when u already Supports someone; null when no spot can be reached.
function supportSpot(u) {
  const fighting = sideAlive(u.side).filter(f => f !== u && engaged(f) && f.r <= u.r + 1e-6);
  if (fighting.some(f => gap(u, f) <= 0.08)) return 'stay';
  const taken = new Set(sideAlive(u.side).filter(s => s !== u && (s.T.spear || s.T.pike) && !engaged(s)).flatMap(s => fighting.filter(f => gap(s, f) <= 0.08)));
  const lim = remaining(u);
  for (const f of fighting.sort((a, b) => dist(u, a) - dist(u, b))) {
    if (taken.has(f) || dist(u, f) > lim + u.r + f.r + 0.5) continue;
    let vx = 0, vy = 0;
    for (const o of sideAlive(u.side === 'good' ? 'evil' : 'good')) if (gap(o, f) <= 0.08) { vx += f.x - o.x; vy += f.y - o.y; }
    const base = Math.atan2(vy, vx), R0 = f.r + u.r + 0.01;
    for (const off of [0, 0.5, -0.5, 1, -1]) {
      const P = { x: f.x + Math.cos(base + off) * R0, y: f.y + Math.sin(base + off) * R0 };
      const v = validateMove(u, P, lim);
      if (v.ok) return { x: P.x, y: P.y, cost: v.cost };
    }
  }
  return null;
}

// A spot just behind the friend nearest the enemy. undefined when the bearer has nobody to follow (then it fights
// like any other model), null when it is already there or cannot get closer.
function bannerSpot(u, foes) {
  const mates = sideAlive(u.side).filter(o => o !== u && !o.T.banner && !o.bow);
  if (!mates.length) return undefined;
  const near = m => foes.reduce((a, b) => (dist(m, a) <= dist(m, b) ? a : b));
  const front = mates.reduce((a, b) => (dist(a, near(a)) <= dist(b, near(b)) ? a : b)), e = near(front);
  const d = dist(front, e) || 1, back = front.r + u.r + 1.2;
  const P = { x: front.x + (front.x - e.x) / d * back, y: front.y + (front.y - e.y) / d * back };
  if (Math.hypot(P.x - u.x, P.y - u.y) < 0.6) return null;
  return bestApproach(u, P, remaining(u));
}

/* ---------- Might, Will and Fate (p. 76–88) ---------- */
// Spend Might to win a Duel Roll when the stake is worth it: the Hero is down to its last Wound, an enemy Hero is in the
// Combat (or an enemy on its last Wound), or a single point does it. foes: the enemy models in the Combat.
export function aiMightDuel(u, plan, foes) {
  if (!plan || plan.k > u.might) return false;
  foes = foes.filter(o => o.side !== u.side && alive(o));
  if (u.w <= 1 || foes.some(f => f.T.hero) || foes.some(f => f.w <= 1 && f.maxW > 1)) return true;
  return plan.k === 1;
}
// Spend k Might to turn a missed To Wound roll into a wound: one point always, more only against a Hero.
export const aiMightWound = (w, t, k) => k <= w.might && (k === 1 || !!t.T.hero);
// Might on a single dice (dice.js: d6Test, woundRoll), q the request: how many points to spend. Only to turn a failure
// into a success, never to buy a 6 that merely lets a model carry on moving.
function aiMightRoll(q) {
  const u = q.u, o = q.opts && q.opts[0], ctx = q.ctx || {};
  if (!o || o.n > u.might || (q.need != null && o.to < q.need && q.step !== 'wound')) return 0;
  const target = ctx.t;
  switch (q.step) {
    case 'wound': return aiMightWound(u, q.t, o.n) ? o.n : 0;
    case 'fate': return o.n === 1 || u.fate === 0 ? o.n : 0;   // a 3 is worth a point; more only on the last Fate Point
    case 'hit': return o.n === 1 && (u.might >= 2 || (target && target.T.hero)) ? 1 : target && target.T.hero && o.n <= u.might ? o.n : 0;
    case 'itw': return ctx.ob && ctx.ob.kind === 'model' && ctx.ob.u.side !== u.side ? 0 : o.n === 1 && (u.might >= 2 || (target && target.T.hero)) ? 1 : 0;
    case 'fight': return o.n === 1 ? 1 : 0;   // a miss would hit a friend
    case 'cav': return o.n === 1 && u.might >= 2 ? 1 : 0;
    case 'jump': case 'leap': case 'climb': case 'thrown': return o.to === 2 && o.n === 1 ? 1 : 0;   // a 1 is a fall
    case 'paralyse': return o.n === 1 ? 1 : 0;
    case 'cast': case 'resist': return o.n === 1 && u.might >= 1 ? 1 : 0;   // a power Cast or Resisted for one point
    default: return 0;
  }
}
// A failed Courage Test: Will first, then Might, but only when the points it has can pass the test.
function aiCourage(q) {
  const u = q.u;
  if (q.why !== 'broken') return (u.will || 0) > q.short ? 'will' : null;   // to Charge: spare Will only, keep one point
  if ((u.will || 0) + (u.might || 0) < q.short) return null;
  return u.will > 0 ? 'will' : 'might';
}

/* ---------- Heroic Actions (p. 79–86) ---------- */
// What a Heroic Action is worth to the computer now (0: not worth a Might Point). o: { u, k, targets }; q: the request.
function heroicValue(o, q) {
  const u = o.u, side = u.side, foes = sideAlive(foeOf(side)), spare = u.might - 1;   // Might left after declaring
  const near = d => foes.some(f => gap(u, f) <= d);
  const myCombat = () => { const c = (G.combats || []).find(x => x.includes(u)); return c || [u, ...foes.filter(f => gap(u, f) <= 0.08)]; };
  switch (o.k) {
    case 'move': {
      // Without Priority: go first when the Hero can Charge now, or would be Charged before it moves; and always
      // answer the enemy's own Heroic Move with a Hero that is in reach of the fighting.
      const answer = (q.made || []).some(m => m.side !== side && m.k === 'move');
      if (G.priority === side && !answer) return 0;
      const canCharge = foes.some(f => !engaged(f) && chargeSpot(u, f, remaining(u)));
      const threatened = foes.some(f => !engaged(f) && gap(u, f) <= moveVal(f) + 0.5);
      return (canCharge && spare >= 1) || (threatened && answer) ? 2 + (answer ? 1 : 0) : 0;
    }
    case 'march': {
      // Far from the enemy (no Charge either way this turn) and with friends to take along: 3″ more for all of them.
      if (o.drum) return near(moveVal(u) + 9) ? 0 : shoutReach(u, 'march').length >= 2 ? 1.5 : 0;   // a war drum: free
      if (near(moveVal(u) + 9) || spare < 1) return 0;
      return shoutReach(u, 'march').length >= 2 ? 1.5 : 0;
    }
    case 'channelling': { const c = aiCast(u); return c && c.pw.cast >= 4 && c.score >= 0.6 && spare >= 1 ? 1 : 0; }   // a 6 on the Casting Test
    case 'resolve': return G.broken && G.broken[side] && sideAlive(side).filter(w => w !== u && !isHero(w) && gap(u, w) <= SHOUT_RANGE).length >= 2 ? 3 : 0;
    case 'shoot': return 0;   // shooting first rarely pays for the point
    case 'accuracy': {
      const shooters = [u, ...shoutReach(u, 'accuracy')].filter(s => s.bow && !s.shot);
      const blocked = shooters.filter(s => foes.some(t => { const i = shotInfo(s, t); return i.ok && (i.itw.length || i.tEng); }));
      return blocked.length >= 2 && spare >= 1 ? blocked.length * 0.5 : 0;
    }
    case 'combat': {
      // A fight the Hero should win and that leaves no enemy standing, with more enemies within reach to Charge after.
      const c = myCombat(), e = c.filter(f => f.side !== side && alive(f));
      if (!e.length || e.length > 1 || e[0].w > 1) return 0;
      const p = combatOdds(c, {}, {}), pg = side === 'good' ? p : 1 - p;
      const more = foes.some(f => !c.includes(f) && gap(u, f) <= moveVal(u) + 1);
      return pg >= 0.6 && more ? 2 : 0;
    }
    case 'strike': {
      const c = myCombat(), e = c.filter(f => f.side !== side && alive(f));
      const p = combatOdds(c, {}, {}), pg = side === 'good' ? p : 1 - p;
      const theirF = Math.max(0, ...e.map(fvOf));
      return pg < 0.8 && fvOf(u) <= theirF && (spare >= 1 || e.some(f => f.T.hero)) ? 1.5 : 0;
    }
    case 'strength': {
      const c = myCombat(), e = c.filter(f => f.side !== side && alive(f));
      const p = combatOdds(c, {}, {}), pg = side === 'good' ? p : 1 - p;
      const gain = e.some(f => { const a = woundNeed(u.s, f.d), b = woundNeed(Math.min(10, u.s * 2), f.d); return !a || (b && b[0] < a[0] - 0) || (a.length > b.length); });
      return pg >= 0.5 && gain ? 1.2 : 0;
    }
    case 'defence': {
      const c = myCombat(), e = c.filter(f => f.side !== side && alive(f));
      const p = combatOdds(c, {}, {}), pl = side === 'good' ? 1 - p : p;
      const hurts = e.some(f => strikeChance(f, u, false) >= 1 / 3);
      return pl >= 0.5 && hurts && (u.w <= 2 || e.some(f => f.T.hero)) ? 1.8 : 0;
    }
    case 'challenge': {
      const t = aiChallengeTarget(u, o.targets);
      return t ? 1.4 : 0;
    }
    default: return 0;
  }
}
// How strong a fighter is, roughly: for a Heroic Challenge and its answer.
const power = u => fvOf(u) * 2 + u.a * 1.5 + u.w + strikeS(u) * 0.5 + u.d * 0.5 + (u.might || 0) + (u.fate || 0);
function aiChallengeTarget(u, targets) {
  const t = (targets || challengeTargets(u)).filter(f => power(f) <= power(u)).sort((a, b) => power(b) - power(a))[0];
  return t || null;
}
// The computer's choice in the Declare Heroic Actions step: the most valuable action, or null to pass.
export function aiDeclare(q) {
  let best = null, bv = 0;
  for (const o of q.options) { const v = heroicValue(o, q); if (v > bv + 1e-9) { bv = v; best = o; } }
  if (!best) return null;
  return best.k === 'challenge' ? { u: best.u, k: 'challenge', t: aiChallengeTarget(best.u, best.targets) } : { u: best.u, k: best.k };
}
// Whether a challenged Hero accepts (p. 85): when it is at least as strong as its challenger.
export const aiAccept = (u, by) => power(u) >= power(by);
// Whether a Hero shouts on its Heroic Action: With Me, At the Double, Loose, Take Aim (heroes.js: shoutReach).
export function aiShout(h, k) {
  const reach = shoutReach(h, k);
  if (k === 'shoot' || k === 'accuracy') return reach.some(o => o.bow && !o.shot);
  return reach.length > 0;
}

// The computer's answer to every question the rolling procedures and the Declare Heroic Actions step ask (dice.js,
// combat.js, heroes.js), so the enemy in the game and both sides in the tools decide alike.
export function aiAnswer(q) {
  switch (q.k) {
    case 'might': return aiMightRoll(q);
    case 'fate': return true;
    case 'courage': return aiCourage(q);
    case 'intelligence': return (q.u.might || 0) >= q.short && q.short <= 2 ? 'might' : null;   // Might only for a near miss
    case 'duelReroll': return rerollPick(q.side === 'good' ? q.D.g : q.D.e);
    case 'duelMight': {
      const foes = [...new Set((q.side === 'good' ? q.D.e : q.D.g).map(d => d.u))];
      for (const u of q.heroes) { const plan = mightPlanDuel(q.D, u); if (plan && aiMightDuel(u, plan, foes)) return { u, die: plan.die }; }
      return null;
    }
    case 'declare': return aiDeclare(q);
    case 'challenge': return aiAccept(q.u, q.by);
    case 'resist': return aiResist(q);
    case 'resister': return aiResister(q);
    case 'compelTo': return aiCompel(q);
    case 'brutal': return aiBrutal(q);
    case 'hurlAt': return aiHurlAt(q);
    case 'sentryMove': return aiSentryMove(q);
    case 'scatter': return aiScatter(q);
    default: return undefined;
  }
}
// The side a request asks (null for one that only shows something).
export const askSide = q => (q.k === 'might' || q.k === 'fate' || q.k === 'courage' || q.k === 'intelligence' || q.k === 'challenge' || q.k === 'resist' ? q.u.side
  : q.k === 'duelReroll' || q.k === 'duelMight' || q.k === 'declare' || q.k === 'resister' || q.k === 'compelTo' || q.k === 'brutal' || q.k === 'hurlAt' || q.k === 'sentryMove' || q.k === 'scatter' ? q.side : null);

// The best shot for a shooter, or null.
export function aiPickShot(s) {
  let best = null;
  for (const t of sideAlive(s.side === 'good' ? 'evil' : 'good')) { const i = shotInfo(s, t); if (i.ok && (!best || i.p > best.i.p)) best = { t, i }; }
  return best;
}
