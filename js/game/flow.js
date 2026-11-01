// Turn sequence and actions. Uses the rules engine for decisions and the ui/* modules
// (board, tray, panel) to show what happens. The steps and their order are those of the 2024 rules and the same as in
// the headless game (engine/sim.js, which the balance tool plays): every roll goes through the engine's rolling
// procedures, which this module carries out with the dice tray and the player's buttons (play()).
import { chargeTests, autoPass, SPECIALS, rule, against, specialKey } from '../engine/special.js';
import { G, gen, waiter, ABORT, prefs, setG, setWaiter, abortFlow, sleep } from '../state.js';
import { $, fmt, pct, pl, d6, RM, esc } from '../util.js';
import { gap, pieceBox } from '../engine/geometry.js';
import { brutalOptions, rendRolls, rendSeq, barge, bargeMove, hurlSeq, monstrousDown, supportersOf, freeStrikes, aiBrutal } from '../engine/monsters.js';
import { moveVal, invisible } from '../engine/rules.js';
import { sentries, sentryRoll, sentryOptions, aiSentryMove, alarmCheck, ringbearer, canWearRing, putOnRing, sauronSeq, removeRingSeq, aiRing, myPrecious } from '../engine/advanced.js';
import { isSiege, siegeWhy, inArc, aiSiegeShot, siegeAimSeq, siegeShotSeq, siegeHitNeed, disableCheck } from '../engine/siege.js';
import { isGate, gateSeq, raiseLadder, afterLadder, pushable, pushSeq } from '../engine/fortress.js';
import { warbands, arrivalSeq, arrivalPoint, aiArrival, arrive, escapes, destroySupplies, SCENARIOS } from '../engine/scenarios.js';
import { rams, isChariot, isWarBeast, ridden, rampSeq, impactSeq, crashSeq, rampPlan, aiRamp, faceOnly, rampDown, immovable, stampedeSeq, aiStampede, chargedBy, cmdFalls } from '../engine/beasts.js';
import { castable, targets, castSeq, effectSeq, castWill, castChance, powerOf, powerKey, powerArg, aiCast, endPhase, freeDice, paralyseSeq, paralysed, staffTurn } from '../engine/magic.js';
import { MISSIONS, taughtIn, knows, missionNo } from '../data/missions.js';
import {
  alive, sideAlive, canMove, engaged, names, groupNames, needStr, shooterReason, shotInfo, shotSeq, findFights, backAwayOptions,
  coverNote, dropLinks, canDefend, checkBroken, needsCourage, idleActivations, spendShot, throwWeapon, throwSpot, throwInfo, chargeSpot, remaining, flee, casualties, breakPoint, woundNeed, readyStones,
} from '../engine/rules.js';
import {
  pairings, bestPartition, orderCombats, sortCombats, describeCombat, goodsOf, evilsOf, contactsIn,
  backAwayAll, strikeTargets, bestStrikeTarget, separateTrapped, trappedIfLose, assignSupport, supOf, unpaired,
  rollDuelDice, duelLead, rerollPick, bannersOf, bannerFor, canShield, shieldPays,
  barrierOf, mayCross, crossBarrier, barrierBackAway,
  chargeBonus, knockDown, bestPart, thrownRiderSeq, knockedFlyingSeq, separateMount, woundPart,
  isHero, mightPlanDuel, duelSeq, noteDuel, strikeSeq, hurtSeq, strikesOf, woundBonus, woundReroll, bladesD, strikeWounds, venomMark, venomEnd,
  shieldwallSnap, defOf, staysUp, forthEorlingas, eorlingasGeneral, useEorlingas,
  weaponsOf, twoH, aiWeapon, pickWeapons, dropWeapons, halfHand, hasShield, canDismount, dismountAtWill, sweepTargets,
} from '../engine/combat.js';
import { d6Test, courageSeq, intelligenceSeq } from '../engine/dice.js';
import {
  HEROIC, HEROIC_KEYS, anyHeroics, sideOptions, declareSeq, heroicQueue, stillPossible, cancel, shout, shoutReach, declared,
  heroicCombatMovers, combatStartSeq, strikePending, autoCourage, callStandFast, resolveStandFast, challengeSlain, challengeBonus, strikeS, endMovePhase, challenging,
  hunterSlain, mightyHero,
} from '../engine/heroes.js';
import { buildUnits, freshTurn } from '../engine/setup.js';
import { needsSwim, swimSeq, applySwim, inDeep } from '../engine/terrain.js';
import { applyCross, forcedCharge, rollFall, testName, heightOf, nearestFree, fallHits, crossTestSeq } from '../engine/terrain.js';
import { aiPlanMove, aiPickShot, aiMoveOrder, aiAnswer, aiShout, askSide } from '../engine/ai.js';
import { alignmentOf } from '../engine/matched.js';
import { alignOf } from '../engine/rules.js';
import * as N from '../engine/named.js';
import { lighters, quenchers, lightSeq, quenchSeq, keptAside, hordeSeq, hordeReturn, burningCount, stores, brand } from '../engine/narrative.js';
import { setPhase, setAction, updateHint, updateMission, renderCard, log, hlChart, resetPanel, showPriority, setBusy } from '../ui/panel.js';
import { beginUndo, endUndo } from './undo.js';
import { fit, animTo, animFrom, fxText, fxArrow, fxDeath } from '../ui/board.js';
import { tray } from '../ui/tray.js';
import { showResult, markDone } from '../ui/menu.js';
import { teach, closeLesson, coach } from '../ui/lessons.js';
import { sfx } from '../ui/audio.js';

/* ---------- Waiting for the player ---------- */
export function waitAction(label) {
  const g = gen;
  return new Promise((res, rej) => { if (g !== gen) return rej(ABORT); showWaiter({ res, rej, label }, true); });
}
function waitChoice(first, second) {
  const g = gen;
  return new Promise((res, rej) => { if (g !== gen) return rej(ABORT); showWaiter({ res, rej, label: first, second }, true); });
}
// Waits for a click on the board (input.js resolves it); the button only shows what to do.
function waitPick(label) {
  const g = gen;
  return new Promise((res, rej) => { if (g !== gen) return rej(ABORT); showWaiter({ res, rej, label, off: true }, true); });
}
// The buttons of a wait: its label, and its second button if it has one. fresh: a new wait (it goes on top of any wait
// still pending, state.js: setWaiter).
function showWaiter(w, fresh) {
  if (fresh) setWaiter(w);
  setAction(w.label, w.off || (!fresh && G && G.busy));
  if (w.second) { const b2 = $('#act2'); b2.textContent = w.second; b2.hidden = false; }
}
export function resolveWaiter(val) {
  if (!waiter) return;
  const w = waiter;
  setWaiter(null);
  if (waiter) showWaiter(waiter, false); else setAction(null);
  w.res(val);
}
// A wait the Options may settle without the player: `auto` returns the answer when a switch (Auto roll, Auto Back Away,
// AI plays for you…) allows it, else undefined. It is asked now, and again whenever an option changes meanwhile.
// opt.off: the button only shows what to do (the answer comes from the board); opt.second: a second button.
async function waitAuto(kind, auto, label, opt = {}) {
  const v = auto();
  if (v !== undefined) { setAction(null); await sleep(RM ? 100 : 350); return v; }
  const outer = G.autoWait;
  G.autoWait = { kind, auto };
  try { return await (opt.second ? waitChoice(label, opt.second) : opt.off ? waitPick(label) : waitAction(label)); } finally { G.autoWait = outer; }
}
// A question for the player (G.ask, shown by panel.js) that may come in the middle of another wait, such as a Hero's
// Might on a Jump Test during the player's move: whatever the panel showed before comes back afterwards.
// A rule of the player's army that it may use now (a Hero's or the army's): asks, unless the app plays for the player;
// then auto() decides. Returns true to use it.
async function askRule(title, body, yes, no, auto) {
  return (await askPlayer({ kind: 'useRule', title, body }, 'useRule', () => (autoPlay() ? (auto() ? 'first' : 'second') : undefined), yes, { second: no })) === 'first';
}
async function askPlayer(ask, kind, auto, label, opt) {
  const was = { ask: G.ask, step: G.step };
  G.ask = ask; G.step = 'good'; updateHint();
  try { return await waitAuto(kind, auto, label, opt); } finally { G.ask = was.ask; G.step = was.step; updateHint(); }
}
export function optionsChanged() {
  if (!G) return;
  if (!prefs.ruler) G.fire = null;
  updateHint();
  const w = G.autoWait;
  if (!w || !waiter) return;
  const v = w.auto();
  if (v !== undefined) resolveWaiter(v);
}
const autoPlay = () => prefs.autoplay;
const autoRoll = () => prefs.autoRoll || prefs.autoplay;
function checkpoint(atEnd) { const r = outcome(atEnd); if (r) { finish(r); throw ABORT; } }
// How the battle stands: the mission's own check, or, once the player fights on after the result, only the end of
// one army (no turn limit then).
export function outcome(atEnd) {
  if (!G.freeplay) return G.m.check(atEnd);
  const g = sideAlive('good').length, e = sideAlive('evil').length;
  return !e ? 'win' : !g ? 'lose' : null;
}
// Fight on after the mission is decided: the battle goes on from the End phase of the turn it was decided in.
export function keepFighting() {
  if (!G || !G.over || G.freeplay) return;
  G.over = false; G.freeplay = true;
  log({ ph: 'End', text: 'You fight on. The mission is decided; the battle now goes on until one army is gone. Leave it any time from the Menu.' });
  runGame(true);
}

/* ---------- New game ---------- */
// i: the mission. A matched play battle (engine/matched.js) comes as `match`, with i the last mission, so that every
// rule taught so far is in play; so does the heroes sandbox (data/missions.js: SANDBOX), which also has every Heroic
// Action.
export function newGame(i, match) {
  abortFlow();
  closeLesson();
  const m = match || MISSIONS[i];
  // Heroic Actions in play (engine/heroes.js): those the missions so far have taught; all of them in matched play and
  // in the sandbox.
  // A mission may list its own (heroics: [] keeps them off, as the Battle of Edoras booklet does before Torch the City).
  const heroics = HEROIC_KEYS.filter(k => m.matched || m.heroics === 'all' || (Array.isArray(m.heroics) ? m.heroics.includes(k) : knows(HEROIC[k].rule, i)));
  const standFastOn = !!(m.matched || m.heroics === 'all' || knows('standFast', i));   // Stand Fast (p. 61), once taught
  setG({ mi: i, m, W: m.board[0], H: m.board[1], units: buildUnits(m), terrain: m.terrain, turn: 1, phase: null, priority: 'good', chooser: null, choosing: false, rollPrompt: false,
    step: null, mode: null, sel: null, active: null, hoverPt: null, hoverUnit: null, inspect: null, preview: null, flash: null, armed: null, aimAt: null,
    curFight: null, combats: null, pairing: null, enemyPick: null, strike: null, fx: [], busy: false, running: false, over: false, autoWait: null, fire: null,
    align: m.matched ? alignmentOf(m) : m.align || null, deployed: !m.zones, objectives: m.objectives || null,   // m.align: a mission played from the Evil side (missions.js: flipSide)
    heroics: new Set(heroics), challenges: [], standFastOn,
    specials: m.matched || m.heroics === 'all' ? null : new Set(SPECIALS.filter(k => knows(k, i))),   // special rules in play (special.js)
    standFast: null, only: null, declare: null, ask: null,
    // Break Points (p. 61): the models each side starts with; Broken armies only once the rule has been taught.
    start: m.start || { good: m.units.filter(u => u.side === 'good').length, evil: m.units.filter(u => u.side === 'evil').length },
    broken: m.matched || (knows('broken', i) && !m.narrative) ? { good: false, evil: false } : null });   // no Broken armies in Narrative Play (narrative_play/#narrative-play-notes)
  resetPanel(i);
  showPriority(null);
  tray.reset();
  setPhase(null);
  setAction(null);
  updateMission();
  updateHint();
  renderCard(true);
  fit();
}

// fightOn: the player fights on after the result (keepFighting): the turn it was decided in ends first.
export async function runGame(fightOn = false) {
  G.running = true;
  try {
    if (fightOn) { await phaseEnd(); G.turn++; }
    if (!G.deployed) await phaseDeploy();
    if (G.turn === 1 && G.m.scen === 'fog' && G.m.fog && !G.m.fog.good) { await fogPicksAct(); updateMission(); }   // Fog of War: the player's secret picks
    for (;;) {
      await phasePriority();
      await phaseMove();
      await phaseShoot();
      await phaseFight();
      await batterGatesAct();   // a siege: the attackers at a gate Strike it (p. 159)
      await phaseEnd();
      G.turn++;
    }
  } catch (e) { if (e !== ABORT) console.error(e); }
}
const order = () => G.priority === 'good' ? ['good', 'evil'] : ['evil', 'good'];

/* ---------- Phases ---------- */
// Matched play: before turn 1 the player may move their models anywhere inside their deployment zone (input.js).
async function phaseDeploy() {
  setPhase('deploy');
  G.mode = 'deploy'; G.step = 'good'; G.sel = null; updateHint();
  log({ ph: 'Deployment', text: `The enemy has deployed ${pl(sideAlive('evil').length, 'model')} along the far edge. Arrange your ${pl(sideAlive('good').length, 'model')} inside your deployment zone, then start the battle.` });
  await waitAction('Start the battle');
  G.mode = null; G.step = null; G.sel = null; G.preview = null; G.flash = null; G.armed = null; G.deployed = true;
  setPhase(null);
}

async function phasePriority() {
  G.units.forEach(freshTurn); G.units.forEach(mightyHero); staffTurn(G.units);   // a Staff of Power's free Will Point
  G.standFast = G.standFastOn ? { good: [], evil: [] } : null;
  G.active = null;
  setPhase('priority');
  // Broken armies are checked at the start of the turn (p. 61).
  for (const s of checkBroken()) {
    const mine = s === 'good';
    log({ auto: true, ph: 'Priority', why: ['broken'], tone: mine ? 'bad' : 'good', text: `${mine ? 'Your army' : 'The enemy army'} is Broken: it has lost ${casualties(s)} of ${G.start[s]} models, more than its Break Point of ${breakPoint(s)}. From now on every model of ${mine ? 'yours' : 'theirs'} that acts must first pass a Courage Test, or it flees. Models Engaged in Combat do not act, so they do not test.` });
    await teach(['broken'], { side: s });
  }
  // Scenario rule: a fixed Priority, for the whole mission or for some turns.
  const always = typeof G.m.priority === 'string', fixed = always ? G.m.priority : G.m.priority && G.m.priority[G.turn];
  if (fixed) {
    G.priority = fixed; G.chooser = fixed; showPriority(fixed);
    const who = fixed === 'good' ? 'you have' : 'the enemy has';
    if (!always) log({ ph: 'Priority', text: `Turn ${G.turn}. Scenario rule: ${who} Priority this turn, so nobody rolls.`, why: ['priority'], tone: fixed === 'good' ? 'good' : 'bad' });
    else if (G.turn === 1) log({ ph: 'Priority', text: `Scenario rule: ${who} Priority in every turn of this mission, so ${fixed === 'good' ? 'your side always acts first' : 'the enemy always acts first'} and nobody rolls. Mission ${missionNo(taughtIn('priority'))} shows how Priority is rolled.`, why: ['priority'], tone: fixed === 'good' ? 'good' : 'bad' });
    updateHint();
    await sleep(always && G.turn > 1 ? 200 : 500);
    return;
  }
  showPriority('roll');
  G.step = 'good'; G.rollPrompt = true; updateHint();
  await teach(['priority']);
  if (!autoRoll()) coach('priority');
  await waitAuto('priority', () => (autoRoll() ? 'first' : undefined), 'Roll for Priority');
  G.step = null; G.rollPrompt = false; updateHint();
  let a, b, rerolls = 0;
  // "Do you think the eyes of the white tower are blind?" (named.js): Denethor's side wins the roll, once per game.
  // The player decides for their own Denethor (the app: the first turn the armies are within 18″), the computer for its.
  const mine = N.canClaim('good') && await askRule('Denethor: claim Priority?', '"Do you think the eyes of the white tower are blind?" Once per game, before the Priority roll, his side wins it this turn.', 'Claim Priority', 'Roll as normal', () => N.wantsClaim('good'));
  const claim = N.claimPriority([mine && 'good', N.wantsClaim('evil') && 'evil'].filter(Boolean));
  if (claim) log({ ph: 'Priority', why: ['armyRule'], tone: claim === 'good' ? 'good' : claim === 'evil' ? 'bad' : undefined, text: claim === 'roll' ? 'Both Denethors claim Priority ("Do you think the eyes of the white tower are blind?"): both rules are used, and the roll goes ahead as normal.' : `"Do you think the eyes of the white tower are blind?": Denethor claims Priority, so ${claim === 'good' ? 'you win' : 'the enemy wins'} the roll this turn.` });
  tray.begin(`Turn ${G.turn}: Priority roll`);
  for (;;) {
    a = d6(); b = d6();
    const tie = a === b;
    await tray.throw([
      { l: 'You', side: 'good', d: [{ v: a, ok: tie ? undefined : a > b }], res: tie ? 'Tie' : a > b ? 'Chooses Priority' : '' },
      { l: 'Enemy', side: 'evil', d: [{ v: b, ok: tie ? undefined : b > a }], res: tie ? 'Tie' : b > a ? 'Chooses Priority' : '' },
    ], { primed: !rerolls });
    if (!tie || G.turn > 1) break;
    rerolls++;
    await sleep(700);
    tray.begin('Tie in turn 1, so roll again');
  }
  const chooser = claim && claim !== 'roll' ? claim : a > b ? 'good' : b > a ? 'evil' : (G.chooser === 'good' ? 'evil' : 'good');
  G.chooser = chooser;
  const dice = [{ l: 'You', d: [{ v: a, ok: chooser === 'good' ? true : undefined }] }, { l: 'Enemy', d: [{ v: b, ok: chooser === 'evil' ? true : undefined }] }];
  const how = claim && claim !== 'roll' ? 'Denethor claimed it' : a !== b ? (a > b ? 'you rolled higher' : 'the enemy rolled higher') : 'a tie, so the side that did not choose last turn chooses';
  const re = rerolls ? ` (after ${pl(rerolls, 're-roll')} of a tie)` : '';
  if (chooser === 'good') {
    log({ ph: 'Priority', text: `Turn ${G.turn}. Priority roll${re}: ${how}. You choose who has Priority.`, dice, why: ['priority'], tone: 'good' });
    G.step = 'good'; G.choosing = true; updateHint();
    if (!autoPlay()) coach('choose');
    // With AI plays for you the app takes Priority (moving first is usually worth more than reacting).
    const c = await waitAuto('choose', () => (autoPlay() ? 'first' : undefined), 'Take Priority', { second: 'Hand over Priority' });
    G.step = null; G.choosing = false;
    G.priority = c === 'second' ? 'evil' : 'good';
    log({ ph: 'Priority', text: G.priority === 'good' ? `${autoPlay() ? 'The app takes' : 'You take'} Priority: your side acts first.` : 'You hand over Priority: the enemy acts first and you react to its moves.' });
  } else {
    G.priority = 'evil';
    log({ ph: 'Priority', text: `Turn ${G.turn}. Priority roll${re}: ${how}. The enemy chooses and takes Priority, so it acts first.`, dice, why: ['priority'], tone: 'bad' });
  }
  N.priorityGiven(chooser);   // Wizard's Pupil, Dunlending Commander
  showPriority(G.priority);
  updateHint();
  await sleep(550);
}

// The Move phase (p. 26): Declare Heroic Actions, the Heroic Moves, then the Activation phase of the side with
// Priority and then of the other side.
async function phaseMove() {
  setPhase('move');
  if (G.turn === 1 && G.objectives && !G.m.matched) await teach(['objectives']);
  await declareStep('move');
  await heroicMoves();
  for (const side of order()) {
    standFastResolve(side);
    await sentryActs(side);   // Sentries Activate first (p. 135)
    await beastStarts(side);   // a Stampede first; a War Beast Trampling those that Charged it
    if (side === 'good') {
      // Nothing to move now: the Warbands still to arrive (Hold Ground, Reconnoitre) and the models standing still
      // Activate all the same, below (as sim.js).
      if (!sideAlive('good').some(canMove)) {
        if (!G.units.some(u => u.side === 'good' && u.reserve && !u.dead)) log({ auto: true, ph: 'Move', text: 'None of your models can move: they are all Engaged in Combat, or have Activated already.', why: ['charge'] });
      } else {
        G.step = 'good'; G.mode = autoPlay() ? 'auto' : 'move'; G.active = null; beginUndo(); updateHint();
        if (!autoPlay()) await teach(moveLessons());
        // 'auto': AI plays for you (switched on now or during the move): the app moves what has not moved yet.
        const r = await waitAuto('move', () => (autoPlay() ? 'auto' : undefined), 'End move');
        endUndo(); G.mode = null; G.sel = null; G.preview = null; G.fire = null; G.active = null;
        if (r === 'auto') { G.mode = 'auto'; setAction(null); updateHint(); await aiMove('good'); G.mode = null; }
      }
    } else {
      G.step = 'evil'; setAction(null); updateHint();
      await aiMove('evil');
    }
    // Reinforcements (Hold Ground, Reconnoitre): Warbands arriving at the end of the side's Activations move at once.
    const arr = await reinforceAct(side);
    if (arr.length && side === 'good' && !autoPlay()) {
      G.step = 'good'; G.mode = 'move'; G.only = arr; G.active = null; updateHint();
      const r = await waitAuto('move', () => (autoPlay() ? 'auto' : undefined), 'End move');
      G.mode = null; G.sel = null; G.only = null; G.active = null;
      if (r === 'auto') await aiMove('good', arr);
    } else if (arr.length) await aiMove(side, arr);
    const back = await hordeAct(side);   // a Narrative Scenario's slain coming back (engine/narrative.js)
    if (back.length && side === 'good' && !autoPlay()) {   // the player commands the Hill Tribes (missions.js: flipSide)
      G.step = 'good'; G.mode = 'move'; G.only = back; G.active = null; updateHint();
      const r = await waitAuto('move', () => (autoPlay() ? 'auto' : undefined), 'End move');
      G.mode = null; G.sel = null; G.only = null; G.active = null;
      if (r === 'auto') await aiMove('good', back);
    } else if (back.length) await aiMove(side, back);
    for (const u of idleActivations(side)) await courageAct(u);   // the models that stood still Activate too (p. 60)
    if (alignOf(side) === 'good') await quenchAct();
    checkpoint(false);
  }
  await lightAct();
  G.step = null;
  endMovePhase();
}
// A Hero with Heroic Resolve that was Charged before it could Activate still calls Stand Fast (p. 84).
function standFastResolve(side) {
  for (const u of resolveStandFast(side)) log({ auto: true, ph: 'Move', why: ['heroicResolve', 'standFast'], tone: side === 'good' ? 'good' : 'bad', text: `${u.name} is Engaged in Combat, but its Heroic Resolve lets it Activate to call Stand Fast: Warriors that Activate within 6″ of it and can see it pass their Courage Tests.` });
}

// Lessons that matter when the player starts moving: the table decides which rules are in play.
function moveLessons() {
  const foes = sideAlive('evil');
  return ['profile', 'move', foes.some(e => !engaged(e)) && 'cz', G.terrain.some(T => T.k === 'brush') && 'terrain',
    !G.m.noShoot && sideAlive('good').some(u => u.bow) && 'shoot', !G.m.noCharge && foes.length && 'charge',
    sideAlive('good').some(u => u.T.spear) && 'spear', sideAlive('good').some(u => u.T.pike) && 'pike',
    sideAlive('good').some(u => u.T.thrown) && 'throwing', sideAlive('good').some(u => u.T.thrown && u.T.spear) && 'spearMastery',
    sideAlive('good').some(u => (u.T.rules || []).includes('Bodyguard')) && 'bodyguard', G.units.some(u => (u.T.rules || []).includes('Shieldwall')) && 'shieldwall',
    sideAlive('good').some(u => u.T.banner) && 'banner',
    G.terrain.some(T => T.k === 'hedge' || T.k === 'plateau') && 'obstacles', sideAlive('good').some(u => u.prone) && 'prone',
    sideAlive('good').some(u => G.terrain.some(T => canDefend(u, T))) && 'barriers',
    sideAlive('good').some(u => u.cav) && 'cavalry'].filter(Boolean);
}

