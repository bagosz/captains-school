// Heroes (2024 Rules Manual, p. 61, 76–88): Heroic Actions, the Declare Heroic Actions step of the Move, Shoot and Fight
// phases, the order in which both sides' Heroic Moves, Shoots and Combats are resolved, what each action does, Heroic
// Challenges, and Stand Fast. Might on dice, Will and Fate are in dice.js. No drawing and no DOM here.
//
// Which Heroic Actions are in play: G.heroics (a Set of the keys below), filled by whoever starts the game from the
// missions that have taught them (a mission only uses rules it has taught). Empty: Heroes only spend Might on dice.
//
// What a declaration leaves on the model (reset each turn by setup.js: freshTurn):
//   u.decl = { move, shoot, fight }   the action declared in each phase
//   u.mvPlus, u.noCharge              Heroic March and At the Double: +3″ (+5″ for cavalry), no Charge this Move phase
//   u.tether                          With Me or At the Double: the Hero (id) the model must end within 6″ of
//   u.resolve                         Heroic Resolve: Broken army Courage Tests pass on their own
//   u.itwReroll, u.sharp              Heroic Accuracy (and Take Aim): re-roll failed In The Way Tests; Sharpshooter
//   u.fvPlus                          Heroic Strike: the D3 added to Fight Value (rolled at its first Combat)
//   u.sx2, u.def6                     Heroic Strength (double Strength for Strikes), Heroic Defence (only natural 6s wound)
// G.challenges lasts the whole game: [{ a: challenger id, t: target id, acc: true | false }].
import { autoPass, hasKeyword, rule, armyRule } from './special.js';
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, gapXY } from './geometry.js';
import { alive, sideAlive, engaged, losBlocked, sideOfAlign, hasHorn, invisible } from './rules.js';
import { isHero } from './dice.js';
import { castable, spellbound, bladewrath } from './magic.js';
import { fightValue, freeHeroic, noHeroics, masterOfBattleNamed, standFastRange, heroesStandFast } from './named.js';

export const foeOf = side => (side === 'good' ? 'evil' : 'good');

/* ---------- The Heroic Actions ---------- */
// phase: when it is declared; order: it changes the order of its phase (p. 80); shout: what the Hero may call out.
export const HEROIC = {
  move: { n: 'Heroic Move', phase: 'move', order: true, shout: 'With Me', rule: 'heroicMove' },
  march: { n: 'Heroic March', phase: 'move', shout: 'At the Double', rule: 'heroicMarch' },
  resolve: { n: 'Heroic Resolve', phase: 'move', rule: 'heroicResolve' },
  shoot: { n: 'Heroic Shoot', phase: 'shoot', order: true, shout: 'Loose', rule: 'heroicShoot' },
  accuracy: { n: 'Heroic Accuracy', phase: 'shoot', shout: 'Take Aim', rule: 'heroicAccuracy' },
  combat: { n: 'Heroic Combat', phase: 'fight', order: true, rule: 'heroicCombat' },
  strike: { n: 'Heroic Strike', phase: 'fight', rule: 'heroicStrike' },
  strength: { n: 'Heroic Strength', phase: 'fight', rule: 'heroicStrength' },
  defence: { n: 'Heroic Defence', phase: 'fight', rule: 'heroicDefence' },
  challenge: { n: 'Heroic Challenge', phase: 'fight', rule: 'heroicChallenge' },
  channelling: { n: 'Heroic Channelling', phase: 'move', rule: 'heroicChannelling' },
};
export const HEROIC_KEYS = Object.keys(HEROIC);
// Every Hero has the three universal actions (p. 81); the others come from its profile (T.heroic).
const UNIVERSAL = ['move', 'shoot', 'combat'];
// Isengard Unleashed (Muster of Isengard): Uruk-hai Captains gain Heroic Strike.
export const heroActions = u => (isHero(u) ? [...new Set([...UNIVERSAL, ...(u.T.heroic || []).filter(k => HEROIC[k]),
  ...(/^Uruk-hai Captain/.test(u.T.n) && armyRule(u, 'Isengard Unleashed') ? ['strike'] : [])])] : []);
