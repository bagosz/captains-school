// Hero check: the order of the hero rules, step by step, with loaded dice, then many sandbox battles with the computer
// playing both sides and every Heroic Action in play. Each check follows the Rules Manual 2024 (pages in the names).
// Usage: node tools/hero-check.mjs [battles]   e.g. node tools/hero-check.mjs 200
globalThis.matchMedia = () => ({ matches: false });
process.removeAllListeners('warning');

const st = await import('../js/state.js');
const R = await import('../js/engine/rules.js');
const C = await import('../js/engine/combat.js');
const H = await import('../js/engine/heroes.js');
const S = await import('../js/engine/sim.js');
const D6 = await import('../js/engine/dice.js');
const SP = await import('../js/engine/special.js');
const TR = await import('../js/engine/terrain.js');
const ST = await import('../js/engine/setup.js');
const { SANDBOX } = await import('../js/data/missions.js');
const { aiAnswer } = await import('../js/engine/ai.js');
const MG = await import('../js/engine/magic.js');
const MO = await import('../js/engine/monsters.js');
const ADV = await import('../js/engine/advanced.js');
const SG = await import('../js/engine/siege.js');
const BE = await import('../js/engine/beasts.js');
const FO = await import('../js/engine/fortress.js');
const SC = await import('../js/engine/scenarios.js');
const { ARMY_TYPES } = await import('../js/data/army-lists.js');
const G = () => st.G;

/* ---------- Loaded dice ---------- */
// load(5, 3, ...): the next d6() calls roll these values; afterwards the dice are random again.
const realRandom = Math.random;
let queue = [];
Math.random = () => (queue.length ? (queue.shift() - 0.5) / 6 : realRandom());
const load = (...v) => { queue = v; };
// Drives a procedure, answering from a script (an array of answers, used in order, for the questions asked), and
// records what it yielded: 'dice:hit 2', 'might:hit', 'raise:hit 2→3', ...
function drive(gen, script = []) {
  const log = [];
  let r = gen.next();
  while (!r.done) {
    const q = r.value;
    const tag = q.k === 'dice' ? `dice:${q.step} ${q.die ? q.die.v : q.dice ? q.dice.map(d => d.v).join(',') : q.T ? q.T.total : ''}`
      : q.k === 'raise' ? `raise:${q.step} ${q.from}→${q.die.v}` : q.k === 'reroll' ? `reroll:${q.step} ${q.was}→${q.die.v}`
        : q.k === 'declare' || q.k === 'duelReroll' || q.k === 'duelMight' ? `${q.k}:${q.side}` : q.k === 'declared' ? `declared:${q.side} ${q.a}` : `${q.k}${q.step ? ':' + q.step : ''}`;
    log.push(tag);
    const asks = ['might', 'fate', 'courage', 'intelligence', 'declare', 'challenge', 'duelReroll', 'duelMight', 'resist', 'resister', 'scatter'].includes(q.k);
    r = gen.next(asks ? (script.length ? (typeof script[0] === 'function' ? script.shift()(q) : script.shift()) : aiAnswer(q)) : undefined);
  }
  return { log, value: r.value };
}
// A small table with the given models: [{ t, side, x, y }].
function table(units, opt = {}) {
  S.startGame({ board: [24, 18], terrain: opt.terrain || [], units, check: () => null, status: () => '', priority: opt.priority || 'good' }, { heroics: H.HEROIC_KEYS, broken: true, shielding: true, standFast: true });
  G().priority = opt.priority || 'good';
  G().standFast = { good: [], evil: [] };
  G().units.forEach(u => { u.decl = {}; });
  return G().units;
}