// The Shoot phase (p. 40): Declare Heroic Actions, the Heroic Shoots, then each side shoots, Priority first.
async function phaseShoot() {
  setPhase('shoot');
  readyStones(G.units);
  if (G.m.noShoot) { await sleep(200); return; }   // scenario rule: nobody shoots in this mission
  await declareStep('shoot');
  await takeAimShouts();
  await heroicShoots();
  for (const side of order()) {
    await siegeShots(side);   // the crew firing a Siege Engine do not shoot themselves
    const shooters = sideAlive(side).filter(u => u.bow && !u.shot);
    if (!shooters.length) continue;
    if (side === 'good') {
      const reasons = shooters.map(u => {
        const r = shooterReason(u); if (r) return `${u.name} ${r}`;
        return sideAlive('evil').some(t => shotInfo(u, t).ok) ? null : `${u.name} has no target in range and Line of Sight`;
      }).filter(Boolean);
      if (reasons.length === shooters.length) { log({ auto: true, ph: 'Shoot', text: `None of your models can shoot. ${reasons.join('; ')}.`, why: ['shoot'] }); continue; }
      G.step = 'good'; G.mode = autoPlay() ? 'auto' : 'shoot'; updateHint();
      if (!autoPlay()) await teach(['hit', 'itw', 'wound', 'cover']);
      const r = await waitAuto('shoot', () => (autoPlay() ? 'auto' : undefined), 'End shooting');
      G.mode = null; G.sel = null; G.preview = null; hlChart(null);
      if (r === 'auto') { G.mode = 'auto'; setAction(null); updateHint(); await aiShoot('good'); G.mode = null; }
    } else {
      G.step = 'evil'; setAction(null); updateHint();
      await aiShoot('evil');
    }
  }
  G.step = null;
}

// Log lines for The Warrior Poet and "Forth Eorlingas!" when a side uses them.
const logPoet = poet => log({ ph: 'Fight', why: ['heroRule'], tone: poet.side === 'good' ? 'good' : 'bad', text: `The Warrior Poet: ${poet.name} spends a Will Point. Until the end of the turn, friendly Rohan models within 6″ of him re-roll To Wound rolls of a natural 1.` });
const logEorl = eorl => log({ ph: 'Fight', why: ['armyRule'], tone: eorl.side === 'good' ? 'good' : 'bad', text: `"Forth Eorlingas!": ${eorl.name}, the General, Charged this turn. Until the end of the turn, Rohan models within 12″ of it re-roll every failed To Wound roll when they Strike (once per game).` });
// The Fight phase (p. 48): the side with Priority Pairs Off, Declare Heroic Actions, the Heroic Combats first (p. 82),
// then the other Combats in the order the side with Priority picks.
async function phaseFight() {
  setPhase('fight');
  // The Warrior Poet: the player decides for their Háma (the app: with two or more Rohan models near him fighting).
  for (const o of N.poetOptions('good', engaged)) {
    if (await askRule(`${o.h.name}: The Warrior Poet?`, `Spend one of ${o.h.name}'s ${o.h.will} Will Points: until the end of the turn, friendly Rohan models within 6″ of him re-roll To Wound rolls of a natural 1. ${o.n} of them ${o.n === 1 ? 'is' : 'are'} fighting now.`, 'Spend Will', 'Not now', () => o.n >= 2)) { logPoet(N.usePoet(o.h)); break; }
  }
  const poet = N.warriorPoet(engaged, ['evil']);   // the computer's Háma spends a Will Point
  if (poet) logPoet(poet);
  // "Forth Eorlingas!": the player decides when their General Charged (the app: at once), the computer uses it at once.
  const myGen = eorlingasGeneral('good');
  if (myGen && await askRule('"Forth Eorlingas!"?', `${myGen.name}, your General, Charged this turn. Once per game: until the end of the turn, Rohan models within 12″ of it re-roll every failed To Wound roll when they Strike.`, 'Use it now', 'Keep it', () => true)) logEorl(useEorlingas(myGen));
  const eorl = forthEorlingas(['evil']);   // Army of Edoras army rule
  if (eorl) logEorl(eorl);
  const groups = findFights();
  if (!groups.length) { await sleep(250); return; }
  let all = assignSupport(await pairOff(groups));   // every Combat of the phase; c.done once fought
  const show = () => { G.combats = all.filter(c => !c.done); updateHint(); };   // G.combats: those still to fight
  G.combats = all;
  if (G.priority === 'evil') await enemyPairing(groups, all);
  await declareStep('fight');
  // The side with Priority picks the order of the other Combats once the Heroic Combats are over. The player does it by
  // clicking a Combat (once the order of Combats is taught); otherwise Combats where the other side would be Trapped go first.
  const pick = G.priority === 'good' && knows('order', G.mi) && !prefs.autoPair && !autoPlay();
  const fought = new Set();
  let k = 0;
  const total = () => k + all.filter(c => !c.done).length;
  // Heroic Combats first, in the order of the D6 when both sides have one; a successful one lets its winners Move or
  // Charge, and then the side with Priority Pairs Off again.
  const Q = heroicQueue('combat');
  if (Q.first) {
    await heroicOrderRoll(Q, 'combat');
    for (let s; (s = Q.next()); ) {
      const h = await pickHeroic(s, Q.left(s), 'combat');
      Q.done(h);
      const c = all.find(x => !x.done && x.includes(h));
      if (!c || !stillPossible(h, 'combat')) { cancelled(h, 'combat', 'it is no longer in a Combat'); continue; }
      log({ auto: true, ph: 'Fight', why: ['heroicCombat'], tone: h.side === 'good' ? 'good' : 'bad', text: `${h.name}'s Heroic Combat: ${describeCombat(c)} is fought before every other Combat.` });
      const D = await fightOne(c, ++k, total(), false);
      c.forEach(u => fought.add(u.id));
      show();
      const movers = D ? heroicCombatMovers(c, D.win) : [];
      if (!movers.length) continue;
      await heroicCombatMove(movers, h, D.win);
      movers.forEach(u => fought.delete(u.id));
      const fresh = findFights().filter(g => g.some(u => !fought.has(u.id)));
      if (!fresh.length) continue;
      log({ auto: true, ph: 'Fight', why: ['heroicCombat', 'pairoff'], text: 'New fights after the Heroic Combat: the side with Priority Pairs Off again.' });
      const more = assignSupport(await pairOff(fresh));
      all = [...all.filter(x => x.done), ...all.filter(x => !x.done && !more.some(m => m.some(u => x.includes(u)))), ...more];
      show();
    }
  }
  if (!pick) {
    const rest = orderCombats(all.filter(c => !c.done), G.priority);
    all = [...all.filter(c => c.done), ...rest];
    show();
    if (G.priority === 'evil' && rest.length > 1) await enemyOrder(rest);
  }
  for (;;) {
    const rest = all.filter(c => !c.done);
    if (!rest.length) break;
    G.combats = rest;
    const D = await fightOne(rest[0], ++k, total(), pick && rest.length > 1);
    // A Monster that Barged and Charged again fights again (monsters.js): its new Combat is Paired Off.
    if (D && D.again && alive(D.again) && engaged(D.again)) {
      const fresh = findFights().filter(g => g.includes(D.again));
      const more = assignSupport(await pairOff(fresh));
      all = [...all.filter(x => x.done), ...all.filter(x => !x.done && !more.some(m => m.some(u => x.includes(u)))), ...more];
      show();
    }
  }
  G.curFight = null; G.combats = null;
}
// One Combat (p. 50): the side with Priority picks it (pick: the player clicks it), Heroic Strike's D3 at its start,
// Shielding (the side with Priority declares first), then the Duel Roll and the rest (resolveFight). Returns the Duel Roll.
async function fightOne(c0, k, total, pick) {
  G.curFight = c0;
  if (pick) { G.mode = 'order'; G.step = 'good'; }
  G.fightNo = { k, total };
  updateHint();
  // Shielding is declared before the Duel Roll, the side with Priority first (p. 111, 124). The enemy only shields once
  // the mission has taught it. The player answers with the second button, offered when every model of theirs in the
  // next Combat carries a shield (panel.js shows it).
  const shield = {};
  const enemyShield = () => { if (G.priority === 'evil' && knows('shielding', G.mi) && shieldPays(G.curFight, 'evil')) shield.evil = true; };
  if (!strikePending(G.curFight).length) enemyShield();
  G.offerShield = knows('shielding', G.mi) ? shield : null;
  updateHint();
  await teach([G.mode === 'order' && 'order', ...fightLessons(G.curFight)].filter(Boolean), { c: G.curFight });
  if (G.mode === 'order' && !autoPlay()) coach('order');
  if (G.offerShield && canShield(G.curFight, 'good') && !autoPlay()) coach('shield');
  // Auto roll skips the button when nothing else is decided with it (the order of Combats, Shielding);
  // with AI plays for you the app also decides Shielding ('auto'), where it pays.
  const offer = () => G.offerShield && canShield(G.curFight, 'good') && !strikePending(G.curFight).length;
  const skip = () => (autoPlay() ? 'auto' : prefs.autoRoll && G.mode !== 'order' && !offer() ? 'first' : undefined);
  let choice = await waitAuto('roll', skip, total > 1 ? `Roll the dice (fight ${k} of ${total})` : 'Roll the dice');
  G.mode = null; G.step = null; G.sel = null;
  const c = G.curFight;
  // A Heroic Strike's D3 is rolled at the start of the Hero's first Combat (p. 86), before anything is declared in it.
  if (strikePending(c).length) {
    tray.begin(`Heroic Strike: ${describeCombat(c)}`);
    await play(combatStartSeq(c), { ph: 'Fight' });
    enemyShield();
    if (knows('shielding', G.mi) && canShield(c, 'good') && !autoPlay()) {
      G.mode = null; G.step = 'good'; updateHint();
      choice = await waitAuto('roll', () => (autoPlay() ? 'auto' : undefined), 'Roll the dice');
      G.step = null;
    }
  }
  G.offerShield = null;
  G.fightNo = null;
  if (choice === 'second' && canShield(c, 'good')) shield.good = true;
  if (choice === 'auto' && knows('shielding', G.mi) && shieldPays(c, 'good', shield)) {
    shield.good = true;
    log({ ph: 'Fight', why: ['shielding'], text: `The app declares Shielding for ${names(goodsOf(c))}: the better choice here.` });
  }
  if (G.priority !== 'evil' && knows('shielding', G.mi) && shieldPays(c, 'evil', shield)) shield.evil = true;
  const D = await resolveFight(c, shield);
  c.done = true;
  updateMission(); renderCard(true);
  checkpoint(false);
  await sleep(250);
  return D;
}

// With Priority the enemy splits the fights into Combats and, after the Declare Heroic Actions step and the Heroic
// Combats, picks the order of the others. The player watches it do so, the way the player does it: it picks one of its
// models, then the model it should fight, one Combat after another (left to right); then it numbers the Combats in the
// order they will be fought. Then the game waits for the player.
const wait = ms => sleep(RM ? ms / 3 : ms);
async function enemyPairing(groups, cs) {
  const all = groups.map(g => pairings(g)).filter(o => o.length);
  if (!all.some(o => o.length > 1)) return;   // nothing to choose
  G.mode = 'enemyPair'; G.step = null; G.sel = null; G.curFight = null; G.combats = [];
  G.pairing = { open: all.map(opts => ({ opts, units: [...new Set(opts[0].flat())], made: [] })) };
  G.enemyPick = { stage: 'pair', note: '', shown: 0 };
  updateHint();
  await teach(['pairoff', 'order']);
  setAction('The enemy is pairing off…', true);
  await wait(500);
  // ci: a Combat keeps its colour while it grows and after the enemy numbers the Combats.
  const byX = sortCombats([...cs]);
  for (const [k, c] of byX.entries()) {
    const o = G.pairing.open.find(x => x.units.includes(c[0]));
    const e = evilsOf(c), single = e.length === 1, centre = single ? e[0] : goodsOf(c)[0], rest = c.filter(u => u !== centre);
    for (let j = 0; j < rest.length; j++) {
      const a = single ? centre : rest[j], b = single ? rest[j] : centre;   // the enemy's own model is picked first
      G.sel = a; G.enemyPick.note = `${a.name} picks ${b.name}`; updateHint();
      await wait(550);
      fxArrow(a, b);
      o.made = [...o.made.filter(m => m.ci !== k), Object.assign([centre, ...rest.slice(0, j + 1)], { ci: k })];
      G.sel = null; G.combats = currentCombats(); updateHint();
      await wait(350);
    }
  }
  byX.forEach((c, k) => { c.ci = k; });
  G.combats = cs; G.curFight = null; G.pairing = null; G.enemyPick = null; G.mode = null;
  log({ ph: 'Fight', why: ['pairoff'], tone: 'bad', text: `The enemy has Priority, so it Pairs Off the fights: ${cs.map(describeCombat).join('; ')}.` });
  updateHint();
}
async function enemyOrder(cs) {
  G.mode = 'enemyPair'; G.step = null; G.sel = null; G.curFight = null; G.combats = cs;
  cs.forEach((c, k) => { if (c.ci == null) c.ci = k; });
  G.enemyPick = { stage: 'order', note: '', shown: 0 };
  await teach(['order']);
  setAction('The enemy picks the order…', true);
  for (let k = 0; k < cs.length; k++) {
    G.curFight = cs[k]; G.enemyPick.shown = k + 1; updateHint();
    await wait(700);
  }
  G.curFight = null; G.enemyPick.stage = 'done';
  log({ ph: 'Fight', why: ['order'], tone: 'bad',
    text: `The enemy has Priority, so it picks the order of the Combats: ${cs.map((c, i) => `${i + 1}. ${describeCombat(c)}`).join('; ')}.` });
  updateHint();
  await waitAuto('continue', () => (autoPlay() ? 'first' : undefined), 'Continue: fight the Combats');
  G.mode = null; G.enemyPick = null;
}

// Lessons for a fight about to be rolled.
function fightLessons(c) {
  const many = goodsOf(c).length > 1 || evilsOf(c).length > 1;
  const pinned = trappedIfLose(c, 'evil').length || trappedIfLose(c, 'good').length;
  const B = barrierOf(c), g = goodsOf(c), e = evilsOf(c);
  return ['duel', many && 'multi', pinned && 'trapped', supOf(c, 'good').some(s => s.T.pike) && 'pike', bannerFor(c, 'good') && 'banner',
    (g.some(u => chargeBonus(u, e)) || e.some(u => chargeBonus(u, g))) && 'cavalrycharge',
    canShield(c, 'good') && 'shielding', c.some(u => alive(u) && weaponsOf(u).includes('two')) && 'twohanded', c.some(u => isHero(u) && u.might > 0) && 'might',
    B && B.mode === 'barrier' && 'barriers', B && B.mode !== 'barrier' && 'bothsides'].filter(Boolean);
}

// Splits every group of models in base contact into Combats. The side with Priority does it: the player
// (once Pairing Off is taught), the app on the player's behalf before that, or the enemy AI.
async function pairOff(groups) {
  const all = groups.map(g => pairings(g)).filter(opts => opts.length);
  const side = G.priority;
  const autoPair = () => prefs.autoPair || autoPlay();
  if (side === 'good' && knows('pairoff', G.mi) && !autoPair()) {
    // Nothing is suggested: the player forms every Combat by hand, model by model, even a plain 1 against 1.
    const before = G.combats;
    G.pairing = { open: all.map(opts => ({ opts, units: [...new Set(opts[0].flat())], made: [] })) };
    G.combats = currentCombats();
    G.mode = 'pair'; G.step = 'good'; G.sel = null; updateHint();
    await teach(['pairoff']);
    coach('pair');
    const done = waitAuto('pair', () => (autoPair() ? 'auto' : undefined), 'Done: fight these Combats');
    refreshPairing();
    const r = await done;
    const chosen = G.pairing.open.flatMap(o => o.made);
    G.mode = null; G.step = null; G.sel = null; G.pairing = null; G.combats = before;
    if (r !== 'auto') {   // 'auto': Auto Pair Off was switched on meanwhile, so the app takes over below
      log({ ph: 'Fight', text: `You Pair Off the fights: ${chosen.map(describeCombat).join('; ')}.`, why: ['pairoff'], tone: 'good' });
      return sortCombats(chosen);
    }
  }
  const fixed = [], open = [];
  for (const opts of all) { if (opts.length > 1) open.push(opts); else fixed.push(...opts[0]); }
  if (!open.length) return sortCombats(fixed);
  // The enemy's split is shown, with its order of Combats, by enemyChoice().
  const chosen = open.flatMap(opts => bestPartition(opts, side));
  if (side === 'good') {
    const how = knows('pairoff', G.mi) ? `The app splits the fights for you (${autoPlay() ? 'AI plays for you' : 'Auto Pair Off'} is on in Options).` : `The app splits the fights for you here; mission ${missionNo(taughtIn('pairoff'))} teaches how.`;
    log({ ph: 'Fight', why: ['pairoff'], text: `Pairing Off: ${chosen.map(describeCombat).join('; ')}. ${how}` });
  }
  return sortCombats([...fixed, ...chosen]);
}
export function currentCombats() {
  const p = G.pairing;
  return p ? assignSupport(sortCombats(p.open.flatMap(o => o.made))) : G.combats || [];
}
// After the player changes the split: new Combats on the table, and Done only once every model is in one.
export function refreshPairing() {
  const p = G.pairing; if (!p) return;
  G.combats = currentCombats();
  const left = p.open.reduce((n, o) => n + unpaired(o).length, 0);
  if (waiter) setAction(left ? `Done: ${pl(left, 'model')} left` : 'Done: fight these Combats', left > 0);
  updateHint();
}

async function phaseEnd() {
  setPhase('end');
  await endMagic();
  for (const d of disableCheck()) { fxDeath(d.e); log({ auto: true, ph: 'End', why: ['siege'], tone: d.e.side === 'evil' ? 'good' : 'bad', text: `${d.by.name} stands in base contact with ${d.e.name} and did nothing but Move this turn: the Siege Engine is disabled and removed.` }); updateMission(); }
  if (G.m.scen === 'supplies') for (const d of destroySupplies()) { log({ auto: true, ph: 'End', why: ['scenario'], tone: d.by.side === 'good' ? 'good' : 'bad', text: `${d.by.name} destroys ${d.o.side === 'good' ? 'one of your' : 'one of the enemy\'s'} Supply Markers.` }); updateMission(); }
  if (G.m.matched) for (const u of myPrecious()) { fxDeath(u); log({ auto: true, ph: 'End', why: ['ring'], tone: u.side === 'good' ? 'bad' : 'good', text: `My Precious: ${u.name} is the last of ${u.side === 'good' ? 'your' : 'the enemy'} army and wears the Ring. It succumbs to its call and is lost.` }); updateMission(); }
  for (const a of alarmCheck()) log({ auto: true, ph: 'End', why: ['sentries'], tone: a.side === 'good' ? 'good' : 'bad', text: a.why === 'near' ? `${a.by.name} spots ${a.e.name} within 3″: the alarm is raised, and ${a.side === 'good' ? 'your' : 'the enemy'} Sentries act normally from now on.` : `${a.by.name} was hit by a shot and survived: the alarm is raised.` });
  checkpoint(true);
  await sleep(400);
}

export function finish(r) {
  if (G.over) return;
  G.over = true; G.mode = null; G.sel = null; G.preview = null; G.curFight = null; G.combats = null; G.pairing = null; G.enemyPick = null; G.strike = null; G.only = null; G.declare = null; G.ask = null;
  abortFlow();
  setAction(null);
  updateHint();
  if (r === 'win' && !G.m.matched && !G.m.sandbox && !G.freeplay) markDone(G.mi);
  sfx.result(r === 'win');
  const text = G.m.matched ? { win: 'Victory.', lose: 'Defeat.', draw: 'A draw.' }[r] : r === 'win' ? 'Mission complete.' : r === 'draw' ? 'A draw.' : 'Mission failed.';
  log({ ph: 'End', text, tone: r === 'win' ? 'good' : r === 'lose' ? 'bad' : null });
  setTimeout(() => showResult(r), 700);
}

/* ---------- Heroic Actions (p. 79–86) ---------- */
const PH = { move: 'Move', shoot: 'Shoot', fight: 'Fight' };
// The Declare Heroic Actions step at the start of a phase (p. 79), when Heroic Actions are in play and some Hero
// could declare one: the side without Priority first, then back and forth until both sides pass.
async function declareStep(phase) {
  if (!anyHeroics() || !sideOptions('good', phase).length && !sideOptions('evil', phase).length) return;
  await teach(phase === 'move' ? ['heroic', 'heroicMove', 'heroicMarch', 'heroicChannelling'] : phase === 'shoot' ? ['heroic', 'heroicShoot', 'heroicAccuracy'] : ['heroic', 'heroicCombat', 'heroicStrike', 'heroicDefence', 'heroicStrength', 'heroicChallenge', 'intoTheFray']);
  await play(declareSeq(phase), { ph: PH[phase] });
}
// When both sides have a Heroic Move, Shoot or Combat, the side with Priority rolls a D6 for which goes first (p. 80).
async function heroicOrderRoll(Q, k) {
  if (Q.roll == null) return;
  const name = HEROIC[k].n, first = Q.first === 'good';
  tray.begin(`${name}s: which side goes first`);
  await tray.throw([{ l: `${G.priority === 'good' ? 'You roll' : 'The enemy rolls'} (Priority): 1–3 Evil first, 4+ Good first`, side: G.priority, d: [{ v: Q.roll, ok: true }], res: first ? 'You go first' : 'The enemy goes first' }], { primed: G.priority === 'good' });
  log({ ph: PH[HEROIC[k].phase], why: ['heroic', HEROIC[k].rule], tone: first ? 'good' : 'bad', dice: [{ l: 'Order D6', d: [{ v: Q.roll }] }],
    text: `Both sides declared a ${name}, so the side with Priority rolls a D6: ${Q.roll}. On ${Q.roll >= 4 ? '4+ the Good side' : '1–3 the Evil side'} chooses first: ${first ? 'your' : 'the enemy\'s'} Hero goes first, then the sides take turns.` });
  await sleep(300);
}
// Which of a side's Heroes performs its Heroic Move, Shoot or Combat next: the player picks when there is a choice.
async function pickHeroic(side, list, k) {
  if (list.length < 2 || side !== 'good' || autoPlay()) return list[0];
  const r = await askPlayer({ kind: 'heroicPick', list, k }, 'heroicPick', () => (autoPlay() ? list[0] : undefined), `Pick the Hero whose ${HEROIC[k].n} comes next`, { off: true });
  return list.includes(r) ? r : list[0];
}
// A Heroic Action that cannot be done any more when its turn comes is cancelled, and its Might Point is lost (p. 80).
function cancelled(h, k, why) {
  cancel(h, k);
  log({ auto: true, ph: PH[HEROIC[k].phase], why: ['heroic', HEROIC[k].rule], tone: h.side === 'good' ? 'bad' : 'good', text: `${h.name}'s ${HEROIC[k].n} is cancelled: ${why}. The Might Point is lost.` });
}
// Whether Hero h shouts With Me, At the Double, Loose or Take Aim (the player decides for their own Heroes).
async function askShout(h, k) {
  const reach = shoutReach(h, k).filter(o => (k === 'shoot' || k === 'accuracy' ? o.bow && !o.shot : true));
  if (!reach.length) return false;
  if (h.side !== 'good' || autoPlay()) return aiShout(h, k);
  await teach([HEROIC[k].rule], { u: h });
  const r = await askPlayer({ kind: 'shout', h, k, reach }, 'shout', () => (autoPlay() ? (aiShout(h, k) ? 'first' : 'second') : undefined), `Shout ${HEROIC[k].shout}!`, { second: 'No shout' });
  return r === 'first';
}
function logShout(h, k, list) {
  const what = { move: 'they Activate right after it and must finish within 6″ of it, or not move at all', march: 'they move 3″ further this turn but may not Charge, and must finish within 6″ of it',
    shoot: 'they may shoot now, with the Hero; those that do not cannot shoot later this phase', accuracy: 'they re-roll failed In The Way Tests this turn' }[k];
  const who = k === 'shoot' || k === 'accuracy' ? list.filter(o => o.bow) : list;
  log({ ph: PH[HEROIC[k].phase], why: ['heroic', HEROIC[k].rule], tone: h.side === 'good' ? 'good' : 'bad', text: `${h.name} shouts "${HEROIC[k].shout}!" ${who.length ? `${names(who)}: ${what}.` : 'No friend it would help is within 6″.'}` });
  fxText(h, `${HEROIC[k].shout}!`, h.side === 'good' ? 'good' : 'bad', 0);
}
// The Heroic Moves (p. 80–81), before either side's Activation phase.
async function heroicMoves() {
  const Q = heroicQueue('move');
  if (!Q.first) return;
  await heroicOrderRoll(Q, 'move');
  for (let s; (s = Q.next()); ) {
    const h = await pickHeroic(s, Q.left(s), 'move');
    Q.done(h);
    if (!stillPossible(h, 'move')) { cancelled(h, 'move', engaged(h) ? 'it was Charged before its turn came' : 'it cannot Activate'); continue; }
    if (needsCourage(h) && !(await courageAct(h))) continue;   // fled: the Heroic Move is gone with it
    log({ ph: 'Move', why: ['heroicMove'], tone: s === 'good' ? 'good' : 'bad', text: `${h.name}'s Heroic Move: it Activates before every other model.` });
    const withMe = (await askShout(h, 'move')) ? shout(h, 'move') : [];
    if (h.shouted) logShout(h, 'move', withMe);
    if (s === 'good' && !autoPlay()) await playerActivation([h], `Done: ${h.name}'s Heroic Move`);
    else await aiMove(s, [h]);
    h.done = true;
    if (!alive(h)) { withMe.forEach(o => { o.tether = null; }); continue; }   // With Me ends with the Hero
    // Every model With Me reached Activates now, even one that gives up its move, so in a Broken army it takes its
    // Courage Test (FAQ, Rules Manual p. 60).
    for (const o of withMe) if (alive(o) && needsCourage(o)) await courageAct(o);
    if (withMe.length) {
      if (s === 'good' && !autoPlay()) await playerActivation(withMe.filter(alive), 'Done: With Me');
      else await aiMove(s, withMe);
      withMe.forEach(o => { o.done = true; });
    }
    updateMission(); renderCard(true);
    checkpoint(false);
  }
}
// The player moves only the models in `list` (a Heroic Move, the friends its With Me reached, the winners of a Heroic
// Combat), then presses the button.
async function playerActivation(list, label) {
  const live = list.filter(alive);
  if (!live.length) return;
  G.only = live; G.step = 'good'; G.mode = 'move'; G.active = null; G.sel = live.find(canMove) || null; updateHint();
  const r = await waitAuto('move', () => (autoPlay() ? 'auto' : undefined), label);
  G.mode = null; G.sel = null; G.preview = null; G.fire = null; G.active = null; G.step = null;
  if (r === 'auto') { G.mode = 'auto'; setAction(null); updateHint(); await aiMove('good', live); G.mode = null; }
  G.only = null; updateHint();
}
// Take Aim (p. 84): a Hero on a Heroic Accuracy may shout it before the shooting starts.
async function takeAimShouts() {
  for (const h of G.units.filter(u => alive(u) && declared(u, 'accuracy'))) {
    if (await askShout(h, 'accuracy')) logShout(h, 'accuracy', shout(h, 'accuracy'));
  }
}
// The Heroic Shoots (p. 82): before either side shoots. With Loose, the friends within 6″ shoot at the same time.
async function heroicShoots() {
  const Q = heroicQueue('shoot');
  if (!Q.first) return;
  await heroicOrderRoll(Q, 'shoot');
  for (let s; (s = Q.next()); ) {
    const h = await pickHeroic(s, Q.left(s), 'shoot');
    Q.done(h);
    if (!stillPossible(h, 'shoot')) { cancelled(h, 'shoot', 'it was Charged and is Engaged in Combat'); continue; }
    log({ ph: 'Shoot', why: ['heroicShoot'], tone: s === 'good' ? 'good' : 'bad', text: `${h.name}'s Heroic Shoot: it shoots before every other model.` });
    const loose = (await askShout(h, 'shoot')) ? shout(h, 'shoot') : [];
    if (h.shouted) logShout(h, 'shoot', loose);
    const list = [h, ...loose].filter(u => u.bow && !u.shot);
    if (s === 'good' && !autoPlay()) {
      if (list.some(u => !shooterReason(u))) {
        G.only = list; G.step = 'good'; G.mode = 'shoot'; updateHint();
        const r = await waitAuto('shoot', () => (autoPlay() ? 'auto' : undefined), `Done: ${h.name}'s Heroic Shoot`);
        G.mode = null; G.sel = null; G.preview = null; G.step = null; hlChart(null);
        if (r === 'auto') await aiShoot('good', list);
        G.only = null;
      }
    } else await aiShoot(s, list);
    loose.forEach(u => { u.shot = true; });   // a friend that did not shoot with the Loose cannot shoot later (p. 82)
    updateMission(); renderCard(true);
    checkpoint(false);
  }
}
// A successful Heroic Combat (p. 82): the Hero and its friends from that Combat may Move or Charge again.
async function heroicCombatMove(movers, h, side) {
  for (const u of movers) { u.heroicMoved = true; u.movedDist = 0; u.done = false; u.moveStart = null; u.trail = []; }
  log({ ph: 'Fight', why: ['heroicCombat'], tone: side === 'good' ? 'good' : 'bad', text: `The Heroic Combat succeeds: every enemy in it is slain, so ${names(movers)} may Move or Charge again (and do nothing else). A new Combat is fought later in the phase.` });
  fxText(h, 'Heroic Combat!', side === 'good' ? 'good' : 'bad', 0);
  if (side === 'good' && !autoPlay()) await playerActivation(movers, 'Done: Heroic Combat move');
  else await aiMove(side, movers);
  movers.forEach(u => { u.done = true; });
  updateMission(); renderCard(true);
  checkpoint(false);
}