// Heroic Tiers (p. 157), highest last. A Heroic Challenge needs a target of the same tier or higher.
export const TIERS = ['Independent', 'Minor', 'Fortitude', 'Valour', 'Legend'];
const tierOf = u => Math.max(0, TIERS.indexOf(u.T.tier || 'Fortitude'));
export const SHOUT_RANGE = 6;
const inPlay = k => !!(G.heroics && G.heroics.has(k));
export const anyHeroics = () => !!(G.heroics && G.heroics.size);

/* ---------- Heroic Challenges (p. 85) ---------- */
const live = id => { const u = G.units.find(o => o.id === id); return u && alive(u) ? u : null; };
const challenges = () => (G.challenges || (G.challenges = [])).filter(c => live(c.a) && live(c.t));
// Whether model u fights enemy f under a Heroic Challenge: u challenged f, or f challenged u and u accepted.
export const challenging = (u, f) => !!(u && f && challenges().some(c => (c.a === u.id && c.t === f.id) || (c.acc && c.t === u.id && c.a === f.id)));
// +1 Attack in a Combat against its challenge opponent (both in the Duel Roll and when making Strikes).
export const challengeBonus = (u, foes) => (foes.some(f => challenging(u, f)) ? 1 : 0);
// The Hero u must Charge if it can: an accepted challenge, when either of them Activates (p. 85).
export function mustCharge(u) {
  const c = challenges().find(x => x.acc && (x.a === u.id || x.t === u.id));
  return c ? live(c.a === u.id ? c.t : c.a) : null;
}
// Whom Hero u may challenge now: enemy Heroes within 6″ with the same Heroic Tier or higher.
export function challengeTargets(u) {
  const cs = challenges();
  if (cs.some(c => c.a === u.id)) return [];   // its challenge stands until its target is slain
  if (cs.some(c => c.acc && c.t === u.id)) return [];   // it accepted one: not until that challenger is slain
  return sideAlive(foeOf(u.side)).filter(f => isHero(f) && gap(u, f) <= SHOUT_RANGE + 1e-6 && tierOf(f) >= tierOf(u)
    && !cs.some(c => c.acc && (c.a === f.id || c.t === f.id))   // nobody may challenge a Hero in an accepted challenge
    && !(G.challenges || []).some(c => c.acc === false && c.t === u.id && c.a === f.id));   // it declined f: not against f
}
// The Hero that slays its challenge opponent gains 1 Might, never above its starting Might (p. 85). Returns true if so.
// General Hunter (p. 125): a model that slays the enemy General in a Combat regains one Might Point spent earlier.
export function hunterSlain(w, t) {
  if (!t.general || !isHero(w) || !alive(w) || rule(w, 'General Hunter') == null || w.might >= w.mwf[0]) return false;
  w.might++;
  return true;
}
// Mighty Hero (p. 127): a free Might Point at the start of each turn, even above the store; lost at the end of the turn
// if not spent (any Might spent in the turn counts as that one first). Call at the start of every turn.
export function mightyHero(u) {
  if (u.freeMight && u.might >= u.mightStart) u.might--;
  u.freeMight = false;
  if (!isHero(u) || !alive(u) || rule(u, 'Mighty Hero') == null) return;
  u.might++; u.freeMight = true; u.mightStart = u.might;
}
// Master of Battle (X+) (p. 127): when an enemy Hero declares a Heroic Action within 6″, the model rolls a D6 and on X+
// declares the same Heroic Action for free (even without Might), if it may take it in this phase. Returns the
// models that rolled: [{ u, v, ok }].
function masterOfBattle(by, k, phase) {
  const out = [];
  for (const m of G.units) {
    const x = rule(m, 'Master of Battle') ?? masterOfBattleNamed(m);   // Mutual Respect (named.js)
    if (x == null || m.side === by.side || !alive(m) || !isHero(m) || gap(m, by) > 6 + 1e-6 || m.decl[phase]) continue;
    const was = m.might; m.might = Math.max(1, was);
    const can = heroOptions(m, phase).some(o => o.k === k) && (k !== 'challenge' || challengeTargets(m).length);
    m.might = was;
    if (!can) continue;
    const v = d6(), ok = v >= (parseInt(x) || 6);
    if (ok) declare(m, k, k === 'challenge' ? challengeTargets(m)[0] : undefined, true);
    out.push({ u: m, v, ok, need: parseInt(x) || 6 });
  }
  return out;
}
export function challengeSlain(w, t) {
  if (!isHero(w) || !alive(w) || !(G.challenges || []).some(c => (c.a === w.id && c.t === t.id) || (c.acc && c.t === w.id && c.a === t.id))) return false;
  if (w.might >= w.mwf[0]) return false;
  w.might++;
  return true;
}