let failed = 0, passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
  queue = [];
}
const eq = (a, b, what) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${what || 'value'}: got ${x}, expected ${y}`); };
const truthy = (v, what) => { if (!v) throw new Error(`${what} should hold`); };

/* ---------- Declare Heroic Actions (p. 79) ---------- */
check('declarations start with the player without Priority and end when both pass in succession (p. 79)', () => {
  const [hal, cap, wulf, targg] = table([{ t: 'halethPrince', side: 'good', x: 4, y: 4 }, { t: 'captainOfRohan', side: 'good', x: 4, y: 9 }, { t: 'wulf', side: 'evil', x: 20, y: 4 }, { t: 'generalTargg', side: 'evil', x: 20, y: 9 }]);
  const pick = (u, k) => q => q.options.find(o => o.u === u && o.k === k);
  // Evil declares, Good passes, Evil declares again, Good now declares (a pass does not end its chances); Evil has no
  // Hero left that could declare, so it passes without being asked, and Good's pass ends the step.
  const { log } = drive(H.declareSeq('move'), [pick(wulf, 'move'), null, pick(targg, 'march'), pick(cap, 'march'), null]);
  eq(log, ['declare:evil', 'declared:evil move', 'declare:good', 'declare:evil', 'declared:evil march', 'declare:good', 'declared:good march', 'declare:good'], 'sequence');
  eq([wulf.might, targg.might, cap.might, hal.might], [2, 1, 1, 3], 'Might left after paying 1 each');
  truthy(cap.mvPlus === 3 && cap.noCharge, 'Heroic March: +3″ and no Charge');
});
check('a Hero declares one Heroic Action per phase, and none with 0 Might (p. 79)', () => {
  const [cap, chief] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'hillTribesChieftain', side: 'evil', x: 20, y: 4 }]);
  H.declare(cap, 'move');
  eq(H.heroOptions(cap, 'move').length, 0, 'options left for the Captain this phase');
  chief.might = 0;
  eq(H.heroOptions(chief, 'move').length, 0, 'options for a Hero without Might');
});
check('the player with Priority rolls a D6 for the order of opposing Heroic Moves: 1–3 Evil first, 4+ Good (p. 80)', () => {
  for (const [roll, first] of [[2, 'evil'], [5, 'good']]) {
    const [cap, chief, cap2] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'hillTribesChieftain', side: 'evil', x: 20, y: 4 }, { t: 'captainOfRohan', side: 'good', x: 4, y: 9 }]);
    H.declare(cap, 'move'); H.declare(chief, 'move'); H.declare(cap2, 'move');
    load(roll);
    const Q = H.heroicQueue('move');
    eq(Q.roll, roll, 'the D6');
    const order = [];
    for (let s; (s = Q.next()); ) { const u = Q.left(s)[0]; order.push(u.side); Q.done(u); }
    eq(order, first === 'evil' ? ['evil', 'good', 'good'] : ['good', 'evil', 'good'], `order after a ${roll}`);
  }
});
check('a Heroic Challenge needs an enemy Hero within 6″ of the same Heroic Tier or higher (p. 85)', () => {
  const [hal, chief, wulf] = table([{ t: 'halethPrince', side: 'good', x: 10, y: 9 }, { t: 'hillTribesChieftain', side: 'evil', x: 13, y: 9 }, { t: 'wulf', side: 'evil', x: 14, y: 11 }]);
  eq(H.challengeTargets(hal).map(u => u.name), ['Wulf'], 'targets of Haleth (Valour): not the Chieftain (Fortitude)');
  eq(H.challengeTargets(chief).map(u => u.name), ['Haleth'], 'targets of the Chieftain');
});

/* ---------- Duel Roll (p. 50, 77) ---------- */
check('Duel Roll: modifiers, then the losing side\'s re-roll, then Might, the losing Hero bidding first (p. 50, 77)', () => {
  const [cap, chief] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'hillTribesChieftain', side: 'evil', x: 11.02, y: 9 }]);
  load(2, 3, 5, 1, 4);   // Captain 2, 3; Chieftain 5, 1; the re-roll 4
  const D = C.rollDuelDice([cap], [chief]);
  const { log, value } = drive(C.duelSeq(D, { good: true }), [q => q.D.g.find(d => d.v === 2), q => ({ u: cap, die: q.D.g.find(d => d.v === 4) }), q => ({ u: cap, die: q.D.g.find(d => d.v === 5) })]);
  eq(log, ['duelReroll:good', 'reroll:duel 2→4', 'duelMight:good', 'raise:duel 4→5', 'duelMight:good', 'raise:duel 5→6'], 'sequence');
  eq([value.win, cap.might], ['good', 0], 'winner and Might left');
});
check('Might bidding goes back and forth (example 59, p. 77)', () => {
  // Gothmog (FV 5, 3 Might) rolls 1, 3; Éomer (FV 6, 3 Might) rolls 2, 3, 4. Played here by Wulf-like profiles.
  const [eo, go] = table([{ t: 'wulf', side: 'good', x: 10, y: 9 }, { t: 'wulf', side: 'evil', x: 11.02, y: 9 }]);
  eo.f = 6; go.f = 5; eo.might = 3; go.might = 3;
  load(2, 3, 4, 1, 3, 6);   // Éomer 2, 3, 4; Gothmog 1, 3 (and a 6 for its third dice, set aside below)
  const D = C.rollDuelDice([eo], [go]);
  D.e.pop();   // Gothmog has 2 Attacks in the example
  const { log, value } = drive(C.duelSeq(D, {}));
  eq(log.filter(x => x.startsWith('raise')), ['raise:duel 3→4', 'raise:duel 4→5', 'raise:duel 4→5', 'raise:duel 5→6', 'raise:duel 5→6'], 'the bids: Gothmog 3→5, Éomer 4→5, Gothmog 5→6, Éomer 5→6');
  eq([value.win, eo.might, go.might], ['good', 1, 0], 'Éomer wins on Fight Value');
});

/* ---------- To Wound, Heroic Defence, Fate (p. 45, 77–78, 86, 88) ---------- */
check('To Wound 6+/4+: Might on the first dice carries over to the second (p. 78)', () => {
  const [cap, t] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 12, y: 9 }]);
  t.d = 9;   // Strength 4 against Defence 9: 6+/4+
  load(5, 3);
  const { log, value } = drive(D6.woundRoll(cap, t, { s: 4 }), [1]);
  eq(log, ['dice:wound 5', 'might:wound', 'raise:wound 5→6', 'dice:wound 3'], 'sequence');
  eq([value.ok, value.dice[1].mod, cap.might], [true, 1, 1], 'the 3 counts as a 4, one point spent');
});
check('Heroic Defence: only a natural 6 wounds, whatever the bonus or Might (p. 86)', () => {
  const [cap, chief] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'hillTribesChieftain', side: 'evil', x: 11.02, y: 9 }]);
  chief.def6 = true;
  load(5);
  const a = drive(D6.woundRoll(cap, chief, { s: 4, bonus: 1 }));
  eq([a.value.ok, a.log.includes('might:wound')], [false, false], 'a 5 (+1) does not wound, and no Might is offered');
  load(6);
  eq(drive(D6.woundRoll(cap, chief, { s: 4 })).value.ok, true, 'a natural 6 wounds');
});
check('Fate: a 4+ prevents the Wound, and Might may raise a 3 before the next point (p. 88, example 73)', () => {
  const [hama] = table([{ t: 'hamaPrince', side: 'good', x: 10, y: 9 }]);
  load(3);
  const { log, value } = drive(C.hurtSeq(hama), [true, 1]);
  eq(log, ['fate', 'dice:fate 3', 'might:fate', 'raise:fate 3→4'], 'sequence');
  eq([value.r, hama.w, hama.fate, hama.might], ['saved', 2, 1, 1], 'saved: Wounds, Fate and Might left');
});
check('Heroic Strength doubles Strength for Strikes; a Heroic Challenge adds +1 Attack and +1 To Wound (p. 85–86)', () => {
  const [hal, wulf, man] = table([{ t: 'halethPrince', side: 'good', x: 10, y: 9 }, { t: 'wulf', side: 'evil', x: 11.02, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 10, y: 10.02 }]);
  H.declare(wulf, 'strength');
  eq(H.strikeS(wulf), 8, 'Wulf\'s Strength for Strikes');
  H.declare(hal, 'challenge', wulf);
  G().challenges[0].acc = true;
  eq([C.strikesOf(hal, [wulf, man]), C.woundBonus(hal, wulf), C.woundBonus(hal, man), C.strikesOf(wulf, [hal])], [4, 1, 0, 4], 'Strikes and To Wound bonus');
  const D = C.rollDuelDice([hal], [wulf, man]);
  eq([D.g.length, D.e.length], [4, 5], 'Duel Roll dice with the challenge bonus');
  wulf.w = 1; wulf.fate = 0; hal.might = 1;
  C.woundPart(wulf, 'rider');
  truthy(H.challengeSlain(hal, wulf) && hal.might === 2, 'slaying the challenged Hero gives back a Might Point');
});
check('Heroic Strike: the D3 is rolled at the start of the Hero\'s first Combat and raises its Fight Value (p. 86)', () => {
  const [hal, wulf] = table([{ t: 'halethPrince', side: 'good', x: 10, y: 9 }, { t: 'wulf', side: 'evil', x: 11.02, y: 9 }]);
  H.declare(hal, 'strike');
  load(5);
  const { log } = drive(H.combatStartSeq([hal, wulf]));
  eq([log, hal.fvPlus, H.fvOf(hal)], [['dice:heroicStrike 5'], 3, 9], 'a 5 is a D3 of 3: Fight Value 9');
  eq(drive(H.combatStartSeq([hal, wulf])).log.length, 0, 'no second roll in the same phase');
});

/* ---------- Shooting (p. 42–45, 71, 77, 84, 130) ---------- */
check('a shot: To Hit, Might; In The Way, the re-roll of Heroic Accuracy, then Might; To Wound (p. 42, 77, 84)', () => {
  const [hama, man] = table([{ t: 'hamaPrince', side: 'good', x: 4, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 16, y: 9 }], { terrain: [{ k: 'brush', x: 9, y: 7, w: 2, h: 4 }] });
  H.declare(hama, 'accuracy');
  hama.might = 2;
  const info = R.shotInfo(hama, man);
  truthy(info.ok && info.itw.length === 1 && info.reroll, 'one obstruction, and a re-roll for it');
  load(2, 1, 3, 5);   // To Hit 2 (3+ needed), In The Way 1, re-rolled 3, To Wound 5
  const { log, value } = drive(R.shotSeq(hama, man, info), [1, 1]);
  eq(log, ['dice:hit 2', 'might:hit', 'raise:hit 2→3', 'dice:itw 1', 'reroll:itw 1→3', 'might:itw', 'raise:itw 3→4', 'dice:wound 5'], 'sequence');
  eq([value.wound, hama.might], [true, 0], 'wounded, Might spent');
});
check('a friend in base contact, not fighting and no bigger, is not In The Way: the shooter fires over its shoulder (Shooting From Behind Friends)', () => {
  const [hama, cap, man] = table([{ t: 'hamaPrince', side: 'good', x: 4, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 6, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 16, y: 9 }]);
  cap.x = hama.x + hama.r + cap.r;
  const info = R.shotInfo(hama, man);
  eq([info.ok, info.itw.length, info.over], [true, 0, [cap.name]], 'shot allowed, the friend named as shot over');
  cap.x = hama.x + 3;
  eq(R.shotInfo(hama, man).ok, false, 'a step away it is In The Way, and Good models do not shoot past it');
});
check('a Sharpshooter hits the part of a Cavalry model it aimed at, with no test (p. 130)', () => {
  const [hama, wr] = table([{ t: 'hamaPrince', side: 'good', x: 4, y: 9 }, { t: 'isengardWargRider', side: 'evil', x: 16, y: 9 }]);
  const info = R.shotInfo(hama, wr);
  load(6, 6);
  const { log, value } = drive(R.shotSeq(hama, wr, info, 'mount'));
  eq([log.some(x => x.startsWith('dice:cav')), value.part], [false, 'mount'], 'no rider-or-mount test, the mount hit');
});
check('odds with Might: a 3+ shot with 1 Might hits on 2+ (dice.js: chainOdds)', () => {
  eq(+D6.chainOdds([{ need: 3 }], 1).toFixed(4), +(5 / 6).toFixed(4), 'chance');
  eq(+D6.chainOdds([{ need: 4, reroll: true }], 0).toFixed(4), 0.75, 'a 4+ with a re-roll');
});

/* ---------- Courage (p. 60–61, 87) ---------- */
check('Courage: 2D6, then Will and Might one point at a time (p. 87); a passing Hero calls Stand Fast (p. 61)', () => {
  const [cap, man] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 13, y: 9 }]);
  load(2, 2);   // 4 against Courage 6+
  const { log, value } = drive(D6.courageSeq(cap, 'broken'));
  eq([log, value.ok, value.will, value.might], [['dice:courage 4', 'courage', 'courage'], true, 1, 1], 'Will first, then Might');
  H.callStandFast(cap);
  eq(H.autoCourage(man) && H.autoCourage(man).why, 'standFast', 'a Warrior within 6″ that sees the Hero passes');
  eq(H.autoCourage(cap), null, 'the Hero itself is not covered by its own Stand Fast');
});

/* ---------- Whole turns ---------- */
check('Intelligence: 2D6 against Intelligence, a Hero adds Might (not Will), a pass covers the same rule this turn (p. 62, 77)', () => {
  const [cap, man] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 13, y: 9 }]);
  cap.might = 2; cap.will = 3; cap.T = { ...cap.T, i: 7 };
  load(3, 3);   // 6 against Intelligence 7+
  const { log, value } = drive(D6.intelligenceSeq(cap, 'test'), ['might']);
  eq([value.ok, value.might, cap.might, cap.will], [true, 1, 1, 3], 'one Might Point: 7, Will untouched');
  load(6, 6);
  eq(S.intelligence(man, 'relic'), true, 'a Warrior passes on 12');
  eq(S.intelligence(man, 'relic'), true, 'and passes again for the same rule without rolling');
  load(1, 1); eq(S.intelligence(man, 'other'), false, 'another rule: a new test');
});
check('Berserker Blade two-handed: one Strike at every enemy in contact when they outnumber its Strikes', () => {
  const [b, e1, e2, e3] = table([{ t: 'warriorOfRohan', side: 'evil', x: 12, y: 9 }, { t: 'hillTribesman', side: 'good', x: 13.02, y: 9 }, { t: 'hillTribesman', side: 'good', x: 10.98, y: 9 }, { t: 'hillTribesman', side: 'good', x: 12, y: 10.02 }]);
  b.T = { ...b.T, gear: ['Berserker Blade'] }; b.a = 2;
  b.wpn = 'two';
  eq(C.sweepTargets(b, [e1, e2, e3]).length, 3, 'three enemies, two Attacks: sweep');
  b.wpn = 'hand';
  eq(C.sweepTargets(b, [e1, e2, e3]), null, 'not with one hand');
});
check('Doorways: a model in a narrow doorway defends it like a Barrier, one charger from each side (p. 57)', () => {
  const terrain = [{ k: 'building', x: 4, y: 9, w: 7.4, h: 0.4 }, { k: 'building', x: 12.6, y: 9, w: 7.4, h: 0.4 }, { k: 'door', x: 11.4, y: 9, w: 1.2, h: 0.4 }];
  const [def, a, b, c] = table([{ t: 'hillTribesman', side: 'evil', x: 12, y: 9.2 }, { t: 'warriorOfRohan', side: 'good', x: 12, y: 5 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 5 }, { t: 'warriorOfRohan', side: 'good', x: 12, y: 13 }], { terrain });
  truthy(R.doorOf(def), 'it stands in the doorway');
  const P = R.chargeSpot(a, def, R.remaining(a));
  truthy(P && P.over, 'the Charge stops in the mouth of the doorway');
  S.applyMove(a, P, P.cost);
  eq(C.barrierOf([def, a]).mode, 'barrier', 'fought as over a Barrier');
  eq(R.chargeSpot(b, def, R.remaining(b)), null, 'no second charger from the same side');
  const Q = R.chargeSpot(c, def, R.remaining(c));
  S.applyMove(c, Q, Q.cost);
  eq(C.barrierOf([def, a, c]).mode, 'bothSides', 'attacked from both sides');
});
check('Ladders: up 3″ with no test, the height paid from the Move; a sheer cliff cannot be Climbed (p. 35)', () => {
  const T = { k: 'plateau', x: 12, y: 2, w: 8, h: 14, z: 3 }, L = { k: 'ladder', x: 11.4, y: 8.5, w: 1.2, h: 1 };
  const [m] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 22, y: 16 }], { terrain: [T, L] });
  const v = R.validateMove(m, { x: 13, y: 9 }, R.remaining(m));
  eq([v.ok, Math.round(v.cost * 10) / 10], [true, 6], '3″ across and 3″ up the ladder');
  G().terrain = [T];
  truthy(!R.validateMove(m, { x: 13, y: 9 }, R.remaining(m)).ok, 'without the ladder it is a Climb');
  T.sheer = true;
  const X = TR.planCross(m, { x: 13, y: 9 });
  eq([X.ok, /sheer/.test(X.why)], [false, true], 'a sheer face: no Climb Test at all');
});
check('Elevated Positions: a defender 1″ up (½ to 1× the charger’s height) fights as over a Barrier; one charger only (p. 57)', () => {
  const T = { k: 'plateau', x: 12, y: 2, w: 8, h: 14, z: 1 };
  const [att, def, two] = table([{ t: 'warriorOfRohan', side: 'good', x: 8, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 12.6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 11 }], { terrain: [T] });
  truthy(R.elevatedFor(att, def) === T, 'the defender holds an Elevated Position');
  const P = R.chargeSpot(att, def, R.remaining(att));
  truthy(P && P.over && P.over.T === T, 'the Charge is made up to it');
  S.applyMove(att, P, P.cost);
  eq([R.engaged(att), C.barrierOf([att, def]) && C.barrierOf([att, def]).mode], [true, 'barrier'], 'in Combat over the edge, as over a Barrier');
  eq(R.chargeSpot(two, def, R.remaining(two)), null, 'a second charger cannot join');
  T.z = 2; att.over = null;
  eq(R.elevatedFor(two, def), null, 'a ledge taller than the charger: no Charge');
});
check('Dismounting at will: the rider goes on foot with the rest of its Move, a horse runs off (p. 69)', () => {
  const [rider] = table([{ t: 'riderOfRohan', side: 'good', x: 8, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 20, y: 9 }]);
  rider.movedDist = 4;
  const n = G().units.length;
  const S = C.dismountAtWill(rider);
  eq([S, rider.cav, rider.mv, R.remaining(rider), G().units.length], [null, false, 6, 2, n], 'on foot, 6 − 4 = 2″ left, the horse gone');
  eq(C.dismountAtWill(rider), false, 'it can never mount or dismount again');
});
check('War drum (X): a free Heroic March for a Warrior, At the Double 12″ to that keyword only (p. 110)', () => {
  const [dr, near, far, other] = table([{ t: 'warriorOfRohan', side: 'good', x: 4, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 12 }, { t: 'warriorOfRohan', side: 'good', x: 14, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 4, y: 5 }]);
  dr.T = { ...dr.T, gear: ['War Drum (Rohan)'] };
  other.T = { ...other.T, kw: 'Man · Gondor · Hero, Infantry' };
  const opts = H.heroOptions(dr, 'move');
  eq(opts.map(o => o.k), ['march'], 'a Warrior with a drum may declare a Heroic March');
  H.declare(dr, 'march');
  eq([dr.drum, dr.might, dr.mvPlus], [true, undefined, 3], 'free, and it marches');
  eq(H.shoutReach(dr, 'march').map(u => u.name), ['Warrior of Rohan 2', 'Warrior of Rohan 3'], '12″, only Rohan models');
});
check('Wargear: war horn +1 Courage within 24″ and Stand Fast +3″ once; light armour vs shots; Elven cloak −1 To Hit (p. 109–110)', () => {
  const [cap, horn, far, man, foe] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 12, y: 12 }, { t: 'warriorOfRohan', side: 'good', x: 18.5, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 4 }, { t: 'hillTribesman', side: 'evil', x: 20, y: 15 }]);
  horn.T = { ...horn.T, gear: [...horn.T.gear, 'War Horn'] };
  load(3, 3); eq(R.courageTest(far).need, far.T.c - 1, 'a friend with a war horn within 24″: +1');
  G().broken = { good: true, evil: false };
  H.callStandFast(cap);
  eq([cap.sfRange, horn.hornUsed, H.standFastFor(far) === cap], [9, true, true], 'the horn takes Stand Fast to 9″ for the Warrior at ~7.5″');
  const bow = { n: 'Bow', rng: 24, s: 2 };
  foe.bow = bow; foe.missiles = [bow];
  const plain = R.shotInfo(foe, man);
  man.T = { ...man.T, gear: ['Light armour', 'Elven cloak'] };
  const i = R.shotInfo(foe, man);
  eq([i.sv - plain.sv, i.need], [1, R.woundNeed(2, man.d + 1)], 'cloak: −1 To Hit; light armour: +1 Defence');
});
check('Weapons: Elven weapon roll-off 3+ / 1–4, Master-forged, Unarmed, lance on a Charge (p. 104–106)', () => {
  const [a, b] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 11.02, y: 9 }]);
  const elf = u => { u.T = { ...u.T, gear: ['Elven hand weapon'] }; };
  elf(a);
  const D = { g: [{ v: 4, u: a }], e: [{ v: 4, u: b }], gF: 3, eF: 3, rerolls: [] };
  load(3); eq(C.settleDuel({ ...D }).win, 'good', 'Good with an Elven weapon wins the roll-off on a 3');
  b.T = { ...b.T, gear: ['Elven'] };
  load(3); eq(C.settleDuel({ ...D }).win, 'evil', 'both Elven: back to 4+');
  a.T = { ...a.T, gear: ['Hand weapon'] };
  load(4); eq(C.settleDuel({ ...D }).win, 'evil', 'Evil with an Elven weapon wins on 1–4');
  const o = { ...a, T: { ...a.T, gear: ['Master-forged two-handed weapon'], twoHanded: true }, wpn: 'two' };
  eq([C.duelMod(o), C.woundBonus(o)], [0, 1], 'Master-forged: no Duel Roll penalty, still +1 To Wound');
  const n = { ...a, unarmed: true };
  eq([C.duelMod(n), C.woundBonus(n)], [-1, -1], 'Unarmed: −1 and −1');
  const l = { ...a, cav: true, charged: true, T: { ...a.T, gear: ['Lance'] } };
  eq(C.woundBonus(l), 1, 'a lance on a Charge: +1 To Wound');
});
check('Missile Weapons: sling twice when still, throwing weapon after a full Move, none when Prone, best weapon per target (p. 106–107)', () => {
  const [sl, th, man] = table([{ t: 'warriorOfRohan', side: 'good', x: 4, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 4, y: 12 }, { t: 'hillTribesman', side: 'evil', x: 12, y: 9 }]);
  sl.bow = { n: 'Sling', rng: 12, s: 1, sling: true }; sl.missiles = [sl.bow];
  eq(R.shotsAllowed(sl), 2, 'a sling that did not move: two shots');
  R.spendShot(sl); eq(sl.shot, false, 'one shot left');
  sl.movedDist = 2; eq(R.shotsAllowed(sl), 1, 'after moving: one');
  const tw = { n: 'Throwing weapon', rng: 6, s: 3, thrown: true }, bow = { n: 'Bow', rng: 24, s: 2 };
  th.missiles = [bow, tw]; th.bow = bow; th.movedDist = 6;
  eq(R.shooterReason(th), null, 'a throwing weapon after a full Move');
  th.x = 10;
  eq(R.shotInfo(th, man).wpn, tw, 'the throwing weapon (S3) beats the bow (S2) at 6″');
  th.prone = true; eq(/Prone/.test(R.shooterReason(th)), true, 'Prone models never shoot');
  th.prone = false; th.crossTried = true; eq(/Jump/.test(R.shooterReason(th)), true, 'no shot after trying a Jump, Leap or Climb');
});
check('Throwing as it Charges: stop 1″ away, throw with no moving penalty, then Charge if the target stands (p. 107)', () => {
  const [th, man] = table([{ t: 'warriorOfRohan', side: 'good', x: 6, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 11, y: 9 }]);
  const tw = { n: 'Throwing weapon', rng: 6, s: 3, thrown: true };
  th.missiles = [tw]; th.bow = tw;
  const P = R.chargeSpot(th, man, R.remaining(th));
  const Q = R.throwSpot(th, P, man);
  truthy(Math.abs(D6 && Math.hypot(Q.x - man.x, Q.y - man.y) - th.r - man.r - 1) < 0.01, 'the throw spot is 1″ from the target');
  load(1);   // the throw misses
  S.applyMove(th, P, P.cost);
  eq([th.threw, th.shot, R.engaged(th)], [true, true, true], 'it threw, may not shoot again, and Charged');
});
check('Melee Weapons: two-handed or hand weapon each Combat; hand-and-a-half two-handed with a shield costs 1 Defence (p. 104, 111)', () => {
  const [orc, man, troll] = table([{ t: 'isengardOrcTwoHanded', side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11.02, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 20, y: 9 }]);
  eq(C.weaponsOf(orc), ['hand', 'two'], 'a hand weapon and a two-handed weapon: a choice');
  eq(C.weaponsOf(troll), ['hand', 'two'], 'a hand-and-a-half weapon: a choice');
  eq(C.weaponsOf(man), ['hand'], 'a hand weapon only');
  const c = [orc, man];
  C.pickWeapons(c, {}, () => 'hand');
  eq([C.duelMod(orc), C.woundBonus(orc, man)], [0, 0], 'with the hand weapon: no modifiers');
  C.dropWeapons(c); C.pickWeapons(c, {}, () => 'two');
  eq([C.duelMod(orc), C.woundBonus(orc, man)], [-1, 1], 'two-handed: −1 Duel Roll, +1 To Wound');
  C.dropWeapons(c);
  const sh = { ...troll, T: { ...troll.T, gear: ['Hand-and-a-half weapon', 'Shield'] }, d: 7 };
  C.pickWeapons([sh, man], {}, () => 'two');
  eq(sh.d, 6, 'two-handed with a shield: no shield bonus');
  C.dropWeapons([sh, man]);
  eq([sh.d, sh.wpn], [7, null], 'back after the Combat');
  G().specials = new Set();
  eq(C.weaponsOf(orc), ['two'], 'before the choice is taught: always two-handed');
  G().specials = null;
});
check('Terror: a Courage Test to Charge; a failure stops the Move, a pass covers later Terror tests; Fearful adds one (p. 60, 124, 130, FAQ)', () => {
  const [a, b, troll, c] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 12 }, { t: 'mordorTroll', side: 'evil', x: 13, y: 10 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 6 }]);
  load(1, 1);
  const spot = R.chargeSpot(a, troll, R.remaining(a));
  truthy(spot, 'a Charge spot');
  S.applyMove(a, spot, spot.cost);
  eq([a.x, a.frozen, a.done], [10, true, true], 'failed: no Move at all');
  load(6, 6);
  const spot2 = R.chargeSpot(b, troll, R.remaining(b));
  S.applyMove(b, spot2, spot2.cost);
  truthy(R.engaged(b), 'passed: it Charges');
  eq(SP.chargeTests(b, troll), [], 'the pass covers the next Terror test this turn');
  c.T = { ...c.T, rules: ['Fearful'] };
  eq(SP.chargeTests(c, troll), ['fearful', 'terror'], 'Fearful against Terror: two tests');
  c.T = { ...c.T, rules: ['Fearless'] };
  eq(H.autoCourage(c) && H.autoCourage(c).why, 'fearless', 'Fearless passes without a roll');
  const t2 = { ...troll, T: { ...troll.T, rules: ['Terror (Orc)'] } };
  eq(SP.causesTerrorIn(t2, b), false, 'Terror (Orc) does not frighten a Man');
});
check('a Broken army: models that stand still Activate too, Heroes first, so Stand Fast covers them (p. 60–61)', () => {
  const [man, cap, far] = table([{ t: 'warriorOfRohan', side: 'good', x: 12, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 22, y: 2 }]);
  G().broken = { good: true, evil: false };
  eq(R.idleActivations('good').map(u => u.name), ['Captain of Rohan', 'Warrior of Rohan 1', 'Warrior of Rohan 2'], 'the Hero first');
  load(6, 6, 1, 1);   // the Captain passes; the far Warrior (out of the Stand Fast) fails
  for (const u of R.idleActivations('good')) S.activate(u);
  eq([R.alive(cap), R.alive(man), !!far.fled], [true, true, true], 'Captain stands, near Warrior passes on Stand Fast, far one flees');
  eq(R.idleActivations('good').length, 0, 'each model tests once');
});
check('a turn: Heroic Moves come before both Activation phases, the side with Priority still before the other (p. 26, 81)', () => {
  const units = [{ t: 'captainOfRohan', side: 'good', x: 4, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 4, y: 11 }, { t: 'hillTribesChieftain', side: 'evil', x: 20, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 20, y: 11 }];
  S.startGame({ board: [24, 18], terrain: [], units, check: () => null, status: () => '', priority: 'evil' }, { heroics: H.HEROIC_KEYS });
  const order = [];
  const brain = side => ({
    answer: q => (q.k === 'declare' ? (side === 'good' ? q.options.find(o => o.k === 'move') || null : null) : undefined),
    heroicMove: list => { list.forEach(u => order.push(`heroic ${u.name}`)); S.COMPUTER.heroicMove(list); },
    move: s => { order.push(`activation ${s}`); S.COMPUTER.move(s); },
  });
  S.playTurn({ good: brain('good'), evil: brain('evil') });
  eq(order, ['heroic Captain of Rohan', 'heroic Warrior of Rohan', 'activation evil', 'activation good'], 'order');
});
check('a turn: the Heroic Combat is fought first (p. 82)', () => {
  const units = [{ t: 'captainOfRohan', side: 'good', x: 15, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 16.02, y: 9 },
    { t: 'warriorOfRohan', side: 'good', x: 4, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 5.02, y: 9 }];
  S.startGame({ board: [24, 18], terrain: [], units, check: () => null, status: () => '', priority: 'good', noShoot: true }, { heroics: H.HEROIC_KEYS });
  const fights = [];
  const still = { move: () => {}, answer: q => (q.k === 'declare' ? q.options.find(o => o.k === 'combat') || null : undefined) };
  S.playTurn({ good: still, evil: { move: () => {}, answer: q => (q.k === 'declare' ? null : undefined) }, trace: t => { if (t.startsWith('fight')) fights.push(t); } });
  truthy(fights.length >= 2 && fights[0].includes('Captain of Rohan'), `the Captain's Combat first: ${fights.join(' / ')}`);
});