/* ---------- Rolling procedures in the game ---------- */
// The engine's rolling procedures (dice.js, rules.js: shotSeq, combat.js, heroes.js, terrain.js) stop at every dice
// and every decision; play() carries one out: dice land in the dice tray, the player answers the questions about their
// own models with the buttons (or a click on a dice), and the enemy (and AI plays for you) answers as the computer does.
// opt: { ph: the log's phase, side: whose colour for dice without a model, label(q) and res(q, die): a dice row's text,
// primed: the first dice flies without another click, dice: [] collects the rows for the log, notes: [] collects the
// re-rolls and Might spent for the log, c, rowG: the Combat and the player's row of a Duel Roll }.
async function play(gen, opt = {}) {
  const rows = opt.rows || (opt.rows = new Map());
  let first = true, r = gen.next();
  while (!r.done) {
    const q = r.value;
    let a;
    if (q.k === 'dice') { await showDice(q, opt, rows, first); first = false; }
    else if (q.k === 'reroll') { await tray.reroll(q.die); refreshRow(q, rows); noteReroll(q, opt); }
    else if (q.k === 'raise') { await tray.bump(q.die); refreshRow(q, rows); noteMight(q, opt); }
    else if (q.k === 'declared') await logDeclared(q);
    else if (q.k === 'answered') logAnswer(q);
    else if (q.k === 'masterOfBattle') {   // Master of Battle (p. 127): a free copy of the enemy's Heroic Action
      log({ ph: PH[HEROIC[q.a].phase], why: ['heroic', 'masterOfBattle'], tone: (q.u.side === 'good') === q.ok ? 'good' : 'bad', dice: [{ l: `Master of Battle ${q.need}+`, d: [{ v: q.v, ok: q.ok }] }],
        text: `${q.by.name} declared ${HEROIC[q.a].n} within 6″ of ${q.u.name}, a Master of Battle: ${q.v}. ${q.ok ? `${q.u.name} declares ${HEROIC[q.a].n} too, without spending Might.` : 'Not this time.'}` });
      renderCard(true);
    }
    else if (opt.on && opt.on[q.k]) a = await opt.on[q.k](q);   // the caller resolves this step itself (a Chariot's Impact Hits)
    else a = await ask(q, opt);
    r = gen.next(a);
  }
  return r.value;
}
const STEP = { hit: 'To Hit roll', itw: 'In The Way Test', fight: 'In The Way Test into the fight', cav: 'rider-or-mount test', wound: 'To Wound roll', fate: 'Fate Roll', jump: 'Jump Test', leap: 'Leap Test', climb: 'Climb Test', thrown: 'Thrown Rider Test' };
// The result shown beside a dice row.
const RES = {
  hit: (q, d) => (d.ok ? 'Hit' : 'Miss'),
  itw: (q, d) => (d.ok ? 'Carries on' : q.ctx && q.ctx.ob && q.ctx.ob.kind === 'model' ? `Hits ${q.ctx.ob.u.name}` : 'Stopped'),
  fight: (q, d) => (d.ok || !q.ctx.mate ? 'Hits the target' : `Hits ${q.ctx.mate.name}`),
  cav: (q, d) => { const m = q.ctx.target.mount.n.toLowerCase(), aimed = q.ctx.aimed; return d.ok === (aimed === 'rider') ? 'The rider' : `The ${m}`; },
  wound: (q, d) => (q.need.length > 1 && q.i === 0 ? (d.ok ? 'Rolled a 6' : 'No wound') : d.ok ? 'Wound' : 'No wound'),
  fate: (q, d) => (d.ok ? 'The Wound is prevented' : 'Not enough'),
  jump: (q, d) => (d.v === 1 ? 'Fails' : d.v === 6 ? 'Goes on' : 'Across'),
  thrown: (q, d) => (d.v === 1 ? 'Knocked Flying' : d.v === 6 ? 'Leaps into Action' : 'Rises From the Dust'),
};
RES.leap = RES.jump; RES.climb = RES.jump;
STEP.fire = 'fire roll'; STEP.horde = 'return roll';
RES.fire = (q, d) => (d.ok ? (q.need === 6 ? 'It burns' : 'Put out') : 'No luck');
RES.horde = (q, d) => (d.ok ? 'Comes back' : 'Stays down');
const resOf = (q, d, opt) => (opt.res ? opt.res(q, d) : RES[q.step] ? RES[q.step](q, d) : '');
function rowLabel(q, opt) {
  const base = (opt.label && opt.label(q)) || q.label || '';
  if (q.step === 'wound' && q.need && q.need.length > 1) return q.i === 0 ? `${base} · needs a 6 first` : `Then ${q.need[1]}+`;
  return base;
}
const TEST_WHY = { broken: 'Broken army', terror: 'Terror', fearful: 'Fearful', timid: 'Timid', survivalInstinct: 'Survival Instinct' };
// The modifiers of a Courage Test T, for the log: a war horn, Harbinger of Evil.
const courageMods = T => `${T.horn ? ' (+1 Courage: a war horn within 24″)' : ''}${T.harb ? ` (−1: ${T.harb.name}’s Harbinger of Evil)` : ''}${T.drained ? ` (Drain Courage: ${T.drained} worse)` : ''}${T.dismay ? ' (−1: an Aura of Dismay)' : ''}`;
// Why a model passes a Courage Test without a roll (special.js: autoPass, heroes.js: autoCourage).
const autoText = a => a.why === 'fearless' ? 'it is Fearless' : a.why === 'swornProtector' ? `it is the Sworn Protector of ${a.h.name}, who is still on the battlefield`
  : a.why === 'heroRule' ? `${a.n.replace(/[?!]$/, '')} (${a.h.name}) covers it` : a.why === 'bodyguard' ? `it is the Bodyguard of ${a.h.name}, who is still on the battlefield` : a.why === 'auraOfCommand' ? `${a.h.name}'s Aura of Command reaches it` : a.why === 'lastStand' ? 'it is the General and a Hero of Legend: Last Stand, the first such test passes' : a.why === 'fury' ? `${a.h.name}'s Fury reaches it` : a.why === 'resolve' ? 'its Heroic Resolve covers it' : a.why === 'rams' ? 'a Chariot or War Beast never flees a Broken army' : `${a.h.name} called Stand Fast within ${a.h.sfRange || N.standFastRange(a.h)}″ and in sight`;
async function showDice(q, opt, rows, first) {
  const side = q.u ? q.u.side : opt.side || 'neutral';
  if (q.step === 'courage' || q.step === 'intelligence') {
    const T = q.T, cour = q.step === 'courage', why = cour ? (TEST_WHY[q.why] || q.why) : q.why;
    const res = cour && q.why === 'broken' ? (T.ok ? 'stands' : 'flees') : T.ok ? 'passes' : 'fails';
    // When the tray title already names the test and the model, the row only gives the roll.
    const roll = `2D6${T.mod ? ` ${T.mod > 0 ? '+' : '−'}${Math.abs(T.mod)}` : ''}`, titled = (tray.title || '').includes(q.u.name);
    const [row] = await tray.throw([{ l: titled ? `${roll}, needs ${T.need}+` : `${cour ? 'Courage' : 'Intelligence'} Test ${T.need}+: ${q.u.name} (${why ? `${why}, ` : ''}${roll})`, side, d: T.dice.map(v => ({ v, ok: T.ok })), res: `${T.total}: ${res}` }]);
    rows.set(T, { row, q });
    return;
  }
  if (q.step === 'heroicStrike') {
    await tray.throw([{ l: `Heroic Strike: ${q.u.name}, D3`, side, d: [{ v: q.die.v, ok: true }], res: `Fight Value ${q.u.f} + ${q.d3} = ${q.u.f + q.d3}` }]);
    log({ ph: 'Fight', why: ['heroicStrike'], tone: side === 'good' ? 'good' : 'bad', dice: [{ l: 'Heroic Strike D3', d: [{ v: q.die.v }] }], text: `${q.u.name}'s Heroic Strike: a ${q.die.v} on the D3 roll, so +${q.d3} Fight Value for the rest of the Fight phase: ${q.u.f + q.d3}.` });
    fxText(q.u, `FV ${q.u.f + q.d3}`, side === 'good' ? 'good' : 'bad', 0);
    return;
  }
  const dice = q.dice || [q.die], label = rowLabel(q, opt);
  const res = q.step === 'wounds' ? (q.wounds ? pl(q.wounds, 'wound') : 'No wounds') : resOf(q, q.die, opt);
  const [row] = await tray.throw([{ l: label, side, d: dice.map(d => ({ v: d.v, ok: d.ok, mod: d.mod || 0, ref: d })), res }], { primed: first && !!opt.primed });
  for (const d of dice) rows.set(d, { row, q });
  if (opt.dice) opt.dice.push({ l: label, d: dice });
}
function refreshRow(q, rows) {
  const e = rows.get(q.die); if (!e) return;
  if (!e.q.dice) e.row.res = resOf(e.q, q.die, {});
}
// Re-rolls and Might spent go into the log: the Duel Roll gathers them in its own entry (opt.notes).
function noteReroll(q, opt) {
  if (q.step === 'duel') { (opt.notes || []).push(`${q.side === 'good' ? 'Your' : 'The enemy\'s'} banner: ${q.die.u.name} re-rolls a ${q.was} and gets ${q.die.v}${q.die.mod ? ` (${q.die.n} ${q.die.mod})` : ''}.`); return; }
  const text = `${q.u.name} re-rolls the failed ${STEP[q.step] || 'roll'} (${q.why}): ${q.was} → ${q.die.v}.`;
  if (opt.notes) opt.notes.push(text); else log({ ph: opt.ph || PH[G.phase] || 'Move', why: [q.why === 'Expert Rider' ? 'thrownrider' : 'heroicAccuracy'], text });
}
function noteMight(q, opt) {
  if (q.step === 'duel') {
    const notes = opt.notes || [], last = notes[notes.length - 1];
    const lead = duelLead(opt.D || { g: [], e: [] });
    if (last && typeof last === 'object' && last.die === q.die) { last.to = q.die.v; last.lead = lead === q.side; return; }
    notes.push({ u: q.u, die: q.die, from: q.from, to: q.die.v, lead: lead === q.side, toString() { return `${this.u.name} spends ${this.to - this.from} Might: ${this.from} → ${this.to}${this.lead ? ', and leads' : ''}.`; } });
    return;
  }
  const text = `${q.u.name} spends ${pl(q.n, 'Might Point')} on the ${STEP[q.step] || 'roll'}: ${q.from} → ${q.die.v}.`;
  if (opt.notes) opt.notes.push(text);
  else log({ ph: opt.ph || PH[G.phase] || 'Move', why: ['might'], tone: q.u.side === 'good' ? 'good' : 'bad', text });
}
async function logDeclared(q) {
  const H = HEROIC[q.a], mine = q.side === 'good';
  fxText(q.u, H.n, mine ? 'good' : 'bad', 0);
  log({ ph: PH[H.phase], why: ['heroic', H.rule], tone: mine ? 'good' : 'bad', text: `${mine ? 'You declare' : 'The enemy declares'}: ${q.u.name}, ${H.n}${q.t ? ` against ${q.t.name}` : ''} ${q.u.drum ? '(free, with its war drum: it must shout At the Double, which reaches 12″)' : q.u.giftTurn === G.turn ? `(free, by its own rule; ${q.u.might} Might left)` : `(1 Might Point, ${q.u.might} left)`}.` });
  renderCard(true);
  await sleep(RM ? 100 : 450);
}
function logAnswer(q) {
  log({ ph: 'Fight', why: ['heroicChallenge'], tone: q.u.side === 'good' ? 'good' : 'bad', text: q.acc ? `${q.u.name} accepts the challenge: both Heroes get +1 Attack and +1 To Wound against each other, and must Charge each other when they can.` : `${q.u.name} declines the challenge: ${q.by.name} still gets its bonuses against it, and ${q.u.name} may never challenge ${q.by.name}.` });
}
// A question from a rolling procedure: the player answers for their own models (unless AI plays for you), the
// computer for the enemy.
async function ask(q, opt) {
  const side = askSide(q);
  if (!side) return undefined;
  if (side !== 'good' || autoPlay() || (q.k === 'duelReroll' && autoRoll())) return aiAnswer(q);
  switch (q.k) {
    case 'might': return playerMightRoll(q);
    case 'fate': return playerFate(q);
    case 'courage': return playerCourage(q);
    case 'intelligence': return playerIntelligence(q);
    case 'duelReroll': return playerReroll(opt.c, q.D, opt.rowG, opt);
    case 'duelMight': return playerMight(opt.c, q.D, q.heroes, opt.rowG);
    case 'declare': return playerDeclare(q);
    case 'challenge': return playerAccept(q);
    case 'resist': return playerResist(q);
    case 'resister': return playerResister(q);
    case 'compelTo': return playerCompel(q);
    case 'hurlAt': return playerHurlAt(q);
    case 'scatter': return playerScatter(q);
    default: return aiAnswer(q);
  }
}
// Might on one of the player's Hero's own dice (To Hit, In The Way, To Wound, a test, a Fate Roll): Might comes last.
const GOAL = { hit: 'a hit', itw: 'the shot carries on', fight: 'it hits the target', cav: 'it hits the part aimed at', fate: 'the Wound is prevented', thrown: 'on its feet', cast: 'the power is Cast', resist: 'the power is resisted', scatter: 'dead on' };
async function playerMightRoll(q) {
  const o = q.opts[0], u = q.u;
  const goal = q.step === 'wound' ? (q.need.length > 1 && q.i === 0 ? 'then the second dice' : 'a wound') : ['jump', 'leap', 'climb'].includes(q.step) ? (o.to === 6 ? 'across, and it goes on' : 'across') : q.step === 'thrown' && o.to === 6 ? 'Leaps into Action' : GOAL[q.step] || 'it passes';
  await teach(['might'], { u });
  const r = await askPlayer({ kind: 'might', q, goal }, 'might', () => (autoPlay() ? aiAnswer(q) : undefined), `Spend ${o.n} Might: ${q.die.v} → ${o.to}, ${goal}`, { second: 'Keep the dice' });
  return typeof r === 'number' ? r : r === 'first' ? o.n : 0;
}
async function playerFate(q) {
  await teach(['fate'], { u: q.u });
  const r = await askPlayer({ kind: 'fate', u: q.u }, 'fate', () => (autoPlay() ? true : undefined), `Spend 1 Fate: a 4+ prevents the Wound (${q.u.fate} left)`, { second: 'Take the wound' });
  return r === true || r === 'first';
}
async function playerCourage(q) {
  const u = q.u, T = q.T, useWill = u.will > 0;
  await teach(['will'], { u });
  const r = await askPlayer({ kind: 'courage', u, T }, 'courage', () => (autoPlay() ? aiAnswer(q) : undefined), `Spend 1 ${useWill ? 'Will' : 'Might'}: ${T.total} → ${T.total + 1} (${T.need}+ needed)`, { second: 'Let it flee' });
  return r === 'first' ? (useWill ? 'will' : 'might') : r === 'will' || r === 'might' ? r : null;
}
async function playerIntelligence(q) {
  const u = q.u, T = q.T;
  await teach(['might'], { u });
  const r = await askPlayer({ kind: 'intelligence', u, T }, 'intelligence', () => (autoPlay() ? aiAnswer(q) : undefined), `Spend 1 Might: ${T.total} → ${T.total + 1} (${T.need}+ needed)`, { second: 'Accept the failure' });
  return r === 'first' || r === 'might' ? 'might' : null;
}
// An Intelligence Test in the dice tray for rule why (sim.js: intelligence has the same steps): a test already passed
// for the same rule this turn passes again. text(T): the log line. Returns whether it passed.
export async function intelligenceAct(u, why, mod = 0, text) {
  const k = `int:${why}`;
  if (u.passed.has(k)) return true;
  await teach(['intelligence'], { u });
  tray.begin(`Intelligence Test${why ? ` (${why})` : ''}: ${u.name}`);
  const T = await play(intelligenceSeq(u, why, mod), {});
  if (T.ok) u.passed.add(k);
  log({ ph: phName(), why: ['intelligence', ...(T.might ? ['might'] : [])], tone: T.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: `Intelligence ${T.need}+`, d: T.dice.map(v => ({ v })) }],
    text: text ? text(T) : `${u.name} takes an Intelligence Test (${why}): ${T.dice[0]} + ${T.dice[1]}${T.mod ? ` ${T.mod > 0 ? '+' : '−'} ${Math.abs(T.mod)}` : ''}${T.might ? ` + ${T.might} Might` : ''} = ${T.total} against ${T.need}+: ${T.ok ? 'passed' : 'failed'}.` });
  renderCard(true);
  return T.ok;
}
// The player's turn in the Declare Heroic Actions step: a Heroic Action from the list in the panel, or Pass.
// "Pass for the rest of the turn" (the second button) passes every later step of this turn too, also when the enemy
// declares (G.passTurn holds the turn); the player is asked again from the next turn on.
async function playerDeclare(q) {
  if (G.passTurn === G.turn && !autoPlay()) return null;
  const choices = q.options.flatMap(o => (o.k === 'challenge' ? o.targets.map(t => ({ u: o.u, k: o.k, t })) : [{ u: o.u, k: o.k }]));
  G.declare = { q, choices }; G.mode = 'declare'; G.step = 'good'; updateHint();
  const r = await waitAuto('declare', () => (autoPlay() ? aiAnswer(q) || 'pass' : undefined), 'Pass', { second: 'Pass for the rest of the turn' });
  G.declare = null; G.mode = null; G.step = null; updateHint();
  if (r === 'second') {
    G.passTurn = G.turn;
    log({ ph: { move: 'Move', shoot: 'Shoot', fight: 'Fight' }[q.phase], why: ['heroic'], text: 'You pass for the rest of this turn: no more Heroic Actions from your side until the next turn.' });
  }
  return r && r.u ? r : null;
}
async function playerAccept(q) {
  await teach(['heroicChallenge'], { u: q.u });
  const r = await askPlayer({ kind: 'challenge', u: q.u, by: q.by }, 'challenge', () => (autoPlay() ? (aiAnswer(q) ? 'first' : 'second') : undefined), `Accept: ${q.u.name} against ${q.by.name}`, { second: 'Decline the challenge' });
  return r === 'first';
}

/* ---------- Courage (p. 60–61) ---------- */
// A model of a Broken army Activates: the Courage Test in the dice tray, unless Heroic Resolve or a Hero's Stand Fast
// passes it; a Hero may add Will and Might; a Hero that stands calls Stand Fast. Returns whether it stays; a model that
// fails flees the battlefield and is removed as a casualty.
export async function courageAct(u) {
  u.tested = true;
  const mine = u.side === 'good';
  await teach(['courage'], { u });
  const auto = autoCourage(u);
  if (auto) {
    log({ auto: true, ph: 'Move', why: ['courage', 'broken', auto.why === 'resolve' ? 'heroicResolve' : auto.why], tone: mine ? 'good' : 'bad',
      text: `${u.name} acts in a Broken army, but ${autoText(auto)}: it passes the Courage Test without a roll.` });
  } else {
    tray.begin(`Courage Test (Broken army): ${u.name}`);
    const opt = {}, T = await play(courageSeq(u, 'broken'), opt);
    const e = [...opt.rows.values()][0];
    if (e && (T.will || T.might)) { e.row.res = `${T.total} (${[T.will && `${T.will} Will`, T.might && `${T.might} Might`].filter(Boolean).join(', ')}): ${T.ok ? 'stands' : 'flees'}`; tray.layout(); }
    const boost = T.will || T.might ? ` It spends ${[T.will && pl(T.will, 'Will Point'), T.might && pl(T.might, 'Might Point')].filter(Boolean).join(' and ')}: ${T.total}.` : '';
    if (!T.ok) { flee(u); fxText(u, 'flees', 'bad', 280); sfx.death(u); }
    log({ ph: 'Move', why: ['courage', 'broken', ...(boost ? ['will'] : [])], tone: T.ok ? (mine ? 'good' : 'bad') : (mine ? 'bad' : 'good'), dice: [{ l: `Courage ${T.need}+`, d: T.dice.map(v => ({ v })) }],
      text: `${u.name} acts in a Broken army, so it takes a Courage Test: ${T.dice[0]} + ${T.dice[1]} = ${T.dice[0] + T.dice[1]} against ${T.need}+${courageMods(T)}.${boost} ${T.ok ? 'It stands and may act this turn.' : 'It fails: it flees the battlefield and counts as a casualty.'}` });
    updateMission(); renderCard(true);
    if (!T.ok) { checkpoint(false); return false; }
  }
  if (isHero(u) && G.broken && G.broken[u.side] && G.standFast) {
    callStandFast(u);
    log({ ph: 'Move', why: ['standFast'], tone: mine ? 'good' : 'bad', text: `${u.name} passed, so it calls Stand Fast: friendly Warriors that Activate within ${u.sfRange || 6}″ of it this turn and can see it pass their Courage Tests without rolling.${u.sfHorn ? ` ${u.sfHorn === u ? 'It blows its' : `${u.sfHorn.name} blows its`} war horn (once per game): 3″ further.` : ''}` });
    await teach(['standFast'], { u });
  }
  updateMission(); renderCard(true);
  return true;
}
// Everything that happens as one of the player's models Activates, before it moves (input.js calls it when the model is
// picked): the Courage Test of a Broken army, and the At the Double of a Hero on a Heroic March. Returns whether it may move.
export const needsActivation = u => (u.ringOn && u.sauronAt !== G.turn) || needsSwim(u) || needsCourage(u) || (declared(u, 'march') && !u.shouted && !u.shoutAsked && !(u.movedDist > 0));
export async function activateModel(u) {
  if (u.ringOn && !u.sauron && u.sauronAt !== G.turn && !(await sauronAct(u))) return false;   // Sauron's Will before anything else
  if (needsSwim(u) && !(await swimAct(u))) return false;
  if (needsCourage(u) && !(await courageAct(u))) return false;
  if (declared(u, 'march') && !u.shouted && !u.shoutAsked) {
    u.shoutAsked = true;
    if (u.drum || await askShout(u, 'march')) logShout(u, 'march', shout(u, 'march'));   // a war drum always shouts
  }
  return true;
}

