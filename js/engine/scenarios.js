// Matched Play Scenarios (2024 Rules Manual, Scenarios: Domination, To the Death!, Hold Ground, Destroy the Supplies,
// Reconnoitre, Fog of War) and the Victory Points they share. No drawing and no DOM here.
//
// Objective Markers (p. 156) are G.objectives: [{ id, x, y, r, side?, gone? }] on 25 mm markers; models move over them
// but never end a move on one (rules.js: validateMove). Victory Points are counted from the battle as it stands:
// u.hurt marks a model that ever lost a Wound (rules.js: takeWound), u.general the General (special.js).
// Reinforcements (Hold Ground's Maelstrom of Battle, Reconnoitre): Warbands start off the table (u.reserve: never
// alive() until they arrive, but counted for Break Points: rules.js: modelsAlive) and come on from a point of a table
// edge, placed there and Activated at once.
import { G } from '../state.js';
import { d6 } from '../util.js';
import { gap, squareHits, boxHits, rectNearest } from './geometry.js';
import { alive, sideAlive, modelsAlive, inert, engaged } from './rules.js';
import { dominance, generalShielded } from './named.js';

export const SCENARIOS = { death: 'To the Death!', domination: 'Domination', hold: 'Hold Ground', supplies: 'Destroy the Supplies', recon: 'Reconnoitre', fog: 'Fog of War' };
export const OBJ_R = 0.49;   // a 25 mm marker
const other = s => (s === 'good' ? 'evil' : 'good');

/* ---------- What every scenario counts ---------- */
export const generalOf = side => G.units.find(u => u.side === side && u.general) || null;
export const lost = u => !!(u && (u.dead || u.fled || (u.gone && !u.escaped)));   // removed as a casualty
export const banners = side => sideAlive(side).filter(u => u.T.banner).length;
export const brokenNow = side => !!(G.broken && G.broken[side]) || (G.m && G.m.start && G.m.start[side] - modelsAlive(side) > G.m.start[side] * (G.m.breakAt ? G.m.breakAt[side] : 0.5));
export const quarter = side => modelsAlive(side) <= G.m.start[side] / 4;
// Models of each side within d″ of a point (marker edge to base edge), on the table and standing or not.
export function near(p, d) {
  const n = { good: 0, evil: 0 };
  for (const u of G.units) if (alive(u) && !inert(u) && Math.hypot(u.x - p.x, u.y - p.y) - u.r - (p.r || 0) <= d + 1e-6) n[u.side] += dominance(u);   // Dominant (X) (named.js)
  return n;
}
// The scorer's points for an objective by numbers (Domination: 1, 2 or 3; Hold Ground: 4, 8 or 12).
export function control(n, s, levels) {
  const me = n[s], them = n[other(s)];
  if (!me) return 0;
  if (!them) return levels[2];
  if (levels.length > 3 && me >= 3 * them) return levels[2];
  if (me >= 2 * them) return levels[1];
  return me > them ? levels[0] : 0;
}
// The General's line: wounded / slain (and To the Death!'s down to its last Wound).
export function generalVP(o, wounded, slain, last = null) {
  const g = generalOf(o);
  if (!g || generalShielded(o)) return 0;   // Line of Command (named.js)
  if (lost(g)) return slain;
  if (last != null && g.hurt && g.w === 1 && g.maxW > 1) return last;
  return g.hurt ? wounded : 0;
}
export const brokenVP = (s, both, alone) => (brokenNow(other(s)) ? (brokenNow(s) ? both : alone) : 0);
export const noBannerVP = s => (banners(other(s)) === 0 ? 2 : 0);
export const bannerVP = s => (banners(s) ? (banners(s) > banners(other(s)) ? 2 : 1) : 0);