/* ---------- Special rules on Strikes (p. 122–133) ---------- */
check('Hatred (X) and Backstabbers: +1 To Wound against the keyword and against a Trapped model (p. 126, 122)', () => {
  const [man, orc] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }]);
  man.T = { ...man.T, rules: ['Hatred (Orc)'] };
  eq(C.woundBonus(man, orc), 1, 'Hatred (Orc) against an Orc');
  eq(C.woundBonus(orc, man), 0, 'no rule, no bonus');
  man.T = { ...man.T, rules: ['Hatred (Elf)'] };
  eq(C.woundBonus(man, orc), 0, 'Hatred (Elf) against an Orc');
  man.T = { ...man.T, rules: ['Hatred'] };
  eq(C.woundBonus(man, orc), 1, 'Hatred with no keyword: every enemy');
  orc.T = { ...orc.T, rules: ['Backstabbers'] };
  eq([C.woundBonus(orc, man, false), C.woundBonus(orc, man, true)], [0, 1], 'Backstabbers only against a Trapped model');
  G().specials = new Set(['terror']);
  eq(C.woundBonus(man, orc), 0, 'a rule not yet taught stays on the card');
  G().specials = null;
});
check('To Wound re-rolls: Poisoned Attacks and Ancient Enemies a natural 1, Bane of Kings and Venom every fail (p. 121–133)', () => {
  const [man, orc] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }]);
  const roll = () => drive(C.strikeSeq(orc, man, 1, false)).value.rolls.map(d => [d.rr || 0, d.v]);
  orc.T = { ...orc.T, rules: ['Poisoned Attacks'] };
  load(1, 5); eq(roll(), [[1, 5]], 'Poisoned: the 1 is re-rolled');
  load(2); eq(roll(), [[0, 2]], 'Poisoned: a 2 stands');
  orc.T = { ...orc.T, rules: ['Ancient Enemies (Man)'] };
  load(1, 6); eq(roll(), [[1, 6]], 'Ancient Enemies (Man) against a Man');
  orc.T = { ...orc.T, rules: ['Ancient Enemies (Elf)'] };
  load(1); eq(roll(), [[0, 1]], 'Ancient Enemies (Elf) against a Man: no re-roll');
  orc.T = { ...orc.T, rules: ['Bane of Kings'] };
  load(3, 6); eq(roll(), [[3, 6]], 'Bane of Kings: a failed 3 is re-rolled');
  orc.T = { ...orc.T, rules: ['Venom'] };
  eq([C.woundReroll(orc, man), C.woundReroll(orc, man, true)], ['fails', null], 'Venom: Strikes only');
});
check('Mighty Blow 2 Wounds, Bane Weapons D3 against the keyword, Blades of the Dead: Defence 10 − Courage (p. 122, 127)', () => {
  const [man, orc] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }]);
  eq(C.strikeWounds(man, orc).n, 1, 'a plain Strike');
  man.T = { ...man.T, rules: ['Mighty Blow'] };
  eq(C.strikeWounds(man, orc).n, 2, 'Mighty Blow');
  man.T = { ...man.T, rules: ['Bane Weapons (Orcbane)'] };
  load(5); eq(C.strikeWounds(man, orc), { n: 3, d3: 3 }, 'Orcbane against an Orc: D3 (5 → 3)');
  load(1); eq(C.strikeWounds(man, orc), { n: 1, d3: 1 }, 'D3 of 1');
  man.T = { ...man.T, rules: ['Bane Weapons (Goblinbane)'] };
  eq(C.strikeWounds(man, orc).n, 1, 'Goblinbane against a Mordor Orc');
  man.T = { ...man.T, rules: ['Blades of the Dead'] };
  eq(C.bladesD(man, orc), 10 - orc.T.c, 'Defence 10 − Courage');
  load(6); const X = drive(C.strikeSeq(man, orc, 1, false)).value;
  eq([X.d, X.need], [10 - orc.T.c, R.woundNeed(H.strikeS(man), 10 - orc.T.c)], 'strikeSeq rolls against it');
});
check('Venom: at the end of the Combat a wounded enemy rolls; a natural 6 is another Wound (p. 133)', () => {
  const [cap, orc] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }]);
  orc.T = { ...orc.T, rules: ['Venom'] };
  C.venomMark(orc, cap);
  load(6); eq(C.venomEnd([cap, orc]).map(v => [v.t.name, v.v, v.ok]), [[cap.name, 6, true]], 'a 6');
  eq(C.venomEnd([cap, orc]), [], 'the marks are cleared');
  C.venomMark(orc, cap); load(5);
  eq(C.venomEnd([cap, orc]).map(v => v.ok), [false], 'a 5: nothing');
});