// The Courage Tests at the start of a Move that Charges t: the charger's Fearful, the target's Terror (special.js:
// chargeTests), each in the dice tray. A model that fails cannot Move this turn but may still shoot. Returns whether it
// may Charge.
export async function chargeNerveAct(u, t) {
  const mine = u.side === 'good';
  for (const k of chargeTests(u, t)) {
    if (u.sauron && k === 'terror') continue;   // a Ringbearer Moved by the other player passes Terror (p. 111)
    const why = k === 'terror' ? `${t.name} causes Terror` : k === 'timid' ? `${u.name}'s ${u.mount.n.toLowerCase()} is Timid` : `${u.name} is Fearful`;
    const auto = k !== 'timid' && autoPass(u);   // Timid: no rule passes the Mount's test (p. 132)
    if (auto) { log({ auto: true, ph: phName(), why: ['courage', k, auto.why], tone: mine ? 'good' : 'bad', text: `${why}, but ${autoText(auto)}: ${u.name} passes the Courage Test without a roll.` }); u.passed.add(k); continue; }
    await teach(k === 'terror' ? ['courage', 'terror'] : ['courage'], { u, t });
    tray.begin(`Courage Test (${TEST_WHY[k]}): ${u.name}`);
    const T = await play(courageSeq(u, k), {});
    const boost = T.will || T.might ? ` It spends ${[T.will && pl(T.will, 'Will Point'), T.might && pl(T.might, 'Might Point')].filter(Boolean).join(' and ')}: ${T.total}.` : '';
    log({ ph: phName(), why: ['courage', k, ...(boost ? ['will'] : [])], tone: T.ok === mine ? 'good' : 'bad', dice: [{ l: `Courage ${T.need}+`, d: T.dice.map(v => ({ v })) }],
      text: `${why}: to Charge, ${u.name} takes a Courage Test: ${T.dice[0]} + ${T.dice[1]} = ${T.dice[0] + T.dice[1]} against ${T.need}+${courageMods(T)}.${boost} ${T.ok ? 'It passes and Charges.' : 'It fails: it cannot Move this turn, but may still shoot.'}` });
    if (!T.ok) { u.frozen = true; u.done = true; fxText(u, 'afraid', 'bad', 280); renderCard(true); return false; }
    u.passed.add(k);
  }
  // Charging an Invisible model (p. 127): an Intelligence Test, −1 for each full inch to it.
  if (invisible(t)) {
    const mod = -Math.floor(gap(u, t) + 1e-9), key = `int:invisible:${t.id}`;
    if (u.passed.has(key)) return true;
    tray.begin(`Intelligence Test: ${u.name} Charges the Invisible ${t.name}`);
    const T = await play(intelligenceSeq(u, 'invisible', mod), {});
    log({ ph: phName(), why: ['invisible', 'intelligence'], tone: T.ok === mine ? 'good' : 'bad', text: `${t.name} is Invisible: to Charge it, ${u.name} takes an Intelligence Test with ${mod} (one for each full inch): ${T.ok ? 'it finds its target.' : 'it cannot find it, and may not Charge it this turn.'}` });
    if (!T.ok) { u.done = true; renderCard(true); return false; }
    u.passed.add(key);
  }
  return true;
}
const phName = () => (G.phase === 'fight' ? 'Fight' : 'Move');
// A throw as model u Charges t at spot c (rules.js: throwSpot, p. 107): the player decides (the computer always throws);
// u moves to 1″ from t and throws. Returns the Charge still to make (a spot with its cost: c, or a new one from where
// u stands), or null when t fell (u keeps the rest of its Move and may go elsewhere).
export async function throwOnCharge(u, t, c) {
  const w = throwWeapon(u, t);
  if (!w) return c;
  const Q = throwSpot(u, c, t), from = { x: u.x, y: u.y };
  u.x = Q.x; u.y = Q.y;
  const info = throwInfo(u, t);
  u.x = from.x; u.y = from.y;
  if (!info.ok) return c;
  if (u.side === 'good' && !autoPlay()) {
    const r = await askPlayer({ kind: 'throw', u, t, w, info }, 'throw', () => (autoPlay() ? 'first' : undefined), `Throw the ${w.n.toLowerCase()} first`, { second: 'Just Charge' });
    if (r !== 'first' && r !== 'auto') return c;
  }
  if (Q.frac > 0) { doMove(u, { x: Q.x, y: Q.y }, c.cost * Q.frac); u.done = false; await sleep(450); }
  log({ ph: 'Move', why: ['throwing'], tone: u.side === 'good' ? 'good' : 'bad', text: `${u.name} stops 1″ from ${t.name} and throws its ${w.n.toLowerCase()} as it Charges (no penalty for moving).` });
  u.threw = true; u.throwing = true;
  try { await doShoot(u, t, info); } finally { u.throwing = false; }
  updateMission(); renderCard(true);
  if (alive(t)) return chargeSpot(u, t, remaining(u)) || { ...c, cost: c.cost * (1 - Q.frac) };
  log({ ph: 'Move', why: ['throwing'], tone: u.side === 'good' ? 'good' : 'bad', text: `${t.name} falls to the throw: ${u.name} may move on with the rest of its Move, and even Charge another enemy.` });
  return null;
}

/* ---------- Actions ---------- */
export function doMove(u, P, cost) {
  if (!u.moveStart) u.moveStart = { x: u.x, y: u.y };
  dropLinks(u);
  if (P.over) u.over = { T: P.over.T, t: P.over.t };
  if (P.charge) { u.charged = true; N.charged(u); }   // Faramir's Charge notes where he began
  u.trail.push({ x: u.x, y: u.y });
  if (P.via) u.trail.push({ x: P.via.x, y: P.via.y });
  const ms = Math.min(650, 160 + cost * 70);
  animTo(u, P, ms);
  sfx.steps(ms);
  u.movedDist += cost;
  if (P.stand) u.prone = false;   // it Stood Up first, for half its Move (p. 37)
  if (moveVal(u) - u.movedDist <= 0.05 || P.crawl) u.done = true;   // a Crawl is all the moving a Prone model does
  if (escapes(u)) { fxText(u, 'escaped', 'good', 0); log({ auto: true, ph: 'Move', why: ['scenario'], tone: u.side === 'good' ? 'good' : 'bad', text: `${u.name} ${G.m.scen === 'recon' ? 'reaches the far edge and escapes the battlefield (Reconnoitre)' : 'leaves the battlefield by the board edge'}.` }); updateMission(); }
  if (u.carry) { const L = raiseLadder(u); if (L) log({ auto: true, ph: 'Move', why: ['siegeWalls'], tone: u.side === 'good' ? 'good' : 'bad', text: `${u.name} sets its Siege Ladder against the wall: models may now go up it, paying its ${L.z}″ of height, and Charge a defender at its top.` }); }
}

/* ---------- Jump, Leap and Climb (terrain.js) ---------- */
// A rider thrown without a test: a 1 on a Jump or Leap from the saddle, or a fall (p. 68, 70): it loses its mount,
// takes a Strength 3 hit, and if it survives it is Prone and out of action for the rest of the turn.
async function throwRider(u, why) {
  const mount = u.mount ? u.mount.n.toLowerCase() : 'mount';
  const opt = { dice: [], label: q => `${u.name} is Knocked Flying: Strength 3 hit, To Wound ${needStr(q.need)}`, side: 'neutral' };
  const K = await play(knockedFlyingSeq(u), opt);
  if (K.died) { fxDeath(u); sfx.death(u); } else fxText(u, 'thrown', 'bad', 280);
  log({ ph: G.phase === 'fight' ? 'Fight' : 'Move', why: ['thrownrider', 'prone'], tone: u.side === 'good' ? 'bad' : 'good', dice: K.hit.need ? [{ l: 'Knocked Flying S3', d: K.hit.dice }] : [],
    text: `${u.name} ${why}: the rider is Knocked Flying and its ${mount} is lost. It takes one Strength 3 hit${K.hit.need ? ` (To Wound ${needStr(K.hit.need)})` : ''}: ${K.died ? 'it is slain.' : K.hit.ok ? 'it loses a Wound, lies Prone and can do nothing more this turn.' : 'no wound, but it lies Prone and can do nothing more this turn.'}${K.died ? '' : ' It fights on foot from now on.'}` });
  updateMission(); renderCard(true);
}
// The Sentries of a side on watch (advanced.js): each rolls on the Sentry Chart before the side's other models move.
async function sentryActs(side) {
  for (const u of sentries(side)) {
    if (u.done || !alive(u)) continue;
    if (needsActivation(u) && !(await activateModel(u))) continue;
    const S = sentryRoll(u), mine = side === 'good';
    const what = !S.who ? 'it is distracted and may not move' : S.who === 'foe' ? `it heard a noise elsewhere: ${mine ? 'the enemy' : 'you'} may move it up to ${fmt(S.lim)}″` : `${mine ? 'you' : 'the enemy'} may move it ${fmt(S.lim)}″`;
    log({ ph: 'Move', why: ['sentries'], dice: [{ l: 'Sentry', d: [{ v: S.v }] }], text: `${u.name} is a Sentry: ${S.v} on the Sentry Chart, ${what}.` });
    if (S.who && canMove(u)) {
      if (S.who === 'own') {
        u.movedDist = Math.max(0, moveVal(u) - S.lim);
        if (mine && !autoPlay()) await playerActivation([u], 'Done: the Sentry'); else await aiMove(side, [u]);
      } else {
        const opts = sentryOptions(u, S.lim), q = { k: 'sentryMove', side: mine ? 'evil' : 'good', u, opts };
        const o = !mine && !autoPlay() ? await askChoice(`Move ${u.name}?`, `The enemy Sentry <b>${esc(u.name)}</b> heard a noise elsewhere: you move it up to ${fmt(S.lim)}″ (no Charge).`, opts.map(x => ({ label: `${fmt(x.cost)}″ to the ${x.label}`, val: x })), 'Leave it where it is') : aiSentryMove(q);
        if (o) { const from = { x: u.x, y: u.y }; dropLinks(u); u.x = o.x; u.y = o.y; animFrom(u, from, 400); await sleep(400); }
      }
    }
    u.done = true;
    updateMission(); renderCard(true);
  }
}
// A Swim Test as the model Activates in Deep Water (or Prone in Shallow Water): 1 drowns, 2–5 half its Move, 6 all of it.
// Returns whether it lives.
export async function swimAct(u) {
  tray.begin(`${u.name}: Swim Test`);
  const roll = await play(swimSeq(u), { primed: true, ph: 'Move' });
  const s = applySwim(u, roll);
  if (s === 'sink') { fxDeath(u); sfx.death(u); }
  log({ ph: 'Move', why: ['water'], tone: (s !== 'sink') === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: 'Swim', d: [{ v: roll, ok: roll >= 2 }] }],
    text: `${u.name} starts its Activation in the water and takes a Swim Test: ${roll}. ${s === 'sink' ? 'It sinks and drowns.' : s === 'half' ? 'It may swim half its Move.' : 'It swims strongly: its whole Move.'}` });
  updateMission(); renderCard(true);
  return s !== 'sink';
}
// Crosses a barrier the way planCross (terrain.js) worked it out: Stand Up if Prone, walk up to it, then the test.
// After a 2–5, a model that landed in an enemy's Control Zone must Charge it if it can reach (p. 33–35).
export async function doCross(u, X) {
  const kind = X.kind === 'down' ? 'climb' : X.kind, name = testName(X.kind), side = u.side;
  const what = X.b.T ? (X.b.T.k === 'hedge' ? 'the hedge' : 'the wall') : X.kind === 'leap' ? 'the gap' : X.kind === 'down' ? 'the drop' : 'the cliff';
  if (X.stand) { u.prone = false; u.movedDist += X.stand; log({ auto: true, ph: 'Move', text: `${u.name} Stands Up (${fmt(X.stand)}″ of its Move).`, why: ['prone'] }); }
  if (X.approach > 0.01) { doMove(u, { x: X.contact.x, y: X.contact.y }, X.approach); await sleep(Math.min(650, 160 + X.approach * 70)); }
  if (!u.moveStart) u.moveStart = { x: u.x, y: u.y };
  await teach([kind, X.kind === 'down' && 'climb'].filter(Boolean));
  tray.begin(`${u.name}: ${name} Test`);
  const roll = await play(crossTestSeq(u, X), { primed: true, ph: 'Move' });
  const from = { x: u.x, y: u.y };
  u.trail.push(from);
  const R = applyCross(u, X, roll);
  animFrom(u, from, 360);
  sfx.steps(360);
  const up = X.kind === 'climb' ? 'up' : 'down';
  let text = `${u.name} ${X.cont ? 'carries on climbing' : `tries to ${name.toLowerCase()} ${X.kind === 'leap' ? 'across ' : X.kind === 'jump' ? 'over ' : up + ' '}${what}`}: ${name} Test ${roll}. `;
  if (X.kind === 'swim') {
    text = `${u.name} wades into Deep Water: Swim Test ${roll}. ${R.drowned ? 'It sinks and drowns.' : R.swim === 'half' ? 'It may swim on with half its remaining Move.' : 'It swims strongly, with all its remaining Move.'}`;
    if (R.drowned) { fxDeath(u); sfx.death(u); }
    log({ ph: 'Move', text, dice: [{ l: 'Swim', d: [{ v: roll, ok: roll >= 2 }] }], why: ['water'], tone: R.drowned ? 'bad' : 'good' });
    updateMission(); renderCard(true);
    return;
  }
  if (R.result === 'fail') text += X.kind === 'jump' ? 'It stumbles and stays where it is; its move is over.' : X.kind === 'leap' ? 'It falls into the gap.' : 'It falls.';
  if (R.thrown && !R.fall) { log({ ph: 'Move', text, why: [X.kind] }); await throwRider(u, 'rolled a 1 on the test from the saddle'); return; }
  else if (R.result === 'partial') text += `Not enough Move to finish: it hangs ${fmt(u.climb.z - u.climb.foot)}″ above the foot of the cliff and must test again next turn.`;
  else if (R.result !== 'fail') text += X.auto ? `${X.auto}: it needs no roll, it counts as a 6 and may carry on moving.` : R.result === 'go' ? 'A 6: it is across and may carry on moving.' : 'It is across, and its move is over.';
  log({ ph: 'Move', text, ...(X.auto ? {} : { dice: [{ l: name, d: [{ v: roll, ok: roll >= 2 }] }] }), why: [kind, R.fall && 'falling', X.auto && specialKey(X.auto)].filter(Boolean), tone: roll === 1 ? 'bad' : 'good' });
  if (R.fall) await fallDamage(u, R.fall, X.kind === 'leap' ? 'falls into the gap' : 'falls from the cliff');
  else if (R.result === 'stop' && R.landed) {
    const fc = forcedCharge(u);
    if (fc && fc.spot) {
      doMove(u, fc.spot, fc.spot.cost); u.done = true;
      sfx.horn(alignOf(side));
      log({ auto: true, ph: 'Move', text: `${u.name} landed in ${fc.e.name}'s Control Zone, so it must Charge it by the shortest way (${fmt(fc.spot.cost)}″).`, why: [kind, 'cz', 'charge'], tone: side === 'good' ? 'good' : 'bad' });
    } else if (fc) log({ auto: true, ph: 'Move', text: `${u.name} landed in ${fc.e.name}'s Control Zone but cannot reach it, so its move simply ends.`, why: [kind, 'cz'] });
  }
  updateMission(); renderCard(true);
}

// A model fell f inches (fall: { f, hits }): it is Prone, and a fall deeper than its height deals Falling Damage,
// one Strength 3 hit plus one for every full inch beyond its height (p. 36).
async function fallDamage(u, fall, how) {
  await teach(['falling', 'prone']);
  fxText(u, 'falls', 'bad', 0);
  const up = !u.cav && staysUp(u);   // Unyielding Combat Stance (p. 132): 4+ and it is not Prone
  if (up && up.ok) u.prone = false;
  const lies = up ? ` Unyielding Combat Stance: ${up.v}, ${up.ok ? 'it keeps its footing' : 'it goes down'}.` : '';
  let text = fall.f < 0.05 ? `${u.name} slips at the bottom and is ${u.prone ? 'Prone' : 'not Prone'}.${lies}` : `${u.name} ${how}, ${fmt(fall.f)}″, and is ${u.prone ? 'Prone' : 'not Prone'}.${lies}`;
  const dice = [];
  if (fall.hits) {
    const R = rollFall(u, fall.hits), label = `Falling Damage: ${pl(fall.hits, 'Strength 3 hit')}, To Wound ${needStr(R.need)} (Defence ${u.d})`;
    hlChart(3, u.d);
    await tray.throw([{ l: label, side: 'neutral', d: R.rolls, res: R.wounds ? pl(R.wounds, 'wound') : 'No wounds' }]);
    dice.push({ l: 'Falling Damage', d: R.rolls });
    let died = false;
    if (u.cav) { for (let i = 0; i < R.wounds; i++) woundPart(u, 'mount'); text += ` It fell further than its own height (${fmt(heightOf(u))}″), so its ${u.mount.n.toLowerCase()} takes ${pl(fall.hits, 'Strength 3 hit')}: ${R.wounds ? `${pl(R.wounds, 'wound')}` : 'no wounds'}.`; }
    else {
      let saved = 0;
      for (let i = 0; i < R.wounds && alive(u); i++) { const r = await hurt(u); if (r === 'saved') saved++; else died = r === 'slain'; if (died) { fxDeath(u); sfx.death(u); } }
      text += ` It fell further than its own height (${fmt(heightOf(u))}″), so it takes ${pl(fall.hits, 'Strength 3 hit')}: ${died ? 'it is slain' : R.wounds - saved ? `it loses ${pl(R.wounds - saved, 'Wound')}` : saved ? 'Fate prevents the wounds' : 'no wounds'}.`;
    }
  } else text += ` It fell no further than its own height (${fmt(heightOf(u))}″), so it takes no Falling Damage.`;
  log({ ph: G.phase === 'fight' ? 'Fight' : 'Move', text, dice, why: ['falling', 'prone'], tone: u.side === 'good' ? 'bad' : 'good' });
  if (u.cav && alive(u)) await throwRider(u, 'fell with its mount');   // a Cavalry model knocked Prone throws its rider (p. 69)
  updateMission(); renderCard(true);
}