/* ---------- Declaring (p. 79) ---------- */
// The actions Hero u could declare now in `phase`: [{ u, k, targets? }].
// A war drum (X) (p. 110): any model may use it to declare a Heroic March for free (drumOptions).
export function heroOptions(u, phase) {
  if (!isHero(u) && drumOf(u)) return drumOptions(u, phase);
  if (!isHero(u) || !alive(u) || !u.decl || u.decl[phase] || spellbound(u) || noHeroics(u)) return [];
  const out = [];
  for (const k of heroActions(u)) {
    if (HEROIC[k].phase !== phase || !inPlay(k)) continue;
    if (u.might < 1 && !freeHeroic(u, k)) continue;   // free ones: Isengard Unleashed, Leader of the Pack, ... (named.js)
    if ((k === 'move' || k === 'march') && (engaged(u) || u.stunned || u.done || u.movedDist > 0)) continue;   // it must be able to Activate
    if ((k === 'shoot' || k === 'accuracy') && (engaged(u) || u.stunned)) continue;   // not while Engaged (p. 82, 84)
    if (k === 'channelling' && (engaged(u) || u.done || !castable(u).length)) continue;   // a caster that can still Activate
    if ((k === 'combat' || k === 'strike' || k === 'strength' || k === 'defence') && !engaged(u)) continue;   // a Hero that fights
    if (k === 'challenge') { const ts = challengeTargets(u); if (ts.length) out.push({ u, k, targets: ts }); continue; }
    out.push({ u, k });
  }
  return out;
}
export const sideOptions = (side, phase) => sideAlive(side).flatMap(u => heroOptions(u, phase));
// War drum (X) (p. 110): the keyword in brackets (true without one), or null. Its free Heroic March must shout At the
// Double, which reaches 12″ (and tethers to 12″), only friends with that keyword, never a model on a Heroic March.
export function drumOf(u) {
  for (const g of u.T.gear || []) { const m = /^war drum(?:\s*\((.+)\))?$/i.exec(g.trim()); if (m) return m[1] && m[1] !== 'X' ? m[1] : true; }
  return null;
}
export const DRUM_RANGE = 12;
function drumOptions(u, phase) {
  if (phase !== 'move' || !inPlay('march') || !alive(u) || !u.decl || u.decl.move || u.tether != null) return [];
  if (engaged(u) || u.stunned || u.done || u.movedDist > 0) return [];
  return [{ u, k: 'march', drum: true }];
}
// The range of Hero (or drummer) h's shouts.
export const shoutRange = h => (h.drum ? DRUM_RANGE : SHOUT_RANGE);
// Spends the Might Point (none for a war drum) and sets what the action does at once. t: the target of a Heroic Challenge.
// free: no Might spent (Master of Battle).
export function declare(u, k, t, free = false) {
  const H = HEROIC[k];
  if (k === 'march' && !isHero(u) && drumOf(u)) u.drum = true;
  else if (!free && freeHeroic(u, k)) u.giftTurn = G.turn;   // a rule's free action (named.js), once per turn
  else if (!free) u.might--;
  u.decl[H.phase] = k;
  if (k === 'march') { u.mvPlus = u.cav ? 5 : 3; u.noCharge = 'Heroic March'; }
  if (k === 'resolve') { u.resolve = true; for (const o of sideAlive(u.side)) if (gap(o, u) <= SHOUT_RANGE + 1e-6) o.resolveDie = true; }   // and a free Resist dice within 6″ (p. 84)
  if (k === 'channelling') u.channel = true;
  if (k === 'accuracy') { u.itwReroll = 'Heroic Accuracy'; u.sharp = true; }
  if (k === 'strength') u.sx2 = true;
  if (k === 'defence') u.def6 = true;
  if (k === 'challenge' && t) (G.challenges || (G.challenges = [])).push({ a: u.id, t: t.id, acc: null });
}
// The Declare Heroic Actions step of a phase: the player without Priority first, then the sides take turns; on its turn a
// side declares one Heroic Action or passes, and the step ends when both sides pass one after the other. A side that
// passed may still declare when its turn comes again. A side with nothing it could declare passes without being asked.
// Requests: { k: 'declare', side, phase, options } answered with one of the options ({ u, k, t } for a challenge, t one
// of its targets) or null to pass; { k: 'declared', side, u, a: action key, t } after each declaration (for the log);
// { k: 'challenge', u: the target, by: the challenger } answered true to accept (p. 85). Returns the declarations.
export function* declareSeq(phase) {
  const made = [];
  let side = G.priority === 'good' ? 'evil' : 'good', passed = false;
  for (let guard = 0; guard < 80; guard++) {
    const options = sideOptions(side, phase);
    const a = options.length ? yield { k: 'declare', side, phase, options, made } : null;
    const ok = a && options.some(o => o.u === a.u && o.k === a.k) && (a.k !== 'challenge' || (a.t && challengeTargets(a.u).includes(a.t)));
    if (!ok) { if (passed) break; passed = true; }
    else {
      passed = false;
      declare(a.u, a.k, a.t);
      made.push({ side, u: a.u, k: a.k, t: a.t || null });
      yield { k: 'declared', side, u: a.u, a: a.k, t: a.t || null };
      for (const mb of masterOfBattle(a.u, a.k, phase)) {
        if (mb.ok) made.push({ side: mb.u.side, u: mb.u, k: a.k, t: null, free: true });
        yield { k: 'masterOfBattle', ...mb, by: a.u, a: a.k };
      }
      if (a.k === 'challenge') {
        const c = G.challenges[G.challenges.length - 1];
        c.acc = !!(yield { k: 'challenge', u: a.t, by: a.u });
        yield { k: 'answered', u: a.t, by: a.u, acc: c.acc };
      }
    }
    side = foeOf(side);
  }
  return made;
}