/* ---------- Special rules on Courage (p. 123–132) ---------- */
check('Sworn Protector (X) and Bodyguard pass Courage Tests while their Hero lives; Bodyguard picks the highest tier Hero (p. 123, 131)', () => {
  const [cap, man, guard, orc] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'warriorOfRohan', side: 'good', x: 6, y: 4 }, { t: 'rohanRoyalGuard', side: 'good', x: 8, y: 4 }, { t: 'mordorOrc', side: 'evil', x: 20, y: 4 }]);
  eq(SP.autoPass(man), null, 'no rule');
  man.T = { ...man.T, rules: [`Sworn Protector (${cap.T.n})`] };
  eq(SP.autoPass(man) && SP.autoPass(man).why, 'swornProtector', 'the named Hero is alive');
  eq(H.autoCourage(man) && H.autoCourage(man).h, cap, 'heroes.js: autoCourage uses it');
  guard.T = { ...guard.T, rules: ['Bodyguard'] };
  SP.assignGuards(G().units);
  eq(guard.guard, cap.id, 'the Bodyguard picks the Captain (Rohan)');
  eq(SP.autoPass(guard) && SP.autoPass(guard).why, 'bodyguard', 'the guarded Hero is alive');
  cap.dead = true;
  eq([SP.autoPass(man), SP.autoPass(guard)], [null, null], 'the Hero is slain: no more automatic passes');
});
check('Harbinger of Evil (X): −1 to enemy Courage Tests within range, once, not for its own kind (p. 125)', () => {
  const [man, orc, orc2] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 14, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 15, y: 9 }]);
  load(3, 3); eq(R.courageTest(man).need, man.T.c, 'no Harbinger');
  orc.T = { ...orc.T, rules: ['Harbinger of Evil (6")'] }; orc2.T = orc.T;
  load(3, 3); const T = R.courageTest(man);
  eq([T.need, T.harb && T.harb.side], [man.T.c + 1, 'evil'], 'within 6″: −1 (two of them still −1)');
  orc.x = orc2.x = 22;
  load(3, 3); eq(R.courageTest(man).need, man.T.c, 'out of range');
  orc.x = 14; man.T = { ...man.T, rules: ['Harbinger of Evil (3")'] };
  load(3, 3); eq(R.courageTest(man).need, man.T.c, 'a model with the rule is unaffected');
});
check('Survival Instinct: a Courage Test after each Wound it survives, flee on a failure; slain for a Heroic Challenge (p. 131, FAQ)', () => {
  const [cap, orc] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }]);
  cap.T = { ...cap.T, rules: ['Survival Instinct'] }; cap.fate = 0;
  const w0 = cap.w;
  load(6, 6); let r = drive(C.hurtSeq(cap)).value;
  eq([r.r, cap.w, !!r.T && r.T.ok], ['wound', w0 - 1, true], 'passed: it stays');
  cap.w = 2; load(1, 1); r = drive(C.hurtSeq(cap), [0, 0, 0, 0, 0, 0]).value;
  eq([r.r, cap.fled, R.alive(cap)], ['slain', true, false], 'failed: it flees as a casualty');
  orc.T = { ...orc.T, rules: ['Survival Instinct', 'Fearless'] };
  r = drive(C.hurtSeq(orc)).value; eq([r.r, r.T], ['slain', null], 'a 1-Wound model is slain outright, no test');
});
check('Timid: the Mount tests to Charge, no rule passes it, and no Cavalry Charge bonus (p. 132)', () => {
  const [rider, orc] = table([{ t: 'riderOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11.2, y: 9 }]);
  eq(SP.chargeTests(rider, orc), [], 'a normal horse');
  rider.mount = { ...rider.mount, rules: ['Timid'] }; rider.T = { ...rider.T, rules: ['Fearless'] };
  eq(SP.chargeTests(rider, orc), ['timid'], 'a Timid mount tests');
  load(1, 1); truthy(!S.chargeNerve(rider, orc) && rider.frozen, 'Fearless does not pass it: failed, no Move');
  rider.charged = true;
  eq(C.chargeBonus(rider, [orc]), false, 'no Cavalry Charge bonus');
});

/* ---------- Special rules on Defence and Prone (p. 123, 129, 132) ---------- */
check('Shieldwall: +1 Defence with two shield-bearing friends in base contact, before Backing Away; not Prone (p. 129, FAQ)', () => {
  const U = table([{ t: 'warriorOfMinasTirith', side: 'good', x: 10, y: 9 }, { t: 'warriorOfMinasTirith', side: 'good', x: 11, y: 9 }, { t: 'warriorOfMinasTirith', side: 'good', x: 12, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 11 }]);
  const [a, b, c, orc] = U;
  for (const u of [a, b, c]) u.T = { ...u.T, rules: ['Shieldwall'], gear: ['Hand Weapon', 'Shield'] };
  b.x = a.x + a.r + b.r; c.x = b.x + b.r + c.r;
  eq([a, b, c].map(R.shieldwallOn), [false, true, false], 'only the middle model touches two friends');
  eq(R.shotArmour(b), 1, 'it counts against shooting too');
  C.shieldwallSnap([b, orc]); b.prone = true;
  eq([C.defOf(b), R.shieldwallOn(b)], [b.d + 1, false], 'worked out before: a model knocked Prone keeps it for the Combat');
  b.prone = false; c.T = { ...c.T, gear: ['Hand Weapon'] };
  eq(R.shieldwallOn(b), false, 'a friend without a shield does not count');
});
check('Burly: no −1 Duel Roll for a two-handed weapon (p. 123)', () => {
  const [orc] = table([{ t: 'isengardOrcTwoHanded', side: 'evil', x: 10, y: 9 }]);
  orc.wpn = 'two';
  const was = C.duelMod(orc);
  eq(was, -1, 'two-handed: −1');
  orc.T = { ...orc.T, rules: ['Burly'] };
  eq(C.duelMod(orc), was + 1, 'the −1 is gone');
});
check('Unyielding Combat Stance: 4+ keeps its footing against a Cavalry Charge and as a thrown rider (p. 132)', () => {
  const [rider, a, b] = table([{ t: 'riderOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11.5, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11.5, y: 11 }]);
  rider.charged = true; a.T = { ...a.T, rules: ['Unyielding Combat Stance'] };
  load(4);
  const down = C.knockDown([rider], [a, b]);
  eq([down.map(u => u.name), down.kept.map(k => [k.u.name, k.v, k.ok])], [[b.name], [[a.name, 4, true]]], 'a 4: it stays up');
  rider.T = { ...rider.T, rules: ['Unyielding Combat Stance'] };
  load(1, 1, 5);   // the Rider of Rohan is an Expert Rider: its 1 is re-rolled first
  const T = drive(C.thrownRiderSeq(rider)).value;
  eq([T.v, T.keep && T.keep.v, !!T.hit], [6, 5, false], 'a 1 on the Thrown Rider Test, then 5: counts as a 6');
});

/* ---------- Special rules of Heroes (p. 124–127) ---------- */
check('Mighty Hero: a free Might Point each turn, lost if not spent; General Hunter regains Might on slaying the General (p. 125, 127)', () => {
  const [cap, chief] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'hillTribesChieftain', side: 'evil', x: 20, y: 4 }]);
  cap.T = { ...cap.T, rules: ['Mighty Hero'] };
  const m0 = cap.might;
  H.mightyHero(cap); eq(cap.might, m0 + 1, 'turn 1: +1 even above the store');
  H.mightyHero(cap); eq(cap.might, m0 + 1, 'not spent: lost, and a new one');
  cap.might--; H.mightyHero(cap); eq(cap.might, m0 + 1, 'spent: the store keeps the rest');
  eq([cap.general, chief.general], [true, true], 'each side\'s only Hero is its General');
  chief.T = { ...chief.T, rules: ['General Hunter'] }; chief.might = 0;
  truthy(H.hunterSlain(chief, cap) && chief.might === 1, 'slays the General: 1 Might back');
});
check('Master of Battle (X+): an enemy Heroic Action within 6″ is copied for free on X+ (p. 127)', () => {
  const [cap, targg] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'generalTargg', side: 'evil', x: 14, y: 9 }], { priority: 'evil' });
  targg.T = { ...targg.T, rules: ['Master of Battle (4+)'] };
  const m = targg.might;
  load(5);
  const { log } = drive(H.declareSeq('move'), [q => q.options.find(o => o.u === cap && o.k === 'march'), null, null]);
  truthy(log.includes('masterOfBattle'), `rolled: ${log.join(', ')}`);
  eq([targg.decl.move, targg.might], ['march', m], 'Heroic March for free');
});
check('Horse Lord: a Wound to the Mount ignored on a natural 6, else the rider\'s Fate (p. 126); Expert Rider from the profile rule', () => {
  const [rider] = table([{ t: 'riderOfRohan', side: 'good', x: 10, y: 9 }]);
  rider.T = { ...rider.T, rules: ['Horse Lord'] };
  const w = rider.mount.w;
  load(6); eq([drive(C.hurtSeq(rider, 'mount')).value.r, rider.mount.w], ['saved', w], 'a 6: ignored');
  load(5); eq([drive(C.hurtSeq(rider, 'mount')).value.r, rider.mount.w], [w > 1 ? 'mountWound' : 'mountSlain', w - 1], 'a 5: the Wound stands');
});

/* ---------- Special rules on movement (p. 123–131) ---------- */
check('Woodland Creature, Mountain Dweller, Swift Movement: Difficult Terrain as open ground (p. 131, 128, 130)', () => {
  const [u] = table([{ t: 'warriorOfRohan', side: 'good', x: 2, y: 9 }], { terrain: [{ k: 'brush', x: 4, y: 6, w: 4, h: 6 }, { k: 'brush', rocky: true, x: 12, y: 6, w: 4, h: 6 }] });
  const cost = P => R.validateMove(u, P, 30).cost;
  const wood = { x: 9, y: 9 }, both = { x: 17, y: 9 };
  const plain = cost(wood);
  truthy(plain > 7 + 1e-6, `woods slow a plain model: ${plain}`);
  u.T = { ...u.T, rules: ['Woodland Creature'] };
  eq(+cost(wood).toFixed(3), 7, 'Woodland Creature: woods are open ground');
  truthy(cost(both) > 15 + 1e-6, 'but rocky scree still slows it');
  u.T = { ...u.T, rules: ['Mountain Dweller'] };
  truthy(cost(wood) > 7 + 1e-6, 'Mountain Dweller: woods slow it');
  u.T = { ...u.T, rules: ['Swift Movement'] };
  eq(+cost(both).toFixed(3), 15, 'Swift Movement: nothing slows it');
});
check('Jump Tests: Cave Dweller +1, Mountain Dweller re-rolls a fail, Spectral Walk and Swift Movement (Obstacles) need no roll (p. 123–130)', () => {
  const [u] = table([{ t: 'warriorOfRohan', side: 'good', x: 2, y: 9 }]);
  const X = { kind: 'jump', b: { T: { k: 'hedge' } } };
  u.T = { ...u.T, rules: ['Cave Dweller'] };
  load(1); eq(drive(TR.crossTestSeq(u, X)).value, 2, 'Cave Dweller: a 1 counts as 2');
  u.T = { ...u.T, rules: ['Mountain Dweller'] };
  load(1, 6); eq(drive(TR.crossTestSeq(u, X)).value, 6, 'Mountain Dweller: the 1 is re-rolled');
  u.T = { ...u.T, rules: ['Swift Movement'] };
  eq([drive(TR.crossTestSeq(u, X)).value, X.auto], [6, 'Swift Movement'], 'Swift Movement over a hedge: no roll');
  const L = { kind: 'leap', b: {} };
  load(1); eq(drive(TR.crossTestSeq(u, L)).value, 1, 'Swift Movement does not help across a gap');
  u.T = { ...u.T, rules: ['Spectral Walk'] };
  eq(drive(TR.crossTestSeq(u, L)).value, 6, 'Spectral Walk: always a 6');
});

/* ---------- Special rules on shooting (p. 124–131) ---------- */
check('Expert Shot two shots; Throw Stones only standing still; Sharpshooter from the rule (p. 124, 129, 131)', () => {
  const [archer, troll, orc] = table([{ t: 'warriorOfRohanBow', side: 'good', x: 4, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 20, y: 4 }, { t: 'mordorOrc', side: 'evil', x: 14, y: 9 }]);
  eq(R.shotsAllowed(archer), 1, 'one shot');
  archer.T = { ...archer.T, rules: ['Expert Shot', 'Sharpshooter'] };
  eq(R.shotsAllowed(archer), 2, 'Expert Shot: two');
  ST.freshTurn(archer); eq(archer.sharp, true, 'Sharpshooter from the profile rule');
  troll.T = { ...troll.T, rules: ['Throw Stones (range 12", Strength 8)'] };
  troll.missiles = [ST.stonesOf(troll.T)];
  troll.movedDist = 2; R.readyStones([troll]); eq(troll.bow, null, 'it moved: no stones');
  troll.movedDist = 0; R.readyStones([troll]);
  eq([troll.bow && troll.bow.rng, troll.bow && troll.bow.s], [12, 8], 'stood still: stones 12″, Strength 8');
  ST.freshTurn(troll); eq(troll.bow, null, 'put away next turn');
});
check('Large Target: only Monsters are In The Way; Fell Sight ignores Stalk Unseen (p. 126, 124)', () => {
  const [archer, man, troll] = table([{ t: 'warriorOfRohanBow', side: 'good', x: 4, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 14, y: 9 }]);
  truthy(R.inTheWay(archer, troll).some(o => o.u === man), 'a man in the way of a normal target');
  troll.T = { ...troll.T, rules: ['Large Target'] };
  truthy(!R.inTheWay(archer, troll).some(o => o.u === man), 'not in the way of a Large Target');
});