// A Shooting Attack (rules.js: shotSeq): To Hit, In The Way, a shot into a fight, rider or mount, To Wound, each in the
// dice tray, with the shooter's Might and the re-rolls of Heroic Accuracy where they apply.
export async function doShoot(s, t, info) {
  if (info.wpn) s.bow = info.wpn;
  spendShot(s);
  const side = s.side, dice = [], why = ['hit'], notes = [];
  // A Sharpshooter aims at the rider or the mount of a Cavalry model (p. 130): the player chooses, the computer takes the
  // part with the better chance.
  const aim = t.cav && info.sharp && side === 'good' && !autoPlay() ? await pickAim(s, t) : info.aim;
  tray.begin(`${s.name} shoots at ${t.name}`);
  const R = await play(shotSeq(s, t, info, aim), { primed: true, dice, notes, ph: 'Shoot' });
  let text = `${s.name} shoots at ${t.name} (${fmt(info.g)}″${prefs.odds ? `, ${pct(info.p)} to wound` : ''}).`;
  if (info.ignored.length) { for (const c of info.ignored) text += ` It ${coverNote(c)}: no In The Way test.`; why.push('cover'); }
  for (const st of R.steps) {
    if (st.k === 'itw') {
      if (!why.includes('itw')) why.push('itw');
      if (!st.ok) text += st.ob.kind === 'model' ? ` The shot hits the obstruction: ${st.ob.u.name}.` : ` The shot is stopped by the ${st.ob.name}.`;
    } else if (st.k === 'fight') {
      why.push('shootFight');
      if (!st.ok && st.target !== t) text += ` The shot hits a friend in the fight: ${st.target.name}.`;
    } else if (st.k === 'cav') {
      why.push('shootcav');
      const mount = R.target.mount.n.toLowerCase(), aimed = st.aimed === 'mount' ? `the ${mount}` : 'the rider';
      text += st.part === st.aimed ? ` It is aimed at ${aimed}, and finds it.` : ` It is aimed at ${aimed}, but hits the ${st.part === 'mount' ? mount : 'rider'} instead.`;
    } else if (st.k === 'sharp') {
      why.push('sharpshooter');
      text += ` Sharpshooter: it hits the ${st.part === 'mount' ? R.target.mount.n.toLowerCase() : 'rider'} it aimed at, with no test for rider or mount.`;
    }
  }
  if (notes.length) { text += ` ${notes.join(' ')}`; if (notes.some(n => /Might/.test(n))) why.push('might'); if (notes.some(n => /re-rolls/.test(n))) why.push('heroicAccuracy'); }
  const xbow = /crossbow/i.test(s.bow.n);
  if (!R.steps[0].ok) { fxArrow(s, t); sfx.shot('miss', xbow); fxText(t, 'miss', 'muted', 330); log({ ph: 'Shoot', text: text + ' Miss.', dice, why }); return; }
  if (R.stopAt != null) {
    fxArrow(s, R.stopAt);
    sfx.shot('block', xbow);
    fxText(t, 'cover', 'muted', 330);
    log({ ph: 'Shoot', text, dice, why });
    return;
  }
  const target = R.target, atMount = R.part === 'mount', d = atMount ? target.mount.d : target.d, who = atMount ? `${target.name}'s ${target.mount.n.toLowerCase()}` : target.name;
  fxArrow(s, target);
  sfx.shot('hit', xbow);
  why.push('wound');
  if (!R.need) { text += ` Strength ${s.bow.s} cannot wound Defence ${d}.`; log({ ph: 'Shoot', text, dice, why }); return; }
  hlChart(s.bow.s, d);
  let thrown = false;
  const w = R.steps[R.steps.length - 1];
  if (w.ok) {
    const r = await hurt(target, atMount ? 'mount' : 'rider');
    if (r === 'saved') text += ` ${target.name} prevents the Wound with Fate.`;
    else if (r === 'slain') { N.slain(s, target); fxDeath(target); fxText(target, 'slain', 'bad', 280); sfx.death(target); text += ` ${target.name} is slain.`; if (challengeSlain(s, target)) text += ` ${s.name} slew the Hero it fought a Heroic Challenge with, and gains 1 Might Point.`; }
    else if (r === 'mountSlain') { fxText(target, `${target.mount.n.toLowerCase()} slain`, 'bad', 280); sfx.wound(target); text += ` The ${target.mount.n.toLowerCase()} is slain: the rider is thrown.`; thrown = true; }
    else { fxText(target, '−1 Wound', 'bad', 280); sfx.wound(target); text += ` ${who} loses a Wound.`; }
    if (r === 'slain') mountLeft(target);
  } else { text += ' No wound: the armour held.'; fxText(target, 'no wound', 'muted', 330); setTimeout(sfx.armour, 330); }
  log({ ph: 'Shoot', text, dice, why, tone: w.ok ? (target.side === 'evil' ? 'good' : 'bad') : null });
  if (thrown) await thrownRiders([target]);
}
// Siege Engines (engine/siege.js, p. 140–147) fire before the other models of their side: the player picks a target for
// each engine that can fire (or holds fire), the computer fires its own.
async function siegeShots(side) {
  for (const e of sideAlive(side).filter(isSiege)) {
    if (siegeWhy(e, null)) continue;
    let t;
    if (side === 'good' && !autoPlay()) {
      const list = sideAlive('evil').filter(o => !siegeWhy(e, o));
      if (!list.length) continue;
      G.sel = e; renderCard(true);
      t = await askChoice(`${e.name}: the target`, `<b>${esc(e.name)}</b> can fire (To Hit ${siegeHitNeed(e, false)}+ with its crew, range ${e.T.siege.min}–${e.T.siege.max}″, Strength ${e.T.siege.s}). ${(e.T.rules || []).includes('Rapid Fire') ? 'Rapid Fire: D6 shots, each like an arrow, with no Scatter.' : 'A Battlefield Target that is hit scatters first; the actual target is knocked Prone and, if wounded, slain.'}`,
        list.map(o => ({ label: `${o.name} (${fmt(gap(e, o))}″${inArc(e, o) ? '' : ', turn the engine: −1 To Hit'})`, val: o })), 'Hold fire');
      G.sel = null;
      if (!t) continue;
    } else {
      const b = aiSiegeShot(e);
      if (!b) continue;
      t = b.t; G.sel = e; G.aimAt = t; await sleep(420);
    }
    await siegeFireAct(e, t);
    G.aimAt = null; G.sel = null;
    updateMission(); renderCard(true);
    await sleep(520);
    checkpoint(false);
  }
}
const SCATTER = { 1: 'a wide miss', 6: 'dead on' };
// One Siege Engine's shot (or the Bolt Thrower's volley) and its Wounds, as sim.js: siegeFire.
async function siegeFireAct(e, t) {
  tray.begin(`${e.name} fires at ${t.name}`);
  let dice = [];
  const n = await play(siegeAimSeq(e, t), { primed: true, dice, notes: [], ph: 'Shoot' });
  for (let i = 0; i < n && alive(t); i++) {   // a volley stops once its target is slain
    if (i) { tray.begin(`${e.name}: shot ${i + 1} of ${n}`); dice = []; }
    const sh = await play(siegeShotSeq(e, t), { primed: true, dice, notes: [], ph: 'Shoot' });
    let text = `${e.name} fires at ${t.name}${n > 1 ? ` (shot ${i + 1} of ${n})` : ''}${e.rotated && !i ? ', turned to face it (−1 To Hit)' : ''}.`;
    const done = (tone = null) => log({ ph: 'Shoot', why: ['siege'], text, tone, dice });
    if (!sh.hit.ok) { fxArrow(e, t); fxText(t, 'miss', 'muted', 330); text += ' Miss.'; done(); continue; }
    if (sh.scatter != null) text += ` Scatter ${sh.scatter}: ${SCATTER[sh.scatter] || 'a slight deviation'}${sh.target && sh.target !== t ? `, and the shot lands on ${sh.target.name}` : !sh.target ? ', and it hits nothing' : ''}.`;
    const u = sh.target;
    if (!u) { fxArrow(e, t); done(); continue; }
    fxArrow(e, u);
    let thrown = false;
    const rolls = sh.rolls.slice().sort((a, b) => (a.part === 'mount' ? -1 : 0) - (b.part === 'mount' ? -1 : 0));
    for (const r of rolls) {
      if (!alive(u) || (r.part === 'mount' && !u.cav)) continue;
      const who = r.part === 'mount' ? `${u.name}'s ${u.mount.n.toLowerCase()}` : u.name;
      if (!r.W.need) { text += ` Strength ${e.T.siege.s} cannot wound ${who}.`; continue; }
      if (!r.W.ok) { text += ` ${who}: no wound.`; continue; }
      let res = await hurt(u, r.part);
      if (res === 'saved') { text += ` ${who} prevents the Wound with Fate.`; continue; }
      const more = r.outright ? 99 : r.n - 1;
      for (let k = 0; k < more && alive(u) && res !== 'slain' && res !== 'mountSlain'; k++) res = woundPart(u, r.part);
      if (res === 'slain') { fxDeath(u); sfx.death(u); text += r.outright ? ` ${u.name} is wounded, and slain.` : ` ${u.name} is slain.`; mountLeft(u); }
      else if (res === 'mountSlain') { text += ` The ${u.mount.n.toLowerCase()} is slain.`; thrown = true; }
      else { fxText(u, `−${r.n} Wound${r.n > 1 ? 's' : ''}`, 'bad', 280); sfx.wound(u); text += ` ${who} loses ${pl(r.n, 'Wound')}.`; }
    }
    if (alive(u) && u.prone) text += ` ${u.name} is knocked Prone.`;
    const f = sh.flung;
    if (f) text += ` Piercing Shot: ${u.name} is flung ${fmt(f.d)}″ back${f.over.length ? `, over ${names(f.over)} (Strength 5 hits, Prone)` : ''}${f.stop ? `, and crashes into ${f.stop.name} (Strength 6 hits on both)` : f.wall ? ', and crashes into the terrain (a Strength 6 hit)' : ''}.`;
    // The other hits of the shot: Area Effect (Strength 5 within 2″), and the models a flung model hits.
    const unhurt = sh.area.filter(a => !a.W.ok || !alive(a.t)).map(a => a.t.name);
    if (unhurt.length) text += ` Area Effect (Strength 5 within 2″): no wound on ${unhurt.join(', ')}${sh.area.some(a => !a.W.ok && a.t.prone) ? ', knocked Prone' : ''}.`;
    for (const a of [...sh.area.map(a => ({ ...a, why: 'Area Effect' })), ...(f ? f.wounds.map(a => ({ ...a, why: 'Piercing Shot' })) : [])]) {
      if (!a.W.ok || !alive(a.t)) continue;
      const res = await hurt(a.t);
      if (res === 'slain') { fxDeath(a.t); sfx.death(a.t); mountLeft(a.t); }
      text += ` ${a.why}: ${a.t.name} ${res === 'saved' ? 'prevents the Wound with Fate' : res === 'slain' ? 'is slain' : res === 'mountSlain' ? 'loses its mount' : 'loses a Wound'}.`;
      if (res === 'mountSlain') await thrownRiders([a.t]);
    }
    done(u.side === 'evil' ? 'good' : 'bad');
    if (thrown && alive(u)) await thrownRiders([u]);
  }
}
// The enemy's Siege Engine scattered near the player's models: on a 1 the player picks any model nearby (or a miss), on
// a 2–5 one of their own models within 6″.
async function playerScatter(q) {
  const wide = q.kind === 'wide';
  const r = await askChoice(`Scatter: ${wide ? 'a wide shot' : 'a slight deviation'}`, wide
    ? `<b>${esc(q.s.name)}</b>'s shot goes wide. You may pick any model within 6″ of ${esc(q.t.name)} for it to land on, or let it miss.`
    : `<b>${esc(q.s.name)}</b>'s shot deviates slightly. Pick the model it lands on: the target itself, or one of your models within 6″ of it.`,
    [...(wide ? [] : [{ label: `${q.t.name} (the target)`, val: q.t }]), ...q.list.map(o => ({ label: `${o.name} (${fmt(gap(q.t, o))}″ from the target)`, val: o }))], wide ? 'It misses' : 'Let the computer pick');
  return r || (wide ? null : aiAnswer(q));
}
// A Chariot Charge or a Trample (engine/beasts.js) towards aim, the Impact Hits resolved on each model it runs into.
// aim null: a Chariot only turns to face the enemy.
export async function rampAct(u, aim) {
  const k = isChariot(u) ? 'Chariot Charge' : 'Trample', why = [isChariot(u) ? 'chariot' : 'warBeast'];
  if (!aim) { faceOnly(u); log({ ph: 'Move', why, text: `${u.name} makes no ${k} this turn and turns to face the enemy.` }); return; }
  const from = { x: u.x, y: u.y }, notes = [];
  let last = { ...from };
  const step = async () => { const d = Math.hypot(u.x - last.x, u.y - last.y); if (d > 0.05) { animFrom(u, last, Math.min(900, 120 * d)); await sleep(Math.min(900, 120 * d)); } last = { x: u.x, y: u.y }; };
  tray.begin(`${u.name}: ${k}`);
  const out = await play(rampSeq(u, aim), { ph: 'Move', notes: [], on: {
    impact: async q => {
      await step();
      const list = await play(impactSeq(u, q.t, q.beast), { ph: 'Move', notes: [] });
      notes.push(`${q.beast ? `It meets ${q.t.name}: three Strength 8 hits each way.` : `It runs into ${q.t.name}: ${impactNote(u, list)}`} ${await hitsAct(list)}`);
      return alive(q.t);
    },
    crash: async () => {
      await step();
      const list = await play(crashSeq(u), { ph: 'Move', notes: [] });
      notes.push(`It crashes into the Obstacle: three Strength 6 hits on it and on ${u.name}. ${await hitsAct(list)}`);
    },
  } });
  await step();
  if (out.rough && !out.rough.ok && alive(u)) notes.push(`It went through Difficult Terrain and rolled a 1: ${await hitsAct([{ t: u, part: 'rider', R: { wounds: 1 } }])}`);
  const end = out.stop && alive(u) ? (out.stop.side === u.side ? ` It stops against ${out.stop.name}.` : ` It stops in base contact with ${out.stop.name}, Charging it.`) : out.why === 'edge' ? ' It stops at the table edge.' : out.why === 'terrain' ? ' Impassable terrain stops it.' : '';
  log({ ph: 'Move', why, tone: out.hit.some(t => t.side !== u.side && !alive(t)) ? (u.side === 'good' ? 'good' : 'bad') : null,
    text: `${u.name} makes a ${k} of ${fmt(out.d)}″.${notes.length ? ' ' + notes.join(' ') : ''}${end}` });
  updateMission();
  return out;
}
const impactNote = (u, list) => list.filter(h => h.t !== u).map(h => `${h.R.rollsN} Impact Hits at Strength ${(isChariot(u) ? u.T.chariot : u.T.warBeast).s}${h.t.cav ? ` on the ${h.part === 'mount' ? h.t.mount.n.toLowerCase() : 'rider'}` : ''}, ${pl(h.R.wounds, 'wound')}`).join('; ') + '.';
// Wounds from hits (Impact Hits, a crash), the mount's first; a rider whose mount is slain is thrown. Returns a note.
async function hitsAct(list) {
  const out = [];
  for (const h of list.slice().sort((a, b) => (b.part === 'mount') - (a.part === 'mount'))) {
    let thrown = false, n = 0;
    for (let k = 0; k < h.R.wounds && alive(h.t); k++) {
      if (h.part === 'mount' && !h.t.cav) break;
      const r = await hurt(h.t, h.part);
      if (r === 'saved') continue;
      n++;
      if (r === 'slain') { fxDeath(h.t); sfx.death(h.t); mountLeft(h.t); out.push(`${h.t.name} is slain.`); break; }
      if (r === 'mountSlain') { thrown = true; out.push(`${h.t.name}'s ${h.t.mount.n.toLowerCase()} is ${h.t.T.chariot ? 'destroyed' : 'slain'}.`); break; }
    }
    if (n && alive(h.t) && !thrown) { fxText(h.t, `−${n} Wound${n > 1 ? 's' : ''}`, 'bad', 200); sfx.wound(h.t); out.push(`${h.t.name} loses ${pl(n, 'Wound')}.`); }
    if (thrown) await thrownRiders([h.t]);
  }
  return out.join(' ');
}
// The player's Chariot or War Beast Activates: where it goes. Returns whether it moved (or turned).
export async function playerRamp(u) {
  if (needsActivation(u) && !(await activateModel(u))) return false;
  const chariot = isChariot(u), k = chariot ? 'Chariot Charge' : 'Trample';
  const foes = sideAlive('evil').filter(t => !t.on);
  const list = [];
  for (const t of foes) {
    const p = rampPlan(u, t);
    if (p.first === t) list.push({ label: `${k} into ${t.name} (${fmt(gap(u, t))}″)`, val: { x: t.x, y: t.y } });
  }
  const ai = aiRamp(u);
  if (ai) list.push({ label: `Advance: the computer picks the heading${ai.lim != null ? ' and stops short' : ''}`, val: ai });
  if (chariot) list.push({ label: 'No Chariot Charge: only turn to face the enemy', val: 'turn' });
  const pick = await askChoice(`${u.name}: ${k}`, chariot
    ? `<b>${esc(u.name)}</b> Moves by Chariot Charge: it pivots up to 45° (again after each full 4″) and Moves up to ${moveVal(u)}″ in a straight line. Every model it runs into suffers ${u.T.chariot.n} Impact Hits at Strength ${u.T.chariot.s}.`
    : `<b>${esc(u.name)}</b> Tramples: it turns to face any way and Moves its full ${moveVal(u)}″ in a straight line. Every model it runs into suffers ${u.T.warBeast.n} Impact Hits at Strength ${u.T.warBeast.s}.`, list, 'Cancel');
  if (!pick) return false;
  G.sel = u;
  await rampAct(u, pick === 'turn' ? null : pick);
  G.sel = null; renderCard(true); updateHint(); checkpoint(false);
  return true;
}
// The One Ring (engine/advanced.js): put on during the Ringbearer's Activation; a mount bolts and the rider is thrown.
export async function ringOnAct(u) {
  const r = putOnRing(u);
  fxText(u, 'Invisible', 'muted', 200);
  log({ ph: 'Move', why: ['ring', 'invisible'], tone: u.side === 'good' ? 'good' : 'bad', text: `${u.name} puts on the One Ring and is Invisible: it cannot be targeted or seen, has no Control Zone, and may move through other models.${r === 'mounted' ? ` Its ${u.mount.n.toLowerCase()} bolts and flees.` : ''}` });
  if (r === 'mounted') await thrownRiders([u]);
  renderCard(true);
}
// Taking it off: a Courage Test (a failure keeps it on until next turn).
export async function ringOffAct(u) {
  tray.begin(`Courage Test: ${u.name} takes off the One Ring`);
  const T = await play(removeRingSeq(u), {});
  if (T.again) return;
  log({ ph: 'Move', why: ['ring', 'courage'], tone: T.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: `Courage ${T.need}+`, d: T.dice.map(v => ({ v })) }],
    text: `${u.name} tries to take off the One Ring: ${T.dice[0]} + ${T.dice[1]} against ${T.need}+. ${T.ok ? 'It is visible again.' : 'The Ring keeps its hold: it stays on until next turn.'}` });
  renderCard(true);
}
// Sauron's Will (p. 111): a D6, 3+ or the other side Moves the Ringbearer this turn. For the player's Ringbearer the
// computer then Moves it at once (mine: false while the computer Activates its own). Returns whether it is in control.
async function sauronAct(u, mine = u.side === 'good') {
  tray.begin(`Sauron's Will: ${u.name}`);
  const d = await play(sauronSeq(u), {});
  if (!d) return true;
  log({ ph: 'Move', why: ['ring'], tone: d.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: "Sauron's Will 3+", d: [{ v: d.v, ok: d.ok }] }],
    text: `Sauron's Will: ${u.name} rolls ${d.v}. ${d.ok ? 'It keeps control of itself.' : `The Ring takes hold: ${u.side === 'good' ? 'the enemy' : 'you'} Move ${u.name} this turn.`}` });
  if (d.ok || !mine) return d.ok;
  await aiMove('good', [u]);   // the other side Moves it (the computer, towards your foes)
  u.done = true;
  return false;
}
export const canRingNow = u => !!G && u.side === 'good' && G.phase === 'move' && G.mode === 'move' && G.step === 'good' && waiter != null && !G.busy && ringbearer(u) && !u.sauron && (G.active === u || (!u.done && !engaged(u)));
// The player's Ring button on the model card.
export async function ringAct(u) {
  if (!canRingNow(u)) return;
  if (needsActivation(u) && !(await activateModel(u))) return;
  if (u.ringOn) await ringOffAct(u); else if (canWearRing(u)) await ringOnAct(u);
  updateHint();
}
// Reinforcements (engine/scenarios.js): a roll for each Warband still off the table; one that arrives is placed at the
// edge point its chart gives (the computer chooses the point). Returns the models placed.
async function reinforceAct(side) {
  const scen = G.m && G.m.scen, out = [];
  if (scen !== 'hold' && scen !== 'recon') return out;
  for (const band of warbands(side).filter(b => b.models.some(u => u.reserve && !u.dead))) {
    const c = band.captain || band.models[0];
    c.waited = c.waited || 0;
    let v = 6;
    if (!(scen === 'recon' && G.turn >= 4)) { tray.begin(`Reinforcements: ${c.name}'s Warband`); v = await play(arrivalSeq(band, scen, c.waited), { ph: 'Move', notes: [] }); }
    const p = arrivalPoint(v, side, scen, (list, chooser) => aiArrival(list, chooser, side));
    const who = side === 'good' ? 'Your' : 'The enemy\'s';
    if (!p) { c.waited++; log({ ph: 'Move', why: ['scenario'], text: `${who} Warband of ${c.name} rolls ${v}: it does not arrive yet${scen === 'recon' ? ' (+1 next turn)' : ''}.` }); continue; }
    const placed = arrive(band, p);
    const edge = p.y <= 0.01 ? 'north' : p.y >= G.H - 0.01 ? 'south' : p.x <= 0.01 ? 'west' : 'east';
    log({ ph: 'Move', why: ['scenario'], tone: side === 'good' ? 'good' : 'bad', text: `${who} Warband of ${c.name} (${placed.length} models) arrives at the ${edge} edge (${scen === 'recon' ? 'its own edge' : `a roll of ${v}`}).` });
    out.push(...placed);
  }
  if (out.length) updateMission();
  return out;
}
/* ---------- Narrative Scenarios (engine/narrative.js) ---------- */
// Hordes of Tribesmen: a D6 for each slain model kept aside, at the end of the Evil Activation Phase; on 4+ it enters
// from a board edge (Reinforcements: it moves on but may not Charge). Returns the models back on the table.
async function hordeAct(side) {
  const kept = keptAside(side), back = [];
  if (!kept.length) return back;
  await teach(['hordes']);
  tray.begin(`${G.m.hordes}s kept aside: 4+ to come back`);
  for (const u of kept) if ((await play(hordeSeq(u), { ph: 'Move', notes: [] })).ok && hordeReturn(u)) back.push(u);
  log({ ph: 'Move', why: ['hordes'], tone: !back.length === (side === 'good') ? 'bad' : 'good', text: back.length ? `Hordes: ${back.length} of the ${kept.length} slain ${G.m.hordes}s roll 4+ and come back from the board edge (Reinforcements: they move on, but may not Charge).` : `Hordes: none of the ${kept.length} slain ${G.m.hordes}s rolls 4+.` });
  if (back.length) updateMission();
  return back;
}
// Put the Fires Out: the Good side's models touching a burning Storehouse at the end of their Activations. Trying costs
// the model its shot and its Support this turn, so the player says yes or no for each of theirs; the computer always tries.
async function quenchAct() {
  for (const u of quenchers()) {
    await teach(['storehouses']);
    const go = u.side !== 'good' || await askRule(`Put the fire out: ${u.name}`, `${u.name} touches a burning Storehouse and is not Engaged. A D6: on 5+ the fire is out. Win or lose, it may not shoot or Support a Combat this turn.`, 'Roll to put it out', 'Not now', () => true);
    if (!go) continue;
    tray.begin('Put the Fires Out: 5+');
    const r = await play(quenchSeq(u), { ph: 'Move', notes: [] });
    log({ ph: 'Move', why: ['storehouses'], tone: r.die.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: 'Put out 5+', d: [{ v: r.die.v, ok: r.die.ok }] }], text: `${u.name} fights the fire: ${r.die.v}. ${r.die.ok ? 'The Storehouse is put out.' : 'It still burns.'} ${burningCount()} of ${stores().length} Storehouses on fire.` });
    updateMission();
  }
}
// Set Alight the City: at the end of the Move Phase each Evil model touching a Storehouse that is not burning, and not
// Engaged, may roll a D6: 6+ (+1 with a flaming brand) sets it on fire. The player says yes or no for each of theirs
// (trying costs the model its shot and its Support this turn); the computer always tries.
async function lightAct() {
  const list = lighters();
  if (!list.length) return;
  await teach(['storehouses']);
  for (const u of list) {
    if (!lighters().includes(u)) continue;   // its Storehouse caught fire from an earlier torch
    if (u.side === 'good' && !(await askRule(`Set the Storehouse alight: ${u.name}`, `${u.name} touches a Storehouse that is not burning and is not Engaged. A D6: on a 6 it catches fire${brand(u) ? ' (5+ with its flaming brand)' : ''}. Win or lose, it may not shoot or Support a Combat this turn.`, 'Roll to set it alight', 'Not now', () => true))) continue;
    tray.begin('Set Alight the City: 6+ (flaming brand +1)');
    const r = await play(lightSeq(u), { ph: 'Move', notes: [] });
    log({ ph: 'Move', why: ['storehouses'], tone: r.die.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: `Set alight ${r.die.n}${r.die.v !== r.die.n ? '+1' : ''}`, d: [{ v: r.die.v, ok: r.die.ok }] }], text: `${u.name} puts a torch to a Storehouse: ${r.die.v}. ${r.die.ok ? 'It catches fire!' : 'The thatch does not catch.'} ${burningCount()} of ${stores().length} Storehouses on fire.` });
  }
  updateMission();
}
// Fog of War: the player's three secret picks before the battle.
async function fogPicksAct() {
  const units = G.units, mine = units.filter(u => u.side === 'good' && u.T.hero), theirs = units.filter(u => u.side === 'evil' && u.T.hero);
  const pickOne = async (title, body, list, label) => (list.length === 1 ? list[0] : (await askChoice(title, body, list.map(u => ({ label: label(u), val: u })), 'Let the computer pick')) || list[Math.floor(Math.random() * list.length)]);
  const own = mine.length > 1 ? mine.filter(u => !u.general) : mine, foe = theirs.length > 1 ? theirs.filter(u => !u.general) : theirs;
  const a = own.length ? await pickOne('Fog of War: your Hero', 'Secretly pick one of your Heroes (not your General if you have another): 1 VP if it lives, 3 if unwounded, 5 if it also spent no Fate.', own, u => u.name) : null;
  const b = foe.length ? await pickOne('Fog of War: their Hero', 'Secretly pick one of the enemy\'s Heroes: 1 VP for wounding it, 3 for slaying it, 5 if one of yours slays it in Combat.', foe, u => u.name) : null;
  const half = G.terrain.map((T, i) => ({ T, i })).filter(x => pieceBox(x.T).y + pieceBox(x.T).h <= G.H / 2 && x.T.k !== 'rock');
  const t = half.length ? await askChoice('Fog of War: a terrain piece', 'Secretly pick a terrain piece in the enemy\'s half: hold it with more models than they have when the battle ends.', half.map(x => ({ label: `${x.T.k === 'brush' ? 'The wood' : x.T.k === 'hill' ? 'The hill' : `The ${x.T.k}`} at ${Math.round(x.T.x + x.T.w / 2)}″ across`, val: x.i })), 'Let the computer pick') : null;
  G.m.fog.good = { mine: a ? a.id : null, theirs: b ? b.id : null, terrain: t ?? (half.length ? half[0].i : null) };
  log({ ph: 'Priority', why: ['scenario'], text: `Fog of War: you secretly chose ${a ? a.name : 'no Hero'} to keep safe, ${b ? b.name : 'no Hero'} to hunt, and a terrain piece to hold. The enemy has chosen too.` });
}
// Sieges (engine/fortress.js): the attackers at a gate Strike it at the end of the Fight phase.
async function batterGatesAct() {
  for (const g of G.units.filter(u => isGate(u) && alive(u))) {
    const res = await play(gateSeq(g), { ph: 'Fight', notes: [] });
    for (const { w, R } of res) {
      let lost = 0;
      for (let k = 0; k < R.wounds && alive(g); k++) { await hurt(g); lost++; }
      log({ ph: 'Fight', why: ['siegeWalls'], tone: w.side === 'good' ? (lost ? 'good' : null) : lost ? 'bad' : null, dice: [{ l: `To Wound ${needStr(R.need)}`, d: R.rolls }],
        text: `${w.name} batters ${g.name} (no Duel Roll; a gate counts as Trapped: two To Wound rolls a Strike): ${lost ? `${pl(lost, 'Wound')}${alive(g) ? `, ${g.w} left` : ': the gate is broken, and models may go through'}` : 'no damage'}.` });
      if (!alive(g)) { fxDeath(g); updateMission(); break; }
    }
  }
}
// A defender pushes a Siege Ladder down (fortress.js: pushSeq); everyone on it falls.
async function pushAct(u, L) {
  tray.begin(`${u.name} pushes the ladder`);
  const P = await play(pushSeq(u, L), { ph: 'Move', notes: [] });
  log({ ph: 'Move', why: ['siegeWalls'], tone: P.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: `Push ${4 - P.mod}+`, d: [{ v: P.die.v, ok: P.ok }] }],
    text: `${u.name} tries to push the Siege Ladder down: ${P.die.v}${P.mod ? ` ${P.mod > 0 ? '+' : '−'} ${Math.abs(P.mod)}` : ''}, 4+ needed. ${P.ok ? `It falls${P.fell.length ? `, and ${names(P.fell)} with it` : ''}.` : 'It holds.'}` });
  for (const o of P.fell) if (alive(o)) { o.over = null; await fallDamage(o, { f: L.z, hits: fallHits(o, L.z) }, 'falls with the Siege Ladder'); }
  updateMission(); renderCard(true);
}
export const canPushNow = u => !!G && u.side === 'good' && G.phase === 'move' && G.mode === 'move' && G.step === 'good' && waiter != null && !G.busy && !(u.movedDist > 0) && !!pushable(u);
// The player's push button on the model card.
export async function pushLadderAct(u) {
  if (!canPushNow(u)) return;
  if (needsActivation(u) && !(await activateModel(u))) return;
  const L = pushable(u); if (L) await pushAct(u, L);
  updateHint();
}
// A Sharpshooter's aim at a Cavalry model: the rider or the mount.
async function pickAim(s, t) {
  const mount = t.mount.n.toLowerCase();
  await teach(['sharpshooter'], { s, t });
  const r = await askPlayer({ kind: 'aim', s, t }, 'aim', () => (autoPlay() ? 'auto' : undefined), `Aim at the rider (Defence ${t.d})`, { second: `Aim at the ${mount} (Defence ${t.mount.d})` });
  return r === 'second' ? 'mount' : r === 'first' ? 'rider' : shotInfo(s, t).aim;
}

