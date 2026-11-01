// Matched play: two armies built from the 2024 army lists (data/army-lists.js, imported from BattleScribe data) fight
// one of the six scenarios of the Rules Manual (scenarios.js scores them) or the Grand Siege. Each army has Heroes leading
// Warbands of Warriors (the Heroic Tier sets how many: matched_play p. 151); the General is the Hero of the highest tier
// (special.js: assignGenerals). The armies deploy in one go instead of Warband by Warband.
// Broken armies take Courage Tests (rules.js).
// No DOM here: the game (game/flow.js) and the balance tool both build their matches with makeMatch().
import { G } from '../state.js';
import { mulberry } from '../util.js';
import { baseRadius } from '../data/units.js';
import { ARMIES, ARMY_TYPES } from '../data/army-lists.js';
import { alive, sideAlive, modelsAlive, inert } from './rules.js';
import { squareHits, piecesClear, pieceBox } from './geometry.js';
import { GATE, makeFortress, withinWalls, WALL_Z } from './fortress.js';
import { SCENARIOS, OBJ_R, dominationMarkers, supplyMarkers, scoreRows, endsNow, brokenNow } from './scenarios.js';
import { straddles } from './terrain.js';

export const POINT_LIMITS = [100, 150, 200, 300];
export const armyById = id => ARMIES.find(a => a.id === id);
const loadoutsOf = army => army.units.flatMap(u => u.loadouts.map(l => (u.hero ? { ...l, hero: u.hero, lead: u.lead, n: u.n } : l)));
const hasHeroes = army => army.units.some(u => u.hero);

/* ---------- Building an army ---------- */
// list: { type key: number of models }. Points, models and the bow and throwing weapon limits (one in three Warriors
// may carry a bow, and a different one in three a throwing weapon; models marked free do not count).
export function armyStats(army, list, limit) {
  const s = { pts: 0, models: 0, warriors: 0, bows: 0, thr: 0, banners: 0, heroes: 0, lead: 0, twice: [], names: {} };
  for (const l of loadoutsOf(army)) {
    const n = list[l.t] || 0;
    if (!n) continue;
    s.pts += n * l.pts; s.models += n;
    if (!l.free) s.warriors += n;
    if (l.bow) s.bows += n;
    if (l.thr) s.thr += n;
    if (ARMY_TYPES[l.t].banner) s.banners += n;
    if (l.hero) { s.heroes += n; s.lead += n * l.lead; s.names[l.n] = (s.names[l.n] || 0) + n; if (s.names[l.n] > 1) s.twice.push(l.n); }
  }
  s.bowLimit = Math.ceil(s.warriors / 3); s.thrLimit = s.bowLimit;
  s.problems = [];
  if (!s.models) s.problems.push('Add at least one model.');
  if (s.pts > limit) s.problems.push(`${s.pts - limit} points over the limit of ${limit}.`);
  if (s.bows > s.bowLimit) s.problems.push(`Too many bows: ${s.bows}, but only one in three Warriors may carry one (${s.bowLimit} here).`);
  if (s.thr > s.thrLimit) s.problems.push(`Too many throwing weapons: ${s.thr}, but only one in three Warriors may carry one (${s.thrLimit} here).`);
  // Warbands (p. 151): every Warrior follows a Hero, each Hero leads as many as its Heroic Tier allows; a Hero once.
  if (hasHeroes(army)) {
    if (!s.heroes && s.models) s.problems.push('Add a Hero: every army needs one to be its General.');
    else if (s.warriors > s.lead) s.problems.push(`Too many Warriors: ${s.warriors}, but your Heroes lead only ${s.lead} (Legend 18, Valour 15, Fortitude 12, Minor 6).`);
    for (const n of new Set(s.twice)) s.problems.push(`${n} can only be taken once.`);
  }
  s.ok = !s.problems.length;
  return s;
}