/* ---------- The order of Heroic Moves, Shoots and Combats (p. 80) ---------- */
// The Heroes that declared action k and still have to perform it. When both sides have some, the player with Priority
// rolls a D6: on 1–3 the Evil side chooses first which of its Heroes goes, on 4+ the Good side; then the sides take
// turns. Q.roll: that D6 (null when only one side declared any); Q.next(): the side to choose now, or null when every
// Hero has gone; Q.left(side): its Heroes still waiting; Q.done(u): u has gone (or its action was cancelled).
export function heroicQueue(k) {
  const phase = HEROIC[k].phase, waiting = { good: [], evil: [] };
  for (const u of G.units) if (alive(u) && u.decl && u.decl[phase] === k) waiting[u.side].push(u);
  let roll = null, turn = null;
  if (waiting.good.length && waiting.evil.length) { roll = d6(); turn = sideOfAlign(roll >= 4 ? 'good' : 'evil'); }
  else turn = waiting.good.length ? 'good' : waiting.evil.length ? 'evil' : null;
  const Q = {
    roll, first: turn, waiting,
    left: side => waiting[side].filter(alive),
    next() {
      if (!turn) return null;
      if (!Q.left(turn).length) turn = Q.left(foeOf(turn)).length ? foeOf(turn) : null;
      return turn;
    },
    done(u) {
      waiting[u.side] = waiting[u.side].filter(o => o !== u);
      if (Q.left(foeOf(u.side)).length) turn = foeOf(u.side);
    },
  };
  return Q;
}
// Whether Hero u can still perform its declared action k when its turn comes. Otherwise the action is cancelled and
// the Might Point is lost (p. 80–81): a Hero that was Charged before its Heroic Move or March, for example.
export function stillPossible(u, k) {
  if (!alive(u)) return false;
  if (k === 'move' || k === 'march') return !engaged(u) && !u.stunned && !u.done;
  if (k === 'shoot') return !engaged(u) && !u.stunned;
  if (k === 'combat') return engaged(u);
  return true;
}
// A cancelled action: its effects go (the Might Point stays spent).
export function cancel(u, k) {
  if (k === 'march') { u.mvPlus = 0; u.noCharge = null; }
  if (u.decl) u.decl[HEROIC[k].phase] = `${k}-cancelled`;
}
export const declared = (u, k) => !!(u.decl && u.decl[HEROIC[k].phase] === k);

// The end of the Move phase: Heroic March and At the Double last only for that phase (p. 83), and With Me ends with the
// Activations. What stays is the Move Value the model had, for "more than half its Move" in the Shoot phase (u.mvShoot).
export function endMovePhase() {
  for (const u of G.units) { u.mvShoot = u.mvPlus || 0; u.mvPlus = 0; u.noCharge = null; u.tether = null; }
}