// shield: { good, evil }, the sides that declared Shielding: twice the dice, no supporters, no Strikes if they win.
// Returns the Duel Roll.
// The Melee Weapon each model fights with (combat.js: pickWeapons, p. 104): the player picks for a model of theirs that
// has a choice, the computer for the others; then the Combat, then the choice is dropped.
async function resolveFight(c, shield = {}) {
  c.forEach(u => { u.fought = true; });   // Will of Evil (magic.js: endPhase)
  const mine = c.filter(u => u.side === 'good' && alive(u) && !shield.good && weaponsOf(u).length > 1);
  const picks = new Map();
  for (const u of mine) picks.set(u, autoPlay() ? aiWeapon(u, c) : await pickWeapon(u, c));
  const chose = pickWeapons(c, shield, u => (picks.has(u) ? picks.get(u) : aiWeapon(u, c)));
  const two = chose.filter(u => u.wpn === 'two'), hand = chose.filter(u => u.wpn === 'hand');
  if (chose.length) log({ ph: 'Fight', why: ['twohanded'], text: [two.length && `${names(two)} ${two.length > 1 ? 'fight' : 'fights'} with ${two.length > 1 ? 'their' : 'its'} two-handed weapon${two.some(u => u.dLoss) ? ' (no shield bonus: −1 Defence)' : ''}`, hand.length && `${names(hand)} ${hand.length > 1 ? 'use' : 'uses'} a hand weapon`].filter(Boolean).join('; ') + '.' });
  try { return await resolveFightWith(c, shield); } finally { dropWeapons(c); }
}
async function pickWeapon(u, c) {
  const foes = c.filter(o => o.side !== u.side && alive(o)), d = Math.min(...foes.map(o => o.d)), need = woundNeed(strikeS(u), d);
  const txt = (n, b) => (!n ? '—' : n.map(v => `${Math.max(2, v - b)}+`).join('/'));
  const r = await askPlayer({ kind: 'weapon', u, hand: txt(need, 0), two: txt(need, 1), half: halfHand(u), shield: hasShield(u) }, 'weapon', () => (autoPlay() ? (aiWeapon(u, c) === 'two' ? 'second' : 'first') : undefined), 'Hand weapon', { second: 'Two-handed' });
  return r === 'second' ? 'two' : 'hand';
}
async function resolveFightWith(c, shield) {
  const goods = goodsOf(c), evils = evilsOf(c);
  if (!goods.length || !evils.length) return null;
  const contacts = contactsIn(goods, evils);
  // Supporting spears and pikes: a dice each, never struck. A Shielding side cannot be Supported.
  const gs = shield.good ? [] : supOf(c, 'good'), es = shield.evil ? [] : supOf(c, 'evil');
  [...gs, ...es].forEach(s => { s.supported = true; });   // Destroy the Supplies: a supporter did more than Move (as sim.js)
  const banners = bannersOf(c, gs, es);
  const D = rollDuelDice(goods, evils, gs, es, shield);
  const team = (list, sup) => `${groupNames(list)}${sup.length ? `, supported by ${groupNames(sup)}` : ''}`;
  const supDice = n => (n ? ` · +${n} support` : '');
  // Dice with a modifier say why, e.g. "banner bearer −1".
  const modNote = dice => {
    const m = dice.find(d => d.mod); if (!m) return '';
    return ` · ${twoH(m.u) ? 'two-handed' : m.u.T.banner ? 'banner' : 'pike and shield'} ${m.mod < 0 ? '−' : '+'}${Math.abs(m.mod)}`;
  };
  // A natural 6 of a two-handed weapon ignores the penalty, so it shows no tag.
  const trayDice = dice => dice.map(d => ({ v: d.v, ref: d, mod: d.six && d.n === 6 ? 0 : d.mod }));
  const shieldNote = side => (shield[side] ? ' · Shielding' : '');
  const lost = side => (side === 'good' ? supOf(c, 'good') : supOf(c, 'evil'));
  for (const s of ['good', 'evil']) if (D.bonus[s].length) log({ auto: true, ph: 'Fight', why: ['cavalrycharge'], tone: s === 'good' ? 'good' : 'bad', text: `Cavalry Charge: ${names(D.bonus[s])} charged infantry on open ground, so ${D.bonus[s].length > 1 ? 'they get' : 'it gets'} Extra Attack (one dice and one Strike more) and Knock to the Ground (the losers are knocked Prone if ${D.bonus[s].length > 1 ? 'they win' : 'it wins'}).` });
  for (const u of [...goods, ...evils]) if (challengeBonus(u, u.side === 'good' ? evils : goods)) log({ ph: 'Fight', why: ['heroicChallenge'], tone: u.side === 'good' ? 'good' : 'bad', text: `Heroic Challenge: ${u.name} fights its challenge opponent, so it has +1 Attack and +1 To Wound against it.` });
  if (shield.good || shield.evil) {
    const who = s => names(s === 'good' ? goods : evils);
    const sh = ['good', 'evil'].filter(s => shield[s]);
    const many = s => (s === 'good' ? goods : evils).length > 1;
    log({ ph: 'Fight', why: ['shielding'], text: sh.map(s => `${who(s)} ${many(s) ? 'declare' : 'declares'} Shielding: twice the dice, but no Strikes if ${many(s) ? 'they win' : 'it wins'}.${lost(s).length ? ` ${names(lost(s))} cannot Support a Shielding model.` : ''}`).join(' ') });
  }

  tray.begin(`Duel Roll: ${team(goods, gs)} vs ${team(evils, es)}`);
  sfx.clash();
  const [rowG, rowE] = await tray.throw([
    { l: `You · FV ${D.gF}${shieldNote('good')}${supDice(gs.length)}${modNote(D.g)}`, side: 'good', d: trayDice(D.g), sort: true },
    { l: `Enemy · FV ${D.eF}${shieldNote('evil')}${supDice(es.length)}${modNote(D.e)}`, side: 'evil', d: trayDice(D.e), sort: true },
  ], { primed: true });
  // Re-rolls (banners, p. 50, 109): the side that is losing first, then the other may answer; then Might (p. 77), the
  // losing Hero bidding first; then the winner (combat.js: duelSeq).
  const notes = [];
  await play(duelSeq(D, banners), { c, D, rowG, rowE, notes, ph: 'Fight' });
  noteDuel(c, D.win);
  const reText = notes.map(String);
  const win = D.win;
  shieldwallSnap(c);   // Shieldwall: worked out before Backing Away (p. 129)
  const walled = c.filter(u => u.swall);
  if (walled.length) log({ auto: true, ph: 'Fight', why: ['shieldwall'], text: `Shieldwall: ${names(walled)} ${walled.length > 1 ? 'stand' : 'stands'} shield to shield with two or more friends: +1 Defence in this Combat.` });
  tray.markTop(rowG, win === 'good' && !D.off); tray.markTop(rowE, win === 'evil' && !D.off);
  const winRes = D.gM !== D.eM ? 'Wins' : D.off ? 'Tie' : 'Wins on Fight Value';
  rowG.res = win === 'good' || D.off ? winRes : ''; rowE.res = win === 'evil' || D.off ? winRes : '';
  const dice = [
    { l: 'You', d: D.gd.map(v => ({ v, ok: win === 'good' && v === D.gM ? true : undefined })) },
    { l: 'Enemy', d: D.ed.map(v => ({ v, ok: win === 'evil' && v === D.eM ? true : undefined })) },
  ];
  if (D.off) dice.push({ l: 'Roll-off', d: [{ v: D.off }] });
  if (D.off) await tray.throw([{ l: 'Roll-off: 1–3 Evil, 4–6 Good', side: 'neutral', d: [{ v: D.off, ok: true }], res: D.off >= 4 ? 'Good wins' : 'Evil wins' }]);
  const who = win === 'good' ? 'you win' : 'the enemy wins';
  // A plain win shows as a tag on the winning row: the dice say why. A tie needs the rule spelt out.
  const winRow = win === 'good' ? rowG : rowE;
  if (D.gM !== D.eM) { if (winRow) { winRow.res = 'Wins'; tray.layout(); } }
  else tray.note(!D.off ? `Both highest dice are ${D.gM}, so the higher Fight Value wins (${D.gF} against ${D.eF}): ${who}.`
      : `Both highest dice are ${D.gM} and the Fight Values are equal, so the roll-off decides: ${who}.`, win === 'good' ? 'good' : 'bad');
  const sups = [...gs, ...es];
  const why = [...D.why, (goods.length > 1 || evils.length > 1) && 'multi', sups.some(s => s.T.spear) && 'spear', sups.some(s => s.T.pike) && 'pike',
    (shield.good || shield.evil) && 'shielding', [...goods, ...evils].some(u => twoH(u)) && 'twohanded', [...goods, ...evils].some(u => u.fvPlus) && 'heroicStrike'].filter(Boolean);
  log({ ph: 'Fight', text: `Duel Roll: ${names(goods)}${gs.length ? `, supported by ${names(gs)},` : ''} vs ${names(evils)}${es.length ? `, supported by ${names(es)}` : ''}.${reText.length ? ' ' + reText.join(' ') : ''} ${D.how} ${win === 'good' ? 'Your side wins.' : 'The enemy wins.'}`, dice, why, tone: win === 'good' ? 'good' : 'bad' });
  await teach([D.why.includes('tie') && 'tie', D.off && 'rolloff'].filter(Boolean));

  const W = win === 'good' ? goods : evils, L = win === 'good' ? evils : goods;
  const B = barrierOf(c);
  if (B && B.mode === 'barrier') { await resolveOverBarrier(c, B, D, shield, gs, es, contacts); return D; }
  if (B) log({ auto: true, ph: 'Fight', why: ['bothsides'], text: B.mode === 'bothSides' ? `${B.def.name} is attacked from both sides of the ${B.T.k}, so the ${B.T.k} protects it no longer: a normal Combat.` : `${B.att.name} is itself attacked on its side of the ${B.T.k}, so this is a normal Combat, and it cannot cross the ${B.T.k}.` });
  // Brutal Power Attacks (monsters.js): a winning Monster may use one instead of its Strikes; Hurl and Barge end the Combat.
  const brutal = [];
  if (!shield[win]) for (const w of W) {
    const o = brutalOptions(w, L, shield); if (!o) continue;
    const a = w.side === 'good' && !autoPlay() ? await playerBrutal(w, o) : aiBrutal({ u: w, opts: o, side: win });
    if (!a) continue;
    w.bpa = G.turn; brutal.push({ w, a });
    if (a.k !== 'rend') break;
  }
  const endB = brutal.find(b => b.a.k !== 'rend');
  if (endB) { D.again = await brutalEndAct(c, endB, W, L, contacts); await venom(c); await thrownRiders(c); return D; }
  // Once Make Way is taught, the player chooses where their own losers Back Away (and whether a friend Makes Way),
  // unless Auto Back Away (or AI plays for you) hands that back to the app.
  const R0 = L[0].side === 'good' && knows('makeway', G.mi) && !prefs.autoBack && !autoPlay() && !L.some(immovable) ? await playerBackAway(W, L, contacts) : backAwayAll(W, L, contacts);
  const { moves, trapped, madeWay, falls } = R0;
  if (R0.away) log({ auto: true, ph: 'Fight', why: ['chariot'], text: `${names(L.filter(immovable))} never ${L.filter(immovable).length > 1 ? 'Back' : 'Backs'} Away (Immovable Object): ${names(R0.away)} ${R0.away.length > 1 ? 'Back' : 'Backs'} Away instead.` });
  for (const m of moves) if (!m.done) animFrom(m.u, m.from, 260);
  const backed = moves.map(m => m.u).filter(u => L.includes(u));
  if (backed.length) log({ ph: 'Fight', text: `Backing Away 1″: ${names(backed)}.`, why: ['backaway'] });
  for (const m of madeWay) log({ ph: 'Fight', text: `${m.u.name} Makes Way: it steps aside up to 1″ to make room, so ${m.for.name} can Back Away there.`, why: ['makeway'] });
  if (trapped.size) log({ auto: true, ph: 'Fight', text: `Trapped, cannot Back Away: ${names(L.filter(l => trapped.has(l.id)))}. Every Strike against them makes two To Wound rolls.`, why: ['trapped'], tone: win === 'good' ? 'good' : 'bad' });
  await teach([backed.length && 'backaway', madeWay.length && 'makeway', trapped.size && 'trapped', 'strikes'].filter(Boolean),
    { trappedNow: names(L.filter(l => trapped.has(l.id))) });

  // A Shielding winner makes no Strikes (and neither do supporters: a Shielding side has none).
  if (shield[win]) log({ auto: true, ph: 'Fight', why: ['shielding'], tone: win === 'good' ? 'good' : 'bad', text: `${names(W)} won while Shielding, so ${win === 'good' ? 'your side makes' : 'the enemy makes'} no Strikes.` });
  // Knock to the Ground (p. 70): the infantry beaten by a charging Cavalry model lies Prone after Backing Away.
  const down = knockDown(W, L);
  for (const k of down.kept) log({ ph: 'Fight', why: ['unyieldingCombatStance'], dice: [{ l: 'Unyielding 4+', d: [{ v: k.v, ok: k.ok }] }],
    text: `${k.u.name} has Unyielding Combat Stance: ${k.v}. ${k.ok ? 'It keeps its footing and is not knocked Prone.' : 'It goes down.'}` });
  if (down.length) log({ auto: true, ph: 'Fight', why: ['cavalrycharge', 'prone'], tone: win === 'good' ? 'good' : 'bad', text: `Knock to the Ground: ${names(down)} ${down.length > 1 ? 'are' : 'is'} knocked Prone. Every Strike against a Prone model makes two To Wound rolls.` });
  // Monstrous Charge (p. 128): the beaten models with less Strength than the charging Monster go down.
  const md = monstrousDown(W, L);
  if (md.down.length) log({ auto: true, ph: 'Fight', why: ['monstrousCharge', 'prone'], tone: win === 'good' ? 'good' : 'bad', text: `Monstrous Charge: ${names(md.down)} ${md.down.length > 1 ? 'are' : 'is'} knocked Prone.` });
  for (const x of md.flying) await knockAct(x, 'is knocked down by a Monstrous Charge');
  const rd = rampDown(W, L);   // a Chariot or War Beast that Charged and won
  if (rd.down.length) log({ auto: true, ph: 'Fight', why: ['chariot', 'prone'], tone: win === 'good' ? 'good' : 'bad', text: `${names(W.filter(rams))} won after Charging: ${names(rd.down)} ${rd.down.length > 1 ? 'are' : 'is'} knocked Prone.` });
  for (const x of rd.flying) await knockAct(x, 'is knocked down by a Chariot');
  for (const { w, a } of brutal) if (alive(a.t)) await rendAct(w, a.t, a.part);   // Rend comes before every Strike
  // A Prone winner makes no Strikes; it may Stand Up instead (p. 52). A rider thrown this turn makes none either.
  const proneW = W.filter(w => w.prone), stunnedW = W.filter(w => w.stunned && !w.prone);
  if (proneW.length) { proneW.forEach(w => { if (!paralysed(w)) w.prone = false; }); log({ auto: true, ph: 'Fight', why: ['prone'], text: `${names(proneW)} won while Prone, so ${proneW.length > 1 ? 'they make' : 'it makes'} no Strikes and Stands Up instead.` }); }
  if (stunnedW.length) log({ auto: true, ph: 'Fight', why: ['thrownrider'], text: `${names(stunnedW)} ${stunnedW.length > 1 ? 'were' : 'was'} thrown from the saddle this turn and cannot make Strikes.` });
  // A Monster that slays with a Strike strikes once more at each model that Supported its victim (p. 89).
  const free = async (w, t) => { if (alive(t) || !freeStrikes(w)) return; for (const s of supportersOf(c, t)) if (alive(s)) { log({ auto: true, ph: 'Fight', why: ['monsters'], text: `${w.name} slew ${t.name}: a free Strike at ${s.name}, which was Supporting it.` }); await strike(w, s, 1, trapped); } };
  for (const w of shield[win] ? [] : W.filter(w => !proneW.includes(w) && !stunnedW.includes(w) && !brutal.some(b => b.w === w))) {
    const sw = sweepTargets(w, L);
    if (sw) {   // Berserker Blade two-handed: one Strike at every enemy it is Engaged with
      log({ ph: 'Fight', why: ['twohanded'], tone: w.side === 'good' ? 'good' : 'bad', text: `${w.name} sweeps its Berserker Blade: one Strike at each of ${names(sw)}.` });
      for (const t of sw) if (alive(t)) await strike(w, t, 1, trapped);
      continue;
    }
    const cands = strikeTargets(w, L, contacts);
    if (!cands.length) continue;
    const n = strikesOf(w, L);   // +1 for a Cavalry Charge's Extra Attack, +1 against a Heroic Challenge opponent
    // Once choosing Strikes is taught, the player picks where each Strike goes when there is a choice. Strikes at a
    // Cavalry model, or with an extra Strike, go one at a time, so each can pick its target (and its part).
    const oneByOne = cands.length > 1 || cands.some(t => t.cav) || n > w.a;
    if (w.side !== 'good' || !knows('pickstrike', G.mi) || !oneByOne || autoPlay()) { const t0 = bestStrikeTarget(w, cands, trapped); await strike(w, t0, n, trapped); await free(w, t0); continue; }
    for (let i = 0; i < n; i++) {
      const cs = strikeTargets(w, L, contacts);
      if (!cs.length) break;
      const t = cs.length === 1 ? cs[0] : await pickStrike(w, cs, trapped, n > 1 ? ` (Strike ${i + 1} of ${n})` : '');
      await strike(w, t, 1, trapped);
      await free(w, t);
    }
  }
  // Each supporter of the winning side makes one Strike at any enemy in the Combat.
  for (const s of win === 'good' ? gs : es) {
    const cs = L.filter(alive);
    if (!cs.length) break;
    const t = cs.length > 1 && s.side === 'good' && knows('pickstrike', G.mi) && !autoPlay() ? await pickStrike(s, cs, trapped, ' (Supporting)') : bestStrikeTarget(s, cs, trapped);
    await strike(s, t, 1, trapped);
  }

  // Losers Backing Away over the edge of a drop fall now, after the Strikes (p. 51).
  for (const fl of falls || []) {
    if (!alive(fl.u)) continue;
    const from = { x: fl.u.x, y: fl.u.y }, Q = nearestFree(fl.u, fl.to);
    fl.u.x = Q.x; fl.u.y = Q.y; fl.u.prone = true;
    animFrom(fl.u, from, 320);
    await fallDamage(fl.u, { f: fl.f, hits: fallHits(fl.u, fl.f) }, 'had nowhere to Back Away but over the edge: it falls');
  }
  const survivors = L.filter(l => trapped.has(l.id) && alive(l));
  for (const m of separateTrapped(W, survivors)) animFrom(m.u, m.from, 220);
  if (survivors.length) log({ auto: true, ph: 'Fight', text: `${names(survivors)} survived while Trapped, so the models are separated slightly and are no longer in base contact.`, why: ['trapped'] });
  if (mayCross(B, win)) await crossOver(B);
  if (B && B.mode === 'ladder') for (const f of afterLadder(B, win).falls) {   // lost at the top of a Siege Ladder: a 1–3 and it falls
    log({ ph: 'Fight', why: ['siegeWalls'], tone: (f.u.side === 'good') === !f.fell ? 'good' : 'bad', dice: [{ l: 'Ladder 4+', d: [{ v: f.die, ok: !f.fell }] }], text: `${f.u.name} is on the ladder of a lost fight: ${f.die}. ${f.fell ? 'It falls.' : 'It keeps its grip.'}` });
    if (f.fell && alive(f.u)) { f.u.over = null; await fallDamage(f.u, { f: B.T.z, hits: fallHits(f.u, B.T.z) }, 'falls off the Siege Ladder'); }
  }
  await venom(c);
  await thrownRiders(c);
  return D;
}

/* ---------- Monsters (engine/monsters.js, p. 89–91) ---------- */
// The player's Monster won: Strikes as normal, or one Brutal Power Attack. Returns null (Strikes) or the choice.
async function playerBrutal(w, o) {
  const list = [{ label: 'Strike as normal', val: 'strike' }];
  const n = rendRolls(w);
  for (const t of o.rend) for (const part of t.cav ? ['rider', 'mount'] : ['rider']) {
    const s = part === 'mount' ? t.mount.s : t.s;
    list.push({ label: `Rend ${t.name}${t.cav ? (part === 'mount' ? ` (its ${t.mount.n.toLowerCase()})` : ' (the rider)') : ''}: ${n} To Wound rolls, Strength ${w.s} against Strength ${s}, ${needStr(woundNeed(w.s, s))}`, val: { k: 'rend', t, part } });
  }
  for (const t of o.hurl) list.push({ label: `Hurl ${t.name} (D3 + ${w.s - t.s}″; two Strength 6 hits on it, one on whoever it lands on)`, val: { k: 'hurl', t } });
  if (o.barge) list.push({ label: 'Barge: every enemy in the Combat and its supporters Back Away 3″; then move D3+3″, and Charge again if you like', val: { k: 'barge' } });
  const r = await askChoice(`${w.name}: a Brutal Power Attack?`, `<b>${esc(w.name)}</b> is a Monster and won the Combat. Instead of its Strikes it may use one Brutal Power Attack this turn. Rend: To Wound rolls against the target's Strength instead of its Defence. Hurl: throw a model with less Strength at another enemy; the Combat ends. Barge: the enemies are flung 3″ back (Prone if they cannot go the full 3″); the Combat ends.`, list, 'Strike as normal');
  return r && r !== 'strike' ? r : null;
}
async function playerHurlAt(q) {
  const r = await askChoice(`Hurl: ${q.pass ? 'at whom?' : 'you pick where it lands'}`, q.pass ? `<b>${esc(q.u.name)}</b> passed its Intelligence Test: pick the enemy ${esc(q.t.name)} is hurled at (within the Hurl Distance and in sight).` : `<b>${esc(q.u.name)}</b> failed its Intelligence Test, so you pick which of your models ${esc(q.t.name)} lands on.`,
    q.list.map(o => ({ label: `${o.name} (${fmt(gap(q.u, o))}″)`, val: o })), 'Let the computer pick');
  return r || aiAnswer(q);
}
// Rend, before any Strike: the To Wound rolls in the tray, a Wound for each success.
async function rendAct(w, t, part) {
  const s = part === 'mount' && t.cav ? t.mount.s : t.s;
  tray.begin(`Rend: ${w.name} against ${t.name}`);
  const S = await play(rendSeq(w, t, rendRolls(w), part), { ph: 'Fight' });
  let slain = false;
  for (let j = 0; j < S.wounds && alive(t); j++) {
    const r = await hurt(t, part);
    if (r === 'slain') { slain = true; fxDeath(t); sfx.death(t); mountLeft(t); } else if (r === 'mountSlain') break;
  }
  log({ ph: 'Fight', why: ['monsters'], tone: w.side === 'good' ? 'good' : 'bad', dice: [{ l: `Rend ${needStr(S.need)}`, d: S.rolls.map(d => ({ v: d.v, ok: d.ok })) }],
    text: `${w.name} Rends ${t.name}: ${S.rollsN} To Wound rolls with Strength ${w.s} against its Strength ${s} (${needStr(S.need)}): ${pl(S.wounds, 'wound')}${slain ? `; ${t.name} is slain` : ''}.` });
}
// Knocked Prone by a Barge or a Hurl: a Cavalry model's rider is Knocked Flying.
async function knockAct(x, why) { if (!alive(x)) return; if (x.cav) await throwRider(x, why); else x.prone = true; }
// A Barge or a Hurl: the Combat ends with it. Returns the Monster when it Charged again after a Barge.
async function brutalEndAct(c, b, W, L, contacts) {
  const w = b.w, mine = w.side === 'good';
  if (b.a.k === 'barge') {
    const B2 = barge(w, c);
    for (const m of B2.moves) animFrom(m.u, m.from, 320);
    await sleep(350);
    log({ ph: 'Fight', why: ['monsters'], tone: mine ? 'good' : 'bad', text: `${w.name} Barges: ${names(B2.moves.map(m => m.u))} ${B2.moves.length > 1 ? 'are' : 'is'} flung back 3″${B2.down.length ? `; ${names(B2.down)} could not go the full 3″ and ${B2.down.length > 1 ? 'are' : 'is'} knocked Prone` : ''}. The Combat ends.` });
    for (const x of B2.down) await knockAct(x, 'is barged into something');
    const m = bargeMove();
    if (!alive(w)) return null;
    log({ ph: 'Fight', why: ['monsters'], tone: mine ? 'good' : 'bad', dice: [{ l: 'D3+3″', d: [{ v: m.v }] }], text: `${w.name} may now move ${m.d}″ (D3+3), and Charge again if it reaches an enemy.` });
    w.movedDist = Math.max(0, moveVal(w) - m.d); w.done = false; w.moveStart = null; w.trail = [];
    if (mine && !autoPlay()) await playerActivation([w], 'Done: the move after the Barge'); else await aiMove(w.side, [w]);
    w.done = true; updateMission(); renderCard(true);
    return engaged(w) ? w : null;
  }
  const t = b.a.t, others = L.filter(l => l !== t);
  const { moves } = backAwayAll(W, others, contacts);
  for (const m of moves) if (!m.done) animFrom(m.u, m.from, 260);
  tray.begin(`Hurl: ${w.name} hurls ${t.name}`);
  const Hh = await play(hurlSeq(w, t), { ph: 'Fight', side: 'neutral' });
  animFrom(t, Hh.from, 420);
  await sleep(420);
  const hurtNow = [], slainNow = [];
  for (const h of Hh.hits) if (h.W.ok && alive(h.u) && !(h.part === 'mount' && !h.u.cav)) {
    const r = await hurt(h.u, h.part);
    if (r === 'slain') { slainNow.push(h.u); fxDeath(h.u); sfx.death(h.u); mountLeft(h.u); } else if (r !== 'saved') hurtNow.push(h.u);
  }
  log({ ph: 'Fight', why: ['monsters', 'intelligence'], tone: mine ? 'good' : 'bad', dice: [{ l: 'Intelligence', d: Hh.T.dice.map(v => ({ v })) }, { l: 'Hits S6', d: Hh.hits.flatMap(h => h.W.dice.map(d => ({ v: d.v, ok: d.ok }))) }],
    text: `${w.name} Hurls ${t.name} ${Hh.dist}″ (D3 ${Hh.d3} + Strength difference). Intelligence Test ${Hh.T.total} against ${Hh.T.need}+: ${Hh.T.ok ? 'passed, so it picks the target' : 'failed, so the other side picks'}. ${Hh.target ? `${t.name} lands on ${Hh.target.name}: two Strength 6 hits on ${t.name}, one on ${Hh.target.name}; both are knocked Prone${Hh.target.s > 5 ? ` (${Hh.target.name} stays up: Strength 6+)` : ''}.` : `No enemy in reach: ${t.name} crashes to the ground, two Strength 6 hits and Prone.`}${hurtNow.length ? ` ${names([...new Set(hurtNow)].filter(alive))} ${hurtNow.length > 1 ? 'lose' : 'loses'} Wounds.` : ''}${slainNow.length ? ` Slain: ${names(slainNow)}.` : ''} The Combat ends.` });
  for (const x of [t, Hh.target].filter(Boolean)) if (alive(x) && x.mountSlain) await thrownRiders([x]);
  for (const x of Hh.flying) if (alive(x) && x.cav) await throwRider(x, 'is hurled about');
  updateMission(); renderCard(true);
  return null;
}

