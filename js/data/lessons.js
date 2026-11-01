// "New rule" lessons: the popup shown the first time a rule comes into play in the whole game (see ui/lessons.js).
// Each lesson: t title, rule (rules-text key for the Rules Manual link), lead, how (how it works), use (how to use it),
// fig (optional small diagram), now(ctx) (optional line about the situation on the table right now),
// of (optional: the rule whose mission teaches this lesson, for a lesson that is a later step of that rule),
// click (optional "Where to click" steps: a list, or a function of ctx that returns one, when the steps depend on the moment).
// Which mission teaches a lesson comes from the missions' rules/also lists, like the rule chips.
import { G, prefs } from '../state.js';
import { pct } from '../util.js';
import { sideAlive, woundNeed, needStr, names, coverTouched, casualties, breakPoint } from '../engine/rules.js';
import { combatOdds, goodsOf, evilsOf, trappedIfLose, supOf, bannerFor, bannerBearers, canShield, woundBonus, topDice, chargeBonus } from '../engine/combat.js';
import { knows, taughtIn, missionNo } from './missions.js';
import { TYPES } from './units.js';

/* ---------- "Where to click": the game's controls as they look on screen ---------- */
const lfBtn = t => `<span class="ui-btn">${t}</span>`;         // the main button in the panel (or the dice tray)
const lfBtn2 = t => `<span class="ui-btn alt">${t}</span>`;    // an outlined button, such as the second choice
// Markers drawn on the table: a dot (Back Away spots) or a dashed ring, in the board's own colours.
const lfDot = c => `<span class="ui-mark" aria-hidden="true"><i class="ui-dot ${c}"></i></span>`;
const lfRing = c => `<span class="ui-mark" aria-hidden="true"><i class="ui-ring ${c}"></i></span>`;
// The enemy splits and orders the fights when it has Priority; the player then only watches.
const lfEnemyPicks = () => G && G.mode === 'enemyPair';
// The roll button's own label: it numbers the fights, and names the Combat while the player picks the order.
function lfRollLabel() {
  const f = G && G.fightNo;
  if (!f) return 'Roll the dice';
  if (G.mode === 'order') return `Roll Combat ${G.combats.indexOf(G.curFight) + 1} (fight ${f.k} of ${f.total})`;
  return f.total > 1 ? `Roll the dice (fight ${f.k} of ${f.total})` : 'Roll the dice';
}

/* ---------- Diagrams (1″ = 20 units, bases 1″ across) ---------- */
const lfBase = (x, y, side, r = 10) => `<circle class="lf-${side}" cx="${x}" cy="${y}" r="${r}"/>`;
const lfLabel = (x, y, txt, cls = '') => `<text class="lf-text ${cls}" x="${x}" y="${y}">${txt}</text>`;
const lfArrow = (x1, y1, x2, y2, cls = '') => `<line class="lf-arrow ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#lf-head)"/>`;
const lfSvg = (h, body) => `<svg viewBox="0 0 340 ${h}" role="img" aria-hidden="true"><defs><marker id="lf-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="lf-head"/></marker></defs>${body}</svg>`;