/* ---------- Army special rules (matched play) ---------- */
check('Army rules: no dawn for Men, Barbarous Killers, Glory Seekers, Bring the City to its Knees, Phalanx, Whipped into a frenzy', () => {
  const [man, uruk, hill, cap, orcCap] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'urukHaiWarrior', side: 'evil', x: 11, y: 9 },
    { t: 'hillTribesman', side: 'evil', x: 11, y: 11 }, { t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'generalTargg', side: 'evil', x: 20, y: 4 }]);
  uruk.T = { ...uruk.T, rules: [] }; hill.T = { ...hill.T, rules: [] };
  G().m.armies = { good: { rules: [] }, evil: { rules: [{ n: '"There will be no dawn for Men"' }, { n: 'Barbarous Killers' }, { n: 'Whipped into a frenzy' }, { n: 'Bring the City to its Knees' }] } };
  eq(C.woundBonus(uruk, man), 1, 'Uruk-hai: Hatred (Man)');
  eq([C.woundBonus(hill, man), C.woundBonus(hill, cap)], [0, 1], 'Dunland: +1 only against a Hero');
  eq([C.woundReroll(orcCap, cap), C.woundReroll(orcCap, man)], ['ones', null], 'Heroes re-roll 1s against Heroes');
  man.T = { ...man.T, rules: ['Glory Seekers'] };
  eq(C.woundBonus(man, orcCap), 1, 'Glory Seekers against a Hero');
  load(6); eq(drive(C.hurtSeq(hill)).value.r, 'saved', 'Hill Tribesman: a 6 ignores the Wound');
  G().m.armies = null;
});
check('Army rules: Protect the King, Forth Eorlingas!', () => {
  const [cap, man, troll, uc] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 11 }, { t: 'mordorTroll', side: 'evil', x: 13, y: 11 }, { t: 'urukHaiWarrior', side: 'evil', x: 20, y: 4 }]);
  G().m.armies = { good: { rules: [{ n: 'Protect the King' }, { n: '"Forth Eorlingas!"' }] }, evil: { rules: [] } };
  eq(SP.chargeTests(man, troll), ['terror'], 'no Rohan Hero has Charged');
  cap.charged = true;
  eq(SP.chargeTests(man, troll), [], 'the Captain Charged: Protect the King');
  G().turn = 3;
  truthy(C.forthEorlingas() === cap && C.woundReroll(man, troll) === 'fails', 'Forth Eorlingas: Rohan models re-roll fails');
  eq(C.forthEorlingas(), null, 'once per game');
  G().m.armies = null; G().eorl = null;
});

/* ---------- Rules of named Heroes and the target armies' rules (named.js) ---------- */
const NM = await import('../js/engine/named.js');
const as = (u, n, rules = u.T.rules) => { u.T = { ...u.T, n, rules }; return u; };
check('Named Heroes: Arise, Riders of Rohan!, Defender of Edoras, The Warrior Poet, The Usurper King, Dunlending Heritage and Commander', () => {
  const [cap, rider, hal, h1, h2, hama, man, wulf, targg, hill] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'riderOfRohan', side: 'good', x: 8, y: 4 },
    { t: 'halethPrince', side: 'good', x: 10, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 11, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 10, y: 10 },
    { t: 'hamaPrince', side: 'good', x: 16, y: 14 }, { t: 'warriorOfRohan', side: 'good', x: 18, y: 14 }, { t: 'wulf', side: 'evil', x: 20, y: 4 },
    { t: 'generalTargg', side: 'evil', x: 20, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 22, y: 9 }]);
  G().units.forEach(u => { u.general = u === cap; });
  rider.charged = true;
  eq(H.fvOf(rider), rider.f + 1, 'Arise: +1 Fight Value after a Charge within 12″ of the Rohan General');
  rider.x = 20; eq(H.fvOf(rider), rider.f, 'not beyond 12″');
  G().combats = [[hal, h1, h2]];
  eq(C.woundReroll(hal, h1), 'fails', 'Defender of Edoras: outnumbered, re-rolls failed To Wound');
  G().combats = [[hal, h1]];
  eq(C.woundReroll(hal, h1), null, 'not when one against one');
  const will = hama.will;
  truthy(NM.warriorPoet(() => true) === hama && hama.will === will - 1, 'The Warrior Poet: Háma spends a Will Point');
  eq([C.woundReroll(man, h1), C.woundReroll(hal, h1)], ['ones', null], 'Rohan models within 6″ of Háma re-roll 1s');
  eq([C.woundReroll(wulf, cap), C.woundReroll(wulf, man)], ['ones', null], 'The Usurper King: 1s against a Hero');
  eq(C.bannersOf([wulf, cap], [], []).evil, 1, 'Wulf re-rolls one Duel dice against a Hero');
  as(targg, targg.T.n, [...targg.T.rules, 'Dunlending Heritage']);
  eq(H.fvOf(hill), hill.f + 1, 'Dunlending Heritage: Dunland Warriors within 6″');
  eq(C.woundReroll(hill, man), null, 'Dunlending Commander: only after handing over Priority');
  G().priority = 'good'; NM.priorityGiven('evil');
  eq(C.woundReroll(hill, man), 'ones', 'Dunlending Commander: 1s after handing over Priority');
  G().combats = null; G().gave = null; G().poet = null;
});
check('Named Heroes: In Defence of the King, Stand Fast 12″, Voice of Curunir, Dominant, Line of Command, Claim the Throne, Oblivious to Pain', () => {
  const [gen, hurin, theo, w, hama, guard, frec, foeGen, uruk, sar, orcCap] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'captainOfRohan', side: 'good', x: 6, y: 4 },
    { t: 'captainOfRohan', side: 'good', x: 4, y: 12 }, { t: 'warriorOfRohan', side: 'good', x: 14, y: 12 }, { t: 'hamaPrince', side: 'good', x: 4, y: 16 },
    { t: 'rohanRoyalGuard', side: 'good', x: 8, y: 16 }, { t: 'generalTargg', side: 'evil', x: 20, y: 4 }, { t: 'wulf', side: 'evil', x: 22, y: 4 },
    { t: 'urukHaiWarrior', side: 'evil', x: 20, y: 14 }, { t: 'generalTargg', side: 'evil', x: 16, y: 16 }, { t: 'generalTargg', side: 'evil', x: 22, y: 16 }]);
  G().units.forEach(u => { u.general = u === gen || u === foeGen; });
  gen.T = { ...gen.T, kw: 'Man · Gondor · Hero, Infantry' };
  as(hurin, 'Húrin the Tall, Warden of the Keys', ['In Defence of the King', 'Line of Command']);
  eq(SP.autoPass(hurin) && SP.autoPass(hurin).why, 'heroRule', 'In Defence of the King: Courage passed within 3″ of a Gondor General');
  eq(SC.generalVP('good', 1, 3), 0, 'Line of Command: no Victory Points for the General while Húrin lives');
  as(theo, 'Théoden, King of Rohan', ['"Forth, and Fear no Darkness"']);
  H.callStandFast(theo);
  truthy(H.standFastFor(w) === theo, 'Théoden: Stand Fast reaches 12″');
  as(sar, 'Saruman', ['Voice of Curunir']); H.callStandFast(sar);
  truthy(H.standFastFor(orcCap) === sar, 'Voice of Curunir: a Hero within 12″ benefits');
  as(hama, hama.T.n, ['Doorward of Meduseld']);
  eq([NM.dominance(hama), NM.dominance(guard), NM.dominance(w)], [2, 2, 1], 'Doorward of Meduseld: Háma and Royal Guard count as 2 while Théoden lives');
  as(frec, 'Freca, Lord of the Westmarch', ['Claim the Throne']);
  frec.x = 6; frec.y = 6; NM.slain(frec, gen);
  truthy(G().claimed && G().claimed.evil, 'Claim the Throne: the enemy General fell within 6″ of Freca');
  uruk.x = 7; uruk.y = 7;
  truthy(C.bannerFor([uruk], 'evil', []) == null, 'Freca is a banner for Dunland models only');
  const hill = { ...uruk, id: 999, T: { ...uruk.T, kw: 'Man · Dunland · Warrior, Infantry' } };
  truthy(C.bannerFor([hill], 'evil', []) === frec, 'Freca counts as a banner with a range of 6″');
  as(uruk, 'Uruk-hai Berserker', ['Oblivious to Pain']);
  load(6); eq(drive(C.hurtSeq(uruk)).value.r, 'saved', 'Oblivious to Pain: a 6 ignores the Wound');
  G().claimed = null; G().slayer = null;
});
check('Named Heroes: Leader of the Pack, Savage Charge, Fury of the Pack', () => {
  const [sh, man, rider, h2] = table([{ t: 'hillTribesChieftain', side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11, y: 9 },
    { t: 'isengardWargRider', side: 'evil', x: 4, y: 4 }, { t: 'riderOfRohan', side: 'good', x: 5.6, y: 4 }]);
  G().m.armies = { good: { rules: [] }, evil: { rules: [{ n: 'Leader of the Pack' }, { n: 'Savage Charge' }] } };
  as(sh, 'Sharku, Warg Rider Captain', []); sh.might = 0;
  truthy(H.heroOptions(sh, 'fight').some(o => o.k === 'combat'), 'Leader of the Pack: Heroic Combat without Might');
  H.declare(sh, 'combat'); eq(sh.might, 0, 'no Might spent');
  sh.decl = {}; eq(H.heroOptions(sh, 'fight').length, 0, 'once per turn');
  rider.charged = true;
  truthy(NM.savageCharge(rider, [h2]), 'Savage Charge: the Extra Attack also against Cavalry');
  as(rider, 'Sharku, Warg Rider Captain', ['Fury of the Pack']);
  eq([H.fvOf(rider), NM.attacksPlus(rider)], [Math.max(rider.f, 5), Math.max(0, 3 - rider.a)], 'Fury of the Pack: Fight 5 and Attacks 3 after a Charge');
  G().m.armies = null;
});