// Venom (p. 133): at the end of the Combat, one enemy each Venom model wounded but did not slay rolls a D6; a natural 6
// is another Wound.
async function venom(c) {
  for (const v of venomEnd(c)) {
    let r = null;
    if (v.ok && alive(v.t)) r = await hurt(v.t);
    if (r === 'slain') { fxDeath(v.t); sfx.death(v.t); mountLeft(v.t); } else if (r && r !== 'saved') { fxText(v.t, '−1 Wound', 'bad', 280); sfx.wound(v.t); }
    log({ ph: 'Fight', why: ['venom'], dice: [{ l: 'Venom 6', d: [{ v: v.v, ok: v.ok }] }], tone: v.ok ? (v.t.side === 'evil' ? 'good' : 'bad') : null,
      text: `${v.w.name}'s Venom: ${v.t.name} rolls ${v.v}. ${!v.ok ? 'Nothing more happens.' : r === 'saved' ? 'The extra Wound is prevented with Fate.' : r === 'slain' ? `It suffers another Wound and is slain.` : 'It suffers another Wound.'}` });
  }
}

// Riders whose mount was slain in this Combat take the Thrown Rider Test once the Strikes are over (p. 70–71).
async function thrownRiders(c) {
  for (const u of c.filter(u => alive(u) && u.mountSlain)) {
    const mount = u.mount.n.toLowerCase();
    const T = await play(thrownRiderSeq(u), { ph: G.phase === 'shoot' ? 'Shoot' : 'Fight', label: q => (q.step === 'wound' ? `Knocked Flying: Strength 3 hit, To Wound ${needStr(q.need)}` : q.label), side: 'neutral', notes: [] });
    const re = T.rolls.length > 1 ? ` (a 1, re-rolled as an Expert Rider: ${T.rolls[1]})` : '';
    const dice = [{ l: 'Thrown Rider', d: T.rolls.map(v => ({ v })) }];
    let text = `${u.name}'s ${mount} is slain, so the rider takes a Thrown Rider Test: ${T.keep ? 1 : T.v}${re}. ${T.keep ? `Unyielding Combat Stance: ${T.keep.v}, ${T.keep.ok ? 'so it counts as a 6' : 'it is Knocked Flying'}. ` : ''}`;
    if (T.v === 1) {
      if (T.hit && T.hit.need) dice.push({ l: 'Knocked Flying S3', d: T.hit.dice });
      text += `Knocked Flying: one Strength 3 hit${T.hit && T.hit.need ? ` (To Wound ${needStr(T.hit.need)})` : ''}: ${T.died ? 'the rider is slain.' : T.hit && T.hit.ok ? 'it loses a Wound, lies Prone and can do nothing more this turn.' : 'no wound, but it lies Prone and can do nothing more this turn.'}`;
      if (T.died) { fxDeath(u); sfx.death(u); } else fxText(u, 'thrown', 'bad', 280);
    } else if (T.v === 6) text += 'Leaps into Action: it lands on its feet and fights on as normal.';
    else text += 'Rises From the Dust: it gets to its feet, but can do nothing more this turn.';
    if (!T.died) text += ` It fights on foot from now on (25 mm base)${u.held && u.held.size ? ', still Engaged with the enemies it was fighting' : ''}.`;
    log({ ph: G.phase === 'shoot' ? 'Shoot' : 'Fight', why: ['thrownrider', ...(T.v === 1 ? ['prone'] : [])], tone: u.side === 'good' ? 'bad' : 'good', dice, text });
    await teach(['thrownrider'], { u });
    updateMission(); renderCard(true);
  }
}
// The player's rider Dismounts during its Move (combat.js: dismountAtWill, p. 69), from the model card.
export async function dismountAct(u) {
  if (!canDismount(u) || waiter == null) return;
  if (needsActivation(u) && !(await activateModel(u))) return;
  const name = u.name, mount = u.mount.n.toLowerCase(), c = u.mount.c;
  const S = dismountAtWill(u);
  const tail = !S ? `Its ${mount} runs off: a horse never stays without its rider.`
    : `Its ${mount} takes a Courage Test: ${S.dice[0]} + ${S.dice[1]} = ${S.dice[0] + S.dice[1]} against ${c}+: ${S.stays ? `it stays as ${S.u.name}, but cannot move again this turn.` : 'it flees the battlefield.'}`;
  log({ ph: 'Move', why: ['dismount', 'loosemount'], tone: 'good', dice: S ? [{ l: `Courage ${c}+`, d: S.dice.map(v => ({ v })) }] : undefined,
    text: `${name} Dismounts and goes on foot, with ${fmt(Math.max(0, u.mv - u.movedDist))}″ of its Move left. ${tail} It can never mount again.` });
  G.sel = canMove(u) ? u : null; G.active = u;
  updateMission(); renderCard(true); updateHint();
}
/* ---------- Magic (engine/magic.js, p. 114–121) ---------- */
// Whether the player's model u may Cast now: in the player's Move, before it Activates or while it is the model moving
// (a power may come before, during or after its Move, even after a Charge), once per Activation.
export function canCastNow(u) {
  if (!G || u.side !== 'good' || G.phase !== 'move' || G.mode !== 'move' || G.step !== 'good' || waiter == null || G.busy) return false;
  if (G.only && !G.only.includes(u)) return false;
  if (!castable(u).length) return false;
  return G.active === u || (!u.done && !(u.movedDist > 0) && !engaged(u));
}
// A question in the panel with a list of answers (G.ask.kind 'choice', panel.js shows the buttons). Returns the value
// picked, or null when the player presses the second button (cancel).
async function askChoice(title, body, list, cancel, kind = 'choice') {
  const r = await askPlayer({ kind: 'choice', title, body, list }, kind, () => undefined, 'Pick one below', { second: cancel });
  return r && r.pick ? r.val : null;
}
const pct2 = p => `${Math.round(p * 100)}%`;
// The player Casts power i of model u: the target, the part of a Cavalry model, the Will Points, then the tests.
export async function castAct(u, i) {
  if (!canCastNow(u)) return;
  const pw = u.T.powers[i], P = pw && powerOf(pw.n);
  if (!P || !castable(u).includes(pw)) return;
  if (needsActivation(u) && !(await activateModel(u))) return;
  const list = targets(u, pw);
  if (!list.length) { log({ auto: true, ph: 'Move', why: ['magic'], text: `${u.name} has no target for ${pw.n} within ${pw.rng}″ and in sight.` }); return; }
  let t = P.aim === 'self' ? u : null;
  if (P.aim === 'enemy' || P.aim === 'friend' || P.aim === 'line') {
    const line = P.aim === 'line', body = line ? `<b>${esc(u.name)}</b> Casts ${esc(pw.n)} (${pw.cast}+): a line D3+3″ long from its base, in the direction you pick (towards an enemy within 6″). Every model under it, friend or foe, suffers a Strength 4 hit and is knocked Prone.`
      : `<b>${esc(u.name)}</b> Casts ${esc(pw.n)} (${pw.cast}+, range ${pw.rng}″). Pick the target: ${P.aim === 'enemy' ? 'an enemy' : 'a friend'} within range and in sight.`;
    t = list.length === 1 && !line ? list[0] : await askChoice(`${pw.n}: ${line ? 'which way?' : 'the target'}`, body,
      list.map(o => ({ label: `${line ? 'Towards ' : ''}${o.name} (${fmt(gap(u, o))}″)`, val: o })), 'Cancel');
    if (!t) return;
  }
  let part = 'rider';
  if (t && t.cav && P.part) {
    part = await askChoice(`${pw.n}: rider or mount?`, `${esc(t.name)} is a Cavalry model: ${esc(pw.n)} targets either the rider or the ${esc(t.mount.n.toLowerCase())}; you choose before rolling.`,
      [{ label: `The rider (Defence ${t.d}, ${t.w} Wounds)`, val: 'rider' }, { label: `The ${t.mount.n.toLowerCase()} (Defence ${t.mount.d}, ${t.mount.w} Wounds)`, val: 'mount' }], 'Cancel');
    if (!part) return;
  }
  let n = 1;
  if (!u.channel) {
    const most = castWill(u);
    n = await askChoice(`${pw.n}: how many Will Points?`, `Each Will Point rolls a D6; any dice of ${pw.cast}+ Casts the power. You decide before rolling. ${esc(u.name)} has ${pl(u.will, 'Will Point')}${most < u.will ? ' (Will of Evil: the last one cannot be spent)' : ''}. ${P.aim === 'enemy' || P.aim === 'enemies' ? 'A higher best dice makes it harder to Resist.' : ''}`,
      Array.from({ length: Math.min(most, 6) }, (_, k) => ({ label: `${pl(k + 1, 'Will Point')}: ${pct2(castChance(u, pw, k + 1))} to Cast`, val: k + 1 })), 'Cancel');
    if (!n) return;
  }
  if (G.active && G.active !== u && !G.active.done && G.active.movedDist > 0) G.active.done = true;   // one Activation at a time
  G.active = u;
  setBusy(true);
  try { await castPower(u, { pw, t, n, part }); } finally { setBusy(false); }
  G.sel = alive(u) && canMove(u) ? u : null;
  updateMission(); renderCard(true); updateHint();
}
// A power Cast and what it does, in the dice tray and the log, for either side: c = { pw, t, n, part }.
async function castPower(u, c) {
  const mine = u.side === 'good', P = powerOf(c.pw.n);
  fxText(u, c.pw.n, mine ? 'good' : 'bad', 0);
  await teach(['magic', 'staffOfPower'], { u });
  tray.begin(`${c.pw.n}: ${u.name}`);
  const hit = (q, d) => (d ? d.ok : (q.dice || []).some(x => x.ok));   // a row of several dice: any of them
  const opt = { ph: 'Move', res: (q, d) => (q.step === 'cast' ? (hit(q, d) ? 'Cast' : 'Fails') : q.step === 'resist' ? (hit(q, d) ? 'Resisted' : 'Not enough') : RES[q.step] && d ? RES[q.step](q, d) : '') };
  const Rc = await play(castSeq(u, c.pw, c.t, c.n), opt);
  const best = d => d.map(x => x.v).join(', ');
  const tgt = c.t && c.t !== u ? ` at ${c.t.name}${c.t.cav && P.part ? ` (the ${c.part === 'mount' ? c.t.mount.n.toLowerCase() : 'rider'})` : ''}` : P.aim === 'enemies' ? ` at every enemy within ${c.pw.rng}″` : '';
  const chan = Rc.dice[0].chan;
  let text = `${u.name} Casts ${c.pw.n}${tgt}, Casting Value ${c.pw.cast}+: ${chan ? 'Heroic Channelling, so one Will Point and the test counts as a 6' : `${pl(Rc.dice.length, 'Will Point')}, ${best(Rc.dice)}`}. `;
  if (!Rc.cast) text += 'Not enough: the power fails (the Will is spent).';
  else if (Rc.barahir) text += `Cast, but ${Rc.barahir.name} rolls a 6 for the Ring of Barahir and is not affected.`;
  else if (Rc.resisted) text += `Cast, but ${Rc.by.name} Resists: ${best(Rc.rdice)} against ${Rc.high}+${Rc.back ? `, and regains ${pl(Rc.back, 'Will Point')} for its natural 6s` : ''}.`;
  else text += `Cast${Rc.rdice.length ? `; ${Rc.by.name} tries to Resist with ${best(Rc.rdice)} but needed ${Rc.high}+` : P.aim === 'enemy' || P.aim === 'enemies' ? `; ${(Rc.targets[0] || c.t).name} cannot Resist (no Will)` : ''}.`;
  const dice = [{ l: `Casting ${c.pw.cast}+`, d: Rc.dice.map(d => ({ v: d.v, ok: d.ok })) }, ...(Rc.rdice.length ? [{ l: `Resist ${Rc.high}+`, d: Rc.rdice.map(d => ({ v: d.v, ok: d.ok })) }] : [])];
  if (Rc.ok) {
    const E = await play(effectSeq(u, c.pw, c.t, Rc, c.part), { ph: 'Move', label: q => q.label, side: 'neutral' });
    for (const x of E.slain) { fxDeath(x); sfx.death(x); mountLeft(x); }
    for (const m of E.moved || []) animFrom(m.u, m.from, 450);   // Compel, Call Winds
    if (E.mountSlain && alive(E.mountSlain)) await thrownRiders([E.mountSlain]);
    text += ` ${effectText(u, c, E)}`;
    if (E.hit && E.hit.need) dice.push({ l: `To Wound ${needStr(E.hit.need)}`, d: E.hit.dice.map(d => ({ v: d.v, ok: d.ok })) });
  }
  log({ ph: G.phase === 'fight' ? 'Fight' : 'Move', why: ['magic', ...(chan ? ['heroicChannelling'] : [])], tone: mine === !!Rc.ok ? 'good' : 'bad', dice, text });
  updateMission(); renderCard(true);
  checkpoint(false);
  return Rc;
}
// What a power did, for the log.
const LASTS = {
  'Transfix': t => `${t.name} is Transfixed until the End phase: it cannot Activate, shoot, declare Heroic Actions or use Active abilities, and makes no Strikes if it wins a fight.`,
  'Aura of Command': (t, u) => `While ${u.name} has Will left, it and every friend within 6″ pass their Courage Tests without rolling.`,
  'Aura of Dismay': (t, u) => `While ${u.name} has Will left, enemies within 6″ of it take −1 on their Courage Tests.`,
  'Fog of Disarray': (t, u) => `While ${u.name} has Will left, enemies within 6″ of it take −1 on their Intelligence Tests.`,
  'Fury': (t, u, pw) => `While ${u.name} has Will left, friends with the ${powerArg(pw.n)} keywords within 6″ of it pass their Courage Tests without rolling.`,
  'Terrifying Aura': (t, u) => `While ${u.name} has Will left, it causes Terror.`,
  'Instil Fear': (t, u) => `Until the End phase, enemies within 6″ of ${u.name} are Fearful.`,
  'Bladewrath': t => `In this turn's Fight phase, every Strike of ${t.name} is made at Strength 6.`,
  'Enchant Blades': t => `In this turn's Fight phase, ${t.name} re-rolls its failed To Wound rolls for Strikes.`,
  'Protection of the Valar': t => `Until the End phase, enemy Magical Powers cannot target ${t.name}, and shots at it take −1 To Hit.`,
  'Fortify Spirit': (t, u) => `While ${u.name} has Will left, ${t.name} rolls a free extra dice on every Resist Test.`,
  'Blinding Light': (t, u) => `Until the End phase, enemy shots at models within 6″ of ${u.name} only hit on a 6.`,
};
function effectText(u, c, E) {
  const k = powerKey(c.pw.n), parts = [];
  if (LASTS[k]) parts.push(LASTS[k](c.t || u, u, c.pw));
  if (E.hit) parts.push(E.hit.ok ? '' : `The Strength ${powerOf(c.pw.n).hit} hit does not wound ${c.t.name}.`);
  parts.push(...E.notes);
  for (const x of E.wounded) if (alive(x)) parts.push(`${x.name} loses a Wound (${x.w}/${x.maxW} left).`);
  for (const x of E.slain) parts.push(`${x.name} is slain.`);
  return parts.filter(Boolean).join(' ');
}
// The player's Resist Test against an enemy power: how many Will Points to spend.
async function playerResist(q) {
  const u = q.u, most = u.will || 0, chance = n => 1 - ((q.high - 1) / 6) ** (n + q.free);
  if (most < 1) return 0;
  await teach(['resist'], { u });
  const list = Array.from({ length: Math.min(most, 5) + 1 }, (_, n) => ({ label: n ? `${pl(n, 'Will Point')}: ${pct2(chance(n))} to Resist` : q.free ? `No Will, only the ${pl(q.free, 'free dice')}: ${pct2(chance(0))}` : 'Do not Resist', val: n }));
  const r = await askChoice(`Resist ${q.p}?`, `<b>${esc(q.by.name)}</b> Cast ${esc(q.p)} on <b>${esc(u.name)}</b>, with a best dice of ${q.high}. Each Will Point spent rolls a D6; a dice of ${q.high} or more Resists the power. ${q.free ? `It also rolls ${pl(q.free, 'free dice')} (Heroic Resolve, Resistant to Magic, Fortify Spirit). ` : ''}A Hero gets back the Will Point of every natural 6. ${esc(u.name)} has ${pl(most, 'Will Point')}.`, list, 'Do not Resist', 'resist');
  return r || 0;
}
// The player's Compel: where the enemy model goes (a Charge into one of the player's models, or a move).
async function playerCompel(q) {
  const r = await askChoice(`Compel: where does ${q.t.name} go?`, `<b>${esc(q.u.name)}</b> moves <b>${esc(q.t.name)}</b> up to half its Move Value (${fmt(q.t.mv / 2)}″), even if it moved already. It may be made to Charge one of your models (no Courage Test for Terror), but never to Jump, Climb or Leap. Afterwards it cannot move again this turn.`,
    q.opts.map(o => ({ label: o.kind === 'charge' ? `${o.label} (${fmt(o.cost)}″)` : `Move it ${o.label} (${fmt(o.cost)}″)`, val: o })), 'Let the computer pick');
  return r || aiAnswer(q);
}
// The player picks which of their models Resists a power that hits several of them.
async function playerResister(q) {
  const r = await askChoice(`Who Resists ${q.p}?`, `<b>${esc(q.by.name)}</b> Cast ${esc(q.p)} on every model of yours within range. One of them may make the Resist Test for all: if it Resists, none is affected.`,
    q.list.map(o => ({ label: `${o.name} (Will ${o.will || 0}${freeDice(o) ? `, ${freeDice(o)} free dice` : ''})`, val: o })), 'Let the computer pick', 'resister');
  return r || aiAnswer(q);
}
// The End phase: Temporary powers end, Enraged Beasts suffer their Wound, Will of Evil (p. 115, 117, 133).
async function endMagic() {
  const E = endPhase();
  for (const u of E.hurt) if (alive(u)) {
    log({ auto: true, ph: 'End', why: ['magic'], tone: u.side === 'good' ? 'bad' : 'good', text: `Enrage Beast ends: ${u.name} loses its +2 and suffers a Wound.` });
    if ((await hurt(u)) === 'slain') { fxDeath(u); sfx.death(u); }
  }
  const lost = E.willOfEvil.filter(u => !E.banished.includes(u));
  if (lost.length) log({ auto: true, ph: 'End', why: ['willOfEvil'], text: `Will of Evil: ${names(lost)} fought this turn and ${lost.length > 1 ? 'give' : 'gives'} up a Will Point.` });
  for (const u of E.banished) { fxDeath(u); log({ auto: true, ph: 'End', why: ['willOfEvil'], tone: u.side === 'good' ? 'bad' : 'good', text: `Will of Evil: ${u.name} gives up its last Will Point and is banished from the battlefield.` }); }
  // Paralyse (p. 118): at the end of the End phase each Paralysed model, then its friends in base contact, roll for a 6.
  const P = await play(paralyseSeq(), { ph: 'End', side: 'neutral' });
  for (const p of P) log({ ph: 'End', why: ['magic'], tone: p.ok === (p.u.side === 'good') ? 'good' : 'bad', dice: [{ l: 'Recover 6', d: p.rolls.map(r => ({ v: r.die.v, ok: r.die.ok })) }],
    text: `${p.u.name} is Paralysed: ${p.rolls.map(r => `${r.by === p.u ? 'it' : r.by.name} rolls ${r.die.v}`).join(', ')}. ${p.ok ? 'A 6: it recovers (still Prone).' : 'It stays Paralysed.'}` });
  if (E.hurt.length || E.banished.length) updateMission();
  renderCard(true);
}

// A rider slain in the saddle: a horse flees; another mount may stay on a Courage Test and fight on (p. 69).
function mountLeft(t) {
  if (!t.cav || !t.mount || t.mount.w <= 0 || t.fled) return;   // a model that fled (Survival Instinct) left with its mount
  const S = separateMount(t), mount = t.mount.n.toLowerCase(), ph = G.phase === 'shoot' ? 'Shoot' : 'Fight';
  if (!S) { log({ auto: true, ph, why: ['loosemount'], text: `Its ${mount} has no rider now and flees the battlefield.` }); return; }
  log({ ph, why: ['loosemount'], tone: S.stays ? (t.side === 'good' ? 'good' : 'bad') : null, dice: [{ l: `Courage ${t.mount.c}+`, d: S.dice.map(v => ({ v })) }],
    text: `Its ${mount} has no rider: Courage Test ${S.dice[0]} + ${S.dice[1]} = ${S.dice[0] + S.dice[1]} against ${t.mount.c}+: ${S.stays ? `it stays and fights on as ${S.u.name}.` : 'it flees the battlefield.'}` });
  if (S.stays) teach(['loosemount'], { u: S.u });
}

// The attacker crosses the Barrier to where the slain defender stood (p. 55).
async function crossOver(B) {
  const m = crossBarrier(B);
  animFrom(m.u, m.from, 320);
  log({ auto: true, ph: 'Fight', why: ['barriers'], tone: m.u.side === 'good' ? 'good' : 'bad', text: `${B.def.name} is slain, so ${m.u.name} crosses the ${B.T.k} and takes its place.` });
  await sleep(350);
}

// A Combat over a Barrier (p. 55): Strikes come before Backing Away, each of the attacker's after an In The Way test
// over the Obstacle (a Hero attacker may spend Might on it); nobody is Trapped. A beaten defender that survives holds its
// ground and the attacker Backs Away instead; a slain defender's place is taken by the attacker.
async function resolveOverBarrier(c, B, D, shield, gs, es, contacts) {
  const { att, def, T } = B, win = D.win, name = T.k, attWon = win === att.side;
  const W = win === 'good' ? goodsOf(c) : evilsOf(c), L = win === 'good' ? evilsOf(c) : goodsOf(c);
  log({ auto: true, ph: 'Fight', why: ['barriers'], text: `${def.name} defends the ${name} against ${att.name}: Strikes come before Backing Away and nobody is Trapped. ${attWon ? `${att.name} won, so each of its Strikes must first pass an In The Way test over the ${name} (4+).` : `${def.name} won, so it strikes as normal.`}` });
  await teach(['barriers'], { c, B });
  if (shield[win]) log({ auto: true, ph: 'Fight', why: ['shielding'], tone: win === 'good' ? 'good' : 'bad', text: `${names(W)} won while Shielding, so ${win === 'good' ? 'your side makes' : 'the enemy makes'} no Strikes.` });
  else {
    const strikers = [...W.filter(w => !w.prone), ...(win === 'good' ? gs : es)];
    for (const w of strikers) {
      const n = W.includes(w) ? w.a + challengeBonus(w, L) : 1;
      for (let i = 0; i < n; i++) {
        const t = L.find(alive); if (!t) break;
        if (attWon) {
          const r = await play(d6Test(w, 4, { step: 'itw', label: `In The Way: the ${name} 4+ (${w.name}'s Strike)`, ctx: { ob: { kind: 'terrain', name } } }), { ph: 'Fight', res: (q, d) => (d.ok ? 'Carries on' : `Stopped by the ${name}`) });
          log({ ph: 'Fight', why: ['barriers', 'itw'], text: `${w.name}'s Strike over the ${name}: In The Way ${r.v}. ${r.ok ? 'It carries on.' : `The ${name} takes the blow: no To Wound roll.`}`, dice: [{ l: 'In The Way 4+', d: [{ v: r.v, ok: r.ok }] }] });
          if (!r.ok) continue;
        }
        await strike(w, t, 1, new Set());
      }
    }
  }
  await venom(c);
  await thrownRiders(c);
  if (mayCross(B, win)) { await crossOver(B); return; }
  const { moves, held } = barrierBackAway(B, win, contacts);
  for (const m of moves) animFrom(m.u, m.from, 260);
  if (!alive(att) || !alive(def)) return;
  if (held) log({ auto: true, ph: 'Fight', why: ['barriers'], text: `${def.name} lost but survived: a defender does not Back Away from its ${name}. ${att.name} Backs Away instead${moves.length ? '' : ', but has nowhere to go and stays where it is (not Trapped)'}.` });
  else log({ auto: true, ph: 'Fight', why: ['backaway'], text: moves.length ? `${att.name} Backs Away 1″ from the ${name}.` : `${att.name} has nowhere to Back Away, but a model fighting over a Barrier is never Trapped: it stays where it is.` });
}