// A profile row like the one on the model card.
const statRow = T => `<dl class="stats">${[['MV', T.mv + '″'], ['FV', T.f], ['SV', T.sh + '+'], ['S', T.s], ['D', T.d], ['A', T.a], ['W', T.w], ['C', T.c + '+'], ['I', T.i + '+']]
  .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

const FIG = {
  profile: `<p class="lfig-cap">${TYPES.rangerOfGondor.n}</p>${statRow(TYPES.rangerOfGondor)}`,
  move:lfSvg(110, `${lfBase(60, 60, 'good')}
    <polyline class="lf-path" points="60,60 150,30 200,70"/>${lfBase(200, 70, 'ghost')}
    ${lfLabel(100, 28, 'leg 1')}${lfLabel(185, 50, 'leg 2')}${lfLabel(215, 100, 'all legs together: up to 6″')}`),
  // The detour keeps the moving base (r 10) clear of the zones: its centre stays 40+ from the enemy centres.
  cz: lfSvg(156, `<circle class="lf-cz" cx="150" cy="64" r="30"/><circle class="lf-cz" cx="150" cy="120" r="30"/>${lfBase(150, 64, 'evil')}${lfBase(150, 120, 'evil')}
    ${lfBase(30, 92, 'good')}<polyline class="lf-path" points="38,84 95,18 205,18 250,48"/>${lfLabel(258, 52, 'around: fine')}
    ${lfArrow(42, 94, 108, 94, 'bad')}${lfLabel(24, 120, 'into a zone:')}${lfLabel(24, 134, 'only by a Charge')}
    ${lfLabel(185, 96, '1″ Control Zone', 'muted')}`),
  terrain: lfSvg(120, `<rect class="lf-brush" x="120" y="20" width="70" height="80" rx="6"/>${lfLabel(130, 62, 'brush')}
    ${lfBase(40, 60, 'good')}<line class="lf-path bad" x1="50" y1="60" x2="250" y2="60"/>${lfLabel(205, 52, 'through: 1″ costs 2″')}
    <polyline class="lf-path" points="46,52 120,8 200,8 250,52"/>${lfLabel(95, 116, 'around: longer, but often cheaper')}`),
  shoot: lfSvg(130, `<circle class="lf-reach" cx="90" cy="65" r="60"/><circle class="lf-reach inner" cx="90" cy="65" r="30"/>${lfBase(90, 65, 'good')}
    ${lfLabel(165, 30, 'outer ring: full Move (6″)')}${lfLabel(165, 62, 'inner ring: move up to 3″ and')}${lfLabel(165, 78, 'still shoot, 1 worse To Hit')}${lfLabel(165, 110, 'beyond 3″: no shooting')}`),
  itw: lfSvg(120, `<path class="lf-view" d="M30 60L289.2 46A14 14 0 1 1 289.2 74Z"/><rect class="lf-brush" x="226" y="10" width="32" height="44" rx="5"/>
    ${lfBase(30, 60, 'good')}${lfBase(290, 60, 'evil', 14)}<line class="lf-fire" x1="40" y1="60" x2="276" y2="60"/><path class="lf-diamond" d="M242 44L249 51L242 58L235 51z"/>
    ${lfLabel(60, 94, 'the shooter\'s view of the whole target')}${lfLabel(60, 112, 'the brush hides part of it: In The Way, 4+')}`),
  cover: lfSvg(130, `<rect class="lf-wall" x="30" y="62" width="280" height="8" rx="2"/>${lfBase(60, 16, 'evil')}${lfBase(260, 16, 'evil')}${lfBase(120, 80, 'good')}
    <line class="lf-fire" x1="120" y1="80" x2="260" y2="16"/><line class="lf-fire bad" x1="60" y1="16" x2="120" y2="80"/><path class="lf-diamond" d="M107 58L115 66L107 74L99 66z"/>
    ${lfLabel(196, 100, 'your shot: no test')}${lfLabel(14, 122, 'their shot: 4+ to pass the wall')}`),
  charge: lfSvg(110,`<circle class="lf-cz" cx="250" cy="55" r="30"/>${lfBase(250, 55, 'evil')}${lfBase(50, 55, 'good')}
    <line class="lf-path" x1="60" y1="55" x2="222" y2="55"/>${lfBase(230, 55, 'ghost')}${lfLabel(80, 40, 'Charge: straight into base contact')}${lfLabel(100, 100, 'both are now Engaged in Combat')}`),
  spear: lfSvg(108, `${lfBase(120, 18, 'evil')}${lfBase(120, 39, 'good')}${lfBase(120, 60, 'good')}<line class="lf-path" x1="120" y1="60" x2="120" y2="39"/>
    ${lfLabel(142, 22, 'enemy')}${lfLabel(142, 43, 'fighting: its own dice')}${lfLabel(142, 64, 'spear behind: +1 dice, 1 Strike')}${lfLabel(142, 80, 'and it cannot be struck')}`),
  pike: lfSvg(126, `${lfBase(110, 16, 'evil')}${lfBase(110, 37, 'good')}${lfBase(110, 58, 'good')}${lfBase(110, 79, 'good')}
    <line class="lf-path" x1="110" y1="58" x2="110" y2="37"/><line class="lf-path" x1="110" y1="79" x2="110" y2="58"/>
    ${lfLabel(132, 20, 'enemy: 1 dice')}${lfLabel(132, 41, 'fighter: its own dice')}${lfLabel(132, 62, 'pike behind it: +1 dice')}${lfLabel(132, 83, 'pike behind the pike: +1 dice')}
    ${lfLabel(20, 116, 'three dice against one, but no room to Back Away')}`),
  banner: lfSvg(160, `<circle class="lf-reach" cx="170" cy="84" r="70"/>${lfBase(170, 84, 'good')}${lfLabel(160, 112, 'banner')}
    ${lfBase(125, 62, 'good')}${lfBase(125, 41, 'evil')}${lfLabel(20, 22, 'in reach: one re-roll')}
    ${lfBase(292, 112, 'good')}${lfBase(313, 112, 'evil')}${lfLabel(262, 146, 'out of reach')}${lfLabel(180, 150, '3″')}`),
  // Jump: the hedge in the middle; where the model ends after each roll.
  jump: lfSvg(122, `<rect class="lf-brush" x="150" y="14" width="12" height="80" rx="5"/>${lfBase(138, 54, 'good')}
    ${lfBase(174, 24, 'ghost')}${lfBase(174, 54, 'ghost')}${lfBase(214, 84, 'ghost')}${lfArrow(184, 84, 204, 84)}
    ${lfLabel(40, 58, '1: stays')}${lfLabel(190, 28, '2–5: across, move over')}${lfLabel(226, 58, '(or Charge, if in a zone)')}${lfLabel(226, 88, '6: goes on')}
    ${lfLabel(120, 114, 'hedge: over half a man tall')}`),
  // Climb: a cliff seen from the side.
  climb: lfSvg(130, `<path class="lf-rock" d="M150 20H330V110H150Z"/>${lfBase(130, 100, 'good')}${lfBase(170, 10, 'ghost')}
    ${lfArrow(130, 88, 130, 30)}${lfLabel(10, 64, 'every inch up')}${lfLabel(10, 80, 'costs 2″ of Move')}
    ${lfLabel(190, 46, '2–5: on top, move over')}${lfLabel(190, 66, '6: on top, goes on')}${lfLabel(190, 86, '1: falls, Prone')}${lfLabel(10, 124, 'out of Move halfway: it hangs there')}`),
  shielding: lfSvg(116, `<path class="lf-path" d="M116 47A14 14 0 0 1 116 73"/>${lfBase(110, 60, 'good')}${lfBase(140, 48, 'evil')}${lfBase(140, 72, 'evil')}
    ${lfLabel(20, 22, 'your model: 1 Attack')}${lfLabel(160, 46, 'two orcs: 2 dice')}${lfLabel(160, 80, 'Shielding: you roll 2 dice')}
    ${lfLabel(20, 108, 'win: they Back Away, but you make no Strikes')}`),
  makeway: lfSvg(112, `${lfBase(110, 34, 'evil')}${lfBase(131, 34, 'good')}${lfBase(152, 34, 'good')}${lfBase(173, 34, 'ghost')}
    ${lfArrow(136, 16, 154, 16)}${lfArrow(157, 16, 175, 16)}${lfLabel(30, 70, 'the loser Backs Away 1″ into the spear\'s place,')}${lfLabel(30, 86, 'the spear Makes Way by stepping back 1″,')}${lfLabel(30, 102, 'and Supports it again next turn')}`),
  backaway: lfSvg(110,`${lfBase(120, 55, 'good')}${lfBase(140, 55, 'evil')}${lfBase(160, 55, 'ghost')}${lfArrow(150, 55, 176, 55)}
    ${lfLabel(30, 30, 'winner')}${lfLabel(150, 30, 'loser steps back 1″')}${lfLabel(60, 100, 'then the winner strikes')}`),
  multi: lfSvg(120, `${lfBase(250, 50, 'evil', 24)}${lfBase(210, 88, 'good')}${lfBase(250, 96, 'good')}${lfBase(290, 88, 'good')}
    ${lfLabel(10, 30, '3 warriors: 3 dice')}${lfLabel(10, 48, 'troll: 3 Attacks, 3 dice')}${lfLabel(10, 112, 'highest single dice wins')}`),
  trapped: lfSvg(120, `<rect class="lf-rock" x="100" y="6" width="140" height="22" rx="4"/>${lfBase(170, 40, 'evil')}${lfBase(150, 58, 'good')}${lfBase(190, 58, 'good')}
    ${lfArrow(170, 34, 170, 14, 'bad')}${lfLabel(250, 24, 'no way back')}${lfLabel(40, 100, 'Trapped: every Strike rolls To Wound twice')}`),
  pairoff: lfSvg(110, `<circle class="lf-halo c1" cx="70" cy="38" r="19"/><circle class="lf-halo c1" cx="56" cy="62" r="19"/><circle class="lf-halo c1" cx="84" cy="62" r="19"/>
    <circle class="lf-halo c2" cx="98" cy="38" r="19"/><circle class="lf-halo c2" cx="112" cy="62" r="19"/>
    ${lfBase(70, 38, 'evil', 14)}${lfBase(98, 38, 'evil', 14)}${lfBase(56, 62, 'good', 14)}${lfBase(84, 62, 'good', 14)}${lfBase(112, 62, 'good', 14)}
    ${lfLabel(150, 36, 'Combat 1: 2 of yours vs 1', 'c1')}${lfLabel(150, 58, 'Combat 2: 1 vs 1', 'c2')}${lfLabel(150, 84, 'never 2 against 2 in one Combat')}`),
};

/* ---------- Dice helpers for text ---------- */
const lfDie = (v, ok) => `<span class="die${ok === true ? ' ok' : ok === false ? ' no' : ''}">${v}</span>`;
const lfDice = (vals, from) => vals.map(v => lfDie(v, v >= from)).join('');

// Shooters and targets on the table now, for "Right now" lines.
const lfShooters = () => sideAlive('good').filter(u => u.bow);
const lfUniq = list => [...new Map(list.map(u => [u.t, u])).values()];

export const LESSONS = {
  profile: {
    t: 'Model profiles', rule: 'profile', fig: FIG.profile,
    lead: 'A profile is the row of numbers that says what a model can do. Hover over any model to see it on the model card; its wargear is listed there too.',
    how: [
      'MV, Move Value: how many inches the model can move each turn. Most models have 6″.',
      'FV, Fight Value: skill in close combat. When both sides roll the same highest dice in a fight, the higher FV wins.',
      'SV, Shoot Value: the D6 roll needed to hit with a bow or crossbow. Lower is better: 3+ hits more often than 4+.',
      'S, Strength and D, Defence: how hard the model hits and how well it is protected. The To Wound chart compares the attacker\'s Strength with the target\'s Defence.',
      'A, Attacks: how many dice the model rolls in a fight, and how many Strikes it makes when it wins.',
      'W, Wounds: how many wounds it can take before it is slain. Most warriors have 1.',
      'C, Courage and I, Intelligence: the 2D6 roll needed for some tests (lower is better). These missions do not use them yet.',
    ],
    use: [
      'Before you act, compare profiles: who is faster, who fights better, who is harder to wound.',
      'The missions use the real 2024 profiles of these models.',
    ],
    now() {
      const g = sideAlive('good')[0], e = sideAlive('evil')[0];
      if (!g || !e) return '';
      return `Your ${g.T.full || g.T.n}: MV ${g.mv}″, FV ${g.f}, Defence ${g.d}. The ${e.T.full || e.T.n}: MV ${e.mv}″, FV ${e.f}, Defence ${e.d}.`;
    },
  },
  move: {
    t: 'Moving', rule: 'move', fig: FIG.move,
    lead: 'In the Move phase each of your models may move up to its Move Value (MV) in inches. Most models have 6″.',
    how: [
      'A model can move in several legs and turn as it likes, until its Move is used up. The distance counts along the whole path.',
      'When you start moving another model, the first one\'s move is over, even if it had Move left.',
      'Models cannot pass through other models, rocks or deep water. You never have to move a model, or use all of its Move.',
    ],
    use: [
      'Plan the whole route before the first leg: a detour costs Move just like going forward.',
      'If time is short, use nearly all of the 6″ every turn.',
    ],
    click: [
      'Click one of your models (bright bases can still move). The yellow ring shows how far it can still go.',
      'Point at the table: the orders show what the move costs before you commit.',
      'Click to move there. Click again further on for the next leg.',
      `Right-click or press Esc to deselect. Press ${lfBtn('End move')} when all your models have moved.`,
    ],
  },
  cz: {
    t: 'Control Zones', rule: 'cz', fig: FIG.cz,
    lead: 'Every model controls the area within 1″ of its base: its Control Zone. On this table enemy zones are the red rings.',
    how: [
      'A model can only enter an enemy\'s Control Zone by Charging that enemy, that is by moving into base contact with it.',
      'A model that starts its move inside an enemy zone may stay, Charge that enemy or move away, but inside the zone it may never get closer to that enemy.',
      'A model Engaged in Combat (touching an enemy) loses its Control Zone.',
      'The app refuses any move that would cut through a zone and tells you why.',
    ],
    use: [
      'Two models standing up to 2″ apart close the gap between them completely: their zones touch. Look for the gaps between the rings.',
      'Your own models block the enemy the same way: a line of models with small gaps is a wall the enemy can only pass by charging.',
    ],
  },
  terrain: {
    t: 'Difficult Terrain', rule: 'terrain', fig: FIG.terrain,
    lead: 'Brush, scree, shallow water and similar terrain slows models down: it is Difficult Terrain.',
    how: [
      'While any part of a model\'s base is in Difficult Terrain, every 1″ it moves costs 2″ of its Move.',
      'A 6″ model that spends its whole move in the brush gets only 3″ further.',
      'The move preview shows the extra cost, for example "Difficult Terrain adds 1.5″".',
    ],
    use: [
      'Measure both ways: going around is often quicker than cutting through.',
      'Brush you are not inside does not slow you, so skirting its edge is free.',
    ],
  },
  shoot: {
    t: 'Moving and shooting', rule: 'shoot', fig: FIG.shoot,
    lead: 'A model with a bow or crossbow can shoot once in the Shoot phase, but how far it moved decides whether it can and how well.',
    how: [
      'It can shoot only if it moved no more than half its Move this turn (3″ for most models) and is not fighting.',
      'If it moved at all, its Shoot Value is 1 worse (4+ becomes 5+). A natural 6 always hits.',
      'A crossbow cannot shoot at all in a turn its model moved.',
      'The target must be in range (bows 24″) and in Line of Sight: the shooter must see some part of it. Rocks or other models that hide the whole target block the view.',
    ],
    use: [
      'Decide in the Move phase who will shoot.',
      'Archers that already have a target should stand still.',
    ],
    click: [
      'Click an archer: the outer ring shows its full Move, the inner ring how far it can go and still shoot.',
      `Archers that stay put need no click at all. Shooting comes after the Move phase, so press ${lfBtn('End move')} first.`,
    ],
  },
  hit: {
    t: 'Roll To Hit', rule: 'hit',
    lead: 'Every shot starts with a D6 against the shooter\'s Shoot Value (SV): roll that number or more to hit.',
    how: [
      `SV 4+ hits on 4, 5 or 6: half the time. ${lfDice([1, 2, 3, 4, 5, 6], 4)}`,
      'SV 3+ (a Ranger of Gondor) also hits on a 3: two shots in three.',
      'Moving this turn makes it 1 worse, but a natural 6 always hits.',
      'After a hit, anything In The Way gets a roll, and then the shot must still wound: roll To Wound against the target\'s Defence.',
    ],
    use: [
      'Check the panel before every shot: it shows the roll each step needs (tick Show odds in Options for the chance to wound in total).',
      'Give the best shooters the most important targets.',
    ],
    click: [
      'Click one of your archers. One that cannot shoot says why.',
      'Point at an enemy: the panel shows To Hit, anything In The Way and To Wound before you commit.',
      `Click the enemy to shoot. The first dice flies at once; each further roll waits until you press ${lfBtn('Throw your dice')} in the dice tray, or click the tray.`,
      `Press ${lfBtn('End shooting')} when you are done. It ends on its own when no shots are left.`,
    ],
    now() {
      const s = lfUniq(lfShooters());
      return s.length ? s.map(u => `${u.T.full || u.base}: SV ${u.sh}+`).join('; ') + '.' : '';
    },
  },
  itw: {
    t: 'In The Way', rule: 'itw', fig: FIG.itw,
    lead: 'Brush, rocks, other models and similar obstacles that hide part of the target can stop a shot.',
    how: [
      'The shooter looks from its head at the whole target, not only at its centre. Everything that hides any part of the target is In The Way, even if the line between the centres misses it.',
      'For each obstacle, roll a D6, nearest first. On 4+ the shot carries on; on 1–3 it hits the obstacle.',
      'If the obstacle is a model, the shot may wound that model instead of the target.',
      'Terrain the shooter is touching does not count, and neither does a friend in base contact with the shooter, if that friend is not fighting and its base is no bigger than that of the shooter (it shoots over the shoulder of that friend). A wall that friend touches does not count either.',
      'Good models never shoot when a friend could be hit; the app tells you when that is the case.',
    ],
    use: [
      'Every obstacle halves your chance. Prefer targets with a clear view; the preview shades the shooter\'s view and marks each obstacle with a diamond.',
      'Stand touching cover: your shots ignore it, but the enemy\'s shots must pass it.',
    ],
  },
  cover: {
    t: 'Shooting from behind cover', rule: 'cover', fig: FIG.cover,
    lead: 'A model touching a low wall shoots over it as if it were not there, while enemy shots at that model must still get past the wall.',
    how: [
      'Your model is in base contact with the wall, so its shots ignore it: no In The Way test.',
      'An enemy shooting at that model must pass the wall: after a hit it takes an In The Way test, and on a 1–3 the wall takes the shot.',
      'So the wall stops about half of the enemy\'s hits. It does not make you safe: some shots will still get through.',
      'Only cover the shooter touches is ignored. A model standing even a little behind the wall must roll for it, like the enemy.',
      'One exception: a model shooting over the shoulder of a friend in base contact (same base size or smaller, not fighting) ignores the wall if that friend touches it.',
    ],
    use: [
      'Keep your shooters touching the wall and shoot from where they stand. Moving would make To Hit 1 worse anyway.',
      'Hover over a target: the panel says when the wall is ignored.',
    ],
    now() {
      const s = lfShooters(), on = s.filter(u => coverTouched(u).length);
      if (!s.length) return '';
      if (!on.length) return 'None of your shooters is touching cover yet.';
      const what = coverTouched(on[0])[0];
      return on.length === s.length ? `All your shooters are touching the ${what}.` : `Touching the ${what}: ${names(on)}. The others are not.`;
    },
  },
  wound: {
    t: 'The To Wound chart', rule: 'wound',
    lead: 'A hit or a blow only hurts if it gets through armour: compare its Strength (S) with the target\'s Defence (D).',
    how: [
      'For a shot use the weapon\'s Strength (bows are S2, crossbows S4); in a fight use the striker\'s own Strength.',
      'Find the row for Strength and the column for Defence on the To Wound chart (the To Wound tab beside the dice log). The number is the D6 roll you need.',
      'Equal Strength and Defence need 4+. Each point of extra Defence makes it harder (5+, then 6+); very tough targets need a 6 and then a second roll, written 6/4.',
      'Each success removes 1 Wound. Most warriors have 1 Wound, so one success slays them.',
    ],
    use: [
      'Before you shoot or strike, check the chart: aim at the models you can really hurt.',
      'Armour works for you too: high-Defence models survive blows that would slay others.',
    ],
    now() {
      const s = lfShooters()[0], foes = lfUniq(sideAlive('evil'));
      if (!s || !foes.length) return '';
      return `Your ${s.bow.n.toLowerCase()} (S${s.bow.s}) wounds ` + foes.map(t => `${t.T.full || t.base} (D${t.d}) on ${needStr(woundNeed(s.bow.s, t.d))}`).join(', ') + '.';
    },
  },
  charge: {
    t: 'Charging', rule: 'charge', fig: FIG.charge,
    lead: 'A Charge is a move that ends in base contact with an enemy. It is the only way into an enemy\'s Control Zone.',
    how: [
      'The charger must see the target at the start of its move and reach it with the Move it has left.',
      'Both models are now Engaged in Combat: they cannot move or shoot, and they fight in the Fight phase.',
      'Several models can charge the same enemy.',
    ],
    use: [
      'Charge so that you have more models in each fight than the enemy: more models means more dice.',
      'Hover over an enemy to see how far it could charge you next turn.',
    ],
    click: [
      'Click one of your models.',
      'Point at an enemy, on the side of its base you want to fight from: the panel shows what the Charge costs, or why it cannot reach.',
      'Click the enemy. Your model moves into base contact and slides in tight next to friends already fighting it.',
    ],
  },
  duel: {
    t: 'Duel Roll', rule: 'duel',
    lead: 'Every fight is decided by a Duel Roll: both sides roll dice, and only the winner can hurt the loser.',
    how: [
      'Each side rolls one D6 for each Attack of its models in the fight. Most warriors have 1 Attack.',
      'The side with the single highest dice wins, no matter how many dice it rolled.',
      'The loser Backs Away 1″, then the winner makes its Strikes.',
    ],
    use: [
      'More dice give better odds: two dice against one win about two fights in three.',
      'Count the dice before you roll: the panel lists them for every fight. Tick Show odds in Options to see the chance to win in percent.',
    ],
    click() {
      return [
        `Press ${lfBtn(lfRollLabel())} beside the orders. Your first dice flies into the dice tray at once.`,
        `With more dice, throw the next one with ${lfBtn('Throw dice 2 of 3')} (or a click on the tray), or the rest together with ${lfBtn2('Throw the other 2')}. The enemy's dice follow on their own.`,
        'Untick One by one in Options to throw all your dice at once (or tick Auto roll there, and no roll waits for a button).',
      ];
    },
    now(ctx) {
      const c = ctx && ctx.c; if (!c) return '';
      const g = goodsOf(c), e = evilsOf(c);
      const dg = g.reduce((s, u) => s + u.a, 0), de = e.reduce((s, u) => s + u.a, 0);
      return `${names(g)} (FV ${Math.max(...g.map(u => u.f))}) against ${names(e)} (FV ${Math.max(...e.map(u => u.f))}): ${dg} dice against ${de}${prefs.odds ? `, so you win ${pct(combatOdds(c))} of the time` : ''}.`;
    },
  },
  tie: {
    t: 'Tied Duel Roll', rule: 'tie',
    lead: 'If both sides\' highest dice are the same, the side with the higher Fight Value (FV) wins.',
    how: [
      'Compare the highest FV on each side of the fight.',
      'If the Fight Values are equal too, a roll-off decides.',
    ],
    use: [
      'Skilled fighters win every tie: a Rohan Royal Guard (FV 4) beats a Hill Tribesman (FV 3) on any tie. Put them where the fight matters.',
    ],
  },
  rolloff: {
    t: 'Roll-off', rule: 'rolloff',
    lead: 'Equal highest dice and equal Fight Value: one more D6 decides the fight.',
    how: [
      'The player with Priority rolls a D6: 1–3 the Evil side wins, 4–6 the Good side wins.',
    ],
    use: [
      'That is a coin toss. Bring more dice or a higher Fight Value so it does not come to this.',
    ],
  },
  backaway: {
    t: 'Backing Away', rule: 'backaway', fig: FIG.backaway,
    lead: 'The loser of a Duel Roll must Back Away 1″ before the winner strikes.',
    how: [
      'It moves 1″ in a straight line away from the winner. It may cross Control Zones but may not end in base contact with an enemy.',
      'On the table the owner picks the direction. Until mission 8 the app does it for you; from then on you click where your model goes.',
      'A friend that is not fighting may step aside up to 1″ (Make Way) to make room; the app does that for you too.',
      'Backing Away does not count as moving, and it is not slowed by Difficult Terrain.',
    ],
    use: [
      'After a fight the models usually stand a little apart, so the fight is not over: Charge again next turn.',
      'A loser that has nowhere to go cannot Back Away, and that is very bad for it (you will meet that soon).',
    ],
    click() {
      if (!G || !knows('makeway', G.mi)) return [`Nothing to click yet: until mission ${missionNo(taughtIn('makeway'))} the app Backs Away your models for you.`];
      return [
        `When one of your models loses and has more than one way back, dots ${lfDot('ok')} appear around it: each is a spot 1″ away.`,
        'Point at a dot to see the move, then click it.',
      ];
    },
  },
  strikes: {
    t: 'Strikes', rule: 'strikes',
    lead: 'The winner of a Duel Roll makes one Strike for each of its Attacks: this is how fights cause casualties.',
    how: [
      'A Strike is a To Wound roll: the striker\'s Strength against the loser\'s Defence on the To Wound chart.',
      'Each success removes 1 Wound; a model with no Wounds left is slain.',
      'The loser never strikes back in that fight. It only survives or not.',
    ],
    use: [
      'Strength 3 against a Defence 3 tribesman wounds on 4+: a won fight kills it half the time, so expect several rounds.',
    ],
  },
  multi: {
    t: 'Multiple Combats', rule: 'multi', fig: FIG.multi,
    lead: 'A fight can have several models on one side, for example three warriors around one troll.',
    how: [
      'That side rolls one D6 for every Attack of all its models together.',
      'Only the single highest dice counts, and the highest Fight Value on each side decides a tie.',
      'If they win, every one of them strikes. If they lose, every one of them Backs Away.',
    ],
    use: [
      'Beat a strong enemy with many models at once, all charging in the same turn, not one by one.',
      'A monster with 3 Attacks rolls 3 dice: you need more dice than that to have a good chance.',
    ],
    now(ctx) {
      const c = ctx && ctx.c; if (!c) return '';
      const g = goodsOf(c), e = evilsOf(c), dg = g.reduce((s, u) => s + u.a, 0), de = e.reduce((s, u) => s + u.a, 0);
      return `This fight: your ${dg + supOf(c, 'good').length} dice against ${de + supOf(c, 'evil').length}${prefs.odds ? `, so you win ${pct(combatOdds(c))} of the time` : ''}.`;
    },
  },
  trapped: {
    t: 'Trapped', rule: 'trapped', fig: FIG.trapped,
    lead: 'A loser that cannot Back Away, because models, rocks, water or the table edge block every way back, is Trapped.',
    how: [
      'It stays where it is, and every Strike against it rolls To Wound twice: two chances to wound instead of one.',
      'Both rolls go against that same model. A model with 1 Attack makes 1 Strike, so it can slay only one enemy, even if both rolls wound.',
      'If it survives, the models are moved slightly apart.',
      'If only a friend blocks its way, one friend that is not fighting can step aside (Make Way); the app does that for you.',
    ],
    use: [
      'Surround enemies, or catch them against rocks, rivers and the table edge, and your blows count double.',
      'Keep your own models from being pinned the same way.',
    ],
    now(ctx) {
      if (ctx && ctx.trappedNow) return `${ctx.trappedNow} cannot Back Away, so every Strike against it rolls To Wound twice.`;
      const c = ctx && ctx.c; if (!c) return '';
      const e = trappedIfLose(c, 'evil'), g = trappedIfLose(c, 'good');
      return [e.length ? `${names(e)} would be Trapped if it loses this fight.` : '', g.length ? `Careful: ${names(g)} would be Trapped if it loses.` : ''].filter(Boolean).join(' ');
    },
  },
  pairoff: {
    t: 'Pairing Off', rule: 'pairoff', fig: FIG.pairoff,
    lead: 'At the start of the Fight phase, models touching enemies are split into separate Combats.',
    how: [
      'A Combat can have several models on one side, but never several on both sides: no 2 against 2.',
      'A model can only join a Combat with an enemy it touches, and every model in base contact must end up in some Combat.',
      'Where there is a choice, the player with Priority decides. When the enemy has Priority, it decides.',
    ],
    use: [
      'Put two of your models against one enemy where it matters most, above all against an enemy that would be Trapped.',
      'A skilled model (high Fight Value) can hold two weaker enemies on its own while others gang up elsewhere.',
    ],
    click() {
      if (lfEnemyPicks()) return [
        'Nothing to click yet: the enemy has Priority, so it splits the fights. Watch it pick one of its models, then the model it fights.',
        `When it has numbered the Combats, press ${lfBtn('Continue: fight the Combats')}.`,
      ];
      return [
        `Models with a dashed yellow ring ${lfRing('pick')} are not in a Combat yet. Click one of them.`,
        'Then click the enemy it should fight, or a model already in the Combat it should join. The models of each Combat get the same coloured ring and a "Combat 1" label ("Trapped" if the enemy could not Back Away).',
        `Not happy with the split? Press ${lfBtn2('Start again: take the Combats apart')} in the panel.`,
        `When no dashed ring is left, press ${lfBtn('Done: fight these Combats')}.`,
      ];
    },
  },
  order: {
    t: 'Order of Combats', rule: 'order',
    lead: 'The player with Priority also chooses which Combat is fought first, then second, and so on.',
    how: [
      'Each Combat is fully resolved, including Backing Away and Strikes, before the next one starts.',
    ],
    use: [
      'Order matters when one of your models blocks an enemy\'s way back while fighting someone else. Fight the Combat with the blocked enemy first: if your blocker lost its own fight first, it might step back and set the enemy free.',
    ],
    click() {
      if (lfEnemyPicks()) return ['Nothing to click: the enemy has Priority, so it numbers the Combats, and they are fought in that order.'];
      return [
        'Click a Combat in the list under the orders, or any of its models on the table. The list marks it "(next)" and its label on the table lights up.',
        `Press ${lfBtn('Roll Combat 2 (fight 1 of 3)')}: the button names the Combat it will fight.`,
        'After each Combat, pick the next one the same way.',
      ];
    },
  },
  pickstrike: {
    t: 'Choosing Strikes', rule: 'strikes',
    lead: 'When one of your models beats several enemies in one Combat, you choose where each of its Strikes goes.',
    how: [
      'A Trapped enemy takes two To Wound rolls from every Strike.',
      'A model with several Attacks strikes one at a time, so after a kill it can switch to another target.',
    ],
    use: [
      'Strike the Trapped enemy first, or the one with the lowest Defence.',
    ],
    click: [
      `Your model that won has a yellow ring. The enemies it can strike have dashed red rings ${lfRing('bad')}.`,
      'The tags on the table and the orders show the roll each of them needs To Wound.',
      'Click the enemy that takes the Strike. A model with several Attacks, or a spear that Supported, picks again for each Strike.',
    ],
  },
  priority: {
    t: 'Priority', rule: 'priority',
    lead: 'From now on both players roll a D6 at the start of every turn to see who has Priority.',
    how: [
      'The higher roller chooses which side has Priority this turn. A tie in turn 1 is rolled again; in later turns the player who did not choose last turn chooses.',
      'The side with Priority moves first and shoots first, splits the fights (Pairing Off) and picks their order.',
    ],
    use: [
      'Take Priority when you want to Charge or shoot first.',
      'Hand it over when you would rather see where the enemy goes and then react, for example to gang up on whoever charged you.',
    ],
    click: [
      `At the start of each turn press ${lfBtn('Roll for Priority')}. Both dice land in the dice tray.`,
      `If you roll higher, choose with the two buttons: ${lfBtn('Take Priority')} or ${lfBtn2('Hand over Priority')}.`,
      'The tag in the top bar shows who has Priority this turn.',
    ],
  },
  shootFight: {
    t: 'Shooting into a fight', rule: 'shootFight',
    lead: 'Evil models may shoot at an enemy that is fighting. Good models never do.',
    how: [
      'After the hit and any In The Way rolls, the shooter rolls one more D6.',
      'On 4+ the shot hits its target; on 1–3 it hits the Evil model in that fight closest to the shooter.',
    ],
    use: [
      'Enemy archers can still pick off your models in a fight. Shoot them, or send a fighter to Charge them.',
    ],
    now(ctx) { return ctx && ctx.s && ctx.t ? `${ctx.s.name} is shooting at ${ctx.t.name}, who is in a fight.` : ''; },
  },
  makeway: {
    t: 'Back Away: your choice, and Make Way', rule: 'makeway', fig: FIG.makeway,
    lead: 'From now on, when one of your models loses a fight, you choose where it Backs Away. A friend standing in the way can step aside for it: Make Way.',
    how: [
      'The loser moves 1″ in a straight line away from the winner, not necessarily straight back (the app allows up to 60° off straight back).',
      'If a friend stands in the way, that friend Makes Way: it steps aside up to 1″ to make room.',
      'Only one friend can Make Way, and not one that is fighting. If there is no room at all, the loser is Trapped.',
      'Make Way is not only for emergencies: a spear behind the fighter can step back with it, so the line stays together.',
    ],
    use: [
      'Back straight into your spear and let it Make Way: next turn it stands behind the same friend and can Support again.',
      'A loser that steps aside sideways may leave a gap in your line for the enemy to run through.',
    ],
    click: [
      `Dots appear around your model that lost: each is a spot it can Back Away to. ${lfDot('ok')} Green: the spot is free. ${lfDot('pick')} Yellow: a friend is in the way and Makes Way.`,
      'Point at a dot: a ghost base shows where the loser goes, and on a yellow dot also where the friend steps.',
      'Click the dot you want. With only one spot to go to, the app moves the model without asking.',
    ],
  },
  pike: {
    t: 'Pikes: Supporting two ranks deep', rule: 'pike', fig: FIG.pike,
    lead: 'A pike reaches further than a spear: a second pike behind the first also Supports the fighter at the front.',
    how: [
      'A pike Supports exactly like a spear: in base contact with a friend that is fighting, it adds one dice and one Strike, and it cannot be struck.',
      'A pike can also Support a friendly pike that is itself Supporting. The fighter in front then gets two Supports: three dice for one model.',
      'Only a pike Supports through a pike. A pike behind a spear adds nothing.',
      'The risk: only one friend can Make Way. If the fighter loses with two pikes right behind it, it usually cannot Back Away and is Trapped.',
      'A pike needs both hands: a model that also carries a shield or a bow gets −1 on its Duel Roll dice. Your Men-at-Arms carry no shield.',
    ],
    use: [
      'Put a pike right behind each fighter, and another pike right behind that pike.',
      'Three dice win most fights, so the fighter loses less often. When it does lose, expect it to be Trapped, and use your banner to avoid that.',
    ],
    click: [
      'Move a pike like a spear: click it, then point just behind the friend it should Support. It snaps into base contact.',
      'For the third rank, point just behind a pike that stands behind a fighter. Before you click, the panel says "A pike behind a pike: it Supports the fighter in front…".',
    ],
    now() {
      const p = sideAlive('good').filter(u => u.T.pike);
      return p.length ? `You have ${p.length} pike${p.length > 1 ? 's' : ''}. Check that every fighter has a pike behind it, and another pike behind that one.` : '';
    },
  },
  banner: {
    t: 'Banners', rule: 'banner', fig: FIG.banner,
    lead: 'A banner inspires the fighters around it: in a Combat near the banner, your side may re-roll one dice of its Duel Roll.',
    how: [
      'The banner reaches 3″ from its bearer (the dotted ring on the table). A Combat counts if one of your models in it, fighting or Supporting, is within 3″ of the banner and can see it.',
      'When your side is losing such a Combat after the Duel Roll, it may re-roll one of its dice. The new result stands, even if it is worse.',
      'One re-roll per Combat, however many banners are near. If the enemy has a banner too, it may then answer with its own re-roll.',
      'The banner bearer itself gets −1 on its own Duel Roll dice, so it fights badly.',
    ],
    use: [
      'Keep the bearer behind your line, close enough that every fight is within 3″ of it.',
      'Re-roll any of your dice: only the new result matters, and your highest dice was losing anyway.',
    ],
    click: [
      'Move the banner bearer like any other model: click it, then a spot close behind your fighters, so that every fight is inside its dotted ring.',
      'The first time your side loses a Duel Roll within its reach, the game stops and shows you how to re-roll.',
    ],
    now(ctx) {
      const b = bannerBearers('good')[0]; if (!b) return '';
      const c = ctx && ctx.c;
      if (c) return bannerFor(c, 'good') ? `${b.name} is within 3″ of this fight.` : `This fight is out of ${b.name}'s reach.`;
      return `${b.name} carries your banner. Its dotted ring shows the 3″ it reaches.`;
    },
  },
  // Shown at the first banner re-roll (ctx: { c, D }), not with the banner in the Move phase. Taught where banners are.
  reroll: {
    t: 'Banner re-roll', rule: 'banner', of: 'banner',
    fig: `<p class="lfig-cap">You are losing 3 against 5. Re-roll one of your dice:</p><p>You ${lfDie(3)}${lfDie(2)} · Enemy ${lfDie(5, true)}</p>
      <p>The 2 is re-rolled and comes up 6: ${lfDie(3, false)}${lfDie(6, true)} · Enemy ${lfDie(5, false)}, so you win.</p>`,
    lead: 'Your side is losing this Duel Roll, but your banner is within reach of the fight: you may roll one of your dice again.',
    how: [
      'Pick any one of your side\'s dice in this Combat, also the dice of a spear or pike that Supports. It is rolled again.',
      'The new result stands, even if it is worse. Only one re-roll per Combat, however many banners are near.',
      'If the re-roll puts you ahead and the enemy has a banner in reach too, it may answer with one re-roll of its own.',
    ],
    use: [
      'Almost always re-roll: your highest dice is losing anyway, so only the new dice can still win the fight.',
      'A dice with a −1 (the banner bearer\'s, or a two-handed weapon\'s) needs one more to win, so pick a dice without it.',
    ],
    click: [
      `Your dice are the top row in the dice tray, each with a pulsing yellow ring ${lfRing('pick')}. Point at one: its ring turns solid.`,
      'Click it to re-roll it. It jumps up and lands again, and the fight goes on.',
      `Or press ${lfBtn('Keep the dice')} in the panel to let the roll stand.`,
    ],
    now(ctx) {
      const D = ctx && ctx.D; if (!D) return '';
      const gM = topDice(D.g), eM = topDice(D.e), need = eM + (D.gF > D.eF ? 0 : 1);
      const fv = D.gF === D.eF ? '' : ` (Fight Value ${D.gF} against ${D.eF})`;
      if (need > 6) return `Your best dice is ${gM} against ${eM}${fv}. The enemy rolled a 6${D.gF === D.eF ? ', so a re-roll can at best tie and go to a roll-off' : ' and wins ties on Fight Value, so no re-roll can win this fight'}.`;
      return `Your best dice is ${gM} against ${eM}${fv}, so the re-rolled dice needs ${need === 6 ? 'a 6' : `${need} or more`} to win${prefs.odds ? ` (${pct((7 - need) / 6)})` : ''}${D.g.some(d => d.mod) ? ', one more on a dice with −1' : ''}.`;
    },
  },
  shielding: {
    t: 'Shielding', rule: 'shielding', fig: FIG.shielding,
    lead: 'A model with a shield can hide behind it: Shielding doubles its dice in the Duel Roll, but if it wins it makes no Strikes.',
    how: [
      'You declare it at the start of a Combat, before the Duel Roll.',
      'Each Shielding model rolls twice as many dice as its Attacks. If your side wins, the enemy still Backs Away (or is Trapped), but nobody is wounded.',
      'With several of your models in one Combat, they all shield or none do, so all of them must carry shields.',
      'A Shielding model cannot be Supported: a spear or pike behind it adds nothing.',
    ],
    use: [
      'Shield when you only have to hold, when you are outnumbered, or when a lost fight would leave you Trapped: winning the Duel Roll is what keeps you alive.',
      'When you must slay the enemy, roll normally: a fight won while Shielding wounds nobody.',
      'With Show odds on, the panel shows your chance to win both ways before you choose.',
    ],
    click: () => [
      `Before each Combat in which all your models carry shields, a second button appears under ${lfBtn(lfRollLabel())}: ${lfBtn2('Shield, then roll')}.`,
      'Above the buttons the panel lists both choices: how many dice each gives, and whether you make Strikes.',
      `Press ${lfBtn2('Shield, then roll')} to shield, or the roll button above it to fight normally. You choose again before every Combat.`,
    ],
    now(ctx) {
      const c = ctx && ctx.c; if (!c || !canShield(c, 'good')) return '';
      const n = goodsOf(c).reduce((s, u) => s + u.a, 0), e = evilsOf(c).reduce((s, u) => s + u.a, 0);
      return `In this fight you roll ${n} dice against ${e}; Shielding would give you ${2 * n}${prefs.odds ? ` and raise your chance to win from ${pct(combatOdds(c, {}))} to ${pct(combatOdds(c, { good: true }))}` : ''}.`;
    },
  },
  obstacles: {
    t: 'Obstacles and heights', rule: 'obstacles',
    lead: 'Walls, hedges and cliffs are crossed according to how tall they are compared with the model: a man is about 1.2″ tall with its base.',
    how: [
      'No taller than half the model (the low stone wall): it steps over freely, but cannot stop on top.',
      'Taller than half the model, up to its height (the hedge): a Jump Test.',
      'Taller than the model (the cliff): a Climb Test. A gap no wider than twice its height (the gully): a Leap Test.',
      'Raised ground: a step up to half its height is walked up; a drop no deeper than its height is walked down for free.',
      'Backing Away and Make Way never cross an Obstacle or take a test.',
    ],
    use: [
      'Look at the heights on the table before you plan the route: the shortest way may cost a test, the longer way none.',
    ],
    click: [
      'A low wall needs nothing special: click beyond it like any move.',
      'To Jump, Leap or Climb, select a model and point beyond the hedge, across the gap or at the top of the cliff. The orders then show the walk, the test and what each roll does.',
      'Click there to go: the model walks up to the obstacle and the dice for its test lands in the dice tray at once.',
    ],
  },
  jump: {
    t: 'Jump Test', rule: 'jump', fig: FIG.jump,
    lead: 'A hedge taller than half the model is crossed with a Jump Test: one D6.',
    how: [
      'The model walks into base contact with the hedge and rolls.',
      '1: it stumbles and stays where it is; its activation is over.',
      '2–5: it lands on the other side, touching the hedge, and its move is over. If it lands in an enemy\'s Control Zone it must Charge that enemy by the shortest way, if its Move reaches.',
      '6: it lands and may carry on moving with whatever Move it has left.',
      'The distance across (the hedge and the base) counts towards its Move.',
    ],
    use: [
      'Four results in six end the move, so jump with the last inches of your Move, not the first.',
      'Look where you land: next to an orc means a fight you may not want.',
    ],
    click: [
      'Select a model and point beyond the hedge: the panel shows the walk, the Jump and what each roll does.',
      'Click: the model walks up to the hedge and the dice for the test lands in the dice tray at once.',
    ],
  },
  leap: {
    t: 'Leap Test', rule: 'leap',
    lead: 'A gap no wider than twice the model\'s height can be Leapt, if it has enough Move to reach the far side.',
    how: [
      'The model walks to the edge and rolls a D6.',
      '1: it falls to the bottom, halfway across, takes Falling Damage if the drop is deeper than its height, and is Prone.',
      '2–5: it lands on the far side and its move is over (the same forced Charge as a Jump).',
      '6: it lands and may carry on moving.',
    ],
    use: [
      'A failed Leap is the worst roll on this table: the model ends up hurt, Prone and at the bottom of the gully. A bridge is slower but safe, if nobody guards it.',
    ],
    click: [
      'Select a model and point at the far side of the gap. Click: it walks to the edge and the dice for the test lands in the dice tray at once.',
    ],
  },
  climb: {
    t: 'Climb Test', rule: 'climb', fig: FIG.climb,
    lead: 'A cliff taller than the model takes a Climb Test at its foot.',
    how: [
      'Every inch climbed counts double, as Difficult Terrain: a 1.8″ cliff costs 3.6″ of Move, plus the step onto the top.',
      '1: it falls and is Prone at the bottom; from higher than its own height it also takes Falling Damage.',
      '2–5: it climbs until it reaches the top, where its move ends, or until its Move runs out: then it hangs there and must test again next turn.',
      '6: it climbs and, at the top, may carry on moving.',
      'Climbing down a drop deeper than the model works the same way; a smaller drop needs no test.',
    ],
    use: [
      'Start the climb at the beginning of a move, so the model reaches the top in one go: a model hanging halfway up falls from that height on a 1.',
      'Stairs or a path up are slower but need no test.',
    ],
    click: [
      'Select a model and point at the top of the cliff. Click: it walks to the foot and the dice for the test lands in the dice tray at once.',
      'A model that hangs on the cliff: select it and click the top again to carry on.',
    ],
  },
  falling: {
    t: 'Falling', rule: 'falling',
    lead: 'A model that falls lands Prone at the bottom, and a long fall hurts.',
    how: [
      'A fall no deeper than the model\'s height: no damage.',
      'Deeper: one Strength 3 hit, plus one more for every full inch beyond its height. Each hit is a To Wound roll against its Defence.',
      'A model that loses a fight at the edge of a drop, with nowhere else to Back Away, goes over the edge: the Strikes come first, then the fall.',
    ],
    use: [
      'Do not fight with your back to a drop.',
    ],
  },
  prone: {
    t: 'Prone models', rule: 'prone',
    lead: 'A model lying on the ground is Prone until it Stands Up.',
    how: [
      'It has no Control Zone, and for Line of Sight it is half its height.',
      'In its move it can Crawl up to 1″ and do nothing else, or Stand Up for half its Move (3″ for most) and then move on normally, even Charge.',
      'While Prone it cannot Charge, Jump, Leap or Climb.',
      'In a fight it rolls as usual, but if it wins it makes no Strikes (it may Stand Up instead), and if it loses it is always Trapped.',
    ],
    use: [
      'Stand a Prone model up before the enemy reaches it: Prone and in a fight is the worst place to be.',
    ],
    click: [
      'Select the Prone model and point within 1″ to Crawl, or further to Stand Up and move: the panel shows the cost.',
    ],
  },
  might: {
    t: 'Might', rule: 'might',
    lead: 'A Hero bends luck: a Might Point raises one of its own dice by 1, and it is always the last word on a roll.',
    how: [
      'For each point, one of the Hero\'s dice goes up by 1: never above 6, never down, and only the Hero\'s own dice.',
      'It comes after everything else: re-rolls, modifiers. Then nothing changes the roll any more.',
      'It works on the Duel Roll, To Wound and To Hit rolls (points on the first dice of a 6+/4+ carry over to the second), In The Way, terrain and Thrown Rider Tests, Courage Tests and the Fate Roll. Not on the roll-off of a tie.',
      'Two Heroes in one fight bid: the one that is losing raises first, the other may answer, and so on until both pass or the dice are 6s.',
    ],
    use: [
      'Count what a point buys: with the higher Fight Value a tie is enough, so one point from 4 to 5 against a 5 wins the fight.',
      'Spend it where a lost fight hurts: your Hero at its last Wound, or the one blow that kills the enemy Hero. A Captain has only 2 points for the whole battle.',
      'Against another Hero, expect an answer: the enemy may raise its dice too, and whoever runs out of points first loses the bidding.',
    ],
    click: [
      'After a Duel Roll (and any re-rolls) your Hero\'s dice can be raised: click one of them in the dice tray, one point per click, or press Keep the dice.',
      'On a To Wound roll of your Hero that misses by a point or two, two buttons appear: spend the points, or keep the dice.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; if (!u) return '';
      const p = ctx.plan;
      return `${u.name} has ${u.might} Might left${p ? `; ${p.k === 1 ? 'one point' : p.k + ' points'} on its ${p.die.v} would win this Duel Roll` : ''}.`;
    },
  },
  fate: {
    t: 'Fate', rule: 'fate', of: 'might',
    lead: 'Fate turns a wound aside: a Fate Point and a 4+ on a D6, and the Hero is unhurt.',
    how: [
      'When your Hero suffers a Wound, you may spend a Fate Point and roll a D6: 4+ and the Wound is prevented.',
      'One point at a time: if the roll fails and points remain, you may spend another.',
      'A Might Point may raise a Fate Roll (a 3 to a 4), decided before the next Fate Point.',
      'Fate stops any Wound, but not a Hero fleeing after a failed Courage Test.',
    ],
    use: [
      'A Captain has 1 Fate Point: it is worth half a Wound. Spend it on the first Wound unless the Hero can afford to take one.',
      'Keep a Might Point for the Fate Roll if the Hero\'s life hangs on it.',
    ],
    click: ['When your Hero is wounded, two buttons appear: Spend 1 Fate, or Take the wound. After a 3, a second pair offers Might.'],
  },
  will: {
    t: 'Will', rule: 'will', of: 'might',
    lead: 'Will keeps a Hero on the field: each point adds 1 to a Courage Test.',
    how: [
      'In a Broken army a Hero tests like everyone else; after the roll it may spend Will Points, one per +1, and Might Points too.',
      'Will also casts and resists Magical Powers, in the chapter on magic.',
    ],
    use: ['A Captain with Courage 6+ and 1 Will passes on a 5: spend it rather than lose the Hero to a bad roll.'],
    click: ['After a failed Courage Test of your Hero, two buttons appear: Spend 1 Will (or Might), or Let it flee.'],
  },
  objectives: {
    t: 'Objective Markers', rule: 'objectives',
    lead: 'Some scenarios are not won by killing: the side that controls more Objective Markers at the end wins.',
    how: [
      'An Objective Marker is a 25 mm marker. Models walk over it but may not end a move on top of it.',
      'A side controls a marker when it has more models within 3″ of it than the enemy. A tie controls nothing.',
      'In this scenario a Hill Tribesman with a flaming brand counts as 2 models.',
    ],
    use: [
      'Only the end of the last turn counts: shoot and fight first, then bring models onto the markers late.',
      'Killing a model near a marker counts twice: one fewer for them, and your models there count for more.',
    ],
    click: ['The markers are the round discs on the table. The Scenario tab and the mission line show who controls each.'],
    now() { return G && G.m.ctrl ? G.m.ctrl() : ''; },
  },
  storehouses: {
    t: 'Burning Storehouses', rule: 'storehouses',
    lead: 'The Hill Tribesmen want to burn the Storehouses; your warriors can put the fires out.',
    how: [
      'At the end of the Move Phase each Evil model touching a Storehouse that is not burning, and not Engaged, rolls a D6: on a 6 it catches fire (a flaming brand adds 1, so 5+).',
      'A Good model that ends its Activation touching a burning Storehouse, not Engaged, may roll a D6: on 5+ the fire is out.',
      'Either way the model may not shoot or Support a Combat this turn.',
    ],
    use: [
      'Charge the tribesmen who reach the walls: an Engaged model cannot light anything.',
      'Keep a spare model near each Storehouse to put fires out; a bowman who tries loses his shot, so use a warrior with a shield.',
    ],
    click: [
      'Playing Rohan: when one of your models touches a burning Storehouse at the end of your move, the panel asks whether it should try: Roll to put it out, or Not now.',
      'Playing the Hill Tribes: at the end of the Move Phase the panel asks the same for each of your models touching a Storehouse that is not burning: Roll to set it alight, or Not now.',
    ],
    now() { return G && G.m.fire ? G.m.status() : ''; },
  },
  hordes: {
    t: 'Hordes of Tribesmen', rule: 'hordes',
    lead: 'The tribesmen you slay do not stay down: they come back from the board edges.',
    how: [
      'A slain Hill Tribesman is put aside. At the end of each Evil Activation Phase a D6 for each one: on 4+ it enters the battlefield from any point on any board edge.',
      'It comes on by the rules for Reinforcements: it moves on from the edge with all the usual rules, but it may not Charge that turn.',
    ],
    use: [
      'Killing tribesmen only buys time. The Heroes decide this battle: slay Wulf and Targg, and keep Haleth and Háma alive.',
      'Stay together near the centre: returning tribesmen arrive from the edges, behind models that strayed out.',
    ],
  },
  heroic: {
    t: 'Heroic Actions', rule: 'heroic',
    lead: 'At the start of the Move, Shoot and Fight phases a Hero may spend a Might Point on a Heroic Action: a deed that bends that phase its way.',
    how: [
      'Each phase opens with a Declare Heroic Actions step. The side without Priority goes first: declare one Heroic Action with one Hero, or pass. Then the other side, back and forth, until both pass one after the other.',
      'A side that passed may still answer when the other declares. A declared Heroic Action cannot be taken back or changed.',
      'Each costs 1 Might Point, the same points that raise dice, and a Hero declares at most one per phase (one in each phase of a turn is fine).',
      'Heroic Move, Shoot and Combat go before everyone else in their phase. When both sides have one, the side with Priority rolls a D6: 1-3 the Evil side picks the first, 4+ the Good side; then they alternate.',
    ],
    use: [
      'Might is scarce: a point spent on a Heroic Action cannot raise a dice later. Declare when it changes the outcome, not every phase.',
      'Heroic Move with the shout With Me lets your Hero and nearby Warriors Charge before the enemy can; Heroic Combat is fought first, and if the Hero wins and every enemy in that Combat falls, it and its friends there may move on and Charge again.',
      'Watch what the enemy declares: you may answer it, because the step only ends when both sides pass one after the other.',
    ],
    click: [
      `In the Declare Heroic Actions step the panel lists what your Heroes may declare: click one to declare it (it costs 1 Might), or press ${lfBtn('Pass')}.`,
      'The model card of a Hero lists its Heroic Actions and its Might Points left.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `Your Heroes: ${hs.map(u => `${u.name} ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicMove: {
    t: 'Heroic Move', rule: 'heroicMove',
    lead: 'For 1 Might Point a Hero Activates before every other model in the Move phase, whoever has Priority; with the shout With Me, the friends near it go too.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Move phase. The Hero then Activates first and cannot Activate again later that phase.',
      'As it Activates it may shout With Me: every friend within 6″ of it at that moment Activates right after it, in the order you choose, and must finish within 6″ of the Hero; a friend that cannot, gives up its Activation.',
      'If both sides declare a Heroic Move, the side with Priority rolls a D6: on 1–3 the Evil side goes first, on 4+ the Good side. A Hero Charged before its turn comes loses the Heroic Move and the Might Point.',
    ],
    use: [
      'Spend it when going first decides something: a Charge before the enemy can make one, or reaching a place first. In a turn where nothing is in reach, it only costs Might.',
      'Keep your Warriors within 6″ of the Hero at the start of the Move phase, so With Me takes them along.',
    ],
    click: [
      'In the Declare Heroic Actions step, click Heroic Move beside your Hero. When it Activates, press Shout With Me! or No shout; move the Hero and press Done, then move the friends it took along and press Done: With Me.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicMarch: {
    t: 'Heroic March', rule: 'heroicMarch',
    lead: 'For 1 Might Point a Hero moves 3″ further this Move phase (5″ on horseback), but may not Charge; with the shout At the Double, the friends near it march too.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Move phase. Unlike a Heroic Move, the Hero still Activates in the usual Priority order.',
      'As it Activates it may shout At the Double: every friend within 6″ of it at that moment adds 3″ to its Move this phase, may not Charge, and must finish within 6″ of the Hero; a friend that cannot, gives up its Activation.',
      'A marching Hero that is Charged before it Activates loses the March and the Might Point. A Hero may declare only one Heroic Action a phase: a March or a Move, never both.',
    ],
    use: [
      'Spend it when distance decides: a race to a place, or getting away from enemies you do not want to fight. Never when you want to Charge.',
      'If the enemy has Priority and can reach your Hero first, a Heroic Move keeps it free; a March would be cancelled by their Charge.',
      'Keep your Warriors within 6″ of the Hero when it Activates, so At the Double takes them along.',
    ],
    click: [
      'In the Declare Heroic Actions step, click Heroic March beside your Hero. When it Activates, press Shout At the Double! or No shout; then move the Hero and the friends: their move range is 3″ longer.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicShoot: {
    t: 'Heroic Shoot', rule: 'heroicShoot',
    lead: 'For 1 Might Point a Hero shoots before every other model in the Shoot phase, whatever the Priority; with the shout Loose, the friends near it shoot at the same time.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Shoot phase, by a Hero that is not Engaged in Combat. It needs no bow of its own.',
      'It may shout Loose: every friend within 6″ of it may shoot now, at any target, in the order you choose. A friend that does not shoot then cannot shoot later this phase.',
      'If both sides declare one, the side with Priority rolls a D6: 1–3 Evil goes first, 4+ Good.',
    ],
    use: [
      'Spend it when the enemy has Priority and their shots would kill your archers before they loose: the enemies you kill now never shoot back.',
      'Keep the archers within 6″ of the Hero, so Loose takes them all.',
    ],
    click: [
      'In the Declare Heroic Actions step, click Heroic Shoot beside your Hero, then press Shout Loose! or No shout; shoot with the Hero and the friends before the enemy does.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicAccuracy: {
    t: 'Heroic Accuracy', rule: 'heroicAccuracy',
    lead: 'For 1 Might Point a Hero re-rolls its failed In The Way Tests this turn and gains Sharpshooter; with the shout Take Aim, the friends near it re-roll them too.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Shoot phase, by a Hero that has it in its profile and is not Engaged in Combat.',
      'Every failed In The Way Test of its shots may be re-rolled (before Might), until the End phase. Sharpshooter lets it hit the part of a Cavalry model it aims at.',
      'It may shout Take Aim: every friend within 6″ of it re-rolls its failed In The Way Tests too.',
    ],
    use: [
      'Spend it when the targets are behind cover: with two In The Way Tests a shot gets through 1 time in 4, with re-rolls more than 1 in 2.',
      'A Hero declares one Heroic Action a phase; two Heroes can each declare one, so one may shout Take Aim while the other shouts Loose.',
    ],
    click: [
      'In the Declare Heroic Actions step, click Heroic Accuracy beside your Hero, then press Shout Take Aim! or No shout; the re-rolls show in the dice tray.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicCombat: {
    t: 'Heroic Combat', rule: 'heroicCombat',
    lead: 'For 1 Might Point a Hero\'s Combat is fought before every other Combat; if every enemy in it falls, the Hero and the friends that fought beside it may Move again, and even Charge.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Fight phase, by a Hero that is in a Combat.',
      'That Combat is fought first. If the Hero\'s side wins it and every enemy model in it is removed as a casualty, the Hero and its friends from that Combat may Move as in the Move phase, but only Move or Charge.',
      'A model that Charges now fights again later in the same Fight phase; the side with Priority Pairs Off the Combats again.',
      'A model benefits from one successful Heroic Combat a turn: if it joins a second one that also succeeds, it does not Move again.',
    ],
    use: [
      'Declare it where your Hero fights a lone enemy it will almost surely slay: the Might Point buys a second fight in the same phase.',
      'Against two or more enemies it fails unless all of them fall, and the Might Point is gone.',
    ],
    click: [
      'In the Declare Heroic Actions step of the Fight phase, click Heroic Combat beside your Hero. If it succeeds, move the Hero (and its friends from that Combat) as in the Move phase, or Charge.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicStrike: {
    t: 'Heroic Strike', rule: 'heroicStrike',
    lead: 'For 1 Might Point a Hero adds a D3 to its Fight Value for the rest of the Fight phase (to at most 10).',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Fight phase, by a Hero that has it in its profile.',
      'The D3 is rolled at the start of the first Combat the Hero fights in that phase and lasts to the end of the phase. It is added after every other change to its Fight Value.',
      'Fight Value counts only when the highest dice of both sides are equal: the higher Fight Value wins the tie. With equal Fight Values, a roll-off decides it.',
    ],
    use: [
      'Spend it against an enemy whose Fight Value is equal to your Hero\'s or higher: then the ties go your way. Against a lower Fight Value your Hero wins the ties anyway, so it changes nothing.',
      'A Hero declares one Heroic Action a phase: a Heroic Strike or a Heroic Combat, not both.',
    ],
    click: [
      'In the Declare Heroic Actions step of the Fight phase, click Heroic Strike beside your Hero; the D3 shows in the dice tray at the start of its Combat.',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicDefence: {
    t: 'Heroic Defence', rule: 'heroicDefence',
    lead: 'For 1 Might Point a Hero is wounded only on a natural 6 for the rest of the Fight phase, whatever the Strength against it.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Fight phase, by a Hero that has it in its profile and is in a Combat.',
      'Until the end of the phase, a Strike wounds the Hero only on a natural 6: no special rule, modifier or Might of the enemy changes that. Where 6+/4+ or the like is needed, both dice must be natural 6s.',
      'It does not protect the Hero\'s mount, if it rides one.',
    ],
    use: [
      'It pays against a strong enemy: one that would wound your Hero on a 3+ or 4+ now needs a 6. Against enemies that need a 6 anyway, it changes nothing.',
      'The sides declare in turn, and a side that passed may still declare later in the step. Pass first, and answer the enemy\'s Heroic Strength when it comes.',
    ],
    click: [
      'In the Declare Heroic Actions step of the Fight phase, click Heroic Defence beside your Hero; the To Wound rolls against it then say "Heroic Defence: natural 6s only".',
    ],
    now() {
      const hs = G && sideAlive('good').filter(u => u.mwf);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  heroicStrength: {
    t: 'Heroic Strength', rule: 'heroicStrength',
    lead: 'For 1 Might Point a Hero doubles its Strength (to at most 10) for its Strikes until the End phase.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Fight phase, by a Hero that has it in its profile and is in a Combat.',
      'Only the Strikes change: Strength 4 becomes 8 on the To Wound chart, so it wounds Defence 6 on a 3+ instead of a 5+. The Duel Roll is not affected.',
    ],
    use: [
      'Spend it against a well-armoured enemy, where it makes the biggest difference on the chart.',
      'An enemy Hero with Heroic Defence can answer it: then every Strike needs a natural 6 again.',
    ],
    click: [
      'In the Declare Heroic Actions step of the Fight phase, click Heroic Strength beside your Hero. When the enemy declares one, the log says so before you choose.',
    ],
    now() {
      const hs = G && sideAlive('evil').filter(u => u.mwf && u.might != null);
      return hs && hs.length ? `${hs.map(u => `${u.name}: ${u.might} Might`).join(', ')}.` : '';
    },
  },
  intoTheFray: {
    t: 'Into the Fray', rule: 'intoTheFray',
    lead: 'Helm Hammerhand declares a Heroic Combat in every Fight phase without spending Might; once he has slain an enemy, he must Charge whenever he Moves and can.',
    how: [
      'In the Declare Heroic Actions step of each Fight phase, Helm may declare a Heroic Combat for free. It is still his one Heroic Action of the phase: a free Heroic Combat means no Heroic Strike or Heroic Strength that phase.',
      'The Heroic Combat works as always: his Combat is fought first, and if every enemy in it falls, he and his friends from it may Move again and Charge.',
      'After Helm has slain an enemy model, for the rest of the battle he must Charge an enemy whenever he Moves, if he can reach one.',
    ],
    use: [
      'Fight one enemy at a time: a lone enemy Helm slays gives him a second Charge in the same Fight phase, and the Heroic Combat costs nothing.',
      'Once he must Charge, he goes wherever an enemy is in reach. Keep him facing the enemy you want, and keep friends on his flanks.',
    ],
    click: [
      'In the Declare Heroic Actions step of the Fight phase, click Heroic Combat beside Helm; the log says it was free. When he must Charge, a plain move is refused while an enemy is in reach.',
    ],
    now() {
      const h = G && sideAlive('good').find(u => u.t === 'helmHammerhand');
      return h ? (h.frayed ? 'Helm has slain an enemy: he must Charge whenever he can.' : 'Helm has slain nobody yet: he may still move freely.') : '';
    },
  },
  heroicChallenge: {
    t: 'Heroic Challenge', rule: 'heroicChallenge',
    lead: 'A Hero names an enemy Hero to fight: both fight harder against each other, and whoever slays the other gains a Might Point.',
    how: [
      'Declared in the Fight phase against an enemy Hero within 6″ of the same Heroic Tier or higher.',
      'Engaged with its target, the challenger gets +1 Attack (in the Duel Roll and for Strikes) and +1 To Wound against it. Slaying the target gives back 1 Might Point, up to its starting Might.',
      'The target accepts or declines. Accept: it gets the same bonuses, and both must Charge each other whenever they can. Decline: only the challenger gets the bonuses, and the target may not challenge it back.',
      'A Hero that challenged may not challenge again until its target is a casualty.',
    ],
    use: [
      'Challenge a Hero you can beat: the extra Attack and +1 To Wound make the fight shorter, and the Might Point comes back on a kill.',
      'Decline a challenge your Hero would lose: it is not forced to Charge, though the challenger keeps its bonuses against it.',
    ],
    click: [
      'Declare it like any Heroic Action: the panel lists it with the enemy Hero it targets.',
      `When the enemy challenges your Hero, two buttons appear: ${lfBtn('Accept')} or ${lfBtn2('Decline')}.`,
    ],
    now(ctx) {
      const u = ctx && ctx.u; return u ? `${u.name} is the one being challenged.` : '';
    },
  },
  standFast: {
    t: 'Stand Fast', rule: 'standFast', of: 'broken',
    lead: 'A Hero that passes its Courage Test in a Broken army calls Stand Fast: the Warriors near it hold without testing.',
    how: [
      'When a Hero of a Broken army passes its Courage Test as it Activates, it calls Stand Fast at the end of its Activation.',
      'Every friendly Warrior that Activates within 6″ of that Hero and can see it passes its own Courage Test automatically. Other Heroes still test for themselves.',
      'A Hero that is Engaged in Combat does not Activate, so it takes no test and cannot call Stand Fast, unless it declared Heroic Resolve: then it Activates only to call Stand Fast.',
    ],
    use: [
      'In a Broken army, Activate your Hero first and keep your Warriors within 6″ of it and in its sight: one good roll holds the whole line.',
      'Heroic Resolve makes the Hero pass its Courage Tests that turn, so its Stand Fast is certain.',
    ],
    click: ['Stand Fast is called by itself; the dice log says which Warriors it covers.'],
    now(ctx) {
      const u = ctx && ctx.u; return u ? `${u.name} calls Stand Fast.` : '';
    },
  },
  intelligence: {
    t: 'Intelligence Test', rule: 'intelligence',
    lead: 'Two dice against the model\'s Intelligence value: equal or higher and it succeeds.',
    how: [
      'Roll 2D6 and add them. A result equal to or higher than the Intelligence value (I on the profile, such as 6+) passes; lower fails, with the effect the rule asking for the test describes.',
      'Some rules make the test harder, such as Charging an Invisible model: the further away, the more it takes.',
      'A Hero may raise the total with Might Points.',
    ],
    use: ['Lower Intelligence is better: an I 4+ model passes far more often than an I 7+ one.'],
    click: ['The test is rolled in the dice tray. If your Hero fails by a little, a button offers to spend Might, or to accept the failure.'],
    now(ctx) {
      const u = ctx && ctx.u; return u ? `${u.name} has Intelligence ${u.T.i}+.` : '';
    },
  },
  magic: {
    t: 'Magical Powers', rule: 'magic',
    lead: 'A model with Magical Powers spends Will Points to Cast them: one D6 for each point, and one dice reaching the Casting Value is enough.',
    how: [
      'A caster may Cast one power as it Activates in the Move phase, before, during or after its move, if it has Will left and is not Prone. The target must be in range and in sight.',
      'Decide first how many Will Points to spend (one D6 each); you cannot roll and then add more. If any dice equals or beats the Casting Value, the power is Cast. A Hero may raise the best dice with Might.',
      'An enemy target with Will may try to Resist it (the next mission teaches this); a model without Will cannot.',
      'Instant powers happen at once, Temporary ones last until the End phase, Exhaustion ones until the caster has no Will left. All end if the caster is slain.',
    ],
    use: [
      'Spend enough dice: with a Casting Value of 4+, two dice succeed three times in four, one dice only half the time.',
      'The Will Points are spent even if the power fails, and they do not come back: keep some for the turns that decide the battle.',
    ],
    click: [
      'Select your caster: its model card lists its powers with Casting Value and range. Click a power to Cast it, then pick the target and the Will Points in the panel; the dice tray rolls them.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; return u && u.mwf ? `${u.name} has ${u.will} Will left.` : '';
    },
  },
  resist: {
    t: 'Resisting Magical Powers', rule: 'resist',
    lead: 'A model targeted by an enemy power may spend Will on a Resist Test: any dice equal to or above the best Casting dice stops the power.',
    how: [
      'After the Casting Test, before the power takes effect, decide how many Will Points to spend: one D6 each, chosen before rolling.',
      'If any dice equals or beats the highest Casting dice, the power is resisted and has no effect. A Hero may raise a dice with Might.',
      'A Hero regains the Will Point of every natural 6 it rolls to Resist.',
      'A power on the caster or its friends (Fury, Bladewrath) has no enemy target and cannot be Resisted. Exhaustion powers such as Fury last until the caster has no Will left or is slain.',
    ],
    use: [
      'A Casting dice of 6 can only be beaten by a 6: one dice in six. Against a 4 or a 5, two dice give a good chance.',
      'Will is scarce: Resist the powers that would cost you the fight, and let the small ones go.',
    ],
    click: [
      'When an enemy power targets one of your models with Will, the panel asks how many Will Points to spend, with the chance of each; the dice tray rolls them.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; return u && u.mwf ? `${u.name} has ${u.will} Will left.` : '';
    },
  },
  staffOfPower: {
    t: 'Staff of Power', rule: 'staffOfPower',
    lead: 'A wizard with a Staff of Power gains a free Will Point at the start of every turn; if it is not spent that turn, it is lost.',
    how: [
      'At the start of each turn the wielder gains one Will Point, on top of the Will on its profile.',
      'It can pay for a Casting or a Resist Test like any other Will Point. At the end of the turn an unspent free point is gone: it never builds up.',
      'Your Staff is Broken (5+) destroys an enemy\'s Staff of Power if it is Cast and not Resisted: no more free Will Points for that wizard.',
    ],
    use: [
      'Spend the free point every turn, on one dice of a Cast or a Resist Test: keeping it gains nothing.',
      'An enemy wizard with a staff never runs dry: breaking it costs him a Will Point every turn for the rest of the battle.',
    ],
    click: [
      'The model card shows the wizard\'s Will including the free point. When you Cast or Resist, the panel counts it among the Will Points you can spend.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; return u && u.mwf ? `${u.name} has ${u.will} Will left this turn.` : '';
    },
  },
  heroicChannelling: {
    t: 'Heroic Channelling', rule: 'heroicChannelling',
    lead: 'A Hero with Magical Powers spends a Might Point in the Move phase: its next Casting Test this turn counts as a 6.',
    how: [
      'Declared in the Declare Heroic Actions step at the start of the Move phase, by a caster that can still Activate.',
      'Its next Cast this turn spends one Will Point and rolls nothing: the Casting Test counts as a 6, so the power is Cast.',
      'An enemy can still Resist it, but only a 6 is equal to or above it.',
    ],
    use: [
      'Keep it for the power that decides the battle and that the enemy will Resist with all he has: one Will Point buys a sure 6.',
      'Might Points are few and do not come back: a Channelling is a Might Point that cannot raise a Duel Roll or a wound later.',
    ],
    click: [
      'At the start of the Move phase the panel offers Heroic Channelling for your caster; then Cast as usual, and the panel spends one Will Point without a dice roll.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; return u && u.mwf ? `${u.name} has ${u.might} Might and ${u.will} Will.` : '';
    },
  },
  sharpshooter: {
    t: 'Sharpshooter', rule: 'sharpshooter', of: 'shootcav',
    lead: 'A Sharpshooter shooting at a Cavalry model chooses the rider or the mount, and a hit lands on the part it aimed at.',
    how: [
      'Without the rule, a hit on a Cavalry model needs a test to see whether it struck the rider or the mount.',
      'With Sharpshooter the shooter names its target part before rolling; if the shot hits, it hits that part, with no test.',
      'Heroic Accuracy gives a Hero Sharpshooter until the End phase, and lets it re-roll failed In The Way Tests.',
    ],
    use: ['Aim at the part that is easier to wound or matters more: a slain mount throws its rider, who takes a Thrown Rider Test; a slain rider leaves its mount behind, which may flee or stay and fight on its own.'],
    click: ['When your Sharpshooter targets a Cavalry model, two buttons ask whether to aim at the rider or at the mount (each with its Defence).'],
    now(ctx) {
      const t = ctx && ctx.t; return t && t.mount ? `${t.name}: rider Defence ${t.d}, ${t.mount.n.toLowerCase()} Defence ${t.mount.d}.` : '';
    },
  },
  broken: {
    t: 'Broken army', rule: 'broken',
    lead: 'An army that has lost more than half its models is Broken: from now on its models may run rather than fight.',
    how: [
      'The Break Point is half the models the army started with. It is checked at the start of every turn: casualties above the Break Point and the army is Broken for good.',
      'Every model of a Broken army takes a Courage Test (2D6 against its Courage) when it Activates, before anything else. A failure and it flees the battlefield as a casualty.',
      'A model Engaged in Combat does not Activate, so it does not test. A model you leave standing does not test either.',
      'Both armies can be Broken at once. In matched play Breaking the enemy is worth Victory Points.',
    ],
    use: [
      'Count the enemy\'s losses: once it is Broken, every orc that wants to reach you must pass an 8+ first, and most will not.',
      'When the enemy is Broken, step back out of base contact instead of fighting on: an orc stuck to your shield does not test, an orc that has to walk does.',
      'When your own army is Broken, move only the models you must, and keep the rest in Combat or still: Courage 7+ fails two times in five.',
    ],
    click: [
      'The mission status under the briefing counts both armies\' losses against their Break Points; the Armies tab beside the dice log lists them model by model.',
      'In a Broken army, clicking one of your models rolls its Courage Test in the dice tray at once; if it stands, it is selected and moves as usual.',
    ],
    now(ctx) {
      const s = ctx && ctx.side; if (!s) return '';
      return `${s === 'good' ? 'Your army' : 'The enemy army'} has lost ${casualties(s)} of ${G.start[s]} models (Break Point ${breakPoint(s)}).`;
    },
  },
  courage: {
    t: 'Courage Test', rule: 'courage',
    lead: 'Two dice against the model\'s Courage value: equal or higher and it stands its ground.',
    how: [
      'Roll 2D6 and add them. A result equal to or higher than the Courage value passes: 7+ passes 21 times in 36 (58%), 8+ passes 15 times in 36 (42%).',
      'In a Broken army the test is taken when the model Activates. A failure means the model flees and is removed as a casualty.',
      'A test passed for one reason covers every further test for the same reason that turn, so a model that stood may move in several legs.',
    ],
    use: [
      'Models with a high Courage value are the ones to move when your army is Broken; Warriors of Minas Tirith (7+) stand more often than orcs (8+).',
      'Every model that can Activate does, standing still or not, and tests first. A model Engaged in Combat does not Activate, so a model already fighting takes no test.',
    ],
    now(ctx) {
      const u = ctx && ctx.u; if (!u) return '';
      const ways = { 2: 36, 3: 35, 4: 33, 5: 30, 6: 26, 7: 21, 8: 15, 9: 10, 10: 6, 11: 3, 12: 1 }, p = Math.round((ways[u.T.c] || 0) / 36 * 100);
      return `${u.name} has Courage ${u.T.c}+: it stands on ${u.T.c} or more, about ${p}% of the time.`;
    },
  },
  terror: {
    t: 'Terror', rule: 'terror',
    lead: 'To Charge a model that causes Terror, a model must first pass a Courage Test; if it fails, it cannot move at all this turn.',
    how: [
      'The test is taken at the start of the Move of a model that wants to Charge a Terror model, before it moves an inch.',
      'Failed: the model does not move this turn (it may still shoot, and fights if it is Charged). Passed: it Charges as normal, and needs no more Terror tests this turn.',
      'Only a Charge calls for the test. A model Charged by the Terror model, or already fighting it, does not test.',
    ],
    use: [
      'Do not send a lone Warrior at a Terror model: a failed test wastes its whole move. Let the monster come to you, or Charge it with the bravest models first.',
      'Once one model fights it, the others can join; each still tests for itself.',
    ],
    click: ['Select your model and click the Terror model as usual: the Courage Test comes up in the dice tray first.'],
    now(ctx) {
      const u = ctx && ctx.u, t = ctx && ctx.t; return u && t ? `${u.name} must pass Courage ${u.T.c}+ to Charge ${t.name}.` : '';
    },
  },
  cavalry: {
    t: 'Cavalry', rule: 'cavalry',
    lead: 'A rider and its mount are one model with two profiles: it moves at the horse’s speed, fights with the better of the two, and either can be struck.',
    how: [
      'The model moves with the mount\'s Move Value: 10″ for a horse. Difficult Terrain costs it ×4 (every 1″ in the brush is 4″ of Move), and it cannot take a Climb Test.',
      'In a Combat it uses the higher Fight Value, Strength and Attacks of rider and mount.',
      'A model that wins a Duel Roll against it chooses, Strike by Strike, whether to hit the rider or the mount; each has its own Defence and Wounds (a horse: Defence 4, 1 Wound).',
      'Rider slain: a horse flees; a Warg stays on a Courage Test (2D6, 8+) and fights on. Mount slain: the rider takes a Thrown Rider Test and fights on, on foot, where the model stood.',
      'A Cavalry model cannot Shield.',
    ],
    use: [
      'Use the 10″ Move to pick your fights: charge where you keep the bonus, and stay more than 6″ from infantry that could charge you first.',
      'Keep out of the brush: a horse crawls through it and loses its charge bonus there.',
      'When you strike a Cavalry model, hit the part that is easier to wound; killing the mount drops the rider to its feet.',
    ],
    click: [
      'Move and Charge a Rider like any model: the panel counts Difficult Terrain at ×4 for it.',
      'When one of your models wins against a Cavalry model, two buttons appear in the panel: Strike the rider, or Strike the horse (or Warg).',
    ],
    now(ctx) {
      const t = ctx && ctx.t; if (!t || !t.cav) return '';
      return `${t.name}: the rider has Defence ${t.d}, its ${t.mount.n.toLowerCase()} Defence ${t.mount.d}.`;
    },
  },
  cavalrycharge: {
    t: 'Cavalry Charge', rule: 'cavalrycharge',
    lead: 'A mounted model that Charges infantry on open ground hits like a hammer: one dice more, and the men it beats are knocked to the ground.',
    how: [
      'The model must have Charged this turn, fight only infantry (no enemy cavalry in the Combat), stand outside Difficult Terrain and not have been thrown this turn. Across a Barrier there is no bonus.',
      'Extra Attack: +1 Attack for this Combat, so one dice more in the Duel Roll and one Strike more.',
      'Knock to the Ground: if its side wins, every infantry model it fought is knocked Prone after Backing Away (not Monsters, not Strength 6 or more). Each Strike against a Prone model makes two To Wound rolls.',
      'Infantry that Charges a Cavalry model gets no such bonus, and the Rider it charges fights with its plain Attacks.',
    ],
    use: [
      'Charge from open ground and only infantry. Two Riders on one man roll four dice against one and almost always win.',
      'A Rider that cannot reach a good charge should stay more than 6″ from the enemy, so the infantry cannot charge it first; next turn it charges them.',
      'Spread the Strikes: a Prone man usually dies to the first Strike, so the second can go to another.',
    ],
    click: [
      'Click an enemy to Charge, as usual. The panel says "Cavalry Charge" when the spot gives the bonus, or why it does not (brush, cavalry).',
      'After a won Duel Roll the losers are laid Prone; then you pick the targets of each Strike when there is a choice.',
    ],
    now(ctx) {
      const c = ctx && ctx.c; if (!c) return '';
      const g = goodsOf(c), e = evilsOf(c), mine = g.filter(u => chargeBonus(u, e)), theirs = e.filter(u => chargeBonus(u, g));
      if (mine.length) return `${names(mine)} ${mine.length > 1 ? 'have' : 'has'} the bonus in this Combat: ${g.reduce((n, u) => n + u.a + (chargeBonus(u, e) ? 1 : 0), 0)} dice against ${e.reduce((n, u) => n + u.a, 0)}.`;
      if (theirs.length) return `${names(theirs)} charged your infantry with the bonus: one dice more, and your model is knocked Prone if it loses.`;
      return '';
    },
  },
  shootcav: {
    t: 'Shooting at cavalry', rule: 'shootcav',
    lead: 'An arrow at a horseman is aimed at the rider, but one shot in two finds the horse.',
    how: [
      'After the To Hit roll and any In The Way tests, roll a D6: 4+ the rider is hit, 1 to 3 the mount.',
      'Roll To Wound against the Defence of the part that was hit: a Rider of Rohan has Defence 5, its horse 4; a Warg Rider 5, its Warg 4.',
      'A mount slain by a shot throws its rider (Thrown Rider Test) and the rider fights on foot. A rider slain leaves the mount on its own: a horse flees, a Warg may stay.',
      'A mounted archer shoots like any model: after moving no more than half its Move (5″ on a horse) and 1 worse To Hit after any move.',
    ],
    use: [
      'Shoot the wolves before they reach you: every Warg Rider you unhorse or slay at range is one fewer to charge you.',
      'Keep your archers more than 10″ from the Warg Riders when the enemy may have Priority: a Warg moves 10″ and charges from that far.',
      'The archer\'s ruler (Options) shows which Warg Riders a Rider can shoot from the spot you point at.',
    ],
    click: [
      'In the Shoot phase click a Rider with a bow, then a Warg Rider. The panel shows the To Hit roll and both To Wound rolls, rider and mount.',
    ],
    now(ctx) {
      const t = ctx && ctx.t; if (!t || !t.cav) return '';
      return `${t.name}: the rider has Defence ${t.d}, its ${t.mount.n.toLowerCase()} Defence ${t.mount.d}.`;
    },
  },
  loosemount: {
    t: 'A mount on its own', rule: 'loosemount', of: 'cavalry',
    lead: 'A Warg that loses its rider does not always run: on a passed Courage Test it stays and fights on its own.',
    how: [
      'The moment the rider is slain or thrown, the mount rolls 2D6 against its Courage: a Warg needs 8 or more (about two in five). A horse always flees.',
      'A Warg that stays is a model of its own: Fight 3, Strength 4, Defence 4, 1 Wound, Move 10″. It charges and fights like any other model.',
      'It counts as a Mount, not infantry: a Cavalry Charge against it gets no Extra Attack or Knock to the Ground.',
    ],
    use: [
      'Slaying the rider does not always end the threat: a loose Warg still bites with Strength 4. Finish it with a Rider or two, or shoot it.',
      'A loose Warg has no rider to protect: every Strike at it hits the Warg itself.',
    ],
  },
  thrownrider: {
    t: 'Thrown Rider', rule: 'thrownrider', of: 'cavalry',
    lead: 'A rider whose mount is slain hits the ground: roll a D6 to see how it lands.',
    how: [
      '1, Knocked Flying: one Strength 3 hit; if it survives, it lies Prone and can do nothing more this turn (it fights as a Prone model: no Strikes, Trapped if it loses).',
      '2 to 5, Rises From the Dust: on its feet, but it can do nothing more this turn: no moving, no Strikes.',
      '6, Leaps into Action: it fights on at once.',
      'The rider is now infantry on a 25 mm base where the model stood, Engaged with the enemies it was fighting. An Expert Rider (the Riders of Rohan) re-rolls a 1. A 1 on a Jump or Leap from the saddle throws the rider the same way, and so does a fall.',
    ],
    use: [
      'A thrown rider is not dead: it keeps its Wounds and its shield. Count it when you plan the next turn, but do not expect it to strike this one.',
      'The test comes after all the Strikes of the Combat, so a Combat can slay the mount and wound the rider in the same fight.',
    ],
  },
  barriers: {
    t: 'Barriers', rule: 'barriers',
    lead: 'A model standing against a wall or hedge at least half its height defends it: attackers must come at it over the Barrier, and the Barrier takes half their blows.',
    how: [
      'A Control Zone stops at a wall, a hedge or rocks. A defender\'s zone reaches over its Barrier instead, so no enemy can cross the Barrier near it without Charging it.',
      'Only one model may Charge a defender over the Barrier. It stops against the Barrier as close to the defender as it can, and the two count as in base contact. Enemies on the defender\'s own side Charge it as usual.',
      'The Duel Roll is normal. Then Strikes come before Backing Away, so nobody is Trapped. The defender strikes as usual; each of the attacker\'s Strikes must first pass an In The Way test (4+) over the Barrier.',
      'A beaten defender that survives holds its ground: the attacker Backs Away instead. A slain defender\'s place is taken by the attacker, which crosses the Barrier at once.',
      'A defender Charged on its own side as well loses the protection (Attacked from both sides). A Prone model never defends.',
    ],
    use: [
      'To hold a line, stand every model in base contact with the wall: a defender with Defence 6 behind a wall is hit by an orc blow only half as often, and a lost fight costs it no ground.',
      'Keep a few models behind the line to Charge any enemy that gets through, and to take the place of a defender that falls.',
      'Shielding works over a Barrier too: a defender that only has to hold can shield.',
    ],
    click: [
      'Select a model and click just short of the wall: it stops in base contact with it, and the panel says it defends the wall.',
      'When an enemy Charges over the wall, it stops against the far side; the fight is listed as a fight over the wall.',
      'To attack over a wall yourself, click the defender: the charge stops against the wall opposite it.',
    ],
    now(ctx) {
      const B = ctx && ctx.B; if (!B) return '';
      return `${B.def.name} defends the ${B.T.k} against ${B.att.name}: if ${B.att.name} wins, each of its Strikes passes the ${B.T.k} only on a 4+.`;
    },
  },
  bothsides: {
    t: 'Attacked from both sides', rule: 'bothsides', of: 'barriers',
    lead: 'A defender Charged on its own side of the Barrier as well loses its protection: the fight is a normal Combat.',
    how: [
      'Backing Away comes before the Strikes again, so the defender can be Trapped, and no Strike needs an In The Way test.',
      'If the defender is slain, the attacker across the Barrier may still cross it.',
      'The other way round: an attacker that is Charged on its own side by a friend of the defender fights a normal Combat, and may not cross the Barrier even if it slays the defender.',
    ],
    use: [
      'Do not let enemies round the end of the wall or through a gate: one of them behind your line strips the Barrier from every defender it reaches.',
      'When you attack a wall, send a model round it: a defender attacked from both sides fights without cover.',
    ],
  },
  twohanded: {
    t: 'Two-handed weapons', rule: 'twohanded',
    fig: `<p class="lfig-cap">An orc with a two-handed weapon: what its Duel Roll dice count as</p><p>${[1, 2, 3, 4, 5, 6].map(v => lfDie(v)).join('')} → ${[1, 1, 2, 3, 4, 6].map((v, i) => lfDie(v, i === 5 ? true : undefined)).join('')}</p>`,
    lead: 'A great axe or cleaver hits hard but swings slowly: worse in the Duel Roll, deadlier in the Strikes.',
    how: [
      'Every Duel Roll dice of a model fighting with a two-handed weapon gets −1. A natural 6 stays a 6.',
      'When it wins, each of its Strikes gets +1 on the To Wound roll: a 6 needed becomes a 5, a 5 becomes a 4.',
      'It cannot use a shield in the same Combat. Here the orcs always fight with their two-handed weapons.',
    ],
    use: [
      'The orcs lose more fights than usual, so you win more often even without Shielding.',
      'But a fight you lose costs more: shield where they outnumber you, and keep your models from being Trapped.',
    ],
    now() {
      const g = sideAlive('good'), e = sideAlive('evil').find(u => u.T.twoHanded);
      if (!g.length || !e) return '';
      return lfUniq(g).map(u => `${u.T.full || u.base} (D${u.d}): the orcs need ${needStr(woundNeed(e.s, u.d))} To Wound, which the +1 turns into ${Math.max(2, woundNeed(e.s, u.d)[0] - woundBonus(e))}+`).join('; ') + '.';
    },
  },
  spear: {
    t: 'Spears and Supporting', rule: 'spear', fig: FIG.spear,
    lead: 'A model with a spear can help a friend who is fighting without joining the fight: it Supports from behind.',
    how: [
      'Move the spear into base contact with a friend that is (or will be) Engaged in Combat. The spear itself must not touch an enemy.',
      'In the Fight phase it adds one dice to that friend\'s Duel Roll, with its own Fight Value.',
      'If your side wins, the spear makes one Strike at any enemy in that Combat. If your side loses, nothing happens to it: it is not part of the Combat, so it cannot be struck and does not Back Away.',
      'A spear Supports one Combat per Fight phase, and not in a turn it shot.',
    ],
    use: [
      'Put a spear right behind every friend in the front rank: one against two becomes two dice against two.',
      'The spear blocks its friend\'s way straight back. When the friend loses, let the spear Make Way so the line holds.',
    ],
    click: [
      'In the Move phase click a spear, then point just behind a friend\'s base, on the side away from the enemy. The spear snaps into base contact with it.',
      'Before you click, the panel says "It will Support …: +1 dice".',
      'Nothing more to click: in the Fight phase a dashed line links the spear to the friend it Supports, and its dice joins that Combat.',
    ],
    now() {
      const s = sideAlive('good').filter(u => u.T.spear);
      return s.length ? `You have ${s.length} spear${s.length > 1 ? 's' : ''}: ${names(s)}.` : '';
    },
  },
  throwing: {
    t: 'Throwing weapons', rule: 'throwing',
    lead: 'A throwing weapon is thrown in the Shoot phase even after a full Move, or once per turn as the model Charges.',
    how: [
      'In the Shoot phase it shoots like a bow, but moving does not stop it: it may throw after a full Move.',
      'As it Charges: the model stops 1″ from its target and throws first, with no −1 for moving. If the target still stands, the model finishes its Charge against it.',
      'If the throw slays the target, the model may go on with the rest of its Move, and even Charge another enemy.',
    ],
    use: [
      'Throw with every model that Charges: it fights anyway, so the throw costs it nothing, and a slain enemy never strikes back.',
      'Mind what the throw costs a model that would rather Support (Spear Mastery).',
    ],
    click: [
      'Move a model with a throwing weapon into a Charge: the panel asks "Throw first" or "Just Charge". The dice tray rolls the throw, then the Charge goes on.',
    ],
    now() {
      const s = sideAlive('good').filter(u => u.T.thrown);
      return s.length ? `${s.length} of your models carry throwing weapons.` : '';
    },
  },
  spearMastery: {
    t: 'Spear Mastery', rule: 'spearMastery', fig: FIG.spear,
    lead: 'Spear Mastery: throwing spears also fight as a spear, so the model can Support a friend, but not in a turn it threw them.',
    how: [
      'A model with Spear Mastery Supports from behind a fighting friend like any spear: one more dice in the Duel Roll, one Strike if you win.',
      'If it threw its spears in this turn\'s Move phase (as it Charged) or Shoot phase, it cannot Support in the Fight phase.',
    ],
    use: [
      'The front rank Charges and throws; the rear rank keeps its spears and moves behind them to Support.',
      'In the Shoot phase, throw only with models that will not Support this turn.',
    ],
    click: [
      'Nothing new to click: a model that threw this turn simply gets no "It will Support" line when you move it behind a friend.',
    ],
    now() {
      const s = sideAlive('good').filter(u => u.T.thrown && u.T.spear);
      const t = s.filter(u => u.threw || u.shot);
      return s.length ? `${s.length} of your models have Spear Mastery${t.length ? `; ${names(t)} threw this turn` : ''}.` : '';
    },
  },
  bodyguard: {
    t: 'Bodyguard', rule: 'bodyguard',
    lead: 'Bodyguards protect one Hero of their army: while it lives and is on the battlefield, they pass every Courage Test without rolling.',
    how: [
      'At the start of the game every Bodyguard picks a Hero with its Faction keyword: the General if it has one, else the Hero of the highest Heroic Tier.',
      'While that Hero is alive and on the battlefield, its Bodyguards pass every Courage Test: they never flee from a Broken army and need no Stand Fast.',
      'If the Hero falls, the Bodyguards test like everyone else.',
    ],
    use: [
      'Keep the guarded Hero alive: he holds the guards together. Keep him out of fights he could lose.',
      'Stand Fast is for the others: the guards do not need it.',
    ],
    click: [
      'Nothing to click: the log says when a Bodyguard passes its Courage Test because its Hero lives.',
    ],
    now() {
      const s = sideAlive('good').filter(u => (u.T.rules || []).includes('Bodyguard'));
      return s.length ? `${s.length} of your models are Bodyguards.` : '';
    },
  },
  shieldwall: {
    t: 'Shieldwall', rule: 'shieldwall',
    lead: 'A model with Shieldwall and a shield gets +1 Defence while it touches two or more friends that have Shieldwall and a shield too.',
    how: [
      'Count the friends in base contact that have the rule and a shield: two or more give +1 Defence, against Strikes and shooting alike.',
      'In a fight it is worked out before Backing Away, so a model keeps it for that Combat.',
      'A Prone model, or Cavalry, neither gets it nor gives it.',
    ],
    use: [
      'Against a Shieldwall, strike at its ends: a model with only one friend beside it has its normal Defence.',
      'Break the line: what Backs Away or falls leaves its neighbours with fewer friends in contact next turn.',
    ],
    click: [
      'Nothing to click: before the Strikes of a fight the log names the models standing in Shieldwall, and the To Wound roll shows their Defence +1.',
    ],
    now() {
      const s = [...sideAlive('good'), ...sideAlive('evil')].filter(u => (u.T.rules || []).includes('Shieldwall'));
      return s.length ? `${s.length} models here have Shieldwall.` : '';
    },
  },
};