/* ---------- Magic (p. 114–121) ---------- */
const power = (u, n) => u.T.powers.find(p => p.n.startsWith(n));
check('Casting: Will dice, the best one against the Casting Value; a Resist Test equal to it resists (p. 114–115, example 81)', () => {
  const [dm, cap] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 16, y: 9 }]);
  const w0 = cap.will;
  load(1, 3, 3);   // Casting 1 and 3 (Transfix 3+), Resist 3
  const { log, value: Rc } = drive(MG.castSeq(dm, power(dm, 'Transfix'), cap, 2), [1]);
  eq(log, ['dice:cast 1,3', 'resist', 'dice:resist 3'], 'steps');
  truthy(Rc.cast && Rc.resisted && !Rc.ok, 'Cast, then resisted');
  eq([dm.will, cap.will], [12, w0 - 1], 'Will spent by both');
});
check('Transfix: no Activation, Heroic Actions, shooting or Strikes until the End phase (p. 121)', () => {
  const [dm, cap] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 16, y: 9 }]);
  load(5, 2);
  const pw = power(dm, 'Transfix'), { value: Rc } = drive(MG.castSeq(dm, pw, cap, 1), [1]);
  truthy(Rc.ok, 'Cast and not resisted');
  drive(MG.effectSeq(dm, pw, cap, Rc));
  truthy(MG.transfixed(cap) && !R.canMove(cap) && !H.heroOptions(cap, 'move').length && C.strikesOf(cap, []) === 0, 'Transfixed');
  MG.endPhase();
  truthy(!MG.transfixed(cap) && R.canMove(cap), 'ends in the End phase');
});
check('Resisting: a Hero regains the Will of a natural 6; Heroic Resolve and Resistant to Magic give free dice (p. 84, 115, 131)', () => {
  const [dm, cap, man] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 16, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 16, y: 12 }]);
  const w0 = cap.will;
  load(4, 6);
  eq(drive(MG.castSeq(dm, power(dm, 'Transfix'), cap, 1), [1]).value.resisted, true, 'a 6 resists');
  eq(cap.will, w0, 'and the Will Point comes back');
  cap.might = 3; H.declare(cap, 'resolve');
  truthy(man.resolveDie && MG.freeDice(man) === 1, 'Heroic Resolve: a free dice within 6″');
  man.T = { ...man.T, rules: ['Resistant to Magic'] };
  eq(MG.freeDice(man), 2, 'Resistant to Magic: one more');
  dm.cast = null; load(4, 1, 5);
  const { log, value } = drive(MG.castSeq(dm, power(dm, 'Transfix'), man, 1), [0]);
  eq([log.at(-1), value.resisted], ['dice:resist 1,5', true], 'a Warrior rolls its free dice');
});
check('Heroic Channelling: the next Casting Test counts as a 6 without a roll, Will still spent (p. 82)', () => {
  const [dm, cap] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 16, y: 9 }]);
  truthy(H.heroOptions(dm, 'move').some(o => o.k === 'channelling'), 'a caster may declare it');
  H.declare(dm, 'channelling');
  const Rc = drive(MG.castSeq(dm, power(dm, 'Black Dart'), cap, 3), [0]).value;
  eq([Rc.high, dm.will, dm.channel], [6, 13, false], 'a 6, one Will Point');
});
check('Will of Evil: the last Will Point cannot Cast; a point lost after a Combat, banished at 0 (p. 133)', () => {
  const [dm] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 16, y: 9 }]);
  dm.will = 1;
  eq(MG.castable(dm).length, 0, 'no Cast with the last point');
  dm.will = 2; dm.fought = true; MG.endPhase();
  eq([dm.will, R.alive(dm)], [1, true], 'one point gone');
  dm.fought = true; MG.endPhase();
  eq(R.alive(dm), false, 'banished at 0');
});
check('Powers that last: Aura of Command ends at 0 Will (Exhaustion); Instil Fear, Drain Courage, Bladewrath, Enchant Blades (p. 116–120)', () => {
  const [dm, orc, cap, man] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 10, y: 12 }, { t: 'captainOfRohan', side: 'good', x: 14, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 22, y: 16 }]);
  const cast = (n, t) => { dm.cast = null; const pw = power(dm, n), Rc = drive(MG.castSeq(dm, pw, t, 1), [0]).value; truthy(Rc.ok, `${n} Cast`); drive(MG.effectSeq(dm, pw, t, Rc)); };
  load(6); cast('Aura of Command', dm);
  eq(SP.autoPass(orc) && SP.autoPass(orc).why, 'auraOfCommand', 'a friend within 6″ passes Courage Tests');
  load(6); cast('Instil Fear', dm);
  truthy(SP.rule(cap, 'Fearful') && !SP.rule(man, 'Fearful'), 'enemies within 6″ are Fearful');
  const before = R.courageTest(cap).need;
  load(6); cast('Drain Courage', cap);
  eq(R.courageTest(cap).need, before + 1, 'Courage 1 worse');
  const w = dm.will; dm.will = 0;
  eq(SP.autoPass(orc), null, 'Exhaustion: ends with the last Will Point');
  dm.will = w;
  const [ku, orc2] = table([{ T: ARMY_TYPES.khamulTheEasterling, side: 'evil', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 14, y: 9 }]);
  const bw = power(ku, 'Bladewrath');
  load(6); drive(MG.effectSeq(ku, bw, orc2, drive(MG.castSeq(ku, bw, orc2, 1)).value));
  eq(H.strikeS(orc2), 6, 'Bladewrath: Strikes at Strength 6');
  G().spells = [{ p: 'Enchant Blades', by: ku.id, t: orc2.id, dur: 'temporary', side: 'evil' }];
  eq([C.woundReroll(orc2, G().units[2]), C.woundReroll(orc2, G().units[2], true)], ['fails', null], 'Enchant Blades: Strikes only');
});
check('Black Dart: a Strength 6 hit; Fury (X); the computer picks a power and a target (p. 116–117)', () => {
  const [kh, man, cap] = table([{ T: ARMY_TYPES.khamulTheEasterling, side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 13, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 14, y: 12 }]);
  load(6, 6);   // Casting 6, To Wound 6
  const pw = power(kh, 'Black Dart'), Rc = drive(MG.castSeq(kh, pw, man, 1)).value;
  const E = drive(MG.effectSeq(kh, pw, man, Rc)).value;
  truthy(E.slain.includes(man) && !R.alive(man), 'the Warrior is slain');
  kh.cast = null;
  const c = MG.aiCast(kh);
  truthy(c && c.t === cap, `the computer Casts at the Captain (got ${c && c.pw.n} at ${c && c.t && c.t.name})`);
  const [sh, uruk] = table([{ T: ARMY_TYPES.urukHaiShaman, side: 'evil', x: 10, y: 9 }, { t: 'urukHaiWarrior', side: 'evil', x: 12, y: 9 }]);
  const fp = sh.T.powers.find(p => /^Fury/.test(p.n));
  load(6); drive(MG.effectSeq(sh, fp, null, drive(MG.castSeq(sh, fp, null, 1)).value));
  eq(SP.autoPass(uruk) && SP.autoPass(uruk).why, 'fury', `Fury (${MG.powerArg(fp.n)}): friends with the keyword pass`);
});

check('Paralyse: Prone, no Activation, no dice in the Duel Roll; a 6 in the End phase recovers (p. 118)', () => {
  const [dm, cap, orc] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 14, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 15.05, y: 9 }]);
  const pw = { n: 'Paralyse', cast: 3, rng: 6 };
  load(6); const Rc = drive(MG.castSeq(dm, pw, cap, 1), [0]).value;
  drive(MG.effectSeq(dm, pw, cap, Rc));
  truthy(MG.paralysed(cap) && cap.prone && !R.canMove(cap) && C.strikesOf(cap, [orc]) === 0, 'Paralysed and Prone');
  const D = C.rollDuelDice([cap], [orc]);
  eq(D.g.length, 0, 'no Duel Roll dice');
  load(5); drive(MG.paralyseSeq(), [0]);
  truthy(MG.paralysed(cap), 'a 5 does not recover');
  load(6); drive(MG.paralyseSeq());
  truthy(!MG.paralysed(cap), 'a 6 recovers');
});
check('Compel: the caster moves the target half its Move, into a Charge if it likes; then it cannot move (p. 116)', () => {
  const [dm, man, orc, orc2] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 14, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11.5, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 11.5, y: 10.3 }]);
  const pw = { n: 'Compel', cast: 3, rng: 12 };
  load(6); const Rc = drive(MG.castSeq(dm, pw, man, 1)).value;
  const opts = MG.compelOptions(dm, man);
  truthy(opts.some(o => o.kind === 'charge') && opts.some(o => o.kind === 'move'), 'Charges and moves offered');
  drive(MG.effectSeq(dm, pw, man, Rc), [q => q.opts.find(o => o.kind === 'charge')]);
  truthy(R.engaged(man) && man.done && !R.canMove(man), 'Charged into the Orcs, and done');
});
check('Call Winds: blown D3+3″ straight away and knocked Prone; Collapse Rocks needs rock (p. 116)', () => {
  const [dm, man] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }], { terrain: [{ k: 'rock', x: 30, y: 1, w: 2, h: 2 }] });
  const pw = { n: 'Call Winds', cast: 3, rng: 12 };
  load(6, 6); const Rc = drive(MG.castSeq(dm, pw, man, 1)).value;
  drive(MG.effectSeq(dm, pw, man, Rc));
  truthy(Math.abs(man.x - 16) < 0.11 && man.y === 9 && man.prone, `6″ away, Prone (at ${man.x.toFixed(2)})`);
  eq(MG.targets(dm, { n: 'Collapse Rocks', cast: 4, rng: 12 }).length, 0, 'no rock near: no target');
});
check('Tremor: every model under the D3+3″ line suffers a Strength 4 hit and is knocked Prone (p. 120)', () => {
  const [sh, a, b, c] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10.5, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 13 }]);
  const pw = { n: 'Tremor', cast: 3, rng: 0 };
  load(6, 6, 1, 1); const Rc = drive(MG.castSeq(sh, pw, a, 1)).value;
  eq([Rc.len, Rc.targets.length], [6, 2], 'a 6″ line hits the two in a row');
  drive(MG.effectSeq(sh, pw, a, Rc));
  truthy(a.prone && b.prone && !c.prone, 'both Prone, the third untouched');
});
check('Writhing Vines: the caster\'s enemies treat the ground within 3″ of the marker as Difficult Terrain (p. 121)', () => {
  const [dm, man] = table([{ T: ARMY_TYPES.theDarkMarshal, side: 'evil', x: 6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 14, y: 9 }]);
  const before = R.validateMove(man, { x: 11, y: 9 }, 6).cost;
  const pw = { n: 'Writhing Vines', cast: 3, rng: 0 };
  load(6); drive(MG.effectSeq(dm, pw, dm, drive(MG.castSeq(dm, pw, dm, 1)).value));
  const after = R.validateMove(man, { x: 11, y: 9 }, 6);
  truthy(after.cost > before + 1, `slowed: ${before.toFixed(1)} → ${after.cost && after.cost.toFixed(1)}`);
  MG.endPhase();
  eq(R.validateMove(man, { x: 11, y: 9 }, 6).cost, before, 'gone in the End phase');
});

/* ---------- Monsters (p. 89–91, 128) ---------- */
check('Monstrous Charge: +1 Attack after a Charge; a Monster may Rend, Hurl or Barge instead of Striking (p. 90, 128)', () => {
  const [troll, cap, man] = table([{ t: 'mordorTroll', side: 'evil', x: 10, y: 9 }, { t: 'captainOfRohan', side: 'good', x: 11.6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 10, y: 10.8 }]);
  troll.T = { ...troll.T, rules: [...troll.T.rules, 'Monstrous Charge'] };
  cap.x = troll.x + troll.r + cap.r; man.x = troll.x; man.y = troll.y + troll.r + man.r;
  const a = C.strikesOf(troll, [cap]);
  troll.charged = true;
  eq(C.strikesOf(troll, [cap]), a + 1, 'one more Strike after a Charge');
  const o = MO.brutalOptions(troll, [cap, man]);
  truthy(o && o.rend.length === 2 && o.hurl.length === 2 && o.barge, 'Rend, Hurl and Barge offered');
  troll.prone = true; eq(MO.brutalOptions(troll, [cap, man]), null, 'not while Prone (FAQ)'); troll.prone = false;
  load(3, 3, 2, 6);
  const R1 = drive(MO.rendSeq(troll, cap, 4)).value;
  eq([R1.need, R1.wounds], [[3], 3], 'Rend: Strength 7 against Strength 4, 3+');
  const md = MO.monstrousDown([troll], [cap, man]);
  eq(md.down.length, 2, 'Monstrous Charge knocks the weaker losers Prone');
});
check('Monsters: a free Strike at each model Supporting the one it slays; Barge sends the losers 3″ (p. 89–90)', () => {
  const [troll, man, spear] = table([{ t: 'mordorTroll', side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11.6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 12.6, y: 9 }]);
  man.x = troll.x + troll.r + man.r; spear.x = man.x + 2 * man.r;
  const c = [troll, man]; c.sup = [spear]; c.via = new Map();
  eq(MO.supportersOf(c, man), [spear], 'the supporter behind it');
  const from = { x: man.x, y: man.y };
  const B = MO.barge(troll, c);
  truthy(B.moves.length === 2 && Math.hypot(man.x - from.x, man.y - from.y) > 2.9, 'both pushed 3″ away');
});
check('Hurl: D3 + the Strength difference, the Hurled model lands Prone by the target, which takes a Strength 6 hit (p. 91)', () => {
  const [troll, man, cap] = table([{ t: 'mordorTroll', side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11.6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 14, y: 12 }]);
  load(6, 6, 6, 1, 1, 1);   // D3 3, Intelligence 12, hits: 1, 1 on the Hurled model, 1 on the target
  const H = drive(MO.hurlSeq(troll, man), [() => cap]).value;
  eq([H.dist, H.target], [3 + troll.s - man.s, cap], 'distance and target');
  truthy(man.prone && cap.prone && R.touching(man, cap), 'both Prone, in base contact');
  eq(H.hits.length, 3, 'two hits and one hit');
});

check('Fly: over models, terrain and Control Zones; no landing in a wood or in a Control Zone without a Charge (p. 124)', () => {
  const [man, orc] = table([{ t: 'warriorOfRohan', side: 'good', x: 4, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 7, y: 9 }], { terrain: [{ k: 'rock', x: 5.5, y: 6, w: 0.8, h: 2 }, { k: 'brush', x: 12, y: 2, w: 3, h: 3 }] });
  eq(R.validateMove(man, { x: 10, y: 9 }, 6).ok, false, 'on foot: the Orc and its Control Zone are in the way');
  man.T = { ...man.T, rules: ['Fly'] };
  eq(R.validateMove(man, { x: 10, y: 9 }, 12).ok, true, 'flying: straight over');
  eq(R.validateMove(man, { x: 8.2, y: 9 }, 12).ok, false, 'not landing in its Control Zone without a Charge');
  eq(R.validateMove(man, { x: 13.5, y: 3.5 }, 12).ok, false, 'not in a wood');
  truthy(R.chargeSpot(man, orc, 12), 'it may Charge');
});