// A random but sensible army: mostly the cheap fighting loadouts, some spears and bows, at most two banners and one
// big model, filled up to the points limit.
// With Heroes: first a Hero (at most about 40% of the points), then Warriors up to the Warbands it leads; when they are
// full, another Hero if one fits.
export function randomArmy(army, limit, rnd = Math.random) {
  const all = loadoutsOf(army), list = {}, heroes = all.filter(l => l.hero), opts = all.filter(l => !l.hero);
  const taken = new Set();
  const addHero = cap => {
    const s = armyStats(army, list, limit);
    const H = heroes.filter(h => !taken.has(h.n) && s.pts + h.pts <= cap);
    if (!H.length) return false;
    const h = H[Math.floor(rnd() * H.length)];
    list[h.t] = 1; taken.add(h.n);
    return true;
  };
  if (heroes.length && !addHero(Math.min(limit, Math.max(limit * 0.4, Math.min(...heroes.map(h => h.pts)))))) return list;   // no Hero fits: no army
  const weight = l => { const T = ARMY_TYPES[l.t]; return T.banner ? 0.12 : l.pts >= 40 ? 0.2 : T.bow ? 0.6 : T.spear || T.pike ? 0.9 : 1; };
  for (let guard = 0; guard < 400; guard++) {
    let s = armyStats(army, list, limit);
    if (heroes.length && s.warriors + 1 > s.lead) {   // the Warbands are full: another Hero, or stop
      if (!addHero(limit)) break;
      s = armyStats(army, list, limit);
      if (s.warriors + 1 > s.lead) continue;   // an Independent or tiny Warband: try again
    }
    const w1 = s.warriors + 1;
    const fits = opts.filter(l => s.pts + l.pts <= limit
      && !(l.bow && s.bows + 1 > Math.ceil((l.free ? s.warriors : w1) / 3)) && !(l.thr && s.thr + 1 > Math.ceil((l.free ? s.warriors : w1) / 3))
      && !(ARMY_TYPES[l.t].banner && s.banners >= 2) && !(l.pts >= 40 && opts.some(o => o.pts >= 40 && list[o.t])));
    if (!fits.length) break;
    let r = rnd() * fits.reduce((n, l) => n + weight(l), 0), pick = fits[0];
    for (const l of fits) { r -= weight(l); if (r <= 0) { pick = l; break; } }
    list[pick.t] = (list[pick.t] || 0) + 1;
  }
  return list;
}

/* ---------- Battlefield ---------- */
// Board size and the depth of each deployment zone (from the long edges) by points limit. The Rules Manual's
// To the Death! deploys within 12″ of the edge on a 48″ board; smaller armies here get a smaller table.
export function boardFor(limit) {
  return limit <= 150 ? { W: 36, H: 30, zone: 6 } : { W: 48, H: 36, zone: 7 };
}