/* ---------- Shouts: With Me, At the Double, Loose, Take Aim ---------- */
// The friends a Hero's shout reaches: within 6″ of it when it shouts. With Me and At the Double (Move phase) only reach
// models that have not been Activated yet; Loose and Take Aim (Shoot phase) any friend.
export function shoutReach(h, k) {
  if (invisible(h)) return [];   // nobody hears an Invisible Hero's shouts (p. 127)
  const kw = h.drum ? drumOf(h) : null;
  return sideAlive(h.side).filter(o => o !== h && !o.T.siege && !o.T.gate && !o.T.warBeast && gap(o, h) <= shoutRange(h) + 1e-6   // a Siege Engine ignores special rules (p. 147)
    && (k === 'shoot' || k === 'accuracy' || (!o.done && !(o.movedDist > 0) && !engaged(o) && !o.stunned && o.tether == null))
    && (!h.drum || ((kw === true || hasKeyword(o, kw)) && !declared(o, 'march'))));
}
// Applies a shout to the models it reaches. With Me: they Activate right after the Hero, finishing within 6″ of it.
// At the Double: +3″ (+5″ cavalry), no Charge, finish within 6″ of the Hero. Take Aim: re-roll failed In The Way Tests.
// Loose: they may shoot now with the Hero (the caller lets them). Returns the models reached.
export function shout(h, k) {
  const list = shoutReach(h, k);
  for (const o of list) {
    if (k === 'move') o.tether = h.id;
    if (k === 'march') { o.tether = h.id; o.mvPlus = o.cav ? 5 : 3; o.noCharge = 'At the Double'; }
    if (k === 'accuracy') o.itwReroll = o.itwReroll || 'Take Aim';
  }
  h.shouted = k;
  return list;
}
// Why model u may not end a move at (x, y): it must finish within 6″ of the Hero whose With Me or At the Double reached
// it (that Hero's position after its own Activation). null when it may.
export function tetherWhy(u, x, y) {
  if (u.tether == null) return null;
  const h = live(u.tether);
  if (!h) return null;
  const g = gapXY(x, y, u.r, h), rg = shoutRange(h);
  return g > rg + 1e-6 ? `${h.name}'s ${h.shouted === 'march' ? 'At the Double' : 'With Me'} reached ${u.name}, so it must finish within ${rg}″ of ${h.name} (that spot is ${(Math.ceil(g * 10) / 10).toFixed(1)}″ away), or not move at all.` : null;
}

/* ---------- Effects in the Fight phase ---------- */
// Fight Value with a Heroic Strike's D3, to a maximum of 10, applied after everything else (p. 86).
// Invisible (p. 127): an Invisible model fighting with no friend in its Combat halves the Fight Value of its enemies.
const halvedBy = u => G.units.some(o => o.side !== u.side && invisible(o) && alive(o) && gap(o, u) <= 0.08 && !G.units.some(f => f !== o && alive(f) && f.side === o.side && G.units.some(e => alive(e) && e.side === u.side && gap(e, o) <= 0.08 && gap(e, f) <= 0.08)));
// The Fight Value: the profile's as named.js changes it (Arise, Riders of Rohan!, ...), plus Heroic Strike.
export const fvOf = u => { const f = Math.min(10, fightValue(u) + (u.fvPlus || 0)); return halvedBy(u) ? Math.ceil(f / 2) : f; };
// Strength for Strikes: doubled by Heroic Strength, to a maximum of 10 (p. 86).
// Glamdring and Sting: +1 Strength for Strikes.
const bladeS = u => u.s + ((u.T.gear || []).some(g => /^(glamdring|sting)$/i.test(g)) ? 1 : 0);
export const strikeS = u => (bladewrath(u) ? 6 : u.sx2 ? Math.min(10, bladeS(u) * 2) : bladeS(u));   // Bladewrath: 6, whatever else applies (p. 116)
// Heroic Strikes still to roll in Combat c: the D3 is rolled at the start of the first Combat the Hero fights in this
// Fight phase (p. 86).
export const strikePending = c => c.filter(u => alive(u) && declared(u, 'strike') && u.fvPlus == null);
export function rollStrike(u) { const v = d6(); u.fvPlus = Math.ceil(v / 2); return { v, d3: u.fvPlus }; }
// The start of Combat c, before Shielding is declared and the Duel Roll is made: the Heroic Strikes still to roll.
// Yields { k: 'dice', step: 'heroicStrike', u, die, d3 } for each.
export function* combatStartSeq(c) {
  for (const u of strikePending(c)) { const r = rollStrike(u); yield { k: 'dice', step: 'heroicStrike', u, die: { v: r.v, n: r.v, ok: true }, d3: r.d3 }; }
}
// A Heroic Combat succeeds when the Hero's side wins its Combat and every enemy model in it is slain (p. 82): the Hero and
// the friends that fought beside it may then Move or Charge again. Returns those models, or [] when it failed.
export function heroicCombatMovers(c, win) {
  const heroes = c.filter(u => u.side === win && alive(u) && declared(u, 'combat') && !u.heroicMoved);
  if (!heroes.length || c.some(u => u.side !== win && alive(u))) return [];
  return c.filter(u => u.side === win && alive(u) && !u.heroicMoved && !u.frozen && !u.T.warBeast && !u.T.chariot);
}

