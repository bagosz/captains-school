// The training missions. Each one teaches one main rule (at most one or two related rules beside it) with
// real 2024 profiles: Rohan and Gondor against the Usurpers of Edoras, Isengard and Mordor.
// rules: the rule cards in the briefing (new rules, plus reminders); also: rules the mission introduces without a card.
// A mission only uses rules taught so far; scenario rules switch off the rest (noShoot, noCharge, fixed priority).
// priority: 'good' gives the player Priority every turn; { 1: 'good' } only in the turns listed; missing = rolled.
import { G } from '../state.js';
import { fmt } from '../util.js';
import { alive, sideAlive, engaged, alignOf, sideOfAlign } from '../engine/rules.js';
import { rectDist, toLocal, fromLocal } from '../engine/geometry.js';
import { near, holdGoal, OBJ_R, escaped } from '../engine/scenarios.js';
import { stores, burning, burningCount, touches, keptAside } from '../engine/narrative.js';
import { TYPES } from './units.js';

function stdCheck(atEnd) {
  if (!sideAlive('evil').length) return 'win';
  if (!sideAlive('good').length) return 'lose';
  if (atEnd && G.turn >= this.limit) return 'lose';
  return null;
}
function stdStatus() { return `Your models: ${sideAlive('good').length} · enemy models: ${sideAlive('evil').length}`; }
const row = (t, side, xs, y, extra) => xs.map(x => Object.assign({ t, side, x, y }, extra || {}));
// n points on a circle of radius r round (cx, cy), the first at deg degrees.
const ring = (cx, cy, r, n, deg = 0) => Array.from({ length: n }, (_, k) => { const a = (deg + k * 360 / n) * Math.PI / 180; return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)]; });
// The First Assault: the throwing spears fight only as spears (no thrown weapon).
const SPEARS_ONLY = { ...TYPES.warriorOfRohanSpears, thrown: null, full: 'Warrior of Rohan with shield and throwing spears (as spears)' };
// Last Stand of the Princes: the Evil side (p. 13) on two arcs round the Good side, Wulf on one, Targg on the other.
const LAST_STAND_EVIL = ['wulf', 'generalTargg', 'hillTribesmanTwoHanded', 'hillTribesmanBow', 'hillTribesmanSpear', 'hillTribesmanBrand', 'hillTribesmanBow', 'hillTribesman',
  'hillTribesmanTwoHanded', 'hillTribesmanBow', 'hillTribesmanShield', 'hillTribesmanSpear', 'hillTribesmanBow', 'hillTribesmanBrandShield',
  'hillTribesmanTwoHanded', 'hillTribesmanBow', 'hillTribesmanSpear', 'hillTribesmanBrand', 'hillTribesmanBow', 'hillTribesman',
  'hillTribesmanTwoHanded', 'hillTribesmanBow', 'hillTribesmanShield', 'hillTribesmanSpear', 'hillTribesmanBow', 'hillTribesmanBrandShield'];
// Torch the City: the two Storehouses, turned as on the map (p. 11). The Good models' spots are given as for an unturned
// Storehouse and turn with the one they guard, so they stay within 3″ of it.
const E3_STORES = [{ k: 'building', house: true, store: true, x: 25, y: 8, w: 6, h: 4.5, a: -10 }, { k: 'building', house: true, store: true, x: 25, y: 27.5, w: 6, h: 4.5, a: -30 }];
const byStore = u => ({ ...u, ...fromLocal(E3_STORES[u.y < 20 ? 0 : 1], u.x, u.y) });
// The Battle of Edoras by alignment: the table side commanding Rohan (Good) and the Hill Tribes (Evil).
const GOOD = () => sideOfAlign('good'), EVIL = () => sideOfAlign('evil');
// A Battle of Edoras mission played from the Evil side: the whole table turned 180° (models, houses, markers), so the
// player still deploys at the bottom; the player's side ('good' on the table) is the booklet's Evil side (G.align), the
// briefing comes from m.evil, Priority in turn 1 still goes to Good (Rohan), and check()'s answer, given for Rohan,
// is turned round for the player. Turning a piece 180° keeps its angle (a rectangle).
export function flipSide(m) {
  const [W, H] = m.board, sw = s => (s === 'good' ? 'evil' : 'good'), xy = o => ({ ...o, x: +(W - o.x).toFixed(2), y: +(H - o.y).toFixed(2) });
  const f = Object.create(m), E = m.evil || {};
  return Object.assign(f, {
    flipped: true, align: { good: 'evil', evil: 'good' },
    units: m.units.map(u => ({ ...xy(u), side: sw(u.side) })),
    terrain: m.terrain.map(T => ({ ...T, x: +(W - T.x - T.w).toFixed(2), y: +(H - T.y - T.h).toFixed(2), ...(T.ox != null ? { ox: W - T.ox, oy: H - T.oy } : {}) })),
    objectives: m.objectives && m.objectives.map(xy),
    priority: typeof m.priority === 'string' ? sw(m.priority) : m.priority && Object.fromEntries(Object.entries(m.priority).map(([k, v]) => [k, sw(v)])),
    intro: E.intro || m.intro, goal: E.goal || m.goal, tip: E.tip || m.tip, debrief: E.debrief || m.debrief,
    check(atEnd) { const r = m.check.call(this, atEnd); return r === 'win' ? 'lose' : r === 'lose' ? 'win' : r; },
  });
}
// The side a player has picked for the Battle of Edoras ('good': Rohan, 'evil': the Hill Tribes), kept in the browser.
const SIDE_KEY = 'cs-edoras-side';
export function edorasSide() { try { return localStorage.getItem(SIDE_KEY) === 'evil' ? 'evil' : 'good'; } catch (e) { return 'good'; } }
export function setEdorasSide(v) { try { localStorage.setItem(SIDE_KEY, v); } catch (e) { /* the choice lasts this game only */ } }
// Mission i as the player will play it: a Battle of Edoras mission from the side they picked.
export const asPicked = i => (MISSIONS[i].series === 'E' && edorasSide() === 'evil' ? flipSide(MISSIONS[i]) : null);
// A spot just outside building T on the side facing u, spread along that wall by the model's id (Torch the City).
function wallSpot(u, T) {   // worked out in T's own frame when the building is turned
  const U = toLocal(T, u.x, u.y), at = (x, y) => fromLocal(T, x, y);
  const cx = Math.max(T.x, Math.min(T.x + T.w, U.x)), cy = Math.max(T.y, Math.min(T.y + T.h, U.y)), d = u.r + 0.08, f = ((u.id * 0.618) % 1) * 0.8 + 0.1;
  if (cx === T.x || cx === T.x + T.w) return at(cx + (cx === T.x ? -d : d), T.y + f * T.h);
  return at(T.x + f * T.w, cy + (cy === T.y ? -d : d));
}