// Terrain in the middle of the table, the same for both sides (turned round by 180°): rocks (impassable), brush
// (Difficult Terrain), low walls (stepped over), hedges (a Jump Test to cross; the computer goes round them) and low
// hills (raised ground 0.5″ high: everybody walks up freely, but only models on the same level can fight).
// At most two pairs of hedges and of hills (the computer does not Jump, so a field of hedges would stall it).
const PIECES = ['rock', 'brush', 'brush', 'wall', 'hedge', 'hill'], MAX_PAIRS = { hedge: 2, hill: 2 };
function makeTerrain(W, H, zone, rnd) {
  const out = [], lo = zone + 1.5, mid = H / 2, made = {};
  const clear = (T, gap) => out.every(o => piecesClear(T, o, gap));
  const pairs = Math.round(W * H / 260);
  for (let tries = 0; out.length < pairs * 2 && tries < 300; tries++) {
    const kind = PIECES[Math.floor(rnd() * PIECES.length)], line = kind === 'wall' || kind === 'hedge';
    if ((made[kind] || 0) >= (MAX_PAIRS[kind] ?? Infinity)) continue;
    const horiz = rnd() < 0.7;
    const w = line ? (horiz ? 4 + rnd() * 3 : 0.6) : kind === 'rock' ? 1.6 + rnd() * 2 : kind === 'hill' ? 4 + rnd() * 3 : 3 + rnd() * 3;
    const h = line ? (horiz ? 0.6 : 3 + rnd() * 2) : kind === 'rock' ? 1.6 + rnd() * 2 : kind === 'hill' ? 3 + rnd() * 2 : 2 + rnd() * 2.5;
    // Brush is woodland; about a third of it is rocky scree instead (Woodland Creature, Mountain Dweller: rules.js: freeIn).
    const extra = kind === 'hedge' ? { ht: 1 } : kind === 'hill' ? { z: 0.5 } : kind === 'brush' && rnd() < 0.35 ? { rocky: true } : {}, k = kind === 'hill' ? 'plateau' : kind;
    const T = { k, x: +(1.5 + rnd() * (W - w - 3)).toFixed(2), y: +(lo + rnd() * Math.max(0.1, mid - lo - h - 0.6)).toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2), ...extra };
    const U = { k, x: +(W - T.x - T.w).toFixed(2), y: +(H - T.y - T.h).toFixed(2), w: T.w, h: T.h, ...extra, ...(T.a ? { a: T.a } : {}) };   // turned half way round, a turned piece keeps its angle
    if (!clear(T, 2.2) || !clear(U, 2.2) || Math.abs(T.x + T.w / 2 - W / 2) < 0.5) continue;
    if (!piecesClear(T, U, 2.2)) continue;   // too close to its own mirror image
    out.push(T, U); made[kind] = (made[kind] || 0) + 1;
  }
  return out;
}

// Places an army in its deployment zone in ranks: fighters in front, spears and pikes right behind them, then
// banners and shooters. front: the y of the zone's edge towards the enemy; dir: +1 if the ranks go down the table.
function deploy(list, side, W, front, dir, terrain, placed, H) {
  const onTable = (y, r) => Math.min(H - r - 0.05, Math.max(r + 0.05, y));   // ranks that overflow the zone stop at the table edge
  const order = T => (T.siege ? 4 : T.chariot || T.warBeast ? -1 : T.bow ? 3 : T.banner || T.hero ? 2 : T.spear || T.pike ? 1 : 0);   // Siege Engines at the back; Chariots and War Beasts in front, with room to charge
  let eid = 0;
  const all = Object.entries(list).flatMap(([t, n]) => Array.from({ length: n }, () => {
    const T = ARMY_TYPES[t];
    if (!T.siege) return [{ t, T }];
    const id = ++eid;   // the engine and its crew (Siege Veteran, crew), placed around it afterwards
    return [{ t, T, eng: id }, ...T.crew.flatMap(([k, c]) => Array.from({ length: c }, () => ({ t: k, T: ARMY_TYPES[k], crewFor: id })))];
  }).flat());
  const crew = all.filter(m => m.crewFor), models = all.filter(m => !m.crewFor).sort((a, b) => order(a.T) - order(b.T) || b.T.base - a.T.base);
  const blocked = (x, y, r) => x < r + 0.3 || x > W - r - 0.3 || terrain.some(T => (T.k === 'rock' || T.k === 'water' || T.k === 'wall' || T.k === 'hedge')
    && squareHits(x, y, r, T)) || placed.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 0.05);
  const out = [];
  let rowY = front, rowDepth = 0, rank = null;
  const rows = [];
  for (const m of models) {
    const r = baseRadius(m.T), k = order(m.T);
    if (k !== rank || (rows.length && rows[rows.length - 1].w + 2 * r + 0.1 > W - 2)) {
      rowY += dir * (rowDepth ? rowDepth + 0.1 : 0); rowDepth = 0; rank = k;
      rows.push({ y: null, w: 0, list: [] });
    }
    const row = rows[rows.length - 1];
    row.list.push({ ...m, r }); row.w += 2 * r + 0.1; rowDepth = Math.max(rowDepth, 2 * r);
    row.y = rowY;
  }
  // Each rank is centred; its models stand on the side of rowY away from the enemy.
  for (const row of rows) {
    let x = W / 2 - row.w / 2;
    for (const m of row.list) {
      const y = onTable(row.y + dir * m.r, m.r);
      let px = x + m.r, tries = 0;
      while (blocked(px, y, m.r) && tries++ < 80) px = x + m.r + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.55;
      const p = { t: m.t, T: m.T, side, x: +px.toFixed(3), y: +y.toFixed(3), r: m.r, eng: m.eng };
      placed.push(p); out.push(p);
      x += 2 * m.r + 0.1;
    }
  }
  // The crew stand in base contact with their engine, on the side towards the enemy (the engine stands at the back of the zone) (p. 141).
  for (const c of crew) {
    const e = out.find(p => p.eng === c.crewFor), r = baseRadius(c.T);
    if (!e) continue;
    let spot = null;
    for (let k = 0; k < 24 && !spot; k++) {
      const a = (dir > 0 ? -Math.PI / 2 : Math.PI / 2) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, d = e.r + r + 0.06;   // 0.05 apart from every placed model, the engine too
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      if (!blocked(x, y, r) && y > r && y < H - r) spot = { x, y };
    }
    if (!spot) continue;
    const p = { t: c.t, T: c.T, side, x: +spot.x.toFixed(3), y: +spot.y.toFixed(3), r, crew: true };
    placed.push(p); out.push(p);
  }
  return out;
}