/* ---------- Advanced rules (p. 132–136) ---------- */
check('Water: Shallow Water slows infantry, not Cavalry; Deep Water takes a Swim Test (1 drowns, 2–5 half the Move, 6 all) (p. 132)', () => {
  const water = [{ k: 'water', x: 8, y: 0, w: 4, h: 18, shallow: true }];
  const [man] = table([{ t: 'warriorOfRohanBow', side: 'good', x: 6, y: 9 }], { terrain: water });
  const v = R.validateMove(man, { x: 10, y: 9 }, 10);
  truthy(v.ok && v.cost > 5, `wading costs double (${v.cost && v.cost.toFixed(1)}″)`);
  G().terrain = [{ k: 'water', x: 8, y: 0, w: 4, h: 18, deep: true }];
  eq(R.validateMove(man, { x: 10, y: 9 }, 6).ok, false, 'Deep Water: not a normal move');
  const X = TR.planCross(man, { x: 10, y: 9 });
  truthy(X && X.ok && X.kind === 'swim', 'a Swim Test at the edge');
  load(3);
  const roll = drive(TR.crossTestSeq(man, X)).value;
  const before = R.remaining(man);
  const A = TR.applyCross(man, X, roll);
  truthy(A.result === 'go' && man.swum && R.remaining(man) < before / 2 + 0.6, 'a 3: half the remaining Move');
  truthy(R.validateMove(man, { x: man.x + 1, y: 9 }, R.remaining(man)).ok, 'it swims on');
  truthy(/Deep Water/.test(R.shooterReason(man) || ''), 'no shooting from Deep Water');
  man.swum = false;
  truthy(TR.needsSwim(man), 'a Swim Test as it Activates in Deep Water');
  load(1); eq(TR.applySwim(man, drive(TR.swimSeq(man)).value), 'sink', 'a 1 drowns');
  eq(R.alive(man), false, 'removed');
});
check('Night: models see 12″ (Cave Dwellers further), shots in the dark +1 To Wound (p. 136)', () => {
  const [bow, orc] = table([{ t: 'warriorOfRohanBow', side: 'good', x: 2, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 18, y: 9 }]);
  truthy(R.shotInfo(bow, orc).ok, 'by day: in range');
  G().m.night = true;
  eq(R.shotInfo(bow, orc).rule, 'night', 'at night: too dark at 15″');
  orc.x = 12;
  truthy(R.shotInfo(bow, orc).ok && R.darkBonus(orc) === 1, 'within 12″, +1 To Wound');
  orc.T = { ...orc.T, rules: ['Cave Dweller'] };
  eq(R.darkBonus(orc), 0, 'no bonus against a Cave Dweller');
  G().m.night = false;
});
check('Sentries: the chart before they move, no shooting until the alarm, which a nearby enemy raises (p. 135)', () => {
  const [s, man] = table([{ t: 'urukHaiCrossbow', side: 'evil', x: 10, y: 9, sentry: true }, { t: 'warriorOfRohan', side: 'good', x: 14.5, y: 9 }]);
  truthy(/Sentry/.test(R.shooterReason(s) || ''), 'no shooting while on watch');
  load(1); eq(ADV.sentryRoll(s).who, null, 'a 1: it does not move');
  load(2); eq(ADV.sentryRoll(s).who, 'foe', 'a 2: the other player moves it');
  load(6); eq(ADV.sentryRoll(s).lim, R.moveVal(s), 'a 6: its whole Move');
  eq(ADV.alarmCheck().length, 0, 'no alarm 3.5″ away');
  man.x = 12;
  eq(ADV.alarmCheck()[0].why, 'near', 'within 3″: the alarm');
  truthy(!ADV.isSentry(s), 'and it acts normally');
});

const run1 = gen => drive(gen).value;
const fireAt = (e, t) => { const n = run1(SG.siegeAimSeq(e, t)); return Array.from({ length: n }, () => run1(SG.siegeShotSeq(e, t))); };
// A Siege Engine at (4, 9) facing east, with its crew in base contact (above and below it).
function engine(t, foes, crew = true) {
  const T = ARMY_TYPES[t], r = T.base / 50.8, list = [{ t, T, side: 'good', x: 4, y: 9 }];
  if (crew) T.crew.forEach(([k], i) => list.push({ t: k, T: ARMY_TYPES[k], side: 'good', x: 4, y: 9 + (i % 2 ? 1 : -1) * (r + 0.52) + (i > 1 ? 0.3 : 0), ...(i > 1 ? { x: 4 - r - 0.52 } : {}) }));
  return table([...list, ...foes]);
}
check('Siege Engines: crew in base contact to fire, range, Arc of Sight and turning −1, no Charges at one (p. 140–147)', () => {
  let U = engine('isengardAssaultBallista', [{ t: 'mordorOrc', side: 'evil', x: 20, y: 9 }], false);
  truthy(/needs 2 crew/.test(SG.siegeWhy(U[0], U[1]) || ''), 'no crew: it cannot fire');
  U = engine('isengardAssaultBallista', [{ t: 'mordorOrc', side: 'evil', x: 20, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 10, y: 9 }]);
  const [e] = U, far = U.at(-2), near = U.at(-1);
  eq(SG.crewAt(e).length, 2, 'two crew in base contact');
  eq(SG.siegeWhy(e, far), null, 'in range and in its Arc of Sight');
  truthy(/out of its range/.test(SG.siegeWhy(e, near) || ''), 'closer than its 12″ minimum');
  far.y = 17; truthy(!SG.inArc(e, far), 'off to the side: outside the 45° arc');
  eq(SG.siegeWhy(e, far) && /Arc/.test(SG.siegeWhy(e, far)), true, 'and two crew cannot turn a Large engine');
  U = engine('mordorSiegeBow', [{ t: 'warriorOfRohan', side: 'evil', x: 15, y: 15 }]);
  eq(SG.siegeWhy(U[0], U.at(-1)), null, 'two crew turn a Small engine');
  eq(SG.siegeHitNeed(U[0], true), Math.min(6, U[1].sh + 1), 'turning it: −1 To Hit');
});
check('Siege Engines: a wounded Battlefield Target is slain; a scatter of 2–5 lands on another model of its side (p. 144–145)', () => {
  let U = engine('isengardAssaultBallista', [{ t: 'warriorOfRohan', side: 'evil', x: 20, y: 9 }, { t: 'warriorOfRohan', side: 'evil', x: 21.5, y: 9 }]);
  load(6, 6, 6);   // To Hit, Scatter (dead on), To Wound
  S.siegeFire(U[0], U.at(-2));
  truthy(!R.alive(U.at(-2)), 'the target is slain by one wound');
  truthy(U[1].shot && U[2].shot, 'the crew firing it do not shoot themselves');
  U = engine('isengardAssaultBallista', [{ t: 'warriorOfRohan', side: 'evil', x: 20, y: 9 }, { t: 'warriorOfRohan', side: 'evil', x: 21.5, y: 9 }]);
  load(6, 3, 1);
  run1(SG.siegeAimSeq(U[0], U.at(-2)));
  const d = drive(SG.siegeShotSeq(U[0], U.at(-2)), [q => q.list[0]]);
  truthy(d.log.includes('scatter'), 'a 3: the other player picks');
  eq(d.value.target, U.at(-1), 'its own model within 6″');
  truthy(U.at(-1).prone && !U.at(-2).prone, 'the actual target is knocked Prone');
  U = engine('mordorSiegeBow', [{ t: 'mordorOrc', side: 'evil', x: 14, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 15.2, y: 9 }]);
  const [orc, behind] = U.slice(-2);
  load(6, 6, 1, 6, 6);   // To Hit, Scatter, no wound, flung 6″, the Strength 5 hit on the Orc behind it wounds
  const f = fireAt(U[0], orc)[0].flung;
  truthy(f && f.d > 5 && f.over.includes(behind) && f.wounds[0].W.ok, 'Piercing Shot: flung back over the Orc behind it, a Strength 5 hit');
  truthy(orc.prone && behind.prone && orc.x > behind.x, 'both Prone, and it lands past it');
});
check('Siege Engines: Area Effect, Rapid Fire, and an enemy in base contact disables one in the End phase (p. 146–147)', () => {
  let U = engine('mordorWarCatapult', [{ t: 'warriorOfRohan', side: 'evil', x: 20, y: 9 }, { t: 'warriorOfRohan', side: 'evil', x: 21.3, y: 9.5 }]);
  load(6, 6, 6, 6);   // Hit, Scatter, To Wound the target, To Wound the one within 2″
  const sh = fireAt(U[0], U.at(-2))[0];
  eq(sh.area.map(a => a.t), [U.at(-1)], 'Strength 5 hits within 2″');
  truthy(U.at(-1).prone, 'and knocked Prone');
  U = engine('gondorAvengerBoltThrower', [{ t: 'mordorOrc', side: 'evil', x: 20, y: 9 }]);
  load(4, 6, 6);   // D6 shots: 4; the first hits and wounds
  const v = fireAt(U[0], U.at(-1));
  truthy(v.length === 4 && v[0].scatter == null && v[0].rolls[0].W.ok, 'Rapid Fire: 4 shots, no Scatter');
  load(3, 6, 6);
  S.siegeFire(U[0], U.at(-1)); truthy(!R.alive(U.at(-1)), 'the volley slays it, and stops');
  U = engine('mordorSiegeBow', [{ t: 'warriorOfRohan', side: 'evil', x: 4 + 0.79 + 0.52, y: 9 }]);
  U[0].side = 'evil'; U.at(-1).side = 'good';   // a good warrior next to an evil engine
  U[1].side = U[2].side = 'evil';
  eq(SG.disableCheck().map(x => x.e), [U[0]], 'disabled: an enemy that did nothing but Move');
  truthy(!R.alive(U[0]), 'removed');
});
check('Chariots: a Chariot Charge runs on through a slain model and stops, Charging, at one that stands; +1 Attack (p. 152–153)', () => {
  const T = ARMY_TYPES.khandishKingInAChariot;
  const [k, a, b] = table([{ t: 'khandishKingInAChariot', T, side: 'evil', x: 3, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11.5, y: 9 }]);
  load(6, 6, 1, 1);   // two Impact Hits on the first Warrior (both wound), two on the second (none)
  const out = S.ramp(k, { x: 20, y: 9 });
  truthy(!R.alive(a), 'the first Warrior is slain');
  eq(out.stop, b, 'it stops at the second, which stands');
  truthy(R.engaged(k) && k.charged, 'in base contact, Charging');
  eq(C.strikesOf(k, [b]), k.a + 1, '+1 Attack after its Charge');
  k.prone = true; eq(k.prone, false, 'never knocked Prone');
});
check('Chariots: Immovable Object, and a Hero whose Chariot is destroyed is Knocked Flying on foot (p. 153)', () => {
  const T = ARMY_TYPES.khandishKingInAChariot;
  const [k, w] = table([{ t: 'khandishKingInAChariot', T, side: 'evil', x: 6, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 6 + 1.18 + 0.5 + 0.02, y: 9 }]);
  const kx = k.x, wx = w.x, res = C.backAwayAll([w], [k], C.contactsIn([w], [k]));
  truthy(k.x === kx && w.x > wx && res.away.includes(w), 'the Chariot lost and stays: the winner Backs Away');
  k.w = 1;
  eq(C.woundPart(k, 'rider'), 'mountSlain', 'its last Wound destroys the Chariot');
  load(1);   // the Strength 3 hit does not wound
  drive(C.thrownRiderSeq(k));
  truthy(R.alive(k) && !k.T.chariot && k.w === ARMY_TYPES[T.foot].w && k.prone, `the King on foot with his own Wounds, Prone (alive ${R.alive(k)}, chariot ${!!k.T.chariot}, w ${k.w}/${ARMY_TYPES[T.foot].w}, prone ${k.prone})`);
});

check('War Beasts: a Trample of the full Move, the Commander counts for the Break Point, Charged by weaker models it Tramples them (p. 148–151)', () => {
  const T = ARMY_TYPES.mumakWithHaradrimCommander;
  let [m, o1, o2] = table([{ t: 'mumakWithHaradrimCommander', T, side: 'evil', x: 4, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 9.5, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 9.5, y: 14 }]);
  eq(R.modelCount(m), 2, 'the Mûmak and its Commander: two models');
  load(6, 1, 1);   // the Impact Hits on the Warrior: one wounds
  const out = S.ramp(m, { x: 20, y: 9 });
  truthy(!R.alive(o1) && out.d > 7.9, 'the Warrior is trampled, and it goes its full 8″');
  [m, o1, o2] = table([{ t: 'mumakWithHaradrimCommander', T, side: 'evil', x: 8, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8 - 2.83 - 0.52, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 8 + 2.83 + 0.52, y: 9 }]);
  eq(BE.chargedBy(m), [o1, o2], 'Charged by two Warriors (Strength 3 + 3, less than 10): it may Trample them');
});
check('War Beasts: a Wound means a Courage Test on the Commander\'s Courage; a failure, a Stampede; slain, its Commander falls (p. 151)', () => {
  const T = ARMY_TYPES.mumakWithHaradrimCommander;
  const [m] = table([{ t: 'mumakWithHaradrimCommander', T, side: 'evil', x: 12, y: 9 }]);
  load(1, 1);
  const r = drive(BE.stampedeSeq(m)).value;
  truthy(!r.ok && m.stampede && r.need === m.cmd.c, 'a 2 against the Commander\'s Courage: it will Stampede');
  load(1, 1, 1);   // the falls do not wound
  m.w = 1; S.wound(m, 'rider', null);
  const c = G().units.find(u => u.t === T.cmd);
  truthy(!R.alive(m) && c && R.alive(c) && c.prone, 'slain: the Commander lies Prone beside it');
});