export const MISSIONS = [
  {
    chapter: 'Basics',
    title: 'The Scout', lesson: 'Moving, Difficult Terrain, Control Zones', board: [30, 20], limit: 8, alwaysCZ: true, priority: 'good', exitX: 27,
    noShoot: true, noCharge: 'The Ranger must slip past unseen, so he does not Charge or fight in this mission.',
    intro: 'A Ranger of Gondor carries a warning to Edoras. Two Hill Tribesmen stand guard on the road. They will not move, but no model can enter their Control Zones without a fight, and the Ranger must slip past unseen: he does not shoot or fight in this mission.',
    goal: 'Get the Ranger of Gondor into the EXIT area on the right by the end of turn 8.',
    tip: 'The brush costs double, so going around can be quicker than cutting through. You can move in several legs, for example around a sentry.',
    rules: ['move', 'cz', 'terrain'], also: ['profile'],
    terrain: [{ k: 'rock', x: 14, y: 0, w: 3, h: 6 }, { k: 'rock', x: 14, y: 14, w: 3, h: 6 }, { k: 'brush', x: 20, y: 2, w: 4, h: 16 }, { k: 'zone', x: 27, y: 0, w: 3, h: 20, label: 'EXIT' }],
    units: [{ t: 'rangerOfGondor', side: 'good', x: 2, y: 10 }, { t: 'hillTribesman', side: 'evil', x: 9, y: 10, ai: 'sentry', n: 'Sentry' }, { t: 'hillTribesman', side: 'evil', x: 15.5, y: 10, ai: 'sentry', n: 'Sentry' }],
    check(atEnd) { const s = G.units[0]; if (alive(s) && s.x >= 27) return 'win'; if (atEnd && G.turn >= this.limit) return 'lose'; return null; },
    status() { return `Distance to the exit: ${fmt(Math.max(0, 27 - G.units[0].x))}″`; },
    debrief: {
      win: 'Control Zones work like invisible walls: the only way in is a Charge. Difficult Terrain costs double, so the shortest path is not always the fastest.',
      lose: 'You ran out of turns. Use nearly all 6″ every turn, and avoid the brush when going around is shorter than paying double.',
    },
  },
  {
    title: 'Hail of Arrows', lesson: 'Moving and shooting, Roll To Hit, In The Way', board: [36, 20], limit: 8, escapeX: 34, priority: 'good',
    noCharge: 'Your bowmen hold the hill and shoot; they do not Charge in this mission.',
    intro: 'Hill Tribesmen are running along the ridge to tell Wulf where the Rohirrim are. Warriors of Rohan with bows and a Ranger of Gondor have a few turns to stop them.',
    goal: 'Shoot down at least 3 of the 6 Hill Tribesmen before they escape off the right edge.',
    tip: 'Moving makes To Hit 1 worse, and a model that moves more than half its Move (3″) cannot shoot at all. The Ranger has SV 3+, so it hits more often than the Warriors (SV 4+).',
    rules: ['shoot', 'hit', 'itw'],
    terrain: [{ k: 'brush', x: 10.4, y: 10.5, w: 2.7, h: 2 }, { k: 'brush', x: 22.4, y: 10.5, w: 2.7, h: 2 }, { k: 'rock', x: 16.6, y: 10, w: 2, h: 2.4 }, { k: 'zone', x: 34, y: 0, w: 2, h: 20, label: 'ESCAPE' }],
    units: [
      ...[[0.8, 3], [2.6, 4.2], [0.8, 5.4], [2.6, 6.6], [0.8, 7.8], [2.6, 9]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y, ai: 'runner' })),
      ...row('warriorOfRohanBow', 'good', [3, 6.5, 10, 20, 23.5, 27, 30.5], 16.5),
      { t: 'rangerOfGondor', side: 'good', x: 16, y: 16.5 },
    ],
    check(atEnd) {
      const g = G.units.filter(u => u.side === 'evil'), k = g.filter(u => u.dead).length, left = g.filter(alive).length;
      if (k >= 3) return 'win'; if (k + left < 3) return 'lose'; if (atEnd && G.turn >= this.limit) return 'lose'; return null;
    },
    status() { const g = G.units.filter(u => u.side === 'evil'); return `Shot down: ${g.filter(u => u.dead).length} of 3 · escaped: ${g.filter(u => u.gone).length}`; },
    debrief: {
      win: 'A shooter that stands still hits best. After moving up to half its Move it can still shoot, but 1 worse. Brush In The Way halves your chances.',
      lose: 'Too many got away. Shoot from where you stand, pick targets with no brush In The Way, and never move shooters more than 3″.',
    },
  },
  {
    title: 'Armour Matters', lesson: 'The To Wound chart, shooting from behind cover', board: [30, 20], limit: 8, priority: 'good',
    noCharge: 'The river is too deep to cross, so nobody can Charge here.',
    intro: 'At the Fords of Isen a river separates you from the enemy, so neither side can reach the other: this is a pure firefight. Your archers stand behind a low stone wall. Across the water stand three Hill Tribesmen archers (Defence 3) and an Uruk-hai crossbowman (Defence 5, crossbow Strength 4).',
    goal: 'Shoot down all three Hill Tribesmen archers by the end of turn 8. The Uruk-hai does not have to die.',
    tip: 'Hover over a target: the To Wound chart shows your bow (S2) wounds a tribesman on 5+ but an Uruk-hai only on a 6. Its crossbow (S4) wounds you on 4+. Your archers touch the wall, so they shoot over it with no In The Way test, while every enemy shot must get past the wall on a 4+. Stay where you are.',
    rules: ['wound', 'cover'],
    // The wall runs behind the whole line, so every enemy shot crosses it; the archers stand in base contact with it.
    terrain: [{ k: 'water', x: 0, y: 8.5, w: 30, h: 3 }, { k: 'wall', x: 2, y: 12.4, w: 26, h: 0.6 }],
    units: [
      ...row('warriorOfRohanBow', 'good', [5, 9], 13.5), { t: 'rangerOfGondor', side: 'good', x: 15, y: 13.5 }, ...row('warriorOfRohanBow', 'good', [19, 22.5, 26], 13.5),
      { t: 'hillTribesmanBow', side: 'evil', x: 6, y: 4.5 }, { t: 'hillTribesmanBow', side: 'evil', x: 13, y: 3.5 },
      { t: 'urukHaiCrossbow', side: 'evil', x: 18.5, y: 5 }, { t: 'hillTribesmanBow', side: 'evil', x: 24, y: 4.5 },
    ],
    check(atEnd) {
      if (!G.units.some(u => u.t === 'hillTribesmanBow' && alive(u))) return 'win';
      if (!sideAlive('good').length) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Tribesmen archers left: ${G.units.filter(u => u.t === 'hillTribesmanBow' && alive(u)).length} · your shooters: ${sideAlive('good').length}`; },
    debrief: {
      win: 'Strength against Defence decides everything. Your bows wound a Hill Tribesman (D3) on 5+ but an Uruk-hai (D5) only on a 6, while its crossbow (S4) wounds you on 4+. Pick the targets you can actually hurt, and shoot from behind cover: the wall you touch costs you nothing and stops half of the enemy\'s hits.',
      lose: 'Check the To Wound chart before every shot: arrows at the Defence 3 tribesmen, not at the Uruk-hai. Keep your archers touching the wall: it stops about half of the enemy\'s hits, though never all of them.',
    },
  },
  {
    title: 'First Clash', lesson: 'Charging, Duel Roll, Pairing Off', board: [24, 18], limit: 10, priority: 'good',
    intro: 'Four Hill Tribesmen want blood. You have three Warriors of Rohan and a Rohan Royal Guard, whose Fight Value of 4 beats any tribesman\'s 3. When several models touch each other, they are split into separate Combats: you have Priority, so you decide who fights whom.',
    goal: 'Defeat all the Hill Tribesmen.',
    tip: 'To Charge, select your model and click an enemy. Avoid fights where the tribesmen outnumber you. When you split the fights, put two of yours against one tribesman. The Royal Guard (FV 4) wins every tied Duel Roll against FV 3, so it can hold one on its own.',
    rules: ['charge', 'duel', 'pairoff'], also: ['tie', 'backaway', 'rolloff', 'strikes', 'order'],
    terrain: [{ k: 'brush', x: 1, y: 7, w: 4, h: 4 }, { k: 'rock', x: 19.5, y: 7.5, w: 3, h: 3 }],
    units: [
      ...row('warriorOfRohan', 'good', [5, 9.5], 13.5), { t: 'rohanRoyalGuard', side: 'good', x: 14, y: 14 }, { t: 'warriorOfRohan', side: 'good', x: 18.5, y: 13.5 },
      ...row('hillTribesman', 'evil', [6, 10, 14, 18], 4),
    ],
    check: stdCheck, status: stdStatus,
    debrief: {
      win: 'The Duel Roll goes to the highest dice, and ties go to the higher Fight Value. The Royal Guard\'s FV 4 wins every tie against a Hill Tribesman, and Pairing Off lets you put two of yours against one enemy.',
      lose: 'Two tribesmen in one fight roll two dice against your one. Charge, and split the fights, so that you have the numbers in every Combat.',
    },
  },
  {
    title: 'Troll in the Ravine', lesson: 'Multiple combats and Trapped', board: [24, 18], limit: 10, priority: 'good',
    intro: 'A Mordor Troll has FV 7, Strength 7, Defence 7 and four Wounds, two of them already lost to Gondor\'s archers. It holds the dead end of the ravine with the rocks at its back and will not leave it. No Warrior of Minas Tirith can beat it alone. Ten together can.',
    goal: 'Slay the Mordor Troll.',
    tip: 'Bring your warriors up together, just outside its Control Zone, then Charge it with as many as you can in the same turn: every warrior in the fight adds a dice. It has the rocks behind it, so if it loses it cannot Back Away and is Trapped: every Strike against it rolls To Wound twice.',
    rules: ['multi', 'trapped', 'strikes'],
    terrain: [{ k: 'rock', x: 0, y: 0, w: 6.5, h: 6.5 }, { k: 'rock', x: 17.5, y: 0, w: 6.5, h: 6.5 }, { k: 'rock', x: 6.5, y: 0, w: 11, h: 1.7 }],
    units: [...row('warriorOfMinasTirith', 'good', [3, 5, 7, 9, 11, 13, 15, 17, 19, 21], 13), { t: 'mordorTroll', side: 'evil', x: 12, y: 3, ai: 'hold', w: 2 }],
    check: stdCheck,
    status() { const t = G.units.find(u => u.T.monster); return `Troll: ${t.w} of ${t.maxW} Wounds · your warriors: ${sideAlive('good').length}`; },
    debrief: {
      win: 'More models in a fight means more dice, and a Trapped enemy takes double Strikes. That is how infantry brings down monsters.',
      lose: 'One warrior against the troll loses almost every Duel Roll. Move your warriors up together and Charge it with all of them in the same turn.',
    },
  },
  {
    title: 'Brawl at the Ford', lesson: 'Order of Combats, choosing Strikes', board: [24, 16], limit: 8, priority: 'good',
    intro: 'Your warriors caught a Hill Tribes raiding party at the ford, and the brawl has already begun. You split the crowd into Combats and pick the order they are fought in, as before. Here the order decides who is Trapped, and when one of your models beats two enemies, you also choose where its Strikes go. In this mission you have Priority every turn, and two more of your models can still Charge in.',
    goal: 'Defeat all the Hill Tribesmen by the end of turn 8.',
    tip: 'Two models against one enemy roll two dice. A tribesman with the river at its back is Trapped if it loses, so gang up there and fight that Combat first. When one of your models beats two enemies, Strike the Trapped one: it takes two To Wound rolls.',
    rules: ['order', 'strikes', 'pairoff'], also: ['pickstrike'],
    terrain: [{ k: 'water', x: 0, y: 0, w: 24, h: 3.6 }, { k: 'rock', x: 8.4, y: 4, w: 1.5, h: 1.12 }, { k: 'rock', x: 7.4, y: 4, w: 1.55, h: 2.6 }, { k: 'brush', x: 1, y: 11, w: 5, h: 3.5 }, { k: 'rock', x: 20.5, y: 12, w: 2.5, h: 2.5 }],
    units: [
      // On the bank: three warriors against two tribesmen with the river at their backs. The middle warrior can join either Combat.
      { t: 'hillTribesman', side: 'evil', x: 3.5, y: 4.15 }, { t: 'hillTribesman', side: 'evil', x: 4.5, y: 4.15 },
      ...row('warriorOfRohan', 'good', [3, 4, 5], 5.016),
      // In the open: the Royal Guard and a warrior against three tribesmen, the left one pinned against a rock. Who takes two?
      { t: 'hillTribesman', side: 'evil', x: 9.5, y: 5.634 }, { t: 'hillTribesman', side: 'evil', x: 10.5, y: 5.634 }, { t: 'hillTribesman', side: 'evil', x: 11.5, y: 5.634 },
      { t: 'rohanRoyalGuard', side: 'good', x: 10, y: 6.5 }, { t: 'warriorOfRohan', side: 'good', x: 11, y: 6.5 },
      // On the right: a warrior blocks a tribesman's way back while it fights another tribesman.
      { t: 'hillTribesman', side: 'evil', x: 18, y: 5.15 }, { t: 'warriorOfRohan', side: 'good', x: 17, y: 5.15 },
      { t: 'hillTribesman', side: 'evil', x: 17, y: 6.15 }, { t: 'warriorOfRohan', side: 'good', x: 17, y: 7.15 },
      // Reserves that can still Charge in turn 1.
      { t: 'warriorOfRohan', side: 'good', x: 13.5, y: 10 }, { t: 'rohanRoyalGuard', side: 'good', x: 15, y: 10 }, { t: 'hillTribesman', side: 'evil', x: 21, y: 8.5 },
    ],
    check(atEnd) {
      if (!sideAlive('evil').length) return 'win';
      if (!sideAlive('good').length) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Tribesmen left: ${sideAlive('evil').length} · your models: ${sideAlive('good').length}`; },
    debrief: {
      win: 'Pairing Off decides where your dice go, and the order decides who is Trapped. Gang up on the enemies that cannot Back Away, fight those Combats first, and send each Strike where it does the most harm.',
      lose: 'Count the dice in each Combat before you press Done: two of your models against one enemy roll two dice, and an enemy with the river behind it is Trapped if it loses.',
    },
  },
  {
    title: 'Battle for Edoras', lesson: 'Rolling for Priority: a full battle', board: [30, 22], limit: 12,
    intro: 'Hill Tribesmen and Rohirrim Traitors march on Edoras. The Rohan Royal Guard holds the line with warriors and bowmen. Until now you always had Priority. Here both sides roll for it every turn: whoever has it moves and shoots first and splits the fights. Everything you have learned comes together.',
    goal: 'Defeat every enemy model within 12 turns.',
    tip: 'Take Priority when you can Charge first; hand it over when you would rather see where the enemy goes and then gang up on it. Enemy archers may shoot into a fight, and a miss can hit their own side. The Royal Guard (FV 4) wins ties: put it where the enemy is thickest.',
    rules: ['priority', 'shootFight', 'pairoff'],
    terrain: [{ k: 'brush', x: 3, y: 9, w: 5, h: 4 }, { k: 'brush', x: 22, y: 9, w: 5, h: 4 }, { k: 'rock', x: 13.5, y: 10.5, w: 3, h: 2.5 }],
    units: [
      ...row('warriorOfRohan', 'good', [6, 9], 17), { t: 'rohanRoyalGuard', side: 'good', x: 12, y: 16.5 }, { t: 'rohanRoyalGuard', side: 'good', x: 15, y: 16.5 },
      { t: 'rohanRoyalGuard', side: 'good', x: 18, y: 16.5 }, ...row('warriorOfRohan', 'good', [21, 24], 17),
      ...row('warriorOfRohanBow', 'good', [10.5, 13.5, 16.5], 19.5),
      { t: 'hillTribesman', side: 'evil', x: 15, y: 4.5 },
      ...[[9.5, 6], [12, 6.5], [18, 6.5], [20.5, 6]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
      ...row('rohirrimTraitor', 'evil', [13.5, 16.5], 8),
      ...row('hillTribesmanBow', 'evil', [12, 18], 3),
    ],
    check: stdCheck, status: stdStatus,
    debrief: {
      win: 'Edoras holds. A full turn is Priority, Move, Shoot, Fight, and the side with Priority acts first and splits the fights. The same rules work on the tabletop in every game.',
      lose: 'Concentrate your force: you win more fights where you have more models. Keep the bowmen back and shooting every turn.',
    },
  },
  {
    chapter: 'Fighting in formation',
    title: 'Spear Wall', lesson: 'Spears and Supporting, choosing where to Back Away, Make Way', board: [24, 18], limit: 8, priority: 'evil',
    intro: 'Hill Tribesmen are pouring down a narrow pass in the White Mountains. Four Warriors of Minas Tirith with shields hold the gap, and four more with spears stand right behind them. A spear does not have to fight to help: from behind a friend it adds a dice to the friend\'s Duel Roll and strikes past its shoulder. The tribesmen are on the attack, so they have Priority every turn.',
    goal: 'Slay 8 of the 10 Hill Tribesmen by the end of turn 8.',
    tip: 'Keep every spear in base contact with a fighting friend: each one adds a dice and a Strike, and it cannot be struck. When one of your fighters loses, you choose where it Backs Away: straight back, with the spear behind it Making Way, keeps your line together.',
    rules: ['spear', 'makeway', 'backaway'],
    // A 6″ pass between rocks: the front rank fills it from rock to rock, so the tribesmen can only come from the front.
    terrain: [{ k: 'rock', x: 0, y: 6, w: 9, h: 5 }, { k: 'rock', x: 15, y: 6, w: 9, h: 5 }],
    units: [
      ...row('warriorOfMinasTirith', 'good', [9.5, 11.17, 12.83, 14.5], 10.5),
      ...row('warriorOfMinasTirithSpear', 'good', [9.5, 11.17, 12.83, 14.5], 11.5),
      ...[[7, 2], [9, 3], [11, 2], [13, 3], [15, 2], [17, 3], [8, 4.5], [12, 4.5], [16, 4.5], [12, 0.8]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    check(atEnd) {
      const slain = G.units.filter(u => u.side === 'evil' && u.dead).length;
      if (slain >= 8) return 'win';
      if (!sideAlive('good').length) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Tribesmen slain: ${Math.min(8, G.units.filter(u => u.side === 'evil' && u.dead).length)} of 8 · your models: ${sideAlive('good').length}`; },
    debrief: {
      win: 'Each spear behind a fighter is one more dice and one more Strike, and the enemy cannot touch it. Backing straight into the spear and letting it Make Way kept the line closed, turn after turn.',
      lose: 'Keep every spear touching a fighting friend, and when a fighter loses, back it straight into its spear and let the spear Make Way. A spear that wanders off, or a gap in the line, costs you the fight.',
    },
  },
  {
    title: 'Pike Square', lesson: 'Pikes two ranks deep, banners', board: [24, 18], limit: 8,
    intro: 'Mordor Orcs swarm across the Pelennor towards a causeway between flooded fields. Three Warriors of Minas Tirith hold it with their shields, and behind each of them stands a Man-at-Arms of Dol Amroth with a pike. Three more pikes and a banner are still coming up from the rear. A pike reaches further than a spear: a second pike behind the first also Supports the fighter in front. From here on both sides roll for Priority again.',
    goal: 'Slay 10 of the 14 Mordor Orcs by the end of turn 8.',
    tip: 'Move each pike at the back into base contact with a pike in the line, not with a fighter: then every fighter rolls three dice. A file three deep has no room to Back Away, so a fighter that loses is Trapped. Keep the banner within 3″ of the fights and re-roll a dice whenever you are losing.',
    rules: ['pike', 'banner', 'trapped'],
    // A causeway 3.2″ wide between deep water: exactly three files fit, so the orcs can only come from the front.
    terrain: [{ k: 'water', x: 0, y: 7.3, w: 10.4, h: 6.7 }, { k: 'water', x: 13.6, y: 7.3, w: 10.4, h: 6.7 }],
    units: [
      ...row('warriorOfMinasTirith', 'good', [10.95, 12, 13.05], 7),
      ...row('manAtArmsOfDolAmroth', 'good', [10.95, 12, 13.05], 8.02),
      ...row('manAtArmsOfDolAmroth', 'good', [10.95, 12, 13.05], 14.8),
      { t: 'warriorOfMinasTirithBanner', side: 'good', x: 12, y: 16, n: 'Banner Bearer' },
      ...[[6, 1.2], [9, 1.2], [12, 1.2], [15, 1.2], [18, 1.2], [7.5, 2.7], [10.5, 2.7], [13.5, 2.7], [16.5, 2.7], [6, 4.2], [9, 4.2], [12, 4.2], [15, 4.2], [18, 4.2]]
        .map(([x, y]) => ({ t: 'mordorOrc', side: 'evil', x, y })),
    ],
    check(atEnd) {
      const slain = G.units.filter(u => u.side === 'evil' && u.dead).length;
      if (slain >= 10) return 'win';
      if (!sideAlive('good').length) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Orcs slain: ${Math.min(10, G.units.filter(u => u.side === 'evil' && u.dead).length)} of 10 · your models: ${sideAlive('good').length}`; },
    debrief: {
      win: 'Three ranks deep, every fighter rolled three dice and the orcs could not reach the pikes. When a fighter lost, it had nowhere to go, and the banner\'s re-roll is what kept that from happening too often.',
      lose: 'Every pike at the back must touch a pike in the line, not a fighter, so the fighter in front rolls three dice. Keep the banner within 3″ of the fights and re-roll whenever you are losing.',
    },
  },
  {
    title: 'Axe and Shield', lesson: 'Shielding against two-handed weapons', board: [24, 18], limit: 7, keep: 6,
    intro: 'Isengard Orcs raid a farmstead in the Westfold. Its stone wall has a single gate, and two Rohan Royal Guard hold it with their shields; another Royal Guard and four Warriors of Rohan wait in the yard behind them. The orcs swing great axes and cleavers: two-handed weapons that strike hard but slowly. Erkenbrand\'s riders will arrive at the end of turn 7. Both sides roll for Priority.',
    goal: 'Hold the gate until the end of turn 7 and lose no more than one of your 7 models.',
    tip: 'Before each fight you may declare Shielding: twice the dice, but no Strikes if you win. You only have to hold, so you do not need Strikes: shield, win the Duel Roll and nobody gets hurt. The orcs\' two-handed weapons lose many Duel Rolls, but each one they win can kill. If a defender in the gate falls, move one from the yard into its place.',
    rules: ['shielding', 'twohanded', 'trapped'],
    // A farmyard wall across the whole table with a 2.2″ gate: two defenders fill it, so the orcs can only come at
    // them from the front. gate: the two spots in the gateway (the balance tool fills them from the yard).
    terrain: [{ k: 'rock', x: 0, y: 8.5, w: 10.9, h: 1 }, { k: 'rock', x: 13.1, y: 8.5, w: 10.9, h: 1 }],
    gate: [[11.45, 9], [12.55, 9]],
    units: [
      ...[[11.45, 9, 'rohanRoyalGuard'], [12.55, 9, 'rohanRoyalGuard'], [12, 10.7, 'rohanRoyalGuard'], [10.4, 11.3, 'warriorOfRohan'], [13.6, 11.3, 'warriorOfRohan'], [11.2, 12.5, 'warriorOfRohan'], [12.8, 12.5, 'warriorOfRohan']]
        .map(([x, y, t]) => ({ t, side: 'good', x, y })),
      ...[[8, 1.2], [11, 1.2], [14, 1.2], [17, 1.2], [6.5, 2.7], [9.5, 2.7], [12.5, 2.7], [15.5, 2.7], [18.5, 2.7], [8, 4.2], [12, 4.2], [16, 4.2]]
        .map(([x, y]) => ({ t: 'isengardOrcTwoHanded', side: 'evil', x, y })),
    ],
    check(atEnd) {
      if (sideAlive('good').length < this.keep) return 'lose';
      if (!sideAlive('evil').length) return 'win';
      if (atEnd && G.turn >= this.limit) return 'win';
      return null;
    },
    status() { return `Your models: ${sideAlive('good').length} (you need ${this.keep}) · orcs: ${sideAlive('evil').length} · riders arrive after turn ${this.limit}`; },
    debrief: {
      win: 'The riders found your shields still up. Shielding doubled your dice, so the orcs rarely won a Duel Roll, and holding the gate never needed a single Strike. Their axes hit hard, but only when they win. When you must slay the enemy instead, Shielding wins you nothing: then you fight.',
      lose: 'Too many fell before the riders came. Declare Shielding before the fights at the gate: twice the dice means far fewer lost Duel Rolls, and a Duel Roll the orcs lose cannot hurt you. Keep the gate filled from the yard.',
    },
  },
  {
    title: 'Spears of the Westfold', lesson: 'Throwing spears and Spear Mastery', board: [24, 18], limit: 8, kill: 7, keep: 3,
    intro: 'Hill Tribesmen come down on a Westfold village, and eight Warriors of Rohan with shields and throwing spears go out to meet them. A throwing spear is a throwing weapon (range 8″, Strength 3): it can be thrown in the Shoot phase even after a full Move, or once per turn as the model Charges: it stops 1″ from its target, throws without the −1 for moving, and then finishes the Charge if the target still stands; if the target falls, it may Charge another. Spear Mastery: the same spears fight as a spear, so the model can Support a friend in a fight, but only if it has not thrown them in this turn\'s Move or Shoot phase.',
    goal: 'Slay 7 of the 10 Hill Tribesmen by the end of turn 8, and keep at least 3 of your 8 Warriors.',
    tip: 'Throw as you Charge: the model fights anyway, so the throw costs it nothing, and a tribesman slain by the spear never strikes back. Let half your Warriors Charge, and move the others right behind them: with Spear Mastery they Support, one more dice in the Duel Roll and a Strike if you win. A model that threw this turn cannot Support. In the Shoot phase you choose: against these tribesmen (Defence 3) a thrown spear wounds on a 4+, about as good as a Support; against heavy armour, keep the spears for Supporting.',
    rules: ['throwing'], also: ['spearMastery'],
    terrain: [{ k: 'brush', x: 2, y: 7, w: 3.5, h: 3 }, { k: 'rock', x: 19, y: 6.5, w: 2.5, h: 2.5 }],
    units: [
      ...row('warriorOfRohanSpears', 'good', [8.5, 10.5, 12.5, 14.5], 13),
      ...row('warriorOfRohanSpears', 'good', [8.5, 10.5, 12.5, 14.5], 14.05),
      ...row('hillTribesman', 'evil', [5, 7.5, 10, 12.5, 15, 17.5, 20], 3),
      ...row('hillTribesman', 'evil', [8.5, 12.5, 16.5], 4.5),
    ],
    check(atEnd) {
      const slain = 10 - sideAlive('evil').length;
      if (sideAlive('good').length < this.keep) return 'lose';
      if (slain >= this.kill) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Tribesmen slain: ${10 - sideAlive('evil').length} of ${this.kill} · your Warriors: ${sideAlive('good').length} (keep ${this.keep}) · turn ${G.turn} of ${this.limit}`; },
    debrief: {
      win: 'The raid is broken. Every Charge began with a spear: the throw cost the fighter nothing, and the friends behind kept their spears to Support, adding dice and Strikes where the fighting was.',
      lose: 'The tribesmen held. Throw as you Charge with the models that will fight, and keep the spears of the rear rank for Supporting: a model that threw this turn cannot Support.',
    },
  },
  {
    chapter: 'Terrain',
    title: 'Over Hedge and Cliff', lesson: 'Obstacles, Jump, Climb, Leap, falling and Prone', board: [30, 20], limit: 8, priority: 'good', noShoot: true,
    exitX: 27, need: 3,
    intro: 'The Westfold burns and word must reach Helm\'s Deep. Five of the King\'s Royal Guard run for it, and the shortest way crosses a low field wall, a thick hedge, a cliff and a gully cut into the ridge beyond. Isengard Orcs guard the hedge gate, the stairs up the cliff and the plank bridge over the gully. The other ways are open, if your messengers dare to jump, climb and leap. The orcs only hold their posts, so you have Priority every turn.',
    goal: 'Get 3 of your 5 messengers into the EXIT area on the right by the end of turn 8.',
    tip: 'The wall is low: just step over it. The hedge, the cliff and the gully each take a test, and a 2–5 ends the move, so test with the last inches of your Move. Start a climb at the beginning of a move. A 1 on the Leap drops the messenger into the gully. Do not land next to an orc unless you want to fight it: your Royal Guard win ties with Fight 4, and Defence 6 turns most orc blows, but a lost Duel Roll against a two-handed axe can still kill.',
    rules: ['jump', 'climb', 'leap', 'falling'], also: ['obstacles', 'prone'],
    // Heights in inches (a man is about 1.2″ tall): a low wall (free), a hedge (Jump), rock stairs of 0.6″ steps up to the
    // ridge, a 1.8″ cliff (Climb), a 2″ gully with a plank bridge (Leap), then a 1″ drop to the lower ground (free).
    terrain: [
      { k: 'wall', x: 3.6, y: 0, w: 0.5, h: 20, ht: 0.5 },
      { k: 'hedge', x: 6.4, y: 0, w: 0.6, h: 9, ht: 1 }, { k: 'hedge', x: 6.4, y: 11, w: 0.6, h: 9, ht: 1 },
      { k: 'plateau', x: 9.5, y: 16.5, w: 1, h: 3.5, z: 0.6 }, { k: 'plateau', x: 10.5, y: 16.5, w: 1, h: 3.5, z: 1.2 },
      { k: 'plateau', x: 11.5, y: 0, w: 3.8, h: 20, z: 1.8 },
      { k: 'plateau', x: 15.3, y: 0.3, w: 2, h: 1.2, z: 1.8, bridge: true },
      { k: 'plateau', x: 17.3, y: 0, w: 8.2, h: 20, z: 1.8 },
      { k: 'plateau', x: 25.5, y: 0, w: 4.5, h: 20, z: 0.8 },
      { k: 'brush', x: 20.5, y: 16.5, w: 3, h: 3.5 },
      { k: 'zone', x: 27, y: 0, w: 3, h: 20, label: 'EXIT' },
    ],
    units: [
      ...[3, 6.5, 10, 13.5, 17].map(y => ({ t: 'rohanRoyalGuard', side: 'good', x: 1.6, y, n: 'Messenger' })),
      { t: 'isengardOrcTwoHanded', side: 'evil', x: 6.7, y: 10, ai: 'sentry', n: 'Gate Guard' },
      { t: 'isengardOrcTwoHanded', side: 'evil', x: 12.1, y: 18, ai: 'sentry', n: 'Stair Guard' },
      { t: 'isengardOrcTwoHanded', side: 'evil', x: 17.9, y: 1.2, ai: 'sentry', n: 'Bridge Guard' },
      { t: 'isengardOrcTwoHanded', side: 'evil', x: 17.9, y: 10, ai: 'sentry', n: 'Gully Guard' },
    ],
    check(atEnd) {
      const out = sideAlive('good').filter(u => u.x >= this.exitX).length;
      if (out >= this.need) return 'win';
      if (sideAlive('good').length < this.need) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `At the exit: ${sideAlive('good').filter(u => u.x >= this.exitX).length} of ${this.need} · messengers left: ${sideAlive('good').length}`; },
    debrief: {
      win: 'The warning gets through. Low walls cost nothing, hedges a Jump, cliffs a Climb and gaps a Leap: each test ends the move on a 2–5, so you tested with the last inches, started climbs fresh and landed away from the guards.',
      lose: 'Too few messengers got through in time. Each test ends the move on a 2–5, so walk first and test with the last inches of your Move; start a climb at the beginning of a move, and land away from the orcs: a forced Charge costs a whole turn.',
    },
  },
  {
    title: 'Hold the Wall', lesson: 'Barriers: defending a wall', board: [24, 18], limit: 8, keep: 7, noShoot: true,
    wallY: 9,
    intro: 'The Usurpers of Edoras come for the outlying farms of the Eastfold. A waist-high field wall runs across the pasture from one side to the other. Ten Royal Guard of Edoras hold it on foot: eight at the wall and two behind the line. The Hill Tribesmen must come over the wall. Both sides roll for Priority. Hold until Éomer\'s éored arrives at the end of turn 8.',
    goal: 'Hold the wall until the end of turn 8 and lose no more than 3 of your 10 models.',
    tip: 'A model in base contact with the wall defends it: a tribesman can only attack it by stopping against the wall opposite, and if it wins, each of its blows must first pass the wall (In The Way 4+). A beaten defender that survives keeps its place. When a defender falls, its attacker crosses the wall: a tribesman behind the line strips the protection from every defender it attacks, so charge it at once with the reserves and its neighbours, and fill the gap in the line.',
    rules: ['barriers', 'bothsides', 'shielding'],
    // A field wall 0.8″ high across the whole table: a Jump for a man, so it can be defended.
    terrain: [{ k: 'wall', x: 0, y: 9, w: 24, h: 0.6, ht: 0.8 }],
    // Where the line stands: eight posts against the wall (the balance tool keeps them filled).
    posts: [[1.8, 10.13], [4.7, 10.13], [7.6, 10.13], [10.5, 10.13], [13.4, 10.13], [16.3, 10.13], [19.2, 10.13], [22.1, 10.13]],
    units: [
      ...[1.8, 4.7, 7.6, 10.5, 13.4, 16.3, 19.2, 22.1].map(x => ({ t: 'rohanRoyalGuard', side: 'good', x, y: 10.13 })),
      { t: 'rohanRoyalGuard', side: 'good', x: 7, y: 12.2 }, { t: 'rohanRoyalGuard', side: 'good', x: 17, y: 12.2 },
      ...[[2.5, 1.2], [6.1, 1.2], [9.7, 1.2], [13.3, 1.2], [16.9, 1.2], [20.5, 1.2], [4.3, 2.7], [7.9, 2.7], [11.5, 2.7], [15.1, 2.7], [18.7, 2.7], [22.3, 2.7], [2.5, 4.2], [6.1, 4.2], [9.7, 4.2], [13.3, 4.2], [16.9, 4.2], [20.5, 4.2]]
        .map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    // Behind the wall: on the player's side of it (the wall is thin, so its near face is the line).
    through() { return sideAlive('evil').filter(u => u.y > this.wallY + 0.6); },
    check(atEnd) {
      if (sideAlive('good').length < this.keep) return 'lose';
      if (!sideAlive('evil').length) return 'win';
      if (atEnd && G.turn >= this.limit) return 'win';
      return null;
    },
    status() { return `Your models: ${sideAlive('good').length} (you need ${this.keep}) · tribesmen: ${sideAlive('evil').length}, behind the wall: ${this.through().length} · the éored arrives after turn ${this.limit}`; },
    debrief: {
      win: 'The wall held. Every blow the tribesmen won had to pass the wall first, and a defender that lost its fight kept its place, so the line never broke. The enemy could not cross the wall inside your Control Zones, and only one of them at a time could attack each defender.',
      lose: 'The line broke. Keep every model in base contact with the wall: a defender is attacked by one enemy at a time, half the blows stop at the wall, and a lost fight costs no ground. Plug the gate and the ends, and send the reserves at any tribesman that gets behind the wall before it attacks your defenders from behind.',
    },
  },
  {
    chapter: 'Cavalry',
    title: 'The Éored Rides', lesson: 'Cavalry: the charge, the horse and the rider', board: [36, 24], limit: 6, keep: 5, need: 8, noShoot: true,
    priority: { 1: 'good' },
    intro: 'Hill Tribesmen have burned a farm in the Westfold and scatter across the pasture with their loot, a dozen of them, well apart. An éored of eight Riders of Rohan comes over the rise. On open ground a charging horseman rolls an extra dice, knocks the men it beats to the ground and strikes them twice; in the brush it is just a man on a horse, and when the men strike back they will go for the horse. You have Priority in turn 1; after that both sides roll.',
    goal: 'Slay 8 of the 12 tribesmen by the end of turn 6 and keep at least 5 of your 8 Riders alive (a Rider on foot still counts).',
    tip: 'Charge from open ground, and only infantry: that gives Extra Attack and Knock to the Ground, and a man on the ground is wounded on two dice per Strike. Two Riders on one tribesman make the fight safe, and a slain tribesman leaves them free to ride on next turn. A Rider that cannot charge should stay more than 6″ from the tribesmen, so they cannot charge it first: a Rider charged by infantry fights with one dice and no bonus. The horse has Defence 4: expect the tribesmen to strike it, and the rider to fight on foot afterwards.',
    rules: ['cavalry', 'cavalrycharge'], also: ['thrownrider'],
    terrain: [
      { k: 'brush', x: 12, y: 2, w: 5, h: 4 }, { k: 'brush', x: 19, y: 15, w: 6, h: 4.5 }, { k: 'brush', x: 27, y: 4, w: 4, h: 3.5 },
      { k: 'wall', x: 22, y: 8, w: 6, h: 0.5 },
    ],
    units: [
      ...[3, 5.6, 8.2, 10.8, 13.4, 16, 18.6, 21.2].map(y => ({ t: 'riderOfRohan', side: 'good', x: 2.5, y })),
      ...[[13.8, 8], [13.5, 14], [14, 20], [19, 3.5], [19.5, 11], [20.5, 21.5], [24.5, 7], [25, 13], [24.5, 22.5], [29.5, 2], [30, 11.5], [30, 18]]
        .map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    slain() { return this.units.filter(u => u.side === 'evil').length - sideAlive('evil').length; },
    check(atEnd) {
      if (sideAlive('good').length < this.keep) return 'lose';
      if (this.slain() >= this.need) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Tribesmen slain: ${this.slain()} of ${this.need} · your Riders: ${sideAlive('good').length} (you need ${this.keep}), ${sideAlive('good').filter(u => u.cav).length} still mounted`; },
    debrief: {
      win: 'The éored swept the pasture. Every charge from open ground brought an extra dice and left the tribesmen on the ground for two rolls per Strike; the Riders that could not charge kept out of reach, and a horse lost was a rider on foot, not a rider dead.',
      lose: 'The charge broke on the brush, or the tribesmen got their charges in first and swarmed the Riders. Charge only from open ground and only infantry, two Riders on one man where you can, so he dies and the Riders are free again, and keep the Riders that cannot charge more than 6″ from the enemy: a Rider charged by infantry fights with one dice and no bonus.',
    },
  },
  {
    title: 'Wolves of Isengard', lesson: 'Cavalry against cavalry, shooting at cavalry', board: [36, 24], limit: 8, keep: 5, need: 4,
    intro: 'A raiding party of Isengard has crossed the Isen: five Warg Riders and four Dunlendings on foot run down the Westfold road. Your éored meets them on the moor, eight Riders of Rohan with bows. Against the men on foot your charge is as deadly as ever; against the wolves a charging horse brings no Extra Attack and knocks nobody down, and the Warg bites with Strength 4, so an even fight favours them. Shoot the wolves as they come, charge them two to one, ride down the Dunlendings. Both sides roll for Priority.',
    goal: 'Break the raid: slay or unhorse 4 of the 9 raiders by the end of turn 8 (a Warg Rider counts once its rider is slain or on foot; a loose Warg does not count), and keep at least 5 of your 8 Riders alive (a Rider on foot still counts).',
    tip: 'In the Shoot phase your Riders may shoot after moving up to 5″: a shot at a Warg Rider hits the rider on a 4+ and the Warg on a 1 to 3. A Warg moves 10″, so a Rider within 10″ of one can be charged when the enemy wins Priority: stay further away, or charge first and in pairs (four dice against one). The Dunlendings are the easy kills: a charge on open ground still knocks them down. A Warg whose rider is slain stays on a Courage Test of 8+ and fights on.',
    rules: ['shootcav', 'cavalrycharge'], also: ['loosemount'],
    terrain: [
      { k: 'rock', x: 14, y: 9.5, w: 4, h: 3 }, { k: 'rock', x: 24, y: 2, w: 3, h: 4 },
      { k: 'brush', x: 9, y: 17, w: 5, h: 4 }, { k: 'brush', x: 22, y: 14, w: 5, h: 5 },
    ],
    units: [
      ...[3.5, 6.2, 8.9, 11.6, 14.3, 17, 19.7, 22.4].map(y => ({ t: 'riderOfRohan', side: 'good', x: 3, y })),
      ...[[30, 3.5], [32.5, 8], [31, 12.5], [32.5, 17], [30, 21.5]].map(([x, y]) => ({ t: 'isengardWargRider', side: 'evil', x, y })),
      ...[[27, 6], [26.5, 10.5], [27, 15], [26.5, 19.5]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    // Raiders still in the fight: Warg Riders in the saddle and orcs on foot (not unhorsed riders, not loose Wargs).
    riders() { return this.units.filter(u => u.side === 'evil').length - sideAlive('evil').filter(u => u.cav || u.t === 'hillTribesman').length; },
    check(atEnd) {
      if (sideAlive('good').length < this.keep) return 'lose';
      if (this.riders() >= this.need) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() { return `Raiders slain or unhorsed: ${this.riders()} of ${this.need}${sideAlive('evil').some(u => u.T.mountModel) ? ` · loose Wargs: ${sideAlive('evil').filter(u => u.T.mountModel).length}` : ''} · your Riders: ${sideAlive('good').length} (you need ${this.keep}), ${sideAlive('good').filter(u => u.cav).length} still mounted`; },
    debrief: {
      win: 'The raid is broken. The Dunlendings went down to charges with the bonus, the wolves to arrows and to two Riders at a time, and the Riders out of a good fight stayed out of the Wargs\' reach. Against cavalry the charge brings no bonus: numbers and the first charge decide.',
      lose: 'The wolves won the even fights, as Strength 4 against a horse will. Ride down the Dunlendings first (the charge bonus still works against them), shoot the Wargs as they come, charge them only in pairs, and keep every Rider that cannot charge more than 10″ from a Warg when the enemy may win Priority.',
    },
  },
  {
    chapter: 'Courage',
    title: 'The Line Wavers', lesson: 'Broken armies and Courage Tests', board: [30, 22], limit: 10, noShoot: true,
    lose: 9, rout: 9,
    intro: 'Osgiliath. Twelve Warriors of Minas Tirith hold two gaps in the ruined walls against twelve Mordor Orcs. Neither side can fight to the last: an army that has lost more than half its models is Broken, and every model of it that acts must first pass a Courage Test or flee. The orcs have Courage 8+ and fail three tests in five; your men have Courage 7+. Break the orcs, then let their own fear finish them. Both sides roll for Priority.',
    goal: 'Drive off 9 of the 12 orcs (slain or fled) by the end of turn 10, and lose fewer than 9 of your 12 men.',
    tip: 'Hold the gaps with shields in front and spears behind, as at the Spear Wall. Count the orcs\' losses: at 7 they are Broken from the start of the next turn. Then step back out of base contact: an orc stuck in a fight does not test, an orc that has to walk to you tests on 8+ and usually runs. Your own Break Point is 7: when your army is Broken, move only the models you must, and keep the rest in Combat or standing still.',
    rules: ['broken', 'courage'],
    // Two 3″ gaps in a ruined wall: three men fill the mouth of each.
    terrain: [{ k: 'rock', x: 11, y: 0, w: 3, h: 6 }, { k: 'rock', x: 11, y: 9, w: 3, h: 5 }, { k: 'rock', x: 11, y: 17, w: 3, h: 5 }],
    posts: [[10.45, 6.5], [10.45, 7.5], [10.45, 8.5], [10.45, 14.5], [10.45, 15.5], [10.45, 16.5]],
    units: [
      ...[[10.45, 6.5], [10.45, 7.5], [10.45, 8.5], [10.45, 14.5], [10.45, 15.5], [10.45, 16.5], [8.2, 7.5], [8.2, 15.5]].map(([x, y]) => ({ t: 'warriorOfMinasTirith', side: 'good', x, y })),
      ...[[9.4, 7], [9.4, 8], [9.4, 15], [9.4, 16]].map(([x, y]) => ({ t: 'warriorOfMinasTirithSpear', side: 'good', x, y })),
      ...[[18, 4], [18, 8], [18, 14], [18, 18], [21, 6], [21, 10.5], [21, 15.5], [24, 8]].map(([x, y]) => ({ t: 'mordorOrc', side: 'evil', x, y })),
      ...[[21, 3], [21, 19], [24, 12], [24, 16]].map(([x, y]) => ({ t: 'mordorOrc', side: 'evil', x, y })),
    ],
    lost(side) { return this.units.filter(u => u.side === side).length - sideAlive(side).length; },
    check(atEnd) {
      if (this.lost('good') >= this.lose) return 'lose';
      if (this.lost('evil') >= this.rout) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const b = s => (G.broken && G.broken[s] ? ', Broken' : '');
      return `Orcs lost: ${this.lost('evil')} of 12 (Broken above 6${b('evil')}; you need ${this.rout}) · yours: ${this.lost('good')} of 12 (Broken above 6${b('good')}; ${this.lose} loses)`;
    },
    debrief: {
      win: 'The orcs broke and ran. You held the gaps until their losses passed the Break Point, then stepped back and let the Courage Tests do the rest: an orc that must walk to you tests on 8+, and most never arrive.',
      lose: 'The line gave way. Hold the gaps with shields and spears, and watch the count: at 7 losses the orcs are Broken, and from then on every orc that walks to you must pass an 8+ first, so step back out of base contact and let them come. When your own army is Broken, act only with the models you must.',
    },
  },
  {
    chapter: 'Heroes',
    title: 'A Captain\'s Might', lesson: 'Might, Will and Fate', board: [24, 18], limit: 12, noShoot: true, lose: 5,
    intro: 'A Captain of Rohan rides out with six Royal Guard to break up a Dunlending raid led by a Hill Tribes Chieftain. Both are Heroes: 2 Might, 1 Will and 1 Fate each. A Might Point raises one of the Hero\'s own dice by 1, after everything else; Fate turns a Wound aside on a 4+; Will adds to a Courage Test. The Chieftain will spend his points to win his fights: so should you, but only where it decides the battle. Both sides roll for Priority.',
    goal: 'Slay the Hill Tribes Chieftain by the end of turn 12. The Captain must survive, and you may lose no more than 4 Royal Guard.',
    tip: 'The Captain has 2 Might for the whole battle: a point spent on a tribesman is a point missing against the Chieftain, where both Heroes bid. Fight Value 4 against 4: a tie is a roll-off that Might cannot touch, so to win on Might your dice must be higher. The Captain has 2 Attacks and Strength 4: the Chieftain (Defence 4) is wounded on a 4+, with 2 Wounds and a Fate Point of his own. Keep the Royal Guard on the tribesmen and bring the Captain to the Chieftain with a Royal Guard beside him for the extra dice.',
    rules: ['might', 'fate', 'will'],
    terrain: [{ k: 'rock', x: 9, y: 0.5, w: 3, h: 2.5 }, { k: 'brush', x: 14, y: 7.5, w: 3, h: 3 }],
    units: [
      { t: 'captainOfRohan', side: 'good', x: 4, y: 9 },
      ...[[2.5, 5.5], [2.5, 7.5], [2.5, 10.5], [2.5, 12.5], [5, 6.5], [5, 11.5]].map(([x, y]) => ({ t: 'rohanRoyalGuard', side: 'good', x, y })),
      { t: 'hillTribesChieftain', side: 'evil', x: 20.5, y: 9 },
      ...[[18.5, 5], [21.5, 6.5], [19, 11.5], [21.5, 13], [19, 8]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    captain() { return G.units.find(u => u.t === 'captainOfRohan'); },
    chief() { return G.units.find(u => u.t === 'hillTribesChieftain'); },
    check(atEnd) {
      if (!alive(this.captain())) return 'lose';
      if (G.units.filter(u => u.side === 'good' && u.t === 'rohanRoyalGuard' && !alive(u)).length >= this.lose) return 'lose';
      if (!alive(this.chief())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const c = this.captain(), e = this.chief();
      return `Captain: ${c.w}/${c.maxW} Wounds, Might ${c.might}, Will ${c.will}, Fate ${c.fate} · Chieftain: ${alive(e) ? `${e.w}/${e.maxW} Wounds, Might ${e.might}, Fate ${e.fate}` : 'slain'} · Royal Guard lost: ${G.units.filter(u => u.side === 'good' && u.t === 'rohanRoyalGuard' && !alive(u)).length} (${this.lose} loses)`;
    },
    debrief: {
      win: 'The Chieftain is down. You spent Might where a single pip decided the fight, kept a point for the bidding against him, and let Fate take the Wound that would have cost you the Captain.',
      lose: 'The raid goes on. Might is scarce: 2 points for the whole battle, and the Chieftain answers every point you spend against him. Save it for the fights that matter, use Fate on the first Wound, and bring a Royal Guard into the Captain\'s fight for the extra dice.',
    },
  },
  {
    title: 'Stand Fast!', lesson: 'Stand Fast · Terror', board: [24, 20], limit: 5, noShoot: true,
    start: { good: 27, evil: 5 },
    intro: 'The ford below the Mering Stream, at dusk. Háma, Prince of Rohan, rode out with twenty-six men; fourteen have fallen. Your army is Broken: every model that Activates must first pass a Courage Test (Courage 7+ for a Warrior) or flee. But a Hero who passes calls Stand Fast, and the Warriors that Activate near him then hold without rolling. Háma has Courage 6+ and 3 Will Points to raise his own tests. A Mordor Troll and four orcs come for the ford. The Troll causes Terror: a model that wants to Charge it must pass a Courage Test first, or not move at all. Both sides roll for Priority.',
    goal: 'Hold until the end of turn 5 with at least 4 of your 12 Warriors still on the field (not slain, not fled), and Háma must not fall or flee. Slay the Troll and you win at once.',
    tip: 'Activate Háma first every turn: he needs Courage 6+, and each Will Point (then Might) raises the roll by 1, but 3 Will must last five turns. Once he passes, every Warrior that Activates within 6″ of him and can see him passes too, so keep the line close in front of him. Keep him out of the fighting: a Hero Engaged in Combat does not Activate, so it calls no Stand Fast, and then every Warrior rolls. A Warrior in a fight does not test either. Do not Charge the Troll with a Warrior on its own: a failed Terror test wastes the move. Let it come into your shields; the orcs break above 2 losses.',
    rules: ['standFast', 'terror'],
    // A stream too deep to enter, with a ford of open ground 6″ wide in the middle.
    terrain: [{ k: 'water', x: 11, y: 0, w: 2, h: 7 }, { k: 'water', x: 11, y: 13, w: 2, h: 7 }],
    keep: 4,
    units: [
      { t: 'hamaPrince', side: 'good', x: 8, y: 10 },
      ...[[10.4, 7.7], [10.4, 9.1], [10.4, 10.9], [10.4, 12.3], [8.4, 7], [8.4, 13]].map(([x, y]) => ({ t: 'warriorOfRohan', side: 'good', x, y })),
      ...[[9.2, 8.4], [9.2, 10], [9.2, 11.6], [7.6, 8.4], [7.6, 11.6], [6.8, 10]].map(([x, y]) => ({ t: 'warriorOfRohanSpears', side: 'good', x, y })),
      { t: 'mordorTroll', side: 'evil', x: 19.5, y: 10 },
      ...[[16, 7], [16, 13]].map(([x, y]) => ({ t: 'mordorOrc', side: 'evil', x, y })),
      ...[[20, 6], [20, 14]].map(([x, y]) => ({ t: 'mordorOrcSpear', side: 'evil', x, y })),
    ],
    captain() { return G.units.find(u => u.t === 'hamaPrince'); },
    troll() { return G.units.find(u => u.t === 'mordorTroll'); },
    men() { return sideAlive('good').filter(u => u.t !== 'hamaPrince').length; },
    check(atEnd) {
      if (!alive(this.captain())) return 'lose';
      if (!alive(this.troll()) || !sideAlive('evil').length) return 'win';
      if (this.men() < this.keep) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'win';
      return null;
    },
    status() {
      const c = this.captain(), men = sideAlive('good').filter(u => u !== c);
      const ring = alive(c) ? men.filter(u => Math.hypot(u.x - c.x, u.y - c.y) - u.r - c.r <= 6).length : 0;
      return `Warriors left: ${men.length} of 12 (keep ${this.keep}) · within 6″ of Háma: ${ring} · Háma: ${alive(c) ? `${c.w}/${c.maxW} Wounds, Will ${c.will}, Might ${c.might}` : 'gone'} · Troll: ${alive(this.troll()) ? `${this.troll().w}/${this.troll().maxW} Wounds` : 'slain'}`;
    },
    debrief: {
      win: 'The ford held. Háma tested first each turn and stayed out of the fighting, so his Stand Fast kept the Warriors around him from running; nobody wasted a move on a failed Terror test, and the Troll had to come to your shields.',
      lose: 'The ford is lost. In a Broken army Activate Háma first, keep him out of base contact, and keep the Warriors within 6″ of him and in his sight: his one passed test holds them all. Do not Charge the Troll with a lone Warrior, a failed Terror test costs the whole move.',
    },
  },
  {
    title: 'The King\'s Guard', lesson: 'Bodyguard · Shieldwall', board: [24, 20], limit: 9, noShoot: true,
    start: { good: 27, evil: 6 }, kill: 3,
    intro: 'The road to Helm\'s Deep. Théoden\'s column has been cut to pieces: fourteen of twenty-seven have fallen, so your army is Broken, and every model that Activates must pass a Courage Test or flee. Six Uruk-hai stand across the road shield to shield. The eight Rohan Royal Guard are Bodyguards: while the King lives, they pass every Courage Test without rolling. The four Warriors of Rohan with throwing spears are not: they need Théoden\'s Stand Fast, which reaches only 6″. The Uruk-hai have Shieldwall: an Uruk-hai with a shield touching two or more friends with Shieldwall and shields gets +1 Defence, 7 instead of 6.',
    goal: 'Slay 3 of the 6 Uruk-hai by the end of turn 9. Théoden must not fall.',
    tip: 'The Guard do the fighting: they never flee while the King lives, however far from him they go. Keep Théoden back and out of every fight: if he falls, you lose, and the Guard test like everyone else. Activate him first each turn; the Warriors near him then pass on his Stand Fast, but beyond 6″ each of them tests on its own (7+ on two dice). Shieldwall makes the middle of the wall harder: a Strength 3 Strike wounds Defence 7 only on a 6. An Uruk-hai at the end of the line touches one friend and has Defence 6 (5+), and the wall comes apart as the Uruk-hai Back Away.',
    rules: ['bodyguard'], also: ['shieldwall'],
    terrain: [{ k: 'rock', x: 1, y: 3, w: 3, h: 4 }, { k: 'rock', x: 20.5, y: 3.5, w: 3, h: 3.5 }],
    units: [
      { t: 'theoden', side: 'good', x: 12, y: 17 },
      ...row('rohanRoyalGuard', 'good', [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5], 15),
      ...row('warriorOfRohanSpears', 'good', [7, 8.5, 15.5, 17], 16.2),
      ...row('urukHaiWarrior', 'evil', [9.5, 10.5, 11.5, 12.5, 13.5, 14.5], 7, { ai: 'hold' }),
    ],
    king() { return G.units.find(u => u.t === 'theoden'); },
    check(atEnd) {
      if (!alive(this.king())) return 'lose';
      if (6 - sideAlive('evil').length >= this.kill) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const k = this.king(), guards = sideAlive('good').filter(u => u.t === 'rohanRoyalGuard').length;
      return `Uruk-hai slain: ${6 - sideAlive('evil').length} of ${this.kill} · Théoden: ${alive(k) ? `${k.w} Wounds, Might ${k.might}, Will ${k.will}` : 'slain'} · Royal Guard: ${guards} · turn ${G.turn} of ${this.limit}`;
    },
    debrief: {
      win: 'The road is open. The Guard never wavered while the King lived, and you broke the wall from its ends, where an Uruk-hai had only one shield beside it and its Defence was 6, not 7.',
      lose: 'The road stays shut. Keep Théoden behind the fighting: his life is what holds the Guard. Strike the ends of the wall, where Shieldwall gives no +1, and roll it up from the side.',
    },
  },
  {
    title: 'With Me!', lesson: 'Heroic Actions: Heroic Move', board: [24, 20], limit: 4, noShoot: true,
    priority: { 1: 'evil', 2: 'evil', 3: 'evil' },
    intro: 'A Hill Tribes Chieftain and his band have slipped round your flank, racing you for the only ford over the Snowbourn. They sprang the trap, so they have Priority in turns 1 to 3 and Activate first. A Hero can defy that: at the start of the Move phase it may spend a Might Point on a Heroic Move and Activate before everyone else, and with the shout With Me the friends within 6″ of it Activate right after it. The Chieftain has Might of his own and may answer with a Heroic Move too; then a dice decides who goes first.',
    goal: 'At the end of turn 4, have more of your models than of theirs inside the ford (the dashed area; models in a fight count).',
    tip: 'Your Captain has 2 Might for 4 turns. Nobody reaches the ford in turn 1, so save the points: declare a Heroic Move in turn 2, when both bands can get there and whoever Activates first takes it, and again in turn 3 to hold it. The Chieftain may answer with a Heroic Move of his own; then a dice decides who goes first. Shout With Me and keep the Warriors within 6″ of the Captain at the start of the Move phase: they Activate with him, and must end within 6″ of him. The Might you spend on a Heroic Move cannot raise a dice in a fight.',
    rules: ['heroic', 'heroicMove'],
    // A stream too deep to wade (the Snowbourn in spate) with one ford 6″ wide; both bands start on the south bank.
    terrain: [{ k: 'water', x: 0, y: 8, w: 9, h: 2 }, { k: 'water', x: 15, y: 8, w: 9, h: 2 }],
    area: { x: 9, y: 7, w: 6, h: 4, label: 'the ford' },
    units: [
      { t: 'captainOfRohan', side: 'good', x: 3, y: 17 },
      ...[[1.5, 16], [4.5, 16], [1.5, 18], [4.5, 18]].map(([x, y]) => ({ t: 'warriorOfRohan', side: 'good', x, y })),
      ...[[3, 15.4], [3, 18.6]].map(([x, y]) => ({ t: 'warriorOfRohanSpears', side: 'good', x, y })),
      { t: 'hillTribesChieftain', side: 'evil', x: 21, y: 17 },
      ...[[22.5, 16], [19.5, 16], [22.5, 18], [19.5, 18], [21, 15.4]].map(([x, y]) => ({ t: 'hillTribesman', side: 'evil', x, y })),
    ],
    inFord(u) { const A = this.area; return alive(u) && u.x >= A.x && u.x <= A.x + A.w && u.y >= A.y && u.y <= A.y + A.h; },
    held(side) { return sideAlive(side).filter(u => this.inFord(u)).length; },
    // Both sides head for the ford (the nearest spot inside it) and stay once in; a Charge still comes first (ai.js).
    aiGoal(u) {
      if (this.inFord(u)) return null;
      const A = this.area, k = u.id % 5;
      return { x: A.x + 0.8 + k * (A.w - 1.6) / 4, y: u.y > A.y + A.h / 2 ? A.y + A.h - 0.8 : A.y + 0.8 };
    },
    check(atEnd) {
      if (!sideAlive('evil').length) return 'win';
      if (!sideAlive('good').length) return 'lose';
      if (atEnd && G.turn >= this.limit) return this.held('good') > this.held('evil') ? 'win' : 'lose';
      return null;
    },
    status() {
      const h = t => G.units.find(u => u.t === t), c = h('captainOfRohan'), e = h('hillTribesChieftain');
      const pr = this.priority[G.turn] ? 'the enemy (ambush)' : 'rolled';
      return `In the ford: yours ${this.held('good')}, theirs ${this.held('evil')} · Captain: ${alive(c) ? `Might ${c.might}` : 'slain'} · Chieftain: ${alive(e) ? `Might ${e.might}` : 'slain'} · Priority in turn ${G.turn}: ${pr}`;
    },
    debrief: {
      win: 'The ford is yours. The tribesmen had Priority, but your Heroic Move let the Captain Activate first, and With Me brought the Warriors within 6″ of him along before a single tribesman moved.',
      lose: 'The tribesmen hold the ford. With Priority they Activate first every turn unless your Captain spends a Might Point on a Heroic Move: declare it in the turns that decide the race, shout With Me, and keep the Warriors within 6″ of him.',
    },
  },
  {
    title: 'At the Double!', lesson: 'Heroic March and At the Double', board: [36, 20], limit: 4, noShoot: true,
    priority: { 1: 'good' }, exitX: 34, need: 5,
    // Models through the gate leave the board, which would count towards the Break Point; the column does not break here.
    breakAt: { good: 1, evil: 0.5 },
    intro: 'Uruk-hai of Isengard caught your patrol in the open, and the gate of Edoras is a long road away. In a straight fight their heavy armour would grind your Warriors down, so you must outrun them. You saw them first, so you have Priority in turn 1. A Heroic March lets a Hero add 3″ to his Move this phase for a Might Point, and with the shout At the Double the friends within 6″ of him march too. The price: nobody marching may Charge, and they must all finish within 6″ of the Hero.',
    goal: 'Bring the Captain and at least 4 of the 6 Warriors through the GATE on the right by the end of turn 4. The Captain must not fall.',
    tip: 'The rear of the column is 24″ from the gate and you have 4 turns of 6″: without a March you cannot make it, and the Captain has only 2 Might. March early: in turn 1 you have Priority and nobody can reach you, and the 3″ you gain keep the Uruk-hai out of Charge reach for the rest of the road. Wait, and the turn they win Priority they Charge your rear first. A March Activates in the usual order, so a Captain Charged before his turn loses it and the Might Point; when the Uruk-hai have Priority and are close, a Heroic Move (go first) is the safer buy. Keep the Warriors within 6″ of the Captain when he shouts At the Double, and keep them out of the brush.',
    rules: ['heroicMarch'],
    terrain: [{ k: 'brush', x: 15, y: 0, w: 5, h: 5 }, { k: 'brush', x: 22, y: 15, w: 5, h: 5 }, { k: 'zone', x: 34, y: 0, w: 2, h: 20, label: 'GATE' }],
    units: [
      { t: 'captainOfRohan', side: 'good', x: 11, y: 10 },
      ...[5.5, 7.3, 9.1, 10.9, 12.7, 14.5].map(y => [9.5, y]).map(([x, y]) => ({ t: 'warriorOfRohan', side: 'good', x, y })),
      ...[[5.5, 6], [5.5, 8.5], [5.5, 11], [5.5, 13.5], [7, 10]].map(([x, y]) => ({ t: 'urukHaiWarrior', side: 'evil', x, y })),
    ],
    captain() { return G.units.find(u => u.t === 'captainOfRohan'); },
    through: () => G.units.filter(u => u.side === 'good' && u.escaped).length,
    // A model that reaches the gate goes through it and is safe (it leaves the board, not as a casualty).
    check(atEnd) {
      for (const u of sideAlive('good').filter(u => u.x >= this.exitX && !engaged(u))) { u.gone = true; u.escaped = true; }
      const cap = this.captain();
      if (cap.dead || cap.fled) return 'lose';
      if (cap.escaped && this.through() >= this.need) return 'win';
      if (this.through() + sideAlive('good').length < this.need) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const c = this.captain(), near = Math.min(99, ...sideAlive('evil').map(e => Math.min(...sideAlive('good').map(u => Math.hypot(u.x - e.x, u.y - e.y) - u.r - e.r))));
      return `Through the gate: ${this.through()} of ${this.need} (the Captain among them) · Captain: ${c.escaped ? 'through' : alive(c) ? `Might ${c.might}` : 'slain'} · nearest Uruk-hai: ${near < 99 ? `${Math.max(0, near).toFixed(1)}″` : 'none'}`;
    },
    debrief: {
      win: 'You made the gate. A Heroic March gave the Captain and every Warrior within 6″ of him 3″ more each time, which is what the road needed; you marched when the Uruk-hai could not reach you first, and kept the column tight.',
      lose: 'The Uruk-hai caught you, or the road was too long. 4 turns of 6″ fall short: declare a Heroic March and shout At the Double with the Warriors within 6″ of the Captain. If the Uruk-hai have Priority and can Charge him first, a Heroic Move instead keeps him free.',
    },
  },
  {
    title: 'Loose!', lesson: 'Heroic Shoot and Heroic Accuracy', board: [24, 18], limit: 6, priority: 'evil', need: 3, maxLost: 4,
    noCharge: 'The stream is too deep to cross, so nobody can Charge here.',
    // A pure firefight: neither side breaks (Courage is not this mission's lesson).
    breakAt: { good: 1, evil: 1 },
    intro: 'Hill Tribesmen archers lie in the undergrowth behind a hedge across the stream and loose on Háma\'s patrol. They sprang the ambush, so they have Priority every turn: their arrows fly before yours. Your Heroes can change that with Heroic Actions in the Shoot phase. A Heroic Shoot lets a Hero shoot before every other model, and with the shout Loose the friends within 6″ of him shoot at the same time; the Captain has no bow, but he can still declare it and shout Loose. A Heroic Accuracy (Háma\'s own) lets him re-roll failed In The Way Tests, and with the shout Take Aim the friends within 6″ of him re-roll them too.',
    goal: 'Shoot down 3 of the 4 tribesmen archers before they shoot down 4 of your 12 Warriors, and by the end of turn 6. Háma must not fall.',
    tip: 'Every shot at the tribesmen must pass two In The Way Tests, one for the hedge and one for the undergrowth, so three hits in four are lost; they stand touching both and shoot out freely. Take Aim lets every archer near Háma re-roll each failed test: more than twice as many arrows get through. Loose lets your archers shoot before the tribesmen, so the ones you kill never loose at you. Both Heroes can declare in the same Shoot phase (one Heroic Action each, a Might Point each): do it in the first turns, while every archer is still standing. Your rear rank touches the front rank, so it shoots over their shoulders; stay where you are.',
    rules: ['heroicShoot', 'heroicAccuracy'],
    terrain: [{ k: 'water', x: 0, y: 7.5, w: 24, h: 2.5 }, { k: 'brush', x: 3, y: 1.5, w: 18, h: 4 }, { k: 'hedge', x: 3, y: 5.5, w: 18, h: 0.6, ht: 1 }],
    units: [
      { t: 'hamaPrince', side: 'good', x: 12, y: 14 }, { t: 'captainOfRohan', side: 'good', x: 12, y: 15 },
      // Two ranks: the rear rank touches the front one, so it shoots over its shoulder; all within 6″ of both Heroes.
      ...[14, 15].flatMap(y => row('warriorOfRohanBow', 'good', [8.4, 9.6, 10.8, 13.2, 14.4, 15.6], y)),
      // The tribesmen stand in the undergrowth touching the hedge: they ignore both when they shoot.
      ...row('hillTribesmanBow', 'evil', [7.5, 10.5, 13.5, 16.5], 5, { ai: 'hold' }),
    ],
    hama() { return G.units.find(u => u.t === 'hamaPrince'); },
    downed: () => G.units.filter(u => u.side === 'evil' && !alive(u)).length,
    lost: () => G.units.filter(u => u.t === 'warriorOfRohanBow' && !alive(u)).length,
    // Checked after each side's volley, so whoever reaches its count first wins the race.
    check(atEnd) {
      if (!alive(this.hama())) return 'lose';
      if (this.downed() >= this.need) return 'win';
      if (this.lost() >= this.maxLost) return 'lose';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const h = this.hama(), c = G.units.find(u => u.t === 'captainOfRohan');
      return `Tribesmen shot down: ${this.downed()} of ${this.need} · Warriors lost: ${this.lost()} of ${this.maxLost} · Might: Háma ${alive(h) ? h.might : '-'}, Captain ${alive(c) ? c.might : '-'}`;
    },
    debrief: {
      win: 'The ambush failed. Take Aim gave every archer near Háma a second chance at each In The Way Test against the hedge and the undergrowth, and the Captain\'s Loose let them shoot before the tribesmen: the Might Points went where they changed the most shots.',
      lose: 'The hedge and the undergrowth stopped most of your arrows, and the tribesmen shot first every turn. Spend the Might Points in the Shoot phase of the first turns: Háma\'s Heroic Accuracy with Take Aim to re-roll the failed In The Way Tests, and the Captain\'s Heroic Shoot with Loose to shoot before them, with the archers within 6″ of both.',
    },
  },
  {
    title: 'Through the Line', lesson: 'Heroic Combat and Heroic Strike', board: [18, 18], limit: 3, noShoot: true,
    // A duel of Heroes: neither side breaks (Courage is not this mission's lesson).
    breakAt: { good: 1, evil: 1 },
    intro: 'Wulf, the Dunlending who would be king of Rohan, waits behind a line of Hill Tribesmen. Haleth means to reach him and throw him back before the tribes close round. The line holds its ground and leaves no gap to slip through, so Haleth must cut his way across it. Two Heroic Actions of the Fight phase help him. A Heroic Combat has his fight resolved before every other; if every enemy in it falls, he may Move again at once and Charge, and fight a second time in the same phase. A Heroic Strike adds a D3 to his Fight Value for the phase, and Fight Value is what decides a tied Duel Roll.',
    goal: 'Win a Duel Roll against Wulf by the end of turn 3. Haleth must not fall.',
    tip: 'Charge one tribesman alone and declare a Heroic Combat: Haleth\'s three dice against one Fight Value 3 die almost always win, and his Strikes nearly always slay it. Then Charge Wulf in the same Fight phase: that is a fight against him in turn 1 instead of turn 2. Wulf has Fight Value 6 like Haleth, so a tie on the dice goes to a roll-off; a Heroic Strike makes Haleth\'s Fight Value 7 to 9 and wins every tie. Against the tribesmen it is wasted, since Haleth wins those ties anyway. One Heroic Action a phase: Heroic Combat while you cut through, Heroic Strike once you fight Wulf. Keep a Might Point if you can, for the Duel Roll or a Fate roll.',
    rules: ['heroicCombat', 'heroicStrike'],
    terrain: [],
    units: [
      { t: 'halethPrince', side: 'good', x: 9, y: 16 },
      // The line holds its ground: 3.9″ between centres leaves 0.9″ between their Control Zones, too narrow for a base.
      ...row('hillTribesman', 'evil', [1.2, 5.1, 9, 12.9, 16.8], 10, { ai: 'hold' }),
      { t: 'wulf', side: 'evil', x: 9, y: 5, ai: 'hold' },
    ],
    haleth() { return G.units.find(u => u.t === 'halethPrince'); },
    wulf() { return G.units.find(u => u.t === 'wulf'); },
    check(atEnd) {
      if (!alive(this.haleth())) return 'lose';
      const w = this.wulf();
      if (!alive(w) || w.duelsLost) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const h = this.haleth(), t = this.wulf();
      return `Wulf: ${alive(t) ? `${t.duelsLost ? 'beaten' : 'unbeaten'}, Might ${t.might}` : 'slain'} · Haleth: ${alive(h) ? `${h.w} Wounds, Might ${h.might}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    debrief: {
      win: 'Wulf gives ground. The Heroic Combat let Haleth slay the tribesman in his way and Charge on in the same Fight phase, a fight more than the turns allowed otherwise, and a Heroic Strike turned the ties between two Fight Values of 6 his way.',
      lose: 'Wulf held. Charge a lone tribesman and declare a Heroic Combat: once it falls, Haleth may Charge Wulf in the same phase. Against Wulf declare a Heroic Strike instead: with equal Fight Values a tie goes to a roll-off, and the D3 wins it for Haleth. Never both in one phase.',
    },
  },
  {
    title: 'Unbreakable', lesson: 'Heroic Defence against Heroic Strength', board: [18, 18], limit: 4, noShoot: true,
    // A duel of Heroes: neither side breaks (Courage is not this mission's lesson).
    breakAt: { good: 1, evil: 1 },
    intro: 'Freca, Lord of the Westmarch, leads his tribesmen down to the Edoras road, and Háma, already wounded, stands alone in the pass between the rocks to stop them. The pass is narrow: while Háma stands in it, nobody slips past him, so Freca must cut him down. Freca has Heroic Strength: for a Might Point his Strength doubles, and a Strength 8 blow wounds even Háma\'s heavy armour on a 3+. Háma has the answer, Heroic Defence: for a Might Point, he is wounded only on a natural 6 for the rest of the Fight phase, whatever the Strength. He has two Might Points and one Wound left; Freca has three Might Points.',
    goal: 'Hold the pass to the end of turn 4: Háma must not fall, and no enemy may reach the road behind the rocks (the dashed area). Slaying Freca wins at once.',
    tip: 'Stay inside the pass: the rocks keep all but two or three enemies off you, and your Control Zone fills the gap. In the Declare Heroic Actions step the sides take turns, so pass first, and when Freca declares a Heroic Strength, answer with a Heroic Defence. Against the tribesmen alone it is wasted: Strength 3 against Defence 6 needs a 6 anyway. Do not spend Might on the Duel Roll or To Wound: Háma has two points, and Freca has three Heroic Strengths to answer. Fate needs no Might.',
    rules: ['heroicDefence', 'heroicStrength'],
    terrain: [{ k: 'rock', x: 0, y: 6, w: 7.25, h: 6 }, { k: 'rock', x: 10.75, y: 6, w: 7.25, h: 6 }],
    area: { x: 0, y: 12.5, w: 18, h: 5.5, label: 'ROAD' },
    units: [
      { t: 'hamaPrince', side: 'good', x: 9, y: 7.5, w: 1 },
      { t: 'freca', side: 'evil', x: 9, y: 1.5 },
      ...row('hillTribesman', 'evil', [6, 9, 12], 3),
    ],
    hama() { return G.units.find(u => u.t === 'hamaPrince'); },
    freca() { return G.units.find(u => u.t === 'freca'); },
    through() { return G.units.some(u => u.side === 'evil' && alive(u) && u.y > 12); },
    check(atEnd) {
      if (!alive(this.hama()) || this.through()) return 'lose';
      if (!alive(this.freca())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'win';
      return null;
    },
    status() {
      const h = this.hama(), f = this.freca();
      return `Háma: ${alive(h) ? `${h.w} Wound${h.w === 1 ? '' : 's'}, Might ${h.might}, Fate ${h.fate}` : 'slain'} · Freca: ${alive(f) ? `Might ${f.might}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    debrief: {
      win: 'The pass holds. Freca\'s Heroic Strength made him wound on a 3+, but each time a Heroic Defence answered it, he needed a 6 again. Waiting for him to declare first, and keeping his Might off the dice, Háma spent it only where it counted.',
      lose: 'The pass fell. Wait in the Declare Heroic Actions step until Freca declares a Heroic Strength, then answer with a Heroic Defence: Háma is then wounded only on a natural 6. Do not spend it against the tribesmen alone, nor on the dice, and stay inside the pass.',
    },
  },
  {
    title: 'The Challenge', lesson: 'Heroic Challenge', board: [24, 18], limit: 4, noShoot: true,
    // A duel of Heroes: neither side breaks (Courage is not this mission's lesson).
    breakAt: { good: 1, evil: 1 },
    intro: 'Freca, Lord of the Westmarch, comes down with his tribesmen to take what he can. Haleth means to end the raid by slaying Freca himself, and a Heroic Action of the Fight phase helps him do it. A Hero that declares a Heroic Challenge names an enemy Hero within 6″ of the same Heroic Tier or higher; both are of Valour. Engaged with that Hero, the challenger has +1 Attack, in the Duel Roll and for Strikes, and +1 To Wound, and slaying it gives back a Might Point. The target accepts or declines. If it accepts, it gets the same bonuses, and both Heroes must Charge each other whenever they can. If it declines, only the challenger gets them.',
    goal: 'Slay Freca by the end of turn 4. Haleth must not fall.',
    tip: 'Walk Haleth at Freca and let your Warriors take the tribesmen. Once Freca is within 6″, declare a Heroic Challenge in the Fight phase, even before the two are in base contact: the challenge lasts until one of them falls. Freca is weaker than Haleth and will likely decline, so the bonuses are Haleth\'s alone: four Attacks, and Freca\'s heavy armour (Defence 6) wounded on a 4+ instead of a 5+. A Heroic Strike adds nothing here: Haleth\'s Fight Value 6 already wins the ties against Freca\'s 5. If an enemy Hero ever challenges you, accept only when your Hero is the stronger: declining gives the bonuses to the challenger alone.',
    rules: ['heroicChallenge'],
    terrain: [],
    units: [
      { t: 'halethPrince', side: 'good', x: 12, y: 15 },
      ...row('warriorOfRohan', 'good', [8, 10, 14, 16], 15.5),
      ...row('hillTribesman', 'evil', [8, 10.5, 13.5, 16], 6),
      { t: 'freca', side: 'evil', x: 12, y: 3 },
    ],
    haleth() { return G.units.find(u => u.t === 'halethPrince'); },
    freca() { return G.units.find(u => u.t === 'freca'); },
    check(atEnd) {
      if (!alive(this.haleth())) return 'lose';
      if (!alive(this.freca())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const h = this.haleth(), t = this.freca(), c = (G.challenges || []).find(x => [x.a, x.t].includes(h.id) && [x.a, x.t].includes(t.id));
      const duel = !c ? 'no challenge' : `${c.a === h.id ? 'Haleth' : 'Freca'} challenged, ${c.acc ? 'accepted' : c.acc === false ? 'declined' : 'unanswered'}`;
      const ws = u => `${u.w} Wound${u.w === 1 ? '' : 's'}, Might ${u.might}`;
      return `Freca: ${alive(t) ? ws(t) : 'slain'} · Haleth: ${alive(h) ? ws(h) : 'slain'} · ${duel} · turn ${G.turn} of ${this.limit}`;
    },
    debrief: {
      win: 'Freca falls. Declined or not, the Heroic Challenge gave Haleth an extra Attack and +1 To Wound against him, and the last blow gave the Might Point back.',
      lose: 'Freca lives. Once he is within 6″, declare a Heroic Challenge against him in the Fight phase: whether he accepts or declines, Haleth fights him with +1 Attack and +1 To Wound. Leave the tribesmen to your Warriors and go for Freca.',
    },
  },
  {
    title: 'The Hammerhand', lesson: 'Into the Fray: every Heroic Action at once', board: [24, 24], limit: 7, noShoot: true,
    intro: 'Wulf has come for the throne of Rohan with Freca, General Targg, the Hill Tribes and the Rohirrim who betrayed their king. Helm Hammerhand, King of Rohan, meets them with his sons Haleth and Háma and his household. Helm has a rule of his own, Into the Fray: he may declare a Heroic Combat in every Fight phase without spending Might. Once he has slain an enemy, though, he must Charge whenever he Moves and can reach one. Every Heroic Action you have learned is in play, for both sides.',
    goal: 'Slay Wulf by the end of turn 7. Helm must not fall.',
    tip: 'Lead with Helm: his free Heroic Combat each Fight phase lets him slay a lone enemy, Move again and Charge the next. Aim those Charges at Wulf. Mind Into the Fray: after his first kill Helm must Charge when he can, so keep him pointed at the enemy line and let the Warriors and the Princes guard his flanks. His two-handed weapon wounds on +1, and he is Burly: no −1 on the Duel Roll for it. Haleth can challenge Wulf (both are Heroes of Valour or higher); Helm cannot, as Wulf\'s tier is lower than his. Freca has Heroic Strength: Háma\'s Heroic Defence answers it.',
    rules: ['intoTheFray'], also: ['burly'],
    terrain: [],
    units: [
      { t: 'helmHammerhand', side: 'good', x: 12, y: 20 },
      { t: 'halethPrince', side: 'good', x: 15, y: 21 },
      { t: 'hamaPrince', side: 'good', x: 9, y: 21 },
      ...row('warriorOfRohan', 'good', [5, 7, 10.5, 13.5, 17, 19], 21.5),
      ...row('hillTribesman', 'evil', [4, 6.5, 9, 11, 13, 15, 17.5, 20], 8),
      ...row('rohirrimTraitor', 'evil', [8, 10.5, 13.5, 16], 5.5),
      { t: 'freca', side: 'evil', x: 7, y: 4 },
      { t: 'generalTargg', side: 'evil', x: 17, y: 4 },
      { t: 'wulf', side: 'evil', x: 12, y: 3 },
    ],
    helm() { return G.units.find(u => u.t === 'helmHammerhand'); },
    haleth() { return G.units.find(u => u.t === 'halethPrince'); },
    hama() { return G.units.find(u => u.t === 'hamaPrince'); },
    freca() { return G.units.find(u => u.t === 'freca'); },
    wulf() { return G.units.find(u => u.t === 'wulf'); },
    check(atEnd) {
      if (!alive(this.helm())) return 'lose';
      if (!alive(this.wulf())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const h = this.helm(), w = this.wulf();
      const ws = u => `${u.w} Wound${u.w === 1 ? '' : 's'}, Might ${u.might}`;
      return `Wulf: ${alive(w) ? ws(w) : 'slain'} · Helm: ${alive(h) ? `${ws(h)}${h.frayed ? ', must Charge' : ''}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    debrief: {
      win: 'Wulf is slain and the Usurpers\' war ends with him. Into the Fray gave Helm a Heroic Combat every turn without spending Might: each lone enemy he slew let him Move and Charge again, nearer to Wulf each time.',
      lose: 'Wulf lives. Give Helm his free Heroic Combat every Fight phase: a Combat against one enemy he can slay lets him Charge again in the same phase. Point those Charges at Wulf, and keep the Princes and Warriors on Helm\'s flanks.',
    },
  },
  /* ---------- Chapter VI: Magic ---------- */
  {
    chapter: 'Magic',
    title: 'The White Rider', lesson: 'Casting Magical Powers', board: [30, 24], limit: 4, noShoot: true,
    intro: 'Seven Uruk-hai of Isengard are running south to burn the villages of the Westfold, and only Gandalf the White and one Warrior of Rohan stand in their way. Gandalf has Magical Powers: as he Activates in the Move phase he may Cast one, spending Will Points, one D6 for each. Any dice that reaches the Casting Value Casts it. He has 6 Will for the whole battle and two powers here: Transfix (3+, 12″) stops an enemy until the End phase: it cannot Activate, so it does not move at all, and makes no Strikes if it wins a fight; Sorcerous Blast (5+, 12″) strikes one enemy with a Strength 5 hit and knocks it Prone, so it spends half its Move standing up. The Uruk-hai have no Will: they cannot Resist.',
    goal: 'Let no more than 2 Uruk-hai reach the road (within 2″ of the south edge) by the end of turn 4, or slay them all. Gandalf must not fall.',
    tip: 'The Uruk-hai need four turns to reach the road: one turn lost is enough to stop a runner. Gandalf Casts once a turn at most, so cast every turn, at the runner nearest the road that neither he nor the Warrior can catch, often one on a flank. Choose the dice before you roll, and the Will is spent whether the power works or not: Transfix needs a 3+, so one dice works two times in three and two dice eight times in nine; Sorcerous Blast needs a 5+, so two dice work five times in nine. Six Will Points for four Casts: two dice when a runner must be stopped, one when you can risk it.',
    rules: ['magic'], also: ['sorcerousBlast', 'transfix'],
    terrain: [{ k: 'rock', x: 0, y: 7, w: 2.5, h: 3 }, { k: 'rock', x: 27.5, y: 6.5, w: 2.5, h: 3 }],
    units: [
      { t: 'gandalfWhite', side: 'good', x: 15, y: 11.5 },
      ...row('warriorOfRohan', 'good', [18.5], 14),
      ...row('urukHaiWarrior', 'evil', [4, 8, 12, 15, 18, 22, 26], 3),
    ],
    most: 2,
    gandalf() { return G.units.find(u => u.t === 'gandalfWhite'); },
    // An Uruk-hai that reaches the road (within 2″ of the south edge) runs on to the villages: it leaves the battle.
    through() {
      for (const u of sideAlive('evil')) if (u.y + u.r >= G.H - 2) { u.gone = true; u.escaped = true; }
      return escaped('evil');
    },
    check(atEnd) {
      if (!alive(this.gandalf()) || this.through() > this.most) return 'lose';
      if (!sideAlive('evil').length) return 'win';
      if (atEnd && G.turn >= this.limit) return 'win';
      return null;
    },
    status() {
      const g = this.gandalf();
      return `Uruk-hai on the road: ${this.through()} (${this.most + 1} lose) · Gandalf: ${alive(g) ? `${g.w} Wound${g.w === 1 ? '' : 's'}, Will ${g.will}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    // The Uruk-hai run straight for the south edge (the computer still Charges what stands in reach).
    aiGoal(u) { return u.side === 'evil' ? { x: u.x, y: G.H - 1 } : undefined; },
    debrief: {
      win: 'The Westfold is safe. Each Will Point bought one dice: a Transfix held an Uruk-hai where it stood for a whole turn, and a Sorcerous Blast struck one down or left it spending half its Move getting up.',
      lose: 'The Uruk-hai got through. Cast every turn, at the runner nearest the road that Gandalf and the Warrior cannot catch: a Transfix (3+) costs it a whole turn, a Sorcerous Blast (5+) half a Move and maybe its life. One turn lost is enough to stop a runner.',
    },
  },
  {
    title: 'The Shaman\'s Fury', lesson: 'Resisting Magical Powers', board: [24, 18], limit: 6, noShoot: true,
    intro: 'An Uruk-hai Shaman drives a war band of Isengard into Rohan, and Haleth rides out with his Warriors to end him. Now the enemy Casts. The Shaman has 3 Will and three powers: Transfix (5+) can stop Haleth for a turn, Bladewrath (4+) gives one Uruk-hai Strength 6 Strikes this turn, and Fury (3+) makes his Uruk-hai within 6″ pass their Courage Tests for as long as he has Will left. When a power targets Haleth, he may Resist: he spends Will Points, one D6 each, and any dice equal to or above the Shaman\'s best Casting dice stops the power. Every natural 6 Haleth rolls to Resist gives that Will Point back.',
    goal: 'Slay the Uruk-hai Shaman by the end of turn 6. Haleth must not fall.',
    tip: 'Haleth has 2 Will Points for the whole battle, and the Shaman will Transfix him when he comes close. Resist when the Transfix would stop Haleth\'s Charge at the Shaman or his Strikes in a fight: a Transfixed Haleth does not move, and makes no Strikes even if he wins. The panel shows your chance for each number of dice: against a 5 two dice give five in nine, against a 6 only a 6 will do. Heroic Resolve (a Might Point in the Move phase) adds a free dice to every Resist Test of Haleth and friends within 6″ this turn, even with no Will left. Bladewrath and Fury target the Shaman\'s own side: they cannot be Resisted.',
    rules: ['resist'], also: ['fury', 'bladewrath'],
    terrain: [{ k: 'rock', x: 2, y: 7.5, w: 3, h: 3 }, { k: 'brush', x: 19, y: 8, w: 3, h: 2.5 }],
    units: [
      { t: 'halethPrince', side: 'good', x: 12, y: 15.5 },
      ...row('warriorOfRohan', 'good', [6, 8, 10, 14, 16, 18], 14),
      { t: 'urukHaiShaman', side: 'evil', x: 12, y: 2.5, ai: 'hold' },
      ...row('urukHaiWarrior', 'evil', [10.5, 13.5], 2.5),
      ...row('urukHaiWarrior', 'evil', [12], 6),
    ],
    haleth() { return G.units.find(u => u.t === 'halethPrince'); },
    shaman() { return G.units.find(u => u.t === 'urukHaiShaman'); },
    check(atEnd) {
      if (!alive(this.haleth())) return 'lose';
      if (!alive(this.shaman())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const h = this.haleth(), s = this.shaman();
      return `Shaman: ${alive(s) ? `${s.w} Wound${s.w === 1 ? '' : 's'}, Will ${s.will}` : 'slain'} · Haleth: ${alive(h) ? `${h.w} Wound${h.w === 1 ? '' : 's'}, Will ${h.will}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    // The player's side (AI plays for you, the balance tool): Haleth makes for the Shaman; the Warriors fight as usual.
    aiGoal(u) { const s = this.shaman(); return u.t === 'halethPrince' && alive(s) ? { x: s.x, y: s.y } : undefined; },
    debrief: {
      win: 'The Shaman is slain, and his powers end with him. Haleth\'s Will went on the Resist Tests that counted: a Transfix shrugged off as he Charged kept the Prince fighting when it mattered.',
      lose: 'The Shaman lives. Spend Haleth\'s Will on the Transfix that would stop his Charge or his Strikes, with two dice against a 5, and let the others go. Natural 6s give the Will back.',
    },
  },
  {
    title: 'The Breaking of the Staff', lesson: 'Staff of Power · Your Staff is Broken', board: [24, 36], limit: 6, noShoot: true,
    intro: 'Saruman waits before the gates of Isengard with two Uruk-hai guards, and Gandalf the White comes alone to break his power. Both wizards carry a Staff of Power: it gives a free Will Point at the start of every turn, lost if it is not spent that turn. Gandalf can Cast Your Staff is Broken (5+, 12″) at Saruman: if it is Cast and not Resisted, Saruman\'s staff is destroyed. Saruman has 6 Will and his free point to Resist it, and 3 Might to raise his Resist dice; he Casts too: Transfix (3+, 18″) to hold Gandalf where he stands, and Sorcerous Blast (5+, 12″). Gandalf has 6 Will for Casting and Resisting alike, and 3 Might: Heroic Channelling (a Might Point in the Move phase) makes his next Casting Test count as a 6, so Saruman needs a 6 to Resist it.',
    goal: 'Break Saruman\'s staff (or slay him) by the end of turn 6. Gandalf must not fall.',
    tip: 'Saruman Transfixes Gandalf from 18″: a Transfixed Gandalf cannot Activate, so he cannot Cast either. Resist those Transfixes with one or two dice, and keep Will for the staff. Within 12″, Cast Your Staff is Broken: spend the free Will Point of your own staff first, it is lost at the end of the turn anyway. With Heroic Channelling one Will Point Casts it for sure and Saruman needs a 6 to Resist; without it, three dice reach the 5+ seven times in ten, and Saruman Resists more easily. Saruman raises a 5 to a 6 with Might, so he may stop the first try: the staff gives Gandalf a Will Point every turn for the next. Keep Gandalf\'s Might for the Channelling.',
    rules: ['staffOfPower'], also: ['yourStaffIsBroken', 'heroicChannelling'],
    terrain: [{ k: 'rock', x: 3, y: 16, w: 3, h: 3 }, { k: 'rock', x: 18, y: 18, w: 3, h: 2.5 }],
    units: [
      { t: 'gandalfWhiteStaff', side: 'good', x: 12, y: 33.5 },
      { t: 'saruman', side: 'evil', x: 12, y: 2.5, ai: 'hold' },
      ...row('urukHaiWarrior', 'evil', [10, 14], 3, { ai: 'hold' }),
    ],
    gandalf() { return G.units.find(u => u.t === 'gandalfWhiteStaff'); },
    saruman() { return G.units.find(u => u.t === 'saruman'); },
    broken() { const s = this.saruman(); return !!s && !(s.T.gear || []).some(g => /^staff of power$/i.test(g)); },
    check(atEnd) {
      if (!alive(this.gandalf())) return 'lose';
      if (this.broken() || !alive(this.saruman())) return 'win';
      if (atEnd && G.turn >= this.limit) return 'lose';
      return null;
    },
    status() {
      const g = this.gandalf(), s = this.saruman();
      return `Saruman: ${alive(s) ? `${this.broken() ? 'staff broken' : 'staff whole'}, Will ${s.will}` : 'slain'} · Gandalf: ${alive(g) ? `${g.w} Wound${g.w === 1 ? '' : 's'}, Will ${g.will}, Might ${g.might}` : 'slain'} · turn ${G.turn} of ${this.limit}`;
    },
    // The player's side (AI plays for you, the balance tool): Gandalf walks at Saruman; the Warriors fight as usual.
    aiGoal(u) { const s = this.saruman(); return u.t === 'gandalfWhiteStaff' && alive(s) ? { x: s.x, y: s.y } : undefined; },
    debrief: {
      win: 'Saruman, your staff is broken. Without it his Will no longer grows each turn, and Isengard\'s master is a wizard like any other. Heroic Channelling made the Casting a 6 that only a 6 could Resist.',
      lose: 'Saruman keeps his staff. Resist the Transfix that would hold Gandalf out of range, then Cast Your Staff is Broken from within 12″ with Heroic Channelling: one Will Point, a sure 6, and Saruman needs a 6 to stop it.',
    },
  },
  /* ---------- The Battle of Edoras: the four Narrative Scenarios of the box's booklet (docs/edoras/) ---------- */
  // Narrative Play (narrative_play/#narrative-play-notes): Good has Priority in turn 1, no Broken armies. North is the
  // top edge. Board 36″ × 36″: the booklet's 3′ × 3′ mat; houses, markers and deployment zones measured from its maps.
  // The player may command either side (flipSide below): check() answers for the booklet's Good side (Rohan) and
  // asks by alignment (GOOD(), EVIL()); evil: the briefing texts for a player commanding the Hill Tribes.
  {
    chapter: 'The Battle of Edoras', narrative: true,
    series: 'E', heroics: [], title: 'The First Assault', lesson: 'Hatred: the Hill Tribes hate Rohan', board: [36, 36], priority: { 1: 'good' },
    noShoot: 'The First Assault: no Missile Weapons yet, the throwing spears fight only as spears (Battle of Edoras, p. 7).',
    intro: 'Wulf unleashes the Hill Tribesmen on the outskirts of Edoras. Twelve Warriors of Rohan, half of them with throwing spears used as spears, face twelve tribesmen: two with hand weapons, two with light shields, four with spears and four with two-handed weapons. The tribesmen have Hatred (Rohan): +1 on their To Wound rolls against your men. First scenario of the Battle of Edoras booklet (p. 6–7).',
    goal: 'The battle lasts until one side has no models left on the board.',
    tip: 'Your shields give Defence 5 against their 3, but Hatred makes their Strength 3 wound you on 4+ instead of 5+. Charge one model into two enemies and Support it with a spear: if you win, both can be struck; if you lose, the spearman cannot be. A shield bearer outnumbered can Shield.',
    rules: ['hatred'], also: ['armyRule'],
    // Map (p. 7): the two Rohan Houses across the centre, the right one turned 45° (here square to the table).
    terrain: [{ k: 'building', house: true, x: 8, y: 17, w: 6, h: 4.5 }, { k: 'building', house: true, x: 24, y: 18.5, w: 6, h: 4.5, a: 45 }],   // turned as on the map (p. 7)
    units: [
      ...row('warriorOfRohan', 'good', [12, 14, 16, 20, 22, 24], 27),
      ...[12, 14, 16, 20, 22, 24].map(x => ({ t: 'warriorOfRohanSpears', T: SPEARS_ONLY, side: 'good', x, y: 28.5 })),
      ...[['hillTribesmanTwoHanded', 11], ['hillTribesman', 13], ['hillTribesmanShield', 15], ['hillTribesmanTwoHanded', 17], ['hillTribesmanTwoHanded', 19], ['hillTribesmanShield', 21], ['hillTribesman', 23], ['hillTribesmanTwoHanded', 25]].map(([t, x]) => ({ t, side: 'evil', x, y: 9 })),
      ...row('hillTribesmanSpear', 'evil', [13, 17, 19, 23], 7),
    ],
    check() { return !sideAlive(EVIL()).length ? 'win' : !sideAlive(GOOD()).length ? 'lose' : null; },
    status: stdStatus,
    evil: {
      intro: 'Wulf unleashes your Hill Tribesmen on the outskirts of Edoras. Twelve tribesmen (two with hand weapons, two with light shields, four with spears, four with two-handed weapons) charge twelve Warriors of Rohan, half of them with throwing spears used as spears. Your men have Hatred (Rohan): +1 on their To Wound rolls against the Rohirrim. First scenario of the Battle of Edoras booklet (p. 6–7), played from the Evil side.',
      goal: 'The battle lasts until one side has no models left on the board.',
      tip: 'Their shields give them Defence 5 against your 3, but Hatred and the two-handed weapons wound them on 4+ or 3+. Gang up two or three on one: a lone warrior who loses is Trapped or struck twice. Your spears Support from behind.',
      debrief: {
        win: 'The outskirts are yours. Hatred made every blow count, and you fought where you had more men.',
        lose: 'The Rohirrim hold. Their shields need 5+ to wound, so use Hatred and the two-handed weapons, and fight two on one.',
      },
    },
    debrief: {
      win: 'The outskirts hold. Hatred made every tribesman\'s blow count, so you fought where you had more men: two on one with a spear behind, and the shields up when outnumbered.',
      lose: 'The tribesmen hit harder than their profile says: Hatred adds 1 To Wound against Rohan. Gang up two on one, put spears behind the fighters, and Shield when a lone warrior is outnumbered.',
    },
  },
  {
    narrative: true, brandDominant: true,
    series: 'E', heroics: [], title: 'The Gates Fall', lesson: 'Objective Markers', board: [36, 36], limit: 8, priority: { 1: 'good' },
    intro: 'The gates are breached. Háma leads eight archers and four shield bearers against General Targg and sixteen tribesmen, four of them with flaming brands. Three Objective Markers lie along the middle of the street. Heroes take the field for the first time: Might only raises dice here, Heroic Actions come later. Second scenario of the booklet (p. 8–9).',
    goal: 'At the end of turn 8, control more Objective Markers than the enemy: more of your models within 3″ of a marker than theirs. A flaming brand counts as 2 models.',
    tip: 'You are outnumbered but have nine bows. Shoot for the first turns, flaming brands first: each counts twice on a marker. Then walk onto the markers late, when fewer tribesmen are left to contest them. Háma is a Sharpshooter with Might to raise a To Hit roll.',
    rules: ['objectives', 'sharpshooter'], also: ['heroRule', 'theWarriorPoet', 'dunlendingCommander', 'masterOfBattle'],
    // Map (p. 9), mat side B: the three printed markers on the north-south centre line, one in each deployment zone and
    // one in the middle; the houses either side of the middle one, the right one turned 45° (here square to the table).
    objectives: [{ x: 18, y: 6, r: OBJ_R }, { x: 18, y: 18, r: OBJ_R }, { x: 18, y: 30, r: OBJ_R }],
    terrain: [{ k: 'building', house: true, x: 6.6, y: 17, w: 6, h: 4.5, a: -15 }, { k: 'building', house: true, x: 23.4, y: 17.3, w: 6, h: 4.5, a: 45 }],   // angles from the map (p. 9)
    units: [
      { t: 'hamaPrince', side: 'good', x: 18, y: 33.5 },
      ...row('warriorOfRohan', 'good', [15, 17, 19, 21], 27),
      ...row('warriorOfRohanBow', 'good', [10, 12, 14, 16, 20, 22, 24, 26], 29),
      { t: 'generalTargg', side: 'evil', x: 18, y: 3 },
      ...[['hillTribesmanBrand', 11], ['hillTribesmanTwoHanded', 13], ['hillTribesmanShield', 15], ['hillTribesmanTwoHanded', 17], ['hillTribesmanTwoHanded', 19], ['hillTribesmanBrandShield', 21], ['hillTribesmanTwoHanded', 23], ['hillTribesman', 25]].map(([t, x]) => ({ t, side: 'evil', x, y: 10 })),
      ...[['hillTribesman', 12], ['hillTribesmanSpear', 14], ['hillTribesmanSpear', 16], ['hillTribesmanSpear', 20], ['hillTribesmanSpear', 22], ['hillTribesmanShield', 24]].map(([t, x]) => ({ t, side: 'evil', x, y: 8 })),
      { t: 'hillTribesmanBrand', side: 'evil', x: 13, y: 6 }, { t: 'hillTribesmanBrandShield', side: 'evil', x: 23, y: 6 },
    ],
    held(side) { return G.objectives.filter(o => { const n = near(o, 3); return n[side] > n[side === 'good' ? 'evil' : 'good']; }).length; },
    ctrl() { return `Markers held: you ${this.held('good')}, the enemy ${this.held('evil')}.`; },
    check(atEnd) {
      if (!sideAlive(GOOD()).length) return 'lose';
      if (!sideAlive(EVIL()).length) return 'win';
      const g = this.held(GOOD()), e = this.held(EVIL());
      if (atEnd && G.turn >= this.limit) return g > e ? 'win' : g === e ? 'draw' : 'lose';
      return null;
    },
    status() { return `${this.ctrl()} · models: ${sideAlive('good').length} against ${sideAlive('evil').length}`; },
    // The computer: Targg's tribesmen make for the markers they do not hold yet (scenarios.js: holdGoal); the player's
    // side (AI plays for you, the balance tool) gathers round its own marker, shooting, and reaches for the others from turn 5, or sooner once it has twice the enemy's models.
    aiGoal(u) {
      if (alignOf(u.side) === 'evil') return holdGoal(u, G.objectives, 3);
      const foe = u.side === 'good' ? 'evil' : 'good';
      const d = o => Math.hypot(u.x - o.x, u.y - o.y) - u.r - o.r, lead = o => { const n = near(o, 3); return n[u.side] - n[foe]; };
      if (G.turn < 5 && sideAlive(u.side).length < 2 * sideAlive(foe).length) { const o = G.objectives[2]; return d(o) <= 2.5 ? null : { x: o.x, y: o.y }; }
      const here = G.objectives.find(o => d(o) <= 2.5);
      if (here && lead(here) <= 1) return null;   // needed where it stands
      const go = G.objectives.filter(o => lead(o) <= 0).sort((a, b) => d(a) - d(b))[0];
      return go ? { x: go.x, y: go.y } : undefined;
    },
    evil: {
      intro: 'The gates are breached. You lead General Targg and sixteen Hill Tribesmen, four of them with flaming brands, into the streets against Háma, eight archers and four shield bearers. Three Objective Markers lie along the middle of the street. Heroes take the field for the first time: Might only raises dice here, Heroic Actions come later. Second scenario of the booklet (p. 8–9), played from the Evil side.',
      goal: 'At the end of turn 8, control more Objective Markers than the enemy: more of your models within 3″ of a marker than theirs. Each flaming brand counts as 2 models.',
      tip: 'Nine bows will thin you out every turn you stand off: close in fast. You outnumber them, and your spears and two-handed weapons win the fights. Keep the flaming brands alive and on a marker at the end, they count double.',
      debrief: {
        win: 'The street is yours. You closed in before the arrows could tell, and the flaming brands counted double on the markers.',
        draw: 'A draw: both sides hold as many markers. Bring more men, and the flaming brands, onto a marker in the last turn.',
        lose: 'The Rohirrim hold the street. Every turn out of reach of their lines is a turn of arrows: charge, and keep the flaming brands for the markers.',
      },
    },
    debrief: {
      win: 'The street is yours. Objective Markers only count at the end: you shot first, picked off the flaming brands that counted double, and claimed the markers when there was nobody left to contest them.',
      draw: 'A draw: both sides hold as many markers. Shoot the flaming brands first, they count twice, and keep two models on a marker you mean to hold.',
      lose: 'The tribesmen hold the street. Shoot before you close in, flaming brands first (they count as two), and bring your models onto the markers in the last turns.',
    },
  },
  {
    narrative: true, fire: true,
    series: 'E', heroics: ['move', 'shoot', 'combat'], title: 'Torch the City', lesson: 'Heroic Combat · burning Storehouses', board: [36, 36], limit: 8, priority: { 1: 'good' },
    intro: 'The tribesmen carry torches towards the Storehouses near Meduseld. Haleth gathers twelve warriors (shields, throwing spears, bows) against General Targg and twenty-four tribesmen, eight of them archers. Heroes may now use the three Heroic Actions every Hero has: Heroic Move, Heroic Shoot and Heroic Combat. Third scenario of the booklet (p. 10–11).',
    goal: 'At the end of turn 8 neither Storehouse may be on fire. Both burning is a defeat, one burning a draw.',
    tip: 'An Engaged tribesman cannot light anything: meet them before they reach the walls. Heroic Combat lets Haleth fight first and, if he kills everything in his fight, Charge again. Keep a shield bearer near each Storehouse to put fires out (5+); a bowman who tries loses his shot.',
    rules: ['storehouses', 'heroicCombat'], also: ['heroicShoot', 'defenderOfEdoras', 'throwing'],
    // Map (p. 11): the two Storehouses near the east edge (fully within 12″ of it); Good wholly within 3″ of either,
    // Evil wholly within 6″ of the west edge.
    terrain: E3_STORES,
    units: [
      ...[{ t: 'halethPrince', side: 'good', x: 23.3, y: 10.2 },
        ...[[23.3, 8.6], [23.3, 11.9], [23.3, 28.6], [23.3, 31]].map(([x, y]) => ({ t: 'warriorOfRohan', side: 'good', x, y })),
        ...[[26.5, 6.6], [29, 6.6], [26.5, 26.1], [29, 26.1]].map(([x, y]) => ({ t: 'warriorOfRohanSpears', side: 'good', x, y })),
        ...[[26.5, 13.9], [29, 13.9], [26.5, 33.4], [29, 33.4]].map(([x, y]) => ({ t: 'warriorOfRohanBow', side: 'good', x, y }))].map(byStore),
      { t: 'generalTargg', side: 'evil', x: 3.5, y: 18.5 },
      ...['hillTribesmanBrand', 'hillTribesmanTwoHanded', 'hillTribesman', 'hillTribesmanShield', 'hillTribesmanTwoHanded', 'hillTribesmanBrandShield', 'hillTribesmanTwoHanded', 'hillTribesmanBrand', 'hillTribesmanTwoHanded', 'hillTribesmanSpear'].map((t, k) => ({ t, side: 'evil', x: 5, y: 5 + k * 3 })),
      ...['hillTribesman', 'hillTribesmanShield', 'hillTribesmanBrandShield', 'hillTribesmanSpear', 'hillTribesmanSpear', 'hillTribesmanSpear'].map((t, k) => ({ t, side: 'evil', x: 3.5, y: [9.5, 12.5, 15.5, 21.5, 24.5, 27.5][k] })),
      ...[6, 10, 14, 18, 22, 26, 30, 34].map(y => ({ t: 'hillTribesmanBow', side: 'evil', x: 2, y })),
    ],
    check(atEnd) {
      if (!sideAlive(GOOD()).length) return 'lose';
      if (atEnd && G.turn >= this.limit) { const n = burningCount(); return n === 0 ? 'win' : n === 1 ? 'draw' : 'lose'; }
      return null;
    },
    status() { const n = burningCount(); return `Storehouses on fire: ${n} of 2 · models: ${sideAlive('good').length} against ${sideAlive('evil').length}`; },
    // The computer's tribesmen (not the archers) make for a Storehouse that is not burning, and guard a burning one;
    // the player's side (AI plays for you, the balance tool) runs to a burning Storehouse and otherwise stays by them.
    aiGoal(u) {
      const S = stores(), dist = T => rectDist(u.x, u.y, T);
      if (alignOf(u.side) === 'evil') {
        if (u.bow || u.T.hero) return undefined;
        const cold = S.filter(T => !burning(T)).sort((a, b) => dist(a) - dist(b))[0];
        if (cold) return touches(u, cold) ? null : wallSpot(u, cold);
        return undefined;
      }
      const hot = S.filter(burning).sort((a, b) => dist(a) - dist(b))[0];
      if (hot && !u.bow) return touches(u, hot) ? null : wallSpot(u, hot);
      const home = S.slice().sort((a, b) => dist(a) - dist(b))[0];
      return u.bow ? null : dist(home) > 4 ? wallSpot(u, home) : undefined;
    },
    evil: {
      intro: 'Your tribesmen carry torches towards the Storehouses near Meduseld. You lead General Targg and twenty-four Hill Tribesmen, eight of them archers, against Haleth and twelve warriors (shields, throwing spears, bows). Heroes may now use the three Heroic Actions every Hero has: Heroic Move, Heroic Shoot and Heroic Combat. Third scenario of the booklet (p. 10–11), played from the Evil side.',
      goal: 'At the end of turn 8 both Storehouses must be on fire. One burning is a draw, none a defeat.',
      tip: 'At the end of the Move Phase every tribesman touching a Storehouse, and not Engaged, may roll to set it alight: a 6, or 5+ with a flaming brand. Charge the defenders first so they are busy, then put the spare men against the walls. Targg\'s Heroic Move lets you move first when you lack Priority.',
      debrief: {
        win: 'Edoras burns. You tied the defenders up in fights and put your spare men, flaming brands first, against the walls.',
        draw: 'A draw: one Storehouse burns. Keep men on the walls of the other, and kill or Charge the warriors who come to put the fires out.',
        lose: 'The Storehouses stand. An Engaged tribesman cannot light anything: Charge the defenders with some, and send the flaming brands round them to the walls.',
      },
    },
    debrief: {
      win: 'The Storehouses stand. Engaged tribesmen light nothing: you met them before the walls, put out what caught fire, and Haleth\'s Heroic Combats cut through the torch bearers.',
      draw: 'A draw: one Storehouse burns. Meet the torch bearers before they reach the walls, and keep a warrior by each Storehouse to put a fire out.',
      lose: 'Edoras burns. Charge the tribesmen who reach the walls (an Engaged model cannot light anything), shoot the flaming brands first, and use Heroic Move to Charge before they do.',
    },
  },
  {
    narrative: true, hordes: 'Hill Tribesman', escapeAny: ['hamaPrince'],
    series: 'E', heroics: ['move', 'shoot', 'combat'], title: 'Last Stand of the Princes', lesson: 'Reinforcements · Victory Points', board: [36, 36], limit: 10, priority: { 1: 'good' },
    intro: 'Edoras is ablaze and the princes are surrounded. Haleth and Háma hold the centre with twenty-four warriors; Wulf and General Targg close in with twenty-four tribesmen, and every tribesman slain may come back from the board edges. Last scenario of the booklet (p. 12–13): every rule of the earlier three.',
    goal: 'Have more Victory Points after turn 10: 1 for each prince alive and each enemy Hero slain (Wulf, Targg), and 2 for the most models within 3″ of the central marker. The enemy scores the other way round. If Háma escapes off a board edge the game ends at once in a draw.',
    tip: 'The tribesmen come back, the Heroes do not: Haleth hunts Wulf and Targg while the warriors hold the marker. Keep the princes away from Wulf\'s Strikes unless Haleth wins the fight. If it goes badly, run Háma to the nearest edge for a draw.',
    rules: ['hordes', 'escape'], also: ['theUsurperKing', 'generalHunter'],
    // Map (p. 13), mat side B: the two houses cover the outer printed markers (west and east), the central one stays.
    // Good wholly within 6″ of it; Evil anywhere at least 6″ from every Good model (here round them, clear of the houses).
    objectives: [{ x: 18, y: 18, r: OBJ_R }],
    terrain: [{ k: 'building', house: true, x: 2, y: 15.75, w: 6, h: 4.5, a: -60 }, { k: 'building', house: true, x: 28, y: 15.75, w: 6, h: 4.5, a: -53 }],   // angles from the map (p. 13)
    units: [
      { t: 'halethPrince', side: 'good', x: 16.85, y: 18 },
      { t: 'hamaPrince', side: 'good', x: 19.15, y: 18 },
      ...ring(18, 18, 2.2, 8, 22.5).map(([x, y]) => ({ t: 'warriorOfRohanBow', side: 'good', x, y })),
      ...ring(18, 18, 4.7, 8, 0).map(([x, y]) => ({ t: 'warriorOfRohan', side: 'good', x, y })),
      ...ring(18, 18, 3.6, 8, 0).map(([x, y]) => ({ t: 'warriorOfRohanSpears', side: 'good', x, y })),
      ...LAST_STAND_EVIL.map((t, k) => { const a = ((k % 2 ? 205 : 25) + Math.floor(k / 2) * 130 / 12) * Math.PI / 180; return { t, side: 'evil', x: +(18 + 13 * Math.cos(a)).toFixed(2), y: +(18 + 13 * Math.sin(a)).toFixed(2) }; }),
    ],
    hordeTarget() { return sideAlive(GOOD()).filter(u => u.T.hero).sort((a, b) => a.w - b.w)[0]; },
    prince(t) { return G.units.find(u => u.t === t); },
    vp(side) {   // side: either side of the table, scored by its alignment
      const good = alignOf(side) === 'good', alive2 = u => u && !u.dead && !u.fled;
      const mine = ['halethPrince', 'hamaPrince'].map(t => this.prince(t)), theirs = ['wulf', 'generalTargg'].map(t => this.prince(t));
      const n = near(G.objectives[0], 3), most = n.good > n.evil ? 'good' : n.evil > n.good ? 'evil' : null;
      return (good ? mine.filter(alive2).length + theirs.filter(u => !alive2(u)).length : mine.filter(u => !alive2(u)).length + theirs.filter(alive2).length) + (most === side ? 2 : 0);
    },
    check(atEnd) {
      if (this.prince('hamaPrince').escaped) return 'draw';
      if (!sideAlive(GOOD()).length) return 'lose';
      if (atEnd && G.turn >= this.limit) { const g = this.vp(GOOD()), e = this.vp(EVIL()); return g > e ? 'win' : g === e ? 'draw' : 'lose'; }
      return null;
    },
    status() { return `Victory Points: you ${this.vp('good')}, the enemy ${this.vp('evil')} · tribesmen kept aside: ${keptAside(EVIL()).length}`; },
    // Rohan (the computer, AI plays for you, the balance tool) holds the marker while the Heroes go hunting; when the
    // computer commands Rohan and is behind on Victory Points in the last three turns, Háma runs for the nearest edge.
    aiGoal(u) {
      if (alignOf(u.side) !== 'good') return undefined;
      if (u.t === 'hamaPrince' && u.side === 'evil' && G.turn >= this.limit - 2 && this.vp(GOOD()) < this.vp(EVIL())) {
        const e = [{ x: u.r, y: u.y }, { x: G.W - u.r, y: u.y }, { x: u.x, y: u.r }, { x: u.x, y: G.H - u.r }];
        return e.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
      }
      if (u.T.hero) return undefined;
      const o = G.objectives[0];
      return Math.hypot(u.x - o.x, u.y - o.y) - u.r - o.r <= 2.5 ? null : { x: o.x, y: o.y };
    },
    evil: {
      intro: 'Edoras is ablaze and the princes are surrounded. You lead Wulf, General Targg and twenty-four Hill Tribesmen against Haleth, Háma and twenty-four warriors holding the centre, and every tribesman slain may come back from the board edges. Last scenario of the booklet (p. 12–13), played from the Evil side.',
      goal: 'Have more Victory Points after turn 10: 1 for each prince slain (Haleth, Háma) and each of your Heroes alive (Wulf, Targg), and 2 for the most models within 3″ of the central marker. The enemy scores the other way round. If Háma escapes off a board edge the game ends at once in a draw.',
      tip: 'Your tribesmen come back on 4+, your Heroes do not: wear the Rohirrim down with warriors, and send Wulf at a prince only when he can win the fight (his Defence is low). Block Háma\'s way to the edges, or he escapes with a draw.',
      debrief: {
        win: 'The line of Helm falls. Your tribesmen kept coming back while the princes ran out of men.',
        draw: 'A draw. If Háma escaped, keep men between him and the edges next time; if not, the marker or one Hero decided it.',
        lose: 'The princes hold. Count Victory Points, not bodies: keep Wulf and Targg alive, slay a prince, and crowd the marker in the last turn.',
      },
    },
    debrief: {
      win: 'The princes hold. The tribesmen kept coming back, but the Heroes did not: Victory Points came from Wulf and Targg slain, the princes alive and the marker held.',
      draw: 'A draw: the princes live to fight another day. A draw by Háma\'s escape is a fair way out of a lost battle; to win, slay Wulf or Targg and keep both princes alive.',
      lose: 'The line of Helm falls. Slain tribesmen come back, so count Victory Points instead of bodies: the enemy Heroes, your princes, and the marker in the last turn.',
    },
  },
];

// The heroes sandbox: not a mission (it is not in the mission list). Every rule taught so far is in play and every
// Heroic Action too, for trying the hero rules out before the missions that teach them exist, and for
// tools/hero-check.mjs. Open it with ?sandbox in the address (http://localhost:8765/?sandbox).
export const SANDBOX = {
  sandbox: true, heroics: 'all',
  title: 'Heroes sandbox', lesson: 'Might, Will, Fate and every Heroic Action', board: [30, 22], limit: 10,
  intro: 'A practice field, not a mission. Haleth, Háma and a Captain of Rohan with nine Warriors of Rohan meet Wulf, General Targg and a Hill Tribes Chieftain with eleven Hill Tribesmen. Every Heroic Action is in play: at the start of the Move, Shoot and Fight phases both sides declare them, the side without Priority first, and a D6 decides whose Heroic Move, Shoot or Combat goes first when both sides have one. Might, Will and Fate work as in mission 17. Both sides roll for Priority, and Broken armies take Courage Tests, so Stand Fast and Heroic Resolve come up too.',
  goal: 'Slay Wulf, General Targg and the Chieftain by the end of turn 10, or rout their army. You lose if Haleth, Háma and the Captain all fall.',
  tip: 'Heroic Actions cost a Might Point each, the same points that raise your dice. Haleth (Challenge, Resolve, Strike) can challenge Wulf, a Hero of Valour like him; Háma (Accuracy, Defence) shoots with Sharpshooter and re-rolls failed In The Way Tests with Heroic Accuracy; the Captain (March) takes the Warriors around him 3″ further with At the Double. Any Hero may declare a Heroic Move, Shoot or Combat.',
  rules: ['heroic', 'might', 'fate', 'will'],
  terrain: [{ k: 'rock', x: 13.5, y: 2, w: 3, h: 3 }, { k: 'rock', x: 13.5, y: 17, w: 3, h: 3 }, { k: 'brush', x: 17, y: 9, w: 3, h: 4 }, { k: 'wall', x: 10, y: 8, w: 0.4, h: 6 }],
  units: [
    { t: 'halethPrince', side: 'good', x: 6, y: 11 },
    { t: 'hamaPrince', side: 'good', x: 4, y: 8 },
    { t: 'captainOfRohan', side: 'good', x: 6, y: 15 },
    ...[6.5, 8.5, 10, 12, 13.5, 17].map(y => ({ t: 'warriorOfRohan', side: 'good', x: 7.6, y })),
    ...[10.5, 12, 13.5].map(y => ({ t: 'warriorOfRohanBow', side: 'good', x: 3, y })),
    { t: 'wulf', side: 'evil', x: 24, y: 11 },
    { t: 'generalTargg', side: 'evil', x: 24, y: 7 },
    { t: 'hillTribesChieftain', side: 'evil', x: 24, y: 15 },
    ...[5, 6.5, 9, 10.5, 12, 13.5, 16, 17.5].map(y => ({ t: 'hillTribesman', side: 'evil', x: 22.4, y })),
    ...[9.5, 11, 12.5].map(y => ({ t: 'hillTribesmanBow', side: 'evil', x: 27, y })),
  ],
  heroes(side) { return G.units.filter(u => u.side === side && u.T.hero); },
  check(atEnd) {
    if (!this.heroes('good').some(alive)) return 'lose';
    if (!this.heroes('evil').some(alive) || !sideAlive('evil').length) return 'win';
    if (!sideAlive('good').length) return 'lose';
    if (atEnd && G.turn >= this.limit) return 'lose';
    return null;
  },
  status() {
    const h = side => this.heroes(side).map(u => `${u.name} ${alive(u) ? `${u.w} Wound${u.w === 1 ? '' : 's'}, Might/Will/Fate ${u.might}/${u.will}/${u.fate}` : 'slain'}`).join('; ');
    return `Yours: ${h('good')} · Theirs: ${h('evil')} · models: ${sideAlive('good').length} against ${sideAlive('evil').length}`;
  },
  debrief: {
    win: 'The enemy Heroes have fallen. Every Heroic Action cost a Might Point that could also have raised a dice: the side that spends its points where they decide the fight wins.',
    lose: 'Your Heroes have fallen. Might is scarce: a Heroic Action and a raised dice come from the same points, and the enemy answers both.',
  },
};

// The mission (index) that first teaches rule k, through its rule cards or its 'also' list; -1 if no mission does yet.
export const taughtIn = k => MISSIONS.findIndex(m => m.rules.includes(k) || (m.also || []).includes(k));
// Whether a player in mission mi has met rule k already (in this mission or an earlier one).
export const knows = (k, mi) => { const i = taughtIn(k); return i >= 0 && i <= mi; };
// Mission numbers: the main campaign counts 1, 2, 3…; a side campaign (series: 'E', the Battle of Edoras) counts E1, E2… on its own.
const seriesOf = i => (MISSIONS[i] && MISSIONS[i].series) || '';
export const missionNo = i => seriesOf(i) + MISSIONS.filter((m, j) => j <= i && seriesOf(j) === seriesOf(i)).length;
// "Mission 17 of 29", "Mission E2 of 4": the count is of the mission's own series.
export const missionOf = i => `Mission ${missionNo(i)} of ${MISSIONS.filter((m, j) => seriesOf(j) === seriesOf(i)).length}`;
// Whether rule k is in play in game g: taught by its mission or an earlier one; in the Heroes sandbox and in matched
// play every rule is, also those no mission teaches yet. The rule chips (panel.js) and the "New rule" popups
// (ui/lessons.js) both ask this.
export const inPlay = (k, g) => !!(g && (g.m.sandbox || g.m.matched || knows(k, g.mi)));