/* ---------- The scenario: The Grand Siege (p. 163) ---------- */
// cfg.scenario 'siegeDef': the player defends the fortress at the bottom of the table; 'siegeAtt': the player attacks
// the computer's fortress at the top. The attacker has a quarter more points (the army builder gives them), and Siege
// Ladders carried by its Warriors (one per 100 points, at least two). The attacker wins with 12 models on or within the
// walls in an End phase (half its army when that is fewer), the defender when the attacker is down to a quarter.
export const LADDERS_PER = 100;
function makeSiege(cfg) {
  const A = { good: armyById(cfg.me), evil: armyById(cfg.foe) };
  const def = cfg.scenario === 'siegeDef' ? 'good' : 'evil', att = def === 'good' ? 'evil' : 'good';
  const W = 48, H = 40, rnd = mulberry(cfg.seed || 1);
  const F = makeFortress(W, H, def);
  // Terrain only on the attacker's side, clear of the walls by 3″ and of its deployment zone.
  const open = makeTerrain(W, H, 12, rnd).filter(T => (B => def === 'good' ? B.y + B.h < F.face - 3 && B.y > 13 : B.y > F.face + 3 && B.y + B.h < H - 13)(pieceBox(T)));
  const terrain = [...F.terrain, ...open], placed = [];
  const lists = { good: cfg.mine, evil: cfg.theirs };
  // The attacker within 12″ of its edge; the defender behind its walls (archers on them).
  const aOut = deploy(lists[att], att, W, att === 'evil' ? 12 : H - 12, att === 'evil' ? -1 : 1, terrain, placed, H);
  const behind = def === 'good' ? F.face + 2 + 4.3 : F.face - 2 - 4.3;
  const dOut = deploy(lists[def], def, W, behind, def === 'good' ? 1 : -1, terrain, placed, H);
  const wallY = def === 'good' ? F.face + 1 : F.face - 1;
  let wx = 1;
  for (const p of dOut.filter(p => p.T.bow && !p.T.siege)) {   // archers up on the walls, clear of the gate
    while (wx < W - 1 && Math.abs(wx - W / 2) < 2 + p.r + 0.1) wx += 0.3;
    if (wx > W - 1) break;
    const i = placed.indexOf(p); if (i >= 0) placed.splice(i, 1);
    p.x = +(wx + p.r).toFixed(3); p.y = wallY; wx += 2 * p.r + 0.15;
    placed.push(p);
  }
  // Siege Ladders for the attacker's Warriors on foot (not its archers if it can help it).
  const carriers = aOut.filter(p => !p.T.hero && !p.T.mount && !p.T.siege && !p.T.monster && !p.T.chariot && !p.T.warBeast && !p.crew)
    .sort((a, b) => (a.T.bow ? 1 : 0) - (b.T.bow ? 1 : 0));
  const nLadders = Math.max(2, Math.round(cfg.limit / LADDERS_PER));
  carriers.slice(0, 2 * nLadders).forEach((p, i) => { p.carry = 'ladder'; p.ladder = i >> 1; });   // two bearers a ladder: they Move it at full speed
  const gate = { t: 'fortressGate', T: GATE, side: def, x: F.gate.x, y: F.gate.y };
  const facing = side => (side === 'good' ? -Math.PI / 2 : Math.PI / 2);
  const units = [...dOut, ...aOut].map(({ t, T, side, x, y, crew, carry, ladder }) => ({ t, T, side, x, y, ...(carry ? { ladder } : {}), ...(T.siege || T.chariot || T.warBeast ? { facing: facing(side) } : {}), ...(crew ? { ai: 'hold', crew: true } : {}), ...(carry ? { carry } : {}) }));
  units.push(gate);
  const count = list => list.reduce((n, p) => n + (p.T.siege ? 0 : p.T.cmd ? 2 : 1), 0);
  const start = { [def]: count(dOut), [att]: count(aOut) };
  const need = Math.min(12, Math.ceil(start[att] / 2));
  const mine = def === 'good';
  const m = {
    matched: true, siege: { def, att, F, need }, cfg, armies: A, start, breakAt: { good: A.good.breakPoint || 0.5, evil: A.evil.breakPoint || 0.5 },
    bannersAtStart: { good: 0, evil: 0 },
    title: `${A.good.name} vs ${A.evil.name}`, lesson: `Matched play · The Grand Siege · ${cfg.limit} points`,
    board: [W, H], terrain, units, limit: null,
    zones: { [att]: att === 'good' ? { x: 0, y: H - 12, w: W, h: 12 } : { x: 0, y: 0, w: W, h: 12 }, [def]: def === 'good' ? { x: 0, y: F.face, w: W, h: H - F.face } : { x: 0, y: 0, w: W, h: F.face } },
    goal: mine ? `Hold the fortress: the attacker wins with ${need} models on or within your walls in an End phase; you win when it is down to a quarter of its army.`
      : `Take the fortress: ${need} of your models on or within its walls in an End phase wins; you lose when you are down to a quarter of your army.`,
    tip: mine ? 'Push their ladders down from the battlements, shoot those carrying them, and keep the gate shut: only Strength 5 or more harms it.'
      : 'Carry the ladders to the walls and climb them; batter the gate (two To Wound rolls a Strike). Keep enough models alive: at a quarter of your army you lose.',
    rules: ['priority', 'charge', 'pairoff', 'shoot', 'siegeWalls'],
    inside: () => sideAlive(att).filter(u => !inert(u) && withinWalls(u, F)).length,
    score() {
      const v = {};
      for (const s of ['good', 'evil']) v[s] = { left: modelsAlive(s), rows: [], total: 0 };
      return v;
    },
    check(atEnd) {
      if (!modelsAlive(att)) return def === 'good' ? 'win' : 'lose';
      if (!modelsAlive(def)) return att === 'good' ? 'win' : 'lose';
      if (!atEnd) return null;
      const aWin = this.inside() >= need, dWin = modelsAlive(att) <= start[att] / 4;
      if (aWin && dWin) return 'draw';
      if (aWin) return att === 'good' ? 'win' : 'lose';
      if (dWin) return def === 'good' ? 'win' : 'lose';
      return null;
    },
    status() {
      return `${mine ? 'Attackers' : 'Your models'} on or within the walls: ${this.inside()} of ${need} · attacker: ${modelsAlive(att)} of ${start[att]} left (it loses at ${Math.floor(start[att] / 4)}) · gate: ${G.units.some(u => u.T.gate && alive(u)) ? 'standing' : 'broken'}`;
    },
    debrief: {
      win: mine ? 'The walls held. Ladders pushed down and arrows on the bearers keep an assault from ever reaching the battlements.' : 'The fortress fell. Ladders in many places at once stretch the defenders thin.',
      lose: mine ? 'The walls were taken. Push ladders down before they fill with climbers, and keep a reserve behind the gate.' : 'The assault broke on the walls. Carry ladders together, and climb where the defenders are thin.',
      draw: 'Both sides reached their goal in the same turn.',
    },
  };
  return m;
}