/* ---------- Objective Markers ---------- */
// Domination's five: the centre, then four placed in turn at least 12″ from the others and 6″ from the edges.
export function dominationMarkers(W, H, rnd) {
  const out = [{ x: W / 2, y: H / 2 }];
  for (let tries = 0; out.length < 5 && tries < 500; tries++) {
    const p = { x: 6 + rnd() * (W - 12), y: 6 + rnd() * (H - 12) };
    if (out.every(o => Math.hypot(o.x - p.x, o.y - p.y) >= 12)) out.push(p);
  }
  return out.map((p, i) => ({ id: i, x: +p.x.toFixed(2), y: +p.y.toFixed(2), r: OBJ_R }));
}
// Destroy the Supplies: three per side on the front edge of its deployment zone (the centre and halfway to each side).
export function supplyMarkers(W, H, zone) {
  const out = [];
  for (const [side, y] of [['good', H - zone], ['evil', zone]]) for (const x of [W / 4, W / 2, 3 * W / 4]) out.push({ id: out.length, side, x, y, r: OBJ_R });
  return out;
}
// Supplies destroyed in the End phase (p. Scenario 4): a standing model in base contact with an enemy marker that did
// nothing this turn but Move (no Cast, no shot, no Combat, no Support, not frozen, nothing cast on it).
export function destroySupplies() {
  const out = [];
  for (const o of (G.objectives || []).filter(o => o.side && !o.gone)) {
    const by = G.units.find(u => alive(u) && !inert(u) && u.side !== o.side && !u.prone && !u.shot && !u.shots && !u.cast && !u.fought && !u.supported && !u.frozen && !u.stunned && !u.spelled && !engaged(u) && Math.hypot(u.x - o.x, u.y - o.y) - u.r - o.r <= 0.08);
    if (by) { o.gone = true; o.by = by.side; out.push({ o, by }); }
  }
  return out;
}