/* ---------- Stand Fast (p. 61) and Heroic Resolve (p. 84) ---------- */
// A Hero that passes its Courage Test for a Broken army calls Stand Fast at the end of its Activation: friendly
// Warriors that Activate within 6″ of it and can see it pass their own test without rolling. Other Heroes still test.
// G.standFast: the Heroes that called it this turn, or null while no mission has taught the rule yet.
export function callStandFast(h) {
  const sf = G.standFast; if (!sf || sf[h.side].includes(h)) return;
  if (invisible(h)) return;   // an Invisible Hero gives no Stand Fast (p. 127)
  sf[h.side].push(h);
  // A war horn, once per game, adds 3″ to the Stand Fast of its own Hero or of a Hero in whose range it stands (p. 110):
  // blown when a Warrior that still has to test stands between 6″ and 9″ of the Hero.
  // Its range: 6″, or 12″ for Théoden and Saruman (named.js).
  const R = standFastRange(h);
  const bearer = [h, ...sideAlive(h.side).filter(o => o !== h && gap(o, h) <= SHOUT_RANGE + 1e-6)].find(o => hasHorn(o) && !o.hornUsed);
  const reach = bearer && sideAlive(h.side).some(w => !isHero(w) && !w.tested && !engaged(w) && gap(w, h) > R + 1e-6 && gap(w, h) <= R + 3 + 1e-6 && !losBlocked(w, h));
  if (reach) { bearer.hornUsed = true; h.sfRange = R + 3; h.sfHorn = bearer; }
}
// Voice of Curunir: Saruman's Stand Fast covers friendly Heroes too.
export function standFastFor(u) {
  if (!G.standFast) return null;
  return G.standFast[u.side].find(h => h !== u && alive(h) && (!isHero(u) || heroesStandFast(h)) && gap(u, h) <= (h.sfRange || standFastRange(h)) + 1e-6 && !losBlocked(u, h)) || null;
}
// A Broken army's Courage Test that needs no roll: Heroic Resolve, or a Warrior near a Hero that called Stand Fast.
// Returns { why, h } or null.
// A Hero with Heroic Resolve that was Charged before it could Activate still Activates, only to call Stand Fast (p. 84):
// at the start of its side's Activation phase. Returns the Heroes that did.
export function resolveStandFast(side) {
  if (!G.broken || !G.broken[side]) return [];
  const list = sideAlive(side).filter(u => u.resolve && engaged(u) && !u.tested);
  for (const u of list) { u.tested = true; callStandFast(u); }
  return list;
}
export function autoCourage(u) {
  const a = autoPass(u);   // Fearless, Sworn Protector, Bodyguard
  if (a) return a;
  if (u.T.chariot || u.T.warBeast) return { why: 'rams' };   // Chariots and War Beasts pass every Broken army test (p. 148, 152)
  if (isHero(u) && u.resolve) return { why: 'resolve', h: u };
  const h = standFastFor(u);
  if (h) return { why: 'standFast', h };
  // Last Stand (p. 152): a Hero of Legend who is the General passes its first Broken army Courage Test on its own.
  if (u.general && u.T.tier === 'Legend' && !u.lastStand && G.align) { u.lastStand = true; return { why: 'lastStand', h: u }; }
  return null;
}