/* ---------- The scenario: To the Death! ---------- */
// cfg: { me, foe: army ids; mine, theirs: lists; limit: points; seed }. The player's army is side 'good' (the bottom
// of the table), the computer's is 'evil'; G.align says which of them is Good and which is Evil.
export function makeMatch(cfg) {
  if (cfg.scenario === 'siegeDef' || cfg.scenario === 'siegeAtt') return makeSiege(cfg);
  const scen = SCENARIOS[cfg.scenario] ? cfg.scenario : 'death';
  const A = { good: armyById(cfg.me), evil: armyById(cfg.foe) };
  const { W, H, zone } = boardFor(cfg.limit);
  const rnd = mulberry(cfg.seed || 1);
  const terrain = makeTerrain(W, H, zone, rnd);
  // Objective Markers (Domination: five; Hold Ground: the centre; Destroy the Supplies: three a side), kept clear of terrain.
  const objectives = scen === 'domination' ? dominationMarkers(W, H, rnd) : scen === 'hold' ? [{ id: 0, x: W / 2, y: H / 2, r: OBJ_R }] : scen === 'supplies' ? supplyMarkers(W, H, zone) : [];
  const onObj = T => objectives.some(o => squareHits(o.x, o.y, 1, T));
  const ground = terrain.filter(T => !onObj(T));
  const placed = objectives.map(o => ({ x: o.x, y: o.y, r: o.r + 0.3 }));
  // The enemy deploys first, then the player (who may rearrange their models before the battle). In Hold Ground and
  // Reconnoitre nobody deploys: every Warband arrives as Reinforcements.
  const theirs = deploy(cfg.theirs, 'evil', W, zone, -1, ground, placed, H);
  const mine = deploy(cfg.mine, 'good', W, H - zone, 1, ground, placed, H);
  const reserve = scen === 'hold' || scen === 'recon';
  // A Siege Engine faces the enemy; the computer's crew stay with their engine (ai 'hold').
  const units = [...mine, ...theirs].map(({ t, T, side, x, y, crew }) => ({ t, T, side, x, y, ...(T.siege || T.chariot || T.warBeast ? { facing: side === 'good' ? -Math.PI / 2 : Math.PI / 2 } : {}), ...(crew ? { ai: 'hold', crew: true } : {}), ...(reserve ? { reserve: true } : {}) }));
  const count = list => list.reduce((n, p) => n + (p.T.siege ? 0 : p.T.cmd ? 2 : 1), 0);   // Siege Engines do not count, a War Beast and its Commander are two
  const start = { good: count(mine), evil: count(theirs) };
  const bannersAtStart = { good: mine.filter(p => p.T.banner).length, evil: theirs.filter(p => p.T.banner).length };
  const breakAt = { good: A.good.breakPoint || 0.5, evil: A.evil.breakPoint || 0.5 };
  const S = SCENARIO_TEXT[scen];
  const m = {
    matched: true, scen, cfg, armies: A, start, breakAt, bannersAtStart, objectives,
    title: `${A.good.name} vs ${A.evil.name}`, lesson: `Matched play · ${SCENARIOS[scen]} · ${cfg.limit} points`,
    board: [W, H], terrain: ground, units, limit: null,
    zones: reserve ? null : { good: { x: 0, y: H - zone, w: W, h: zone }, evil: { x: 0, y: 0, w: W, h: zone } },
    goal: S.goal, tip: S.tip,
    rules: ['priority', 'charge', 'pairoff', 'shoot', ...(scen === 'death' ? [] : ['scenario'])],
    // The Victory Points if the battle ended now.
    score() {
      const vp = {};
      for (const s of ['good', 'evil']) {
        const rows = scoreRows(scen, s, this);
        vp[s] = { rows, total: rows.reduce((a, r) => a + r.n, 0), left: modelsAlive(s), broken: brokenNow(s), quarter: modelsAlive(s) <= start[s] / 4 };
      }
      return vp;
    },
    check(atEnd) {
      // Sudden death: an army wiped out loses, whatever the points say (Warbands yet to arrive still count).
      if (!modelsAlive('evil')) return 'win';
      if (!modelsAlive('good')) return 'lose';
      if (!atEnd) return null;
      const e = endsNow(scen);
      this.lastRoll = e.roll ?? null;
      if (!e.end) return null;
      const v = this.score();
      return v.good.total > v.evil.total ? 'win' : v.good.total < v.evil.total ? 'lose' : 'draw';
    },
    status() {
      const v = this.score(), q = s => Math.floor(start[s] / 4);
      const end = scen === 'hold' || scen === 'fog' ? 'once an army is Broken, a 1–2 on a D6 ends it each turn' : `it ends at ${q('good')} of yours or ${q('evil')} of theirs`;
      const F = this.fog && this.fog.good, nm = id => (G.units.find(u => u.id === id) || { name: '—' }).name;
      const fog = F ? ` · your secret picks: keep ${nm(F.mine)}, hunt ${nm(F.theirs)}` : '';
      return `VP ${v.good.total}–${v.evil.total}${fog} · you: ${v.good.left} of ${start.good}${v.good.broken ? ' (Broken)' : ''} · enemy: ${v.evil.left} of ${start.evil}${v.evil.broken ? ' (Broken)' : ''} · ${end}`;
    },
    debrief: S.debrief,
  };
  if (scen === 'fog') m.fog = { evil: fogPicks('evil', units, ground, H, rnd) };   // the player picks theirs before the battle
  return m;
}
// Fog of War: the computer's secret picks (one of its own Heroes, one of the player's, a terrain piece in the player's half).
// Unit ids are the index in the unit list (setup.js: buildUnits).
export function fogPicks(side, units, terrain, H, rnd = Math.random) {
  const pick = l => l[Math.floor(rnd() * l.length)];
  const own = units.map((u, i) => ({ u, i })).filter(x => x.u.side === side && x.u.T.hero), foe = units.map((u, i) => ({ u, i })).filter(x => x.u.side !== side && x.u.T.hero);
  const best = l => (l.length > 1 ? l.filter(x => !x.u.general) : l);
  const half = terrain.map((T, i) => ({ T, i })).filter(x => (B => side === 'evil' ? B.y >= H / 2 : B.y + B.h <= H / 2)(pieceBox(x.T)) && x.T.k !== 'rock');
  return { mine: own.length ? pick(best(own)).i : null, theirs: foe.length ? pick(best(foe)).i : null, terrain: half.length ? pick(half).i : null };
}
const SCENARIO_TEXT = {
  death: { goal: 'Score more Victory Points than the enemy. The battle ends at the end of a turn in which an army is down to a quarter of its models.',
    tip: 'Points come from the enemy General, Breaking the enemy army (losing more than half its models), cutting it down to a quarter, its Heroes and from banners: keep yours alive and kill theirs.',
    debrief: { win: 'The side that keeps its army together and makes the other one bleed wins To the Death!: fight where you outnumber the enemy, and guard your banners.', lose: 'Pick your fights: two of yours against one of theirs wins most Combats, and a Broken army gives the enemy 5 Victory Points.', draw: 'Both sides scored the same Victory Points.' } },
  domination: { goal: 'Hold the five Objective Markers: each scores 1–3 Victory Points for the side with more models within 3″ when the battle ends (at a quarter of an army).',
    tip: 'Spread out: three markers held by a few models each beat one held by many. Twice the enemy\'s numbers scores 2, being alone 3.',
    debrief: { win: 'You held more ground than the enemy.', lose: 'The enemy held more of the markers: spread your Warbands over them.', draw: 'Both sides scored the same Victory Points.' } },
  hold: { goal: 'Hold the centre: the side with more models within 6″ of the marker scores 4, twice as many 8, three times or alone 12. Your Warbands arrive as Reinforcements (Maelstrom of Battle).',
    tip: 'Once an army is Broken, every turn may be the last (a 1–2 on a D6): be in the centre when it ends.',
    debrief: { win: 'You held the centre.', lose: 'The enemy held the centre when the battle ended.', draw: 'Both sides scored the same Victory Points.' } },
  supplies: { goal: 'Destroy the enemy\'s three Supply Markers (a model in base contact in the End phase that did nothing but Move) and guard yours.',
    tip: 'A marker is destroyed only by a model that did not shoot, cast or fight that turn: screen your runners from the enemy.',
    debrief: { win: 'You burnt more of their supplies than they did of yours.', lose: 'The enemy got at your supplies: keep a guard on them.', draw: 'Both sides scored the same Victory Points.' } },
  recon: { goal: 'Get more of your models off the table across the enemy\'s edge. Warbands arrive from your own edge as Reinforcements (4+, a turn earlier with each failed roll).',
    tip: 'A model that touches the enemy\'s edge at the end of its move escapes. Heroes that escape score extra.',
    debrief: { win: 'More of your scouts got through.', lose: 'The enemy got more scouts through: block their path to your edge.', draw: 'Both sides scored the same Victory Points.' } },
  fog: { goal: 'Secret objectives: keep your chosen Hero safe, hunt theirs, and hold a terrain piece in their half. Once an army is Broken, every turn may be the last.',
    tip: 'Your picks are on your card; the enemy\'s stay hidden until the end.',
    debrief: { win: 'Your secret objectives scored more.', lose: 'The enemy\'s secret objectives scored more.', draw: 'Both sides scored the same Victory Points.' } },
};