check('The One Ring: Invisible (no shots, through models, Fight Value halved), Sauron\'s Will, taking it off, My Precious (p. 111, 127)', () => {
  const T = ARMY_TYPES.frodoBaggins;
  const [f, bow, orc] = table([{ t: 'frodoBaggins', T, side: 'good', x: 10, y: 9 }, { t: 'mordorOrcBow', side: 'evil', x: 18, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 10 + 0.49 + 0.49 + 0.02, y: 9 }]);
  truthy(ADV.ringbearer(f) && !ADV.canWearRing(f), 'Frodo carries the Ring, but cannot put it on while Engaged');
  ADV.putOnRing(f);
  truthy(R.invisible(f) && !R.shotInfo(bow, f).ok, 'Invisible: it cannot be shot');
  eq(H.fvOf(orc), Math.ceil(orc.f / 2), 'fighting it alone, the Orc\'s Fight Value is halved');
  truthy(R.validateMove(f, { x: 13, y: 9 }, 4).ok, 'it moves through the Orc');
  load(2); drive(ADV.sauronSeq(f), [0]);
  truthy(f.sauron, "Sauron's Will: a 2, the enemy Moves it");
  load(6, 6); drive(ADV.removeRingSeq(f));
  truthy(!f.ringOn, 'a Courage Test passed: the Ring comes off');
  ADV.putOnRing(f); bow.dead = true; orc.dead = true;
  const g = table([{ t: 'frodoBaggins', T, side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 20, y: 9 }])[0];
  ADV.putOnRing(g);
  eq(ADV.myPrecious(), [g], 'the last of its army, wearing the Ring: lost');
});

// A fortress wall across a 24 × 18 table, its face at y = 10 (the attacker comes from smaller y).
const fortWall = () => [{ k: 'plateau', x: 0, y: 10, w: 24, h: 2, z: FO.WALL_Z, sheer: true, fort: true, face: 'n' }];
check('Sieges: the wall cannot be Climbed; a gate takes no Duel Roll, two To Wound rolls a Strike, and no shot under Strength 5 (p. 158–159)', () => {
  const [orc, g, bow] = table([{ t: 'mordorOrc', side: 'evil', x: 6, y: 9 }, { t: 'fortressGate', T: FO.GATE, side: 'good', x: 12, y: 8 }, { t: 'mordorOrcBow', side: 'evil', x: 12, y: 2 }], { terrain: fortWall() });
  truthy(!TR.planCross(orc, { x: 6, y: 11 }).ok, 'no Climbing a fortress wall');
  truthy(!R.engaged(g) && R.modelCount(g) === 0, 'a gate is never Engaged and is not counted');
  truthy(/Strength 5/.test(R.shotInfo(bow, g).why || ''), 'an Orc bow cannot damage it');
  orc.x = 12 - 2 - 0.49 - 0.02; orc.y = 8;
  load(6, 6, 6, 6);   // one Strike (Attacks 1): two To Wound rolls, 6/6 against Defence 10
  const res = drive(FO.gateSeq(g)).value;
  eq(res.length && res[0].R.rollsN, 2, 'two To Wound rolls for its one Strike');
});
check('Sieges: a Siege Ladder goes up at the wall; a Charge up it; a loser falls on 1–3; pushing it down (p. 160–161)', () => {
  const [orc, man, mate] = table([{ t: 'mordorOrc', side: 'evil', x: 6, y: 10 - 0.49 - 0.05 }, { t: 'warriorOfRohan', side: 'good', x: 6, y: 10.51 }, { t: 'warriorOfRohan', side: 'good', x: 7.01, y: 10.51 }], { terrain: fortWall() });
  orc.carry = 'ladder';
  eq(R.moveVal(orc), orc.mv / 2, 'carrying a ladder alone: half Move');
  const L = FO.raiseLadder(orc);
  truthy(L && !orc.carry && FO.siegeLadders().length === 1, 'against the wall: the ladder goes up');
  orc.y = 5;
  const c = R.chargeSpot(orc, man, 10);
  truthy(c && c.over && c.over.T === L, 'a Charge up the ladder at the defender at its top');
  S.applyMove(orc, c, c.cost);
  truthy(R.engaged(man) && R.engaged(orc), 'Engaged across the battlements');
  const B = C.barrierOf([orc, man]);
  eq(B && B.mode, 'ladder', 'a fight at the top of a ladder');
  load(2);
  eq(FO.afterLadder(B, 'good').falls.map(f => f.fell), [true], 'the attacker lost: a 2, it falls');
  orc.over = null; orc.y = 4;
  truthy(FO.pushable(man) === L, 'nobody at the top: the defender may push it');
  load(3);   // 3 + 1 for the friend beside it
  truthy(drive(FO.pushSeq(man, L)).value.ok && !FO.siegeLadders().length, 'pushed down on 3 + 1');
});

check('Scenarios: Objective Markers, control by numbers, Supply Markers destroyed in the End phase, escaping, Reinforcements (Rules Manual: Scenarios)', () => {
  const [a, b, c] = table([{ t: 'warriorOfRohan', side: 'good', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 11.5, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 12.5, y: 11 }]);
  G().objectives = [{ id: 0, x: 11, y: 10.5, r: SC.OBJ_R }];
  truthy(!R.validateMove(a, { x: 11, y: 10.4 }, 6).ok, 'no model ends its move on an Objective Marker');
  const n = SC.near(G().objectives[0], 3);
  eq([n.good, n.evil, SC.control(n, 'good', [1, 2, 3]), SC.control(n, 'evil', [1, 2, 3])], [2, 1, 2, 0], 'twice as many within 3″: 2 Victory Points');
  eq(SC.control({ good: 3, evil: 1 }, 'good', [4, 8, 12, 'x3']), 12, 'Hold Ground: three times as many, 12');
  G().objectives = [{ id: 0, side: 'evil', x: 10, y: 9 + 0.49 + 0.49 + 0.02, r: SC.OBJ_R }];
  G().m.scen = 'supplies';
  eq(SC.destroySupplies().map(d => d.by), [a], 'a Warrior in base contact that did nothing but Move destroys the Supply Marker');
  G().m.scen = 'recon'; a.y = 0.55;
  truthy(SC.escapes(a) && SC.escaped('good') === 1 && R.modelsAlive('good') === 2, 'touching the enemy edge: it escapes, and still counts');
  b.reserve = true; b.x = -5;
  eq(R.alive(b), false, 'a Warband yet to arrive is not on the table');
  const placed = SC.arrive({ captain: null, models: [b] }, { x: 12, y: G().H });
  truthy(placed[0] === b && R.alive(b) && b.y > G().H - 2, 'it arrives at the south edge');
  G().m.scen = null; G().objectives = null;
});

check('Last Stand: a Hero of Legend who is the General passes its first Broken army Courage Test (p. 152)', () => {
  const [cap] = table([{ t: 'captainOfRohan', side: 'good', x: 4, y: 4 }, { t: 'mordorOrc', side: 'evil', x: 20, y: 4 }]);
  cap.T = { ...cap.T, tier: 'Legend' }; cap.general = true; G().align = { good: 'good', evil: 'evil' };
  eq(H.autoCourage(cap) && H.autoCourage.length >= 0 && cap.lastStand, true, 'the first test passes');
  eq(H.autoCourage(cap), null, 'only the first');
  G().align = null;
});

check('Named wargear: Glamdring +1 Strength, Andúril 4+ at worst, Narya re-rolls a failed Fate Roll (army lists)', () => {
  const [cap, troll] = table([{ t: 'captainOfRohan', side: 'good', x: 10, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 12, y: 9 }]);
  const s0 = H.strikeS(cap);
  cap.T = { ...cap.T, gear: ['Glamdring'] };
  eq(H.strikeS(cap), s0 + 1, 'Glamdring');
  cap.T = { ...cap.T, gear: ['Andúril, Flame of the West'] };
  load(4); eq(drive(C.strikeSeq(cap, troll, 1, false)).value.need, [4], 'Andúril against Defence 7');
  cap.T = { ...cap.T, gear: ['Narya'] }; cap.fate = 1;
  load(2, 5); const F = drive(D6.fateSeq(cap), [true]).value;
  truthy(F.saved && F.rolls[0].re, 'Narya: the 2 is re-rolled');
});

/* ---------- Audit fixes (14.10.2026) ---------- */
const AI = await import('../js/engine/ai.js');
check('Spears: a model gains Support from only one spear-armed model; a pike through a pike gives the second (errata p. 104, p. 105)', () => {
  // F1 and F2 fight E1 and E2; S1 and S3 can both only reach F1, S2 stands behind F2.
  const [f1, f2, e1, e2, s1, s2, s3] = table([{ t: 'warriorOfMinasTirith', side: 'good', x: 10, y: 9 }, { t: 'warriorOfMinasTirith', side: 'good', x: 10, y: 10 },
    { t: 'mordorOrc', side: 'evil', x: 9, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 9, y: 10 },
    { t: 'warriorOfMinasTirithSpear', side: 'good', x: 11, y: 9 }, { t: 'warriorOfMinasTirithSpear', side: 'good', x: 11, y: 10 }, { t: 'warriorOfMinasTirithSpear', side: 'good', x: 10.5, y: 8.134 }]);
  const [c] = C.assignSupport([[f1, f2, e1, e2]]);
  eq(c.sup.length, 2, 'Supporters: one for each fighter');
  truthy(c.sup.includes(s2) && (c.sup.includes(s1) !== c.sup.includes(s3)), 'S2 and one of S1, S3');
  // A line of pikes: P1 behind the fighter, P2 and P3 both behind P1; only one of them Supports through it.
  const [p0, e, p1, p2, p3] = table([{ t: 'manAtArmsOfDolAmroth', side: 'good', x: 10, y: 9 }, { t: 'mordorOrc', side: 'evil', x: 9, y: 9 },
    { t: 'manAtArmsOfDolAmroth', side: 'good', x: 11, y: 9 }, { t: 'manAtArmsOfDolAmroth', side: 'good', x: 12, y: 9 }, { t: 'manAtArmsOfDolAmroth', side: 'good', x: 11.5, y: 9.866 }]);
  const [d] = C.assignSupport([[p0, e]]);
  eq(d.sup.length, 2, 'Supports for the pike fighter');
  truthy(d.sup.includes(p1) && d.via.get(d.sup.find(s => s !== p1)) === p1, 'P1, and one pike through it');
});
check('Cavalry and Break Points: a slain rider counts as a casualty though its mount stays (p. 69)', () => {
  const [wr] = table([{ t: 'isengardWargRider', side: 'evil', x: 10, y: 9 }, { t: 'warriorOfRohan', side: 'good', x: 20, y: 9 }]);
  wr.dead = true;
  load(6, 6);
  const S2 = C.separateMount(wr);
  truthy(S2 && S2.stays && R.alive(S2.u), 'the Warg stays as a model of its own');
  eq(R.casualties('evil'), 1, 'Casualties of the Evil side');
});
check('Cavalry Charge: no Extra Attack or Knock to the Ground against a model defending a Barrier (cavalry/#fighting-across-barriers)', () => {
  const [rider, man] = table([{ t: 'riderOfRohan', side: 'good', x: 10, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 12, y: 9 }]);
  rider.charged = true;
  truthy(C.chargeBonus(rider, [man]), 'the bonus in the open');
  rider.over = { t: man.id, T: { k: 'wall' } };
  truthy(!C.chargeBonus(rider, [man]), 'no bonus over the Barrier it defends');
});
check('The computer Jumps a hedge that blocks its way, with the Jump Test (p. 33)', () => {
  const [w, h] = table([{ t: 'warriorOfRohan', side: 'good', x: 9, y: 9 }, { t: 'hillTribesman', side: 'evil', x: 18, y: 9 }],
    { terrain: [{ k: 'hedge', x: 11, y: 0, w: 0.6, h: 18, ht: 1 }] });
  const act = AI.aiPlanMove(w);
  truthy(act && act.cross && act.cross.kind === 'jump', `a Jump planned (got ${JSON.stringify(act && (act.cross ? act.cross.kind : act.p))})`);
  load(3);
  S.COMPUTER.move('good');
  truthy(w.x > 11.6 && w.crossTried && w.done, `across the hedge, Move over (x ${w.x.toFixed(2)})`);
  eq(h.x, 18, 'the enemy stays');
});

/* ---------- Battles ---------- */
const games = +process.argv[2] || 100;
const counts = {}, results = {};
let errors = 0, turns = 0;
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  try {
    S.startGame(SANDBOX, { mi: 0, broken: true, shielding: true, standFast: true, heroics: H.HEROIC_KEYS });
    const count = q => { if (q.k === 'declare') { const a = aiAnswer(q); if (a) counts[a.k] = (counts[a.k] || 0) + 1; return a === null ? null : a; } return undefined; };
    const r = S.playGame({ good: { answer: count }, evil: { answer: count } }, 15);
    results[r.r] = (results[r.r] || 0) + 1; turns += r.turn;
  } catch (e) { errors++; if (errors <= 3) console.log(`battle ${i}: ${e.stack.split('\n').slice(0, 4).join(' | ')}`); }
}
console.log(`\n${games} sandbox battles in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${JSON.stringify(results)}, average ${(turns / Math.max(1, games - errors)).toFixed(1)} turns, ${errors} errors.`);
console.log(`Heroic Actions the computer declared: ${Object.entries(counts).map(([k, n]) => `${H.HEROIC[k].n} ${n}`).join(', ') || 'none'}.`);
console.log(`${passed} checks passed, ${failed} failed.`);
if (failed || errors) process.exitCode = 1;