// Might on the Duel Roll (p. 77): the player clicks a dice of one of their Heroes in the tray (one point per click) or
// keeps the dice. Returns { u, die } or null. With AI plays for you the app decides as the enemy does.
async function playerMight(c, D, heroes, row) {
  const u = heroes[0], plan = mightPlanDuel(D, u);
  G.might = { c, D, u, plan, heroes }; G.mode = 'might'; G.step = 'good'; updateHint();
  await teach(['might'], { c, D, u, plan });
  coach('reroll');
  tray.pickFrom(row);
  let pick = null;
  for (;;) {
    const r = await waitAuto('might', () => (autoPlay() ? aiAnswer({ k: 'duelMight', side: 'good', D, heroes }) || 'keep' : undefined), 'Keep the dice');
    if (!r || r === 'keep' || r === 'first') break;
    if (r.u && r.die) { pick = r; break; }   // the computer's answer (AI plays for you)
    if (!r.u || !heroes.includes(r.u) || r.v >= 6) { G.flash = { msg: !r.u || !heroes.includes(r.u) ? `Only the dice of ${names(heroes)} can be raised with Might.` : 'A dice can never be raised above 6.', rule: 'might' }; updateHint(); continue; }
    pick = { u: r.u, die: r }; break;
  }
  tray.pickFrom(null);
  G.might = null; G.mode = null; G.step = null; G.flash = null; updateHint();
  return pick;
}
// A Wound to a model: a Hero with Fate may try to prevent it first (p. 88). Returns woundPart's answer, or 'saved'.
async function hurt(t, part = 'rider') {
  const H = await play(hurtSeq(t, part), { ph: G.phase === 'shoot' ? 'Shoot' : G.phase === 'fight' ? 'Fight' : 'Move' });
  if (H.F && H.F.rolls.length) {
    const rolls = H.F.rolls, saved = H.r === 'saved';
    log({ ph: G.phase === 'shoot' ? 'Shoot' : 'Fight', why: ['fate'], tone: saved ? (t.side === 'good' ? 'good' : 'bad') : null, dice: [{ l: 'Fate 4+', d: rolls.map(f => ({ v: f.v, ok: f.ok, mod: f.mt })) }],
      text: `${t.name} spends ${pl(rolls.length, 'Fate Point')}: ${rolls.map(f => f.v + (f.mt ? ` (${f.v - f.mt} + ${f.mt} Might)` : '')).join(', ')}. ${saved ? 'The Wound is prevented.' : 'The Wound stands.'}` });
    if (saved) { fxText(t, 'Fate', 'muted', 280); renderCard(true); }
  }
  if (H.T) {   // Survival Instinct (p. 131): a Courage Test after the Wound, flee on a failure
    const T = H.T, mine = t.side === 'good';
    log({ ph: G.phase === 'shoot' ? 'Shoot' : G.phase === 'fight' ? 'Fight' : 'Move', why: ['courage', 'survivalInstinct'], tone: T.ok === mine ? 'good' : 'bad', dice: [{ l: `Courage ${T.need}+`, d: T.dice.map(v => ({ v })) }],
      text: `${t.name} has Survival Instinct, so after the Wound it takes a Courage Test: ${T.dice[0]} + ${T.dice[1]} = ${T.dice[0] + T.dice[1]} against ${T.need}+${courageMods(T)}.${T.will || T.might ? ` It spends ${[T.will && pl(T.will, 'Will Point'), T.might && pl(T.might, 'Might Point')].filter(Boolean).join(' and ')}: ${T.total}.` : ''} ${T.ok ? 'It stays.' : 'It fails: it flees and is removed as a casualty.'}` });
    if (!T.ok) { fxText(t, 'flees', 'bad', 280); updateMission(); }
  }
  if (isWarBeast(t) && alive(t) && H.r === 'wound') await stampedeAct(t);   // each Wound: a Courage Test, or it Stampedes
  if (isWarBeast(t) && H.r === 'slain') {   // its Commander falls (Falling Damage), or dies with it (Plenty of Orcs)
    const f = cmdFalls(t);
    if (f) log({ auto: true, ph: PH_OF(), why: ['warBeast'], text: f.u ? `${f.name} falls from the slain ${t.name}: ${pl(f.wounds, 'wound')}${f.died ? ', and is slain' : ', and lies Prone beside it'}.` : `${f.name} dies with the ${t.name}.` });
  }
  return H.r;
}
const PH_OF = () => (G.phase === 'shoot' ? 'Shoot' : G.phase === 'fight' ? 'Fight' : G.phase === 'end' ? 'End' : 'Move');
// The Courage Test a War Beast takes after a Wound (beasts.js: stampedeSeq).
async function stampedeAct(u) {
  const S = await play(stampedeSeq(u), { ph: PH_OF(), notes: [] });
  log({ ph: PH_OF(), why: ['warBeast', 'courage'], tone: S.ok === (u.side === 'good') ? 'good' : 'bad', dice: [{ l: `Courage ${S.need}+`, d: S.dice.map(v => ({ v })) }],
    text: `${u.name} ${ridden(u) ? `(${u.cmd.name}'s Courage ${S.need}+)` : `(nobody rides it: its own Courage ${S.need}+)`}: ${S.dice[0]} + ${S.dice[1]}${u.T.warBeast.foul ? ' − 1' : ''}${S.will ? `, ${S.will} Will` : ''}. ${S.ok ? 'It keeps its nerve.' : 'It will Stampede at the start of its next Activation.'}` });
}
// A side's War Beasts at the start of its Activations (as sim.js: beastStart).
async function beastStarts(side) {
  for (const u of sideAlive(side).filter(isWarBeast)) {
    if (!alive(u) || u.done) continue;
    if (!ridden(u) && !u.stampede) await stampedeAct(u);
    if (u.stampede) {
      u.stampede = false; G.sel = u;
      log({ ph: 'Move', why: ['warBeast'], tone: side === 'good' ? 'bad' : 'good', text: `${u.name} Stampedes: ${side === 'good' ? 'the enemy turns' : 'you turn'} it to face any way, and it Tramples its full Move.` });
      const out = await rampAct(u, aiStampede(u));
      if (out && out.off) { u.dead = true; if (u.cmd) u.cmd.w = 0; fxDeath(u); log({ ph: 'Move', why: ['warBeast'], tone: side === 'good' ? 'bad' : 'good', text: `${u.name} Stampedes off the table and is lost, with everyone riding it.` }); }
      u.done = true; u.shot = true; G.sel = null; updateMission(); checkpoint(false);
      continue;
    }
    const by = chargedBy(u);
    if (!by) continue;
    G.sel = u;
    const notes = [];
    for (const t of by) { const list = await play(impactSeq(u, t), { ph: 'Move', notes: [] }); notes.push(`${t.name}: ${impactNote(u, list)} ${await hitsAct(list)}`); }
    log({ auto: true, ph: 'Move', why: ['warBeast'], text: `${u.name} was Charged by models of no greater combined Strength than its own, so it Tramples them first. ${notes.join(' ')}` });
    if (!engaged(u)) await rampAct(u, aiRamp(u)); else u.done = true;
    G.sel = null; updateMission(); checkpoint(false);
  }
}
// A friendly banner lets the player re-roll one of their dice: they click it in the dice tray, or keep the dice.
// Returns the dice to re-roll, or null.
// With Auto roll (or AI plays for you) the app re-rolls the best dice to re-roll, as the enemy does.
async function playerReroll(c, D, row, opt) {
  G.reroll = { c, D }; G.mode = 'reroll'; G.step = 'good'; updateHint();
  await teach(['banner', 'reroll'], { c, D });
  if (!autoRoll()) coach('reroll');
  tray.pickFrom(row);
  const r = await waitAuto('reroll', () => (autoRoll() ? rerollPick(D.g) : undefined), 'Keep the dice');
  tray.pickFrom(null);
  G.reroll = null; G.mode = null; G.step = null; updateHint();
  const d = r && r.u ? r : null;
  if (!d && opt && opt.notes) opt.notes.push('You keep your dice.');
  return d;
}

// The player Backs Away their own losers one by one by clicking a marked spot. A spot that needs a friend to Make Way
// shows where that friend steps. With a single spot there is nothing to choose. Moves are animated here (done: true).
async function playerBackAway(W, L, contacts) {
  const moves = [], trapped = new Set(), madeWay = [], falls = [];
  for (const l of L) {
    const opts = backAwayOptions(l, W, contacts);
    if (!opts.length) { trapped.add(l.id); continue; }
    if (opts[0].fall != null) { falls.push({ u: l, to: { x: opts[0].x, y: opts[0].y }, f: opts[0].fall }); continue; }   // only over the edge
    // Auto Make Way: the player picks among the free spots; when only a friend's Make Way would make room, the app
    // takes the most direct of those spots itself.
    const free = opts.filter(o => !o.makeWay), pool = prefs.autoWay && free.length ? free : opts;
    const P = pool.length === 1 || (prefs.autoWay && !free.length) ? pool[0] : await pickBackAway(l, pool);
    if (P.makeWay) {
      const m = P.makeWay;
      moves.push({ u: m.u, from: { x: m.u.x, y: m.u.y }, done: true }); m.u.x = m.x; m.u.y = m.y;
      animFrom(m.u, moves[moves.length - 1].from, 260);
      madeWay.push({ u: m.u, for: l });
    }
    moves.push({ u: l, from: { x: l.x, y: l.y }, done: true }); l.x = P.x; l.y = P.y;
    animFrom(l, moves[moves.length - 1].from, 260);
  }
  return { moves, trapped, madeWay, falls };
}
async function pickBackAway(l, opts) {
  G.backAway = { l, opts }; G.mode = 'backaway'; G.step = 'good'; G.preview = null; updateHint();
  await teach(['backaway', 'makeway']);
  coach('backaway');
  // Switched on meanwhile, Auto Back Away (or AI plays for you) takes the most direct spot.
  const P = await waitAuto('backaway', () => (prefs.autoBack || autoPlay() ? opts[0] : undefined), `Click where ${l.name} Backs Away`, { off: true });
  G.backAway = null; G.mode = null; G.step = null; updateHint();
  return P;
}

async function pickStrike(w, cands, trapped, which) {
  G.strike = { w, cands, trapped }; G.mode = 'strike'; G.step = 'good'; updateHint();
  await teach(['pickstrike']);
  coach('strike');
  const t = await waitAuto('strike', () => (autoPlay() ? bestStrikeTarget(w, cands, trapped) : undefined), `Click the model ${w.name} strikes${which}`, { off: true });
  G.strike = null; G.mode = null; G.step = null; G.preview = null; updateHint();
  return t;
}

// Which part of a Cavalry model the player's Strike goes at: the rider or the mount (p. 71).
async function pickPart(w, t) {
  const mount = t.mount.n.toLowerCase();
  G.mode = 'part'; G.step = 'good'; G.strike = { w, cands: [t], trapped: new Set(), part: true }; updateHint();
  await teach(['cavalry'], { t });
  const r = await waitAuto('part', () => (autoPlay() ? bestPart(w, t) : undefined), `Strike the rider (Defence ${t.d})`, { second: `Strike the ${mount} (Defence ${t.mount.d})` });
  G.strike = null; G.mode = null; G.step = null; updateHint();
  return r === 'second' ? 'mount' : r === 'first' ? 'rider' : r;
}
// n Strikes by w at t (combat.js: strikeSeq): the To Wound rolls in the tray (a Hero's one by one, with Might), then the
// Wounds, each after the target's Fate.
async function strike(w, t, n, trapped) {
  const part = t.cav && t.mount.w > 0 ? (w.side === 'good' && knows('cavalry', G.mi) && !autoPlay() ? await pickPart(w, t) : bestPart(w, t)) : 'rider';
  const tr = trapped.has(t.id) || !!t.prone, blades = part === 'mount' ? null : bladesD(w, t);
  const atMount = part === 'mount', mount = atMount ? t.mount.n.toLowerCase() : '', d = atMount ? t.mount.d : blades != null ? blades : defOf(t);
  const who = atMount ? `${t.name}'s ${mount}` : t.name;
  const S = strikeS(w), need = woundNeed(S, d), bonus = woundBonus(w, t, tr), rr = woundReroll(w, t), dbl = tr ? (trapped.has(t.id) ? 'Trapped' : 'Prone') : '';
  const sNote = S !== w.s ? `Strength ${S} (Heroic Strength)` : `Strength ${w.s}`;
  if (!need) { log({ auto: true, ph: 'Fight', text: `${w.name} cannot wound ${who} (${sNote} vs Defence ${d}).`, why: ['wound'] }); return; }
  hlChart(Math.min(10, S), d);
  // Special rules (p. 122–133): the bonuses and re-rolls, named as on the profile.
  const hate = against(w, 'Hatred', t), stab = tr && rule(w, 'Backstabbers') != null, chal = challenging(w, t);
  const rrName = rr === 'fails' ? (rule(w, 'Bane of Kings') != null ? 'Bane of Kings' : 'Venom') : rr ? (rule(w, 'Poisoned Attacks') != null ? 'Poisoned Attacks' : 'Ancient Enemies') : '';
  const plusText = [twoH(w) && '+1 for the two-handed weapon', chal && '+1 Heroic Challenge', hate && '+1 Hatred', stab && '+1 Backstabbers',
    rr && `${rrName}: re-roll ${rr === 'fails' ? 'failed rolls' : '1s'}`, !atMount && blades == null && t.swall && 'Defence +1 for Shieldwall', blades != null && `Blades of the Dead: Defence ${blades} (10 − Courage)`].filter(Boolean).join(', ');
  const nat6 = !atMount && t.def6;
  // The target is left out when the tray title already names it as the only model on its side.
  const foe = (tray.title || '').replace(/^Duel Roll: /, '').split(' vs ').includes(who);
  const label = `${w.name}${foe ? '' : ` strikes ${who}`}: To Wound ${needStr(need)}${plusText ? `, ${plusText}` : ''}${nat6 ? ', Heroic Defence: natural 6s only' : ''}${dbl ? `, ${dbl} so 2 rolls` : ''}`;
  const one = { n: 0 };
  const R = await play(strikeSeq(w, t, n, tr, part), { ph: 'Fight', label: q => { if (q.step === 'wound') one.n++; return label; } });
  if (one.n) tray.note(R.wounds ? pl(R.wounds, 'wound') : 'No wounds', R.wounds ? (w.side === 'good' ? 'good' : 'bad') : null);   // a Hero's rolls came one by one
  let died = false, mountSlain = false, savedN = 0, regained = false, lostN = 0;
  const had = atMount ? t.mount.w : t.w, more = [];
  for (let i = 0; i < R.wounds && alive(t) && !mountSlain; i++) {
    let r = await hurt(t, part);
    if (r === 'saved') { savedN++; continue; }
    lostN++;
    // Mighty Blow, Bane Weapons (p. 122, 127): a Strike Fate did not prevent does more Wounds.
    const X = strikeWounds(w, t);
    const was = lostN;
    for (let k = X.n - 1; k > 0 && r !== 'slain' && r !== 'mountSlain'; k--) { r = woundPart(t, part); lostN++; }
    if (lostN > was || X.d3) more.push(X.d3 ? `Bane Weapon D3: ${X.d3}` : 'Mighty Blow');
    if (!atMount && r !== 'slain') venomMark(w, t);
    if (r === 'slain') { died = true; fxDeath(t); fxText(t, 'slain', 'bad', 280); sfx.death(t); regained = challengeSlain(w, t) || hunterSlain(w, t); N.slain(w, t); mountLeft(t); }
    else if (r === 'mountSlain') { mountSlain = true; fxText(t, `${mount} slain`, 'bad', 280); sfx.wound(t); }
    else { fxText(t, '−1 Wound', 'bad', 280); sfx.wound(t); }
  }
  if (!R.wounds) { fxText(t, 'no wound', 'muted', 0); sfx.armour(); }
  const lost = Math.max(0, lostN - had), moreText = more.length ? ` Each Strike that got through did more Wounds (${more.join(', ')}).` : '';
  const res = !R.wounds ? 'No wounds.' : savedN === R.wounds ? `${t.name} prevents ${savedN > 1 ? 'every Wound' : 'the Wound'} with Fate.` : died ? `${t.name} is slain.${lost ? ` It had only ${pl(had, 'Wound')}, so ${lost > 1 ? `${lost} wounds are` : 'the extra wound is'} lost: Strikes only hurt the model they are aimed at.` : ''}${regained ? ` ${w.name} slew its Heroic Challenge opponent and gains 1 Might Point.` : ''}`
    : mountSlain ? `The ${mount} is slain: the rider takes a Thrown Rider Test once the Strikes are over.` : `${who} loses ${pl(Math.min(lostN, had), 'Wound')}${savedN ? ` (${savedN} prevented with Fate)` : ''}.`;
  log({ ph: 'Fight', text: `${w.name} strikes ${who}: ${pl(n, 'Strike')}${dbl ? `, doubled for ${dbl}` : ''}, so ${pl(R.rollsN, 'To Wound roll')} on ${needStr(need)} (${sNote} vs Defence ${d}${plusText ? `, ${plusText}` : ''}${nat6 ? '; Heroic Defence: only natural 6s wound' : ''}). ${res}${moreText}`,
    dice: [{ l: `Strikes ${needStr(need)}${bonus ? ` +${bonus}` : ''}`, d: R.rolls }], why: [...(tr ? ['strikes', trapped.has(t.id) ? 'trapped' : 'prone', 'wound'] : ['strikes', 'wound']), twoH(w) && 'twohanded', atMount && 'cavalry', S !== w.s && 'heroicStrength', nat6 && 'heroicDefence', chal && 'heroicChallenge', hate && 'hatred', stab && 'backstabbers',
      rr && specialKey(rrName), blades != null && 'bladesOfTheDead', more.includes('Mighty Blow') && 'mightyBlow', more.some(m => m.startsWith('Bane')) && 'baneWeapons'].filter(Boolean),
    tone: R.wounds ? (t.side === 'evil' ? 'good' : 'bad') : null });
}

/* ---------- Enemy turn (and the player's, with AI plays for you) ---------- */
// The computer Activates the side's models (only: just these, as for a Heroic Move or With Me): a Courage Test first in
// a Broken army, a Hero on a Heroic March shouts At the Double as it Activates, then the move the planner picks.
async function aiMove(side, only) {
  const movers = (only || sideAlive(side)).filter(canMove), mine = side === 'good';
  if (!movers.length) return;
  if (!only && movers.every(u => u.ai === 'sentry' || u.ai === 'hold')) { log({ ph: 'Move', text: `${names(movers)} ${movers.length > 1 ? 'stand their' : 'stands its'} ground.` }); await sleep(300); return; }
  const walked = [];
  const pace = movers.length > 8 ? 0.4 : 1;   // a big army (matched play) moves quicker, model by model
  for (const u of aiMoveOrder(movers)) {
    if (!canMove(u)) continue;
    if (declared(u, 'march') && !u.shouted && !u.shoutAsked) {   // At the Double is shouted as the Hero Activates
      if (needsCourage(u) && !(await courageAct(u))) continue;
      u.shoutAsked = true;
      if (u.drum || aiShout(u, 'march')) logShout(u, 'march', shout(u, 'march'));
    }
    if (ringbearer(u) && !u.sauron) {   // the One Ring: Sauron's Will first, then on or off
      if (u.ringOn && u.sauronAt !== G.turn) await sauronAct(u, false);
      const a = u.sauron ? null : aiRing(u);
      if (a === 'on') { if (needsCourage(u) && !(await courageAct(u))) continue; await ringOnAct(u); if (!alive(u) || !canMove(u)) { u.done = true; continue; } }
      else if (a === 'off') await ringOffAct(u);
    }
    if (needsSwim(u) && !(await swimAct(u))) continue;   // Deep Water: a Swim Test first
    const cast = castable(u).length && G.phase === 'move' ? aiCast(u) : null;   // a Magical Power as it Activates
    if (cast) {
      if (needsCourage(u) && !(await courageAct(u))) continue;
      G.sel = u; await sleep(160 * pace);
      await castPower(u, cast);
      G.sel = null;
      if (!alive(u) || !canMove(u)) { u.done = true; continue; }
    }
    if (rams(u)) {   // a Chariot Charge or a Trample
      if (needsCourage(u) && !(await courageAct(u))) continue;
      G.sel = u; await sleep(200 * pace);
      await rampAct(u, aiRamp(u));
      G.sel = null; updateMission(); renderCard(true); checkpoint(false);
      continue;
    }
    const Lp = pushable(u);   // a defender at the top of an enemy Siege Ladder pushes it down
    if (Lp) { if (needsCourage(u) && !(await courageAct(u))) continue; G.sel = u; await pushAct(u, Lp); G.sel = null; checkpoint(false); continue; }
    let act = aiPlanMove(u);
    if (!act) { if (u.shouted || only) u.done = true; continue; }
    if (needsCourage(u) && !(await courageAct(u))) continue;
    if (act.cross) {   // a Jump, Leap or Climb Test on the way (ai.js: crossPlan; as sim.js: crossMove)
      G.sel = u; await sleep(160 * pace);
      await doCross(u, act.cross);
      G.sel = null; updateMission(); checkpoint(false);
      act = alive(u) && canMove(u) ? aiPlanMove(u) : null;   // a 6: it may carry on moving
      if (!act || act.cross) { u.done = true; continue; }
    }
    if (act.charge && !(await chargeNerveAct(u, act.charge))) continue;
    if (act.charge) {
      const rest = await throwOnCharge(u, act.charge, act.p);
      if (rest) { act.p = rest; act.cost = rest.cost; }
      if (rest == null) { const again = canMove(u) && aiPlanMove(u); if (again && !again.charge) { doMove(u, again.p, again.cost); } u.done = true; G.sel = null; updateMission(); checkpoint(false); continue; }
    }
    G.sel = u; await sleep(160 * pace);
    doMove(u, act.p, act.cost);
    u.done = true;
    if (act.stand) { log({ ph: 'Move', text: `${u.name} Stands Up.`, why: ['prone'] }); await sleep(300 * pace); G.sel = null; continue; }
    if (act.charge) {
      sfx.horn(alignOf(side));
      log({ ph: G.phase === 'fight' ? 'Fight' : 'Move', text: `${u.name} charges ${act.charge.name}${act.p.over ? ` over the ${act.p.over.T.k} it defends: it stops against the ${act.p.over.T.k}, as close to the defender as it can` : ''} (${fmt(act.cost)}″). Both models are now Engaged in Combat.`, why: act.p.over ? ['charge', 'barriers'] : ['charge'], tone: mine ? 'good' : 'bad' });
    } else walked.push(`${u.name} ${fmt(act.cost)}″`);
    await sleep(420 * pace);
    G.sel = null;
    if (u.ai === 'runner' && u.x >= G.m.escapeX) { u.gone = true; log({ ph: 'Move', text: `${u.name} escapes from the battlefield.`, tone: 'bad' }); }
    updateMission();
    checkpoint(false);
  }
  if (walked.length) log({ ph: G.phase === 'fight' ? 'Fight' : 'Move', text: `${mine ? 'The app moves your models' : 'The enemy moves'}: ${walked.join(', ')}.` });
}

async function aiShoot(side, only) {
  for (const s of (only || sideAlive(side)).filter(u => u.bow && !u.shot && alive(u))) while (alive(s) && !s.shot) {   // a sling may shoot twice
    const best = aiPickShot(s);
    if (!best) break;
    G.sel = s; G.aimAt = best.t; await sleep(420);
    if (best.i.tEng) await teach(['shootFight'], { s, t: best.t });
    await doShoot(s, best.t, best.i);
    G.aimAt = null; G.sel = null;
    updateMission(); renderCard(true);
    await sleep(520);
    checkpoint(false);
  }
}