/* ---------- Reinforcements ---------- */
// The Warbands of a side: each Hero with the Warriors it leads (in the order they were mustered).
export function warbands(side) {
  const heroes = G.units.filter(u => u.side === side && u.T.hero && !inert(u)), rest = G.units.filter(u => u.side === side && !u.T.hero && !inert(u));
  const bands = heroes.map(h => ({ captain: h, models: [h] }));
  if (!bands.length) return rest.length ? [{ captain: null, models: rest }] : [];
  let i = 0;
  for (const u of rest) { bands[i % bands.length].models.push(u); i++; }
  return bands;
}
// A Warband arriving at point p of a table edge: its models placed in a block just inside the edge (rules.js keeps
// them clear of others), ready to Activate. Returns the models placed.
export function arrive(band, p) {
  const out = [], inward = p.y <= 0.01 ? { x: 0, y: 1 } : p.y >= G.H - 0.01 ? { x: 0, y: -1 } : p.x <= 0.01 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const side = { x: -inward.y, y: inward.x };
  let k = 0;
  for (const u of band.models.filter(u => u.reserve && !u.dead)) {
    for (let tries = 0; tries < 200; tries++, k++) {
      const row = Math.floor(k / 7), col = (k % 7) - 3;
      const x = p.x + side.x * col * 1.1 + inward.x * (u.r + 0.05 + row * 1.1), y = p.y + side.y * col * 1.1 + inward.y * (u.r + 0.05 + row * 1.1);
      if (x < u.r || y < u.r || x > G.W - u.r || y > G.H - u.r) continue;
      if (G.units.some(o => o !== u && alive(o) && Math.hypot(o.x - x, o.y - y) < o.r + u.r + 0.02)) continue;
      if ((G.terrain || []).some(T => (T.k === 'rock' || T.k === 'building' || T.k === 'water') && squareHits(x, y, u.r, T))) continue;
      u.x = x; u.y = y; u.reserve = false; u.movedDist = 0; u.done = false; u.noCharge = 'Reinforcements'; out.push(u); k++;   // they may not Charge (p. 20)
      break;
    }
  }
  return out;
}
// The arrival roll (Maelstrom of Battle or Reconnoitre). Returns { die, point (or null: not yet), who: the side choosing }.
export function* arrivalSeq(band, scenario, turnsWaited = 0) {
  const c = band.captain;
  const die = { n: d6(), v: 0, mt: 0, ok: false };
  die.v = die.n + (scenario === 'recon' ? turnsWaited : 0);
  yield { k: 'dice', step: 'arrive', u: c || band.models[0], die, need: scenario === 'recon' ? 4 : 2, label: `${c ? `${c.name}'s Warband` : 'A Warband'}: Reinforcements` };
  return die.v;
}
// Where a Warband comes on for a roll v (Hold Ground's chart; Reconnoitre: its own edge on 4+). side: whose Warband.
// pick: (edges, chooser) => point, the choosing side's choice. Returns the point or null.
export function arrivalPoint(v, side, scenario, pick) {
  const W = G.W, H = G.H, own = side === 'good' ? 'S' : 'N';
  const pts = e => (e === 'N' || e === 'S' ? [6, W / 2, W - 6].map(x => ({ x, y: e === 'N' ? 0 : H })) : [6, H / 2, H - 6].map(y => ({ x: e === 'W' ? 0 : W, y })));
  if (scenario === 'recon') return v >= 4 ? pick(pts(own), side) : null;
  if (v <= 1) return null;
  const opp = other(side);
  const chart = { 2: [['N', 'S'], opp], 3: [['E', 'W'], opp], 4: [['N', 'S'], side], 5: [['E', 'W'], side], 6: [['N', 'S', 'E', 'W'], side] }[Math.min(6, v)];
  return pick(chart[0].flatMap(pts), chart[1]);
}
// The computer's pick of an arrival point: its own side near its friends and the objective; the other side's as far
// from them as it can.
export function aiArrival(list, chooser, side) {
  const goal = (G.objectives || [])[0] || { x: G.W / 2, y: G.H / 2 };
  const score = p => -Math.hypot(p.x - goal.x, p.y - goal.y);
  const s = list.slice().sort((a, b) => score(b) - score(a));
  return chooser === side ? s[0] : s[s.length - 1];
}

/* ---------- Reconnoitre: escaping off the opponent's edge ---------- */
export const escapeEdgeY = side => (side === 'good' ? 0 : G.H);
// A model whose base touches the opponent's board edge at the end of its Move escapes (it leaves the table).
// A mission's escapeAny (profile keys): that model escapes off any board edge (Last Stand of the Princes: Háma).
export function escapes(u) {
  if (!G.m || !alive(u) || inert(u)) return false;
  const any = (G.m.escapeAny || []).includes(u.t);
  if (G.m.scen !== 'recon' && !any) return false;
  const touch = any ? u.x - u.r <= 0.12 || u.y - u.r <= 0.12 || u.x + u.r >= G.W - 0.12 || u.y + u.r >= G.H - 0.12
    : u.side === 'good' ? u.y - u.r <= 0.12 : u.y + u.r >= G.H - 0.12;
  if (!touch) return false;
  u.gone = true; u.escaped = true; u.dom = dominance(u);   // Dominant (X) counts as X models escaped (FAQ: kept as it left)
  return true;
}
export const escaped = side => G.units.filter(u => u.side === side && u.escaped).reduce((n, u) => n + (u.dom || 1), 0);

/* ---------- Victory Points by scenario ---------- */
// The rows each side scores now: [{ k, label, n }]. fog: { [side]: { mine, theirs (Hero ids), terrain (index) } }.
export function scoreRows(scen, s, m) {
  const o = other(s), rows = [], add = (k, label, n) => rows.push({ k, label, n });
  const heroesLost = G.units.filter(u => u.side === o && u.T.hero && lost(u)).length;
  if (scen === 'death') {
    add('general', 'Enemy General wounded / at 1 Wound / slain', generalVP(o, 1, 5, 3));
    add('broken', 'Enemy army Broken', brokenVP(s, 3, 5));
    add('noBanner', 'Enemy has no banner left', noBannerVP(s));
    add('banner', 'Banners left', bannerVP(s));
    add('quarter', 'Enemy down to a quarter', quarter(o) ? 3 : 0);
    add('heroes', 'Enemy Heroes slain (up to 3)', Math.min(3, heroesLost));
  } else if (scen === 'domination') {
    for (const ob of G.objectives || []) add(`obj${ob.id}`, `Objective ${ob.id + 1} (models within 3″)`, control(near(ob, 3), s, [1, 2, 3]));
    add('general', 'Enemy General wounded / slain', generalVP(o, 1, 2));
    add('broken', 'Enemy army Broken', brokenVP(s, 1, 3));
  } else if (scen === 'hold') {
    add('centre', 'The centre (models within 6″)', control(near(G.objectives[0], 6), s, [4, 8, 12, 'x3']));
    add('general', 'Enemy General wounded / slain', generalVP(o, 1, 3));
    add('broken', 'Enemy army Broken', brokenVP(s, 1, 3));
    add('noBanner', 'Enemy has no banner left', noBannerVP(s));
  } else if (scen === 'supplies') {
    const theirs = (G.objectives || []).filter(x => x.side === o), mine = (G.objectives || []).filter(x => x.side === s);
    const killed = theirs.filter(x => x.gone).length, lostMine = mine.filter(x => x.gone).length;
    add('destroyed', 'Enemy Supply Markers destroyed (3 each)', 3 * killed);
    add('contested', 'Enemy markers standing with more of yours within 3″', theirs.filter(x => !x.gone && near(x, 3)[s] > near(x, 3)[o]).length);
    add('more', 'Destroyed more markers', killed > lostMine ? 1 : 0);
    add('general', 'Enemy General wounded / slain', generalVP(o, 1, 3));
    add('broken', 'Enemy army Broken', brokenVP(s, 1, 3));
    add('noBanner', 'Enemy has no banner left', noBannerVP(s));
    add('banner', 'Banners left', bannerVP(s));
  } else if (scen === 'recon') {
    const me = escaped(s), them = escaped(o);
    add('escaped', 'Models escaped off the enemy edge', me >= 3 && me >= 3 * them ? 12 : me >= 2 && me >= 2 * them ? 8 : me > them ? 4 : 0);
    add('heroes', 'Your Heroes escaped (up to 3)', Math.min(3, G.units.filter(u => u.side === s && u.T.hero && u.escaped).length));
    add('general', 'Enemy General wounded / slain', generalVP(o, 1, 2));
    add('broken', 'Enemy army Broken', brokenVP(s, 1, 3));
  } else if (scen === 'fog') {
    const F = (m && m.fog && m.fog[s]) || {}, mine = G.units.find(u => u.id === F.mine), theirs = G.units.find(u => u.id === F.theirs);
    add('ownHero', 'Your chosen Hero alive / unhurt / no Fate spent', !mine || lost(mine) ? 0 : mine.hurt ? 1 : mine.fateUsed ? 3 : 5);
    add('enemyHero', 'Their chosen Hero wounded / slain / slain in Combat', !theirs ? 0 : lost(theirs) ? (theirs.diedIn === 'fight' ? 5 : 3) : theirs.hurt ? 1 : 0);
    const T = F.terrain != null ? G.terrain[F.terrain] : null;
    let tv = 0;
    if (T) {
      const on = side => G.units.filter(u => alive(u) && u.side === side && !inert(u) && boxHits(T, u.x - u.r - 0.08, u.y - u.r - 0.08, u.x + u.r + 0.08, u.y + u.r + 0.08, false)).length;
      const a = on(s), b = on(o);
      tv = !b && a >= 2 ? 5 : a >= 2 && a >= 2 * b ? 3 : a > b ? 1 : 0;
    }
    add('terrain', 'Your chosen terrain piece held', tv);
    add('general', 'Enemy General wounded / slain', generalVP(o, 1, 2));
    add('broken', 'Enemy army Broken', brokenVP(s, 1, 3));
  }
  return rows;
}
// Whether the battle ends at the end of this turn: a quarter (most scenarios), or once an army is Broken a D6 of 1–2
// each turn (Hold Ground, Fog of War). Returns { end, roll }.
export function endsNow(scen) {
  if (scen === 'hold' || scen === 'fog') {
    if (!brokenNow('good') && !brokenNow('evil')) return { end: false };
    const roll = d6();
    return { end: roll <= 2, roll };
  }
  return { end: quarter('good') || quarter('evil') };
}

/* ---------- The computer's scenario goals ---------- */
// Holding markers (Domination, a mission's Objective Markers): stay on a marker where u is needed (its side not ahead
// there by 2), else go to the least held one, nearest first. Returns a point, null to stay, or undefined.
export function holdGoal(u, objs, d = 3) {
  const dist = p => Math.hypot(u.x - p.x, u.y - p.y);
  const at = p => { const L = dist(p) || 1; return { x: p.x + (u.x - p.x) / L * ((p.r || 0) + u.r + 1), y: p.y + (u.y - p.y) / L * ((p.r || 0) + u.r + 1) }; };
  const lead = x => x.n[u.side] - x.n[other(u.side)];
  const obs = objs.map(o => ({ o, n: near(o, d) })).sort((a, b) => lead(a) - lead(b) || dist(a.o) - dist(b.o));
  const here = obs.find(x => dist(x.o) - u.r - x.o.r <= d);
  if (here && lead(here) <= 1) return null;   // needed where it stands
  const go = obs.find(x => lead(x) <= 1) || obs[0];
  return go ? at(go.o) : undefined;
}
// Where a model heads when it has nothing to Charge (ai.js): a point, null to stay, undefined for the usual plan.
// A mission may bring its own: m.aiGoal(u), the same answers.
export function scenarioGoal(u, m) {
  if (m && m.aiGoal && !inert(u)) { const g = m.aiGoal(u); if (g !== undefined) return g; }
  if (!m || !m.scen || m.scen === 'death' || inert(u)) return undefined;
  const at = (p, d = 0.1) => { const L = Math.hypot(u.x - p.x, u.y - p.y) || 1; return { x: p.x + (u.x - p.x) / L * ((p.r || 0) + u.r + d), y: p.y + (u.y - p.y) / L * ((p.r || 0) + u.r + d) }; };
  const dist = p => Math.hypot(u.x - p.x, u.y - p.y);
  if (m.scen === 'domination') return holdGoal(u, m.objectives || [], 3);
  if (m.scen === 'hold') { const c = m.objectives[0]; return dist(c) - u.r - c.r <= 5.5 ? null : at(c, 1.5); }
  if (m.scen === 'supplies') {
    const theirs = m.objectives.filter(o => o.side && o.side !== u.side && !o.gone).sort((a, b) => dist(a) - dist(b));
    if (theirs.length && (u.id % 2 === 0 || dist(theirs[0]) < 10)) return at(theirs[0], 0.02);
    const mine = m.objectives.filter(o => o.side === u.side && !o.gone && G.units.some(e => alive(e) && e.side !== u.side && Math.hypot(e.x - o.x, e.y - o.y) < 8)).sort((a, b) => dist(a) - dist(b));
    return mine.length && dist(mine[0]) < 12 ? at(mine[0], 0.8) : undefined;
  }
  if (m.scen === 'recon') return { x: u.x, y: u.side === 'good' ? u.r + 0.05 : G.H - u.r - 0.05 };
  if (m.scen === 'fog') {
    const F = m.fog && m.fog[u.side], T = F && F.terrain != null ? G.terrain[F.terrain] : null;
    if (!T || u.id % 3) return undefined;
    const p = rectNearest(u.x, u.y, T);
    return Math.hypot(u.x - p.x, u.y - p.y) - u.r < 0.3 ? null : p;
  }
  return undefined;
}