// Who is Good and who is Evil in a match (the roll-off and the shooting rules care; the player is always side 'good').
export const alignmentOf = m => ({ good: m.armies.good.align, evil: m.armies.evil.align });

// Whether model u may stand at (x, y) during deployment: wholly inside its zone, clear of terrain it cannot stand on
// and of other models.
export function canDeploy(u, x, y) {
  const Z = G.m.zones[u.side], r = u.r;
  if (x - r < Z.x || x + r > Z.x + Z.w || y - r < Z.y || y + r > Z.y + Z.h) return { ok: false, why: 'Models must be deployed wholly within your deployment zone (the lit strip along your table edge).' };
  const T = G.terrain.find(T => (T.k === 'rock' || T.k === 'water' || T.k === 'wall' || T.k === 'hedge') && squareHits(x, y, r, T));
  if (T) return { ok: false, why: T.k === 'wall' || T.k === 'hedge' ? `A model can't stand on top of a ${T.k}.` : 'Models can\'t stand on rocks.' };
  if (straddles(x, y, r)) return { ok: false, why: 'A model can\'t stand half over the edge of a hill.' };
  const o = G.units.find(o => o !== u && alive(o) && Math.hypot(o.x - x, o.y - y) < o.r + r - 0.01);
  if (o) return { ok: false, why: `${o.name} is standing there.` };
  return { ok: true };
}
