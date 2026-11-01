// Balance check: plays every mission many times with a sensible player strategy and prints how often the
// player wins. Uses the real rules engine (js/engine) and mission data, without drawing anything: the turn sequence of
// js/engine/sim.js, with the mission strategies below for the player's side and the computer for the enemy.
// Usage: node tools/balance.mjs [runs per mission] [mission number ...]   e.g. node tools/balance.mjs 500 4 7
// Missions should come out at 75% or more: the player is meant to win most of the time once they use the rule.
// Trace a few games turn by turn: DEBUG=5 node tools/balance.mjs 1 5   (5 games of mission 5)
globalThis.matchMedia = () => ({ matches: false });
process.removeAllListeners('warning');   // js/ has no package.json type, so Node warns that it reparses the modules as ES modules

const st = await import('../js/state.js');
const { MISSIONS, knows, missionNo, flipSide } = await import('../js/data/missions.js');
// A mission given as its number in the menu: 16 for the main campaign, E2 for the Battle of Edoras.
const indexOf = a => MISSIONS.findIndex((m, i) => missionNo(i) === String(a).toUpperCase());
const R = await import('../js/engine/rules.js');
const C = await import('../js/engine/combat.js');
const { buildUnits, freshTurn } = await import('../js/engine/setup.js');
const { aiPickShot } = await import('../js/engine/ai.js');
const S = await import('../js/engine/sim.js');
const H = await import('../js/engine/heroes.js');
const SP = await import('../js/engine/special.js');
const { run } = await import('../js/engine/dice.js');
const { gap, gapXY, dist } = await import('../js/engine/geometry.js');
const TR = await import('../js/engine/terrain.js');
const M = await import('../js/engine/magic.js');

const G = () => st.G;
const DEBUG = process.env.DEBUG ? [] : null;
const foes = side => R.sideAlive(side === 'good' ? 'evil' : 'good');

/* ---------- Player strategies ---------- */
// Every move goes through sim.js: applyMove, which Activates the model first (a Courage Test in a Broken army).
const applyMove = S.applyMove;

// Shooters: stay or step up to half their Move, wherever the best shot is (moving makes To Hit 1 worse).
// keep: stay at least that far (gap) from every enemy when choosing the spot, unless already closer.
function shooterMove(u, weight, keep = 0) {
  const score = () => Math.max(0, ...foes(u.side).map(t => { const i = R.shotInfo(u, t); return i.ok ? i.p * weight(t) : 0; }));
  let best = { P: null, cost: 0, v: score() };
  const x0 = u.x, y0 = u.y, near = keep && foes(u.side).some(f => gap(u, f) < keep);
  for (const d of [1.5, 3, u.mv / 2]) for (let k = 0; k < 8; k++) {
    const P = { x: x0 + Math.cos(k * Math.PI / 4) * d, y: y0 + Math.sin(k * Math.PI / 4) * d };
    const v = R.validateMove(u, P, u.mv / 2);
    if (!v.ok) continue;
    if (keep && !near && foes(u.side).some(f => gapXY(P.x, P.y, u.r, f) < keep)) continue;
    u.x = P.x; u.y = P.y; u.movedDist = v.cost;
    const s = score();
    u.x = x0; u.y = y0; u.movedDist = 0;
    if (s > best.v + 0.02) best = { P, cost: v.cost, v: s };
  }
  if (best.P) applyMove(u, best.P, best.cost);
}
// Fighters: charge where friends already fight (more dice), otherwise walk towards the nearest enemy.
function fighterMove(u) {
  let best = null;
  for (const f of foes(u.side)) {
    if (gap(u, f) > R.remaining(u)) continue;
    const c = R.chargeSpot(u, f, R.remaining(u));
    if (!c) continue;
    const mates = R.sideAlive(u.side).filter(o => o !== u && C.touching(o, f)).length;
    const sc = mates * 3 - c.cost * 0.1 - f.d * 0.2;
    if (!best || sc > best.sc) best = { c, sc };
  }
  if (best) { applyMove(u, best.c, best.c.cost); return; }
  for (const f of foes(u.side).sort((a, b) => dist(u, a) - dist(u, b))) {
    const p = R.bestApproach(u, f, R.remaining(u));
    if (p) { applyMove(u, p, p.cost); return; }
  }
}
const generic = {
  move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) u.bow ? shooterMove(u, () => 1) : fighterMove(u); },
  shoot(s) { return aiPickShot(s); },
  takePriority: () => true,
};
// Spears: stand right behind a fighting friend (on the side away from its enemies) that has no spear yet.
function spearSupport(u) {
  const fighting = R.sideAlive(u.side).filter(f => f !== u && R.engaged(f) && f.r <= u.r);
  if (fighting.some(f => C.touching(u, f))) return;   // already Supporting
  const taken = new Set(R.sideAlive(u.side).filter(s => s !== u && s.T.spear).flatMap(s => fighting.filter(f => C.touching(s, f))));
  for (const f of [...fighting].sort((a, b) => dist(u, a) - dist(u, b))) {
    if (taken.has(f)) continue;
    const e = foes(u.side).filter(o => C.touching(o, f));
    let vx = 0, vy = 0; for (const o of e) { vx += f.x - o.x; vy += f.y - o.y; }
    const L = Math.hypot(vx, vy) || 1, R0 = f.r + u.r + 0.01, P = { x: f.x + vx / L * R0, y: f.y + vy / L * R0 };
    const v = R.validateMove(u, P, R.remaining(u));
    if (v.ok) { applyMove(u, P, v.cost); return; }
  }
}
// Pike Square: nobody charges, the block holds the causeway. Each pike that is not in a file yet joins the shortest file,
// right behind its last model; the banner bearer stands behind the middle file, within 3″ of every fight.
function pikeSquareMove(side) {
  const mine = R.sideAlive(side), files = [10.95, 12, 13.05];
  const fileOf = fx => mine.filter(o => Math.abs(o.x - fx) < 0.3 && o.y < 14 && !o.T.banner).sort((a, b) => a.y - b.y);
  const inFile = u => files.some(fx => fileOf(fx).includes(u));
  const goTo = (u, P) => { const v = R.validateMove(u, P, R.remaining(u)); if (v.ok) { applyMove(u, P, v.cost); return; } const Q = R.furthestMove(u, P, R.remaining(u)), w = R.validateMove(u, Q, R.remaining(u)); if (w.ok) applyMove(u, Q, w.cost); };
  for (const u of mine.filter(o => o.T.pike && R.canMove(o) && !inFile(o))) {
    const fx = files.map(x => ({ x, n: fileOf(x).length })).sort((a, b) => a.n - b.n || Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0].x, f = fileOf(fx);
    goTo(u, { x: fx, y: f.length ? f[f.length - 1].y + 1.01 : 8 });
  }
  for (const b of mine.filter(o => o.T.banner && R.canMove(o))) {
    const f = fileOf(12), P = { x: 12, y: (f.length ? f[f.length - 1].y : 8) + 1.01 };
    if (Math.hypot(P.x - b.x, P.y - b.y) > 0.1) goTo(b, P);
  }
}
// Over Hedge and Cliff: each messenger keeps to a lane clear of the guards' Control Zones. It walks, and takes a Jump,
// Leap or Climb Test only when the Move it has left pays for the crossing (so tests come with the last inches), and it
// starts a climb only at the start of its move (it never hangs halfway). MSG=naive: lanes straight from where the
// messengers start (past the guards), and climbs started whenever the cliff is reached.
const MSG_LANES = [3.5, 6, 7, 12.5, 14.5];
function messengerMove(side) {
  const m = G().m, naive = process.env.MSG === 'naive';
  for (const u of R.sideAlive(side)) {
    if (u.x >= m.exitX) continue;
    const lane = naive ? u.y0 ?? (u.y0 = u.y) : MSG_LANES[u.id % MSG_LANES.length];
    for (let k = 0; k < 4 && R.canMove(u); k++) {
      // Head for the lane first (a point 6″ ahead in it), then along it to the exit.
      const goal = { x: Math.min(m.exitX + 1.5, u.x + 6), y: lane }, X = TR.planCross(u, goal);
      if (X && X.ok && (X.kind === 'jump' || X.kind === 'leap' || !X.partial || naive || X.cont)) {
        if (X.stand) { u.prone = false; u.movedDist += X.stand; }
        if (X.approach > 0.01) { if (!u.moveStart) u.moveStart = { x: u.x, y: u.y }; u.x = X.contact.x; u.y = X.contact.y; u.movedDist += X.approach; }
        const roll = run(TR.crossTestSeq(u, X), S.answer), out = TR.applyCross(u, X, roll);
        if (out.fall) S.fall(u, out.fall.f);
        else if (out.thrown) run(C.knockedFlyingSeq(u), S.answer);
        if (out.result === 'stop' && out.landed) { const fc = TR.forcedCharge(u); if (fc && fc.spot) applyMove(u, fc.spot, fc.spot.cost); }
        if (out.result === 'go') continue;
        u.done = true; break;
      }
      if (X && X.contact && u.prone && Math.hypot(X.contact.x - u.x, X.contact.y - u.y) < 0.05) { u.prone = false; u.movedDist += u.mv / 2; u.done = true; break; }   // Prone at the foot: Stand Up, climb next turn
      if (X && X.contact) {   // the crossing does not fit this move: walk to the barrier and stop there
        const rem = R.remaining(u) - (u.prone ? u.mv / 2 : 0), v = Math.hypot(X.contact.x - u.x, X.contact.y - u.y) > 0.05 && R.validateMove(u, X.contact, rem);
        if (v && v.ok) { if (u.prone) { u.prone = false; u.movedDist += u.mv / 2; } applyMove(u, X.contact, v.cost); }
        u.done = true; break;
      }
      const stand = u.prone ? u.mv / 2 : 0, Q = R.furthestMove(u, goal, R.remaining(u) - stand), v = R.validateMove(u, Q, R.remaining(u) - stand);
      if (v.ok) applyMove(u, { ...Q, stand }, v.cost + stand);
      u.done = true; break;
    }
  }
}
// The computer's own planner (ai.js) for the player's side: it follows a mission's aiGoal (markers, Storehouses).
const byAI = { ...generic, move: side => S.COMPUTER.move(side), shield: (c, other) => C.shieldPays(c, 'good', other) };
// Spears Support a fighting friend when one is near, otherwise everyone fights; Shield where it pays.
const supportFight = {
  ...generic,
  move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) { if (u.T.spear) spearSupport(u); if (R.canMove(u) && !u.movedDist) fighterMove(u); } },
  shield: (c, other) => C.shieldPays(c, 'good', other),
};
const STRATEGY = {
  'The First Assault': supportFight, 'The Gates Fall': byAI, 'Torch the City': byAI,
  // Spears of the Westfold: at most half the Warriors Charge in a turn (those nearest the enemy) and throw as they
  // Charge; the rest move behind a fighting friend to Support (Spear Mastery), else Charge too. Everyone throws in the
  // Shoot phase (against Defence 3 a throw is worth more than a Support). THROW=never: no throws on the Charge;
  // SHOOT=free: only models that touch no fighting friend throw in the Shoot phase; FRONT=all: everyone Charges.
  'Spears of the Westfold': {
    ...supportFight,
    throwAt: () => process.env.THROW !== 'never',
    move(side) {
      const mine = R.sideAlive(side).filter(R.canMove), near = u => Math.min(99, ...foes(side).map(f => gap(u, f)));
      const front = process.env.FRONT === 'all' ? mine.length : Math.ceil(mine.length / 2);
      let charged = 0;
      for (const u of [...mine].sort((a, b) => near(a) - near(b))) {
        if (charged >= front || !R.canMove(u) || u.movedDist) continue;
        if (foes(side).some(f => R.chargeSpot(u, f, R.remaining(u)))) { fighterMove(u); charged++; }
      }
      for (const u of mine.filter(R.canMove)) { if (!u.movedDist) spearSupport(u); }
      for (const u of mine.filter(R.canMove)) { if (!u.movedDist && !R.sideAlive(side).some(f => f !== u && R.engaged(f) && C.touching(u, f))) fighterMove(u); }
    },
    shoot(s) {
      if (process.env.SHOOT === 'free' && R.sideAlive(s.side).some(f => f !== s && R.engaged(f) && C.touching(s, f))) return null;
      return aiPickShot(s);
    },
  },
  // Chapter VI (magic): the computer's plan, its Casting (magic.js: aiCast) and its Resist Tests. CAST=never: the
  // player Casts nothing; RESIST=never: the player never Resists.
  // The White Rider: one Cast a turn, so Gandalf spreads his Will over the turns left: two dice while he has more Will
  // than turns, else one. He Transfixes the unengaged Uruk-hai nearest the road that no Warrior is near, or Blasts one
  // that would reach the road next turn when he has the dice for it. CAST=never: no Casting; CAST=computer: aiCast.
  'The White Rider': {
    ...byAI,
    cast(u) {
      const how = process.env.CAST;
      if (how === 'never') return null;
      if (how === 'computer') return S.COMPUTER.cast(u);
      const g = G(), pw = n => (u.T.powers || []).find(p => p.n === n), will = u.will || 0, mine = R.sideAlive(u.side).filter(f => f !== u);
      const blast = pw('Sorcerous Blast'), fix = pw('Transfix'), left = g.m.limit - g.turn + 1, n = will > left ? 2 : 1;
      const near = t => Math.min(99, ...mine.map(f => gap(f, t)), gap(u, t) - u.mv);
      const run = list => list.filter(t => !R.engaged(t) && !M.on(t, 'Transfix') && near(t) > 1.5).sort((a, b) => b.y - a.y);
      const close = run(M.targets(u, blast)).find(t => t.y + t.r >= g.H - 2 - t.mv);
      if (close && n === 2 && process.env.BLAST !== 'never') return { pw: blast, t: close, n };
      const free = run(M.targets(u, fix))[0];
      return free ? { pw: fix, t: free, n } : null;
    },
  },
  // The Shaman's Fury: Haleth Charges the Shaman when he can, otherwise walks at him past the Uruk-hai; the Warriors
  // play the computer's plan. Haleth Resists a Transfix with all his Will when it would stop him reaching or fighting
  // the Shaman (in Charge reach of him, or Engaged), else with one dice. RESIST=never: no Resist Tests; RESIST=computer:
  // aiResist.
  'The Shaman\'s Fury': {
    ...byAI,
    move(side) {
      const g = G(), h = g.m.haleth(), s = g.m.shaman();
      if (R.alive(h) && R.alive(s) && R.canMove(h) && !R.engaged(h)) {
        const mv = R.remaining(h), c = R.chargeSpot(h, s, mv), p = c || R.bestApproach(h, s, mv);
        if (p) applyMove(h, p, p.cost);
        h.done = true;
      }
      S.COMPUTER.move(side);
    },
    resist(q) {
      const how = process.env.RESIST;
      if (how === 'never') return 0;
      if (how === 'computer') return S.COMPUTER.answer(q);
      const h = q.u, s = G().m.shaman(), will = h.will || 0;
      if (q.p !== 'Transfix') return 0;
      return R.engaged(h) || (R.alive(s) && gap(h, s) <= h.mv + 1) ? will : Math.min(1, will);
    },
  },
  // The Breaking of the Staff: Gandalf walks to 9″ of Saruman (inside the 12″ of Your Staff is Broken) and Casts it
  // as soon as Saruman is in range, before or after his move: with Heroic Channelling one Will Point, else up to three
  // dice. He declares Channelling only when this move can bring Saruman into range, and keeps his Might for it. He
  // Resists a Transfix with two dice against a 5 or 6 (three while Channelling: the Might Point is lost if he cannot
  // Activate), else one, a Sorcerous Blast with one.
  // CAST=never: no Your Staff is Broken (only slaying Saruman wins); CHANNEL=never: no Heroic Channelling;
  // RESIST=never / computer.
  'The Breaking of the Staff': {
    ...byAI, keepMight: true,
    // Where Gandalf's move takes him this turn ({ x, y, cost }), or null when he stays.
    spot(g, s) {
      const d = Math.hypot(g.x - s.x, g.y - s.y), k = (9 + g.r + s.r) / d;
      return d > 9 + g.r + s.r ? R.bestApproach(g, { x: s.x + (g.x - s.x) * k, y: s.y + (g.y - s.y) * k }, R.remaining(g)) : null;
    },
    declare(q) {
      if (q.phase !== 'move') return undefined;
      const m = G().m, g = m.gandalf(), s = m.saruman(), o = q.options.find(x => x.k === 'channelling' && x.u === g);
      if (!o || process.env.CHANNEL === 'never' || process.env.CAST === 'never' || !R.alive(s) || m.broken() || !(g.will > 0)) return null;
      const p = !R.engaged(g) && this.spot(g, s), at = p || g;
      return Math.hypot(at.x - s.x, at.y - s.y) - g.r - s.r <= 12 + 1e-6 ? { u: g, k: 'channelling' } : null;
    },
    move(side) {
      const m = G().m, g = m.gandalf(), s = m.saruman(), pw = (g.T.powers || []).find(p => p.n === 'Your Staff is Broken');
      const tryCast = () => {
        if (process.env.CAST === 'never' || !R.alive(s) || m.broken() || !(g.will > 0) || !M.targets(g, pw).includes(s)) return false;
        S.cast(g, { pw, t: s, n: g.channel ? 1 : Math.min(3, g.will) });
        return true;
      };
      if (R.alive(g) && R.canMove(g) && S.activate(g)) {
        if (!tryCast() && R.canMove(g) && !R.engaged(g) && R.alive(s)) {
          const p = this.spot(g, s);
          if (p) applyMove(g, p, p.cost);
          if (R.alive(g)) tryCast();
        }
        g.done = true;
      }
      S.COMPUTER.move(side);
    },
    resist(q) {
      const how = process.env.RESIST;
      if (how === 'never') return 0;
      if (how === 'computer') return S.COMPUTER.answer(q);
      const will = q.u.will || 0;
      if (q.p === 'Transfix') return Math.min(q.u.channel ? Math.max(0, will - 1) : will, q.u.channel ? 3 : q.high >= 5 ? 2 : 1);
      return Math.min(will, 1);
    },
  },
  // Last Stand of the Princes: Háma keeps to the marker in the middle of the warriors and shoots, never Charging; the
  // rest play the computer's plan (the warriors hold the marker, Haleth fights).
  'Last Stand of the Princes': {
    ...byAI,
    move(side) {
      const o = G().objectives[0], hama = R.sideAlive(side).find(u => u.t === 'hamaPrince');
      if (hama && R.canMove(hama) && !R.engaged(hama)) {
        const p = Math.hypot(hama.x - o.x, hama.y - o.y) > 1.6 ? R.bestApproach(hama, { x: o.x + 1.1, y: o.y }, Math.max(0, R.moveVal(hama) / 2 - hama.movedDist)) : null;
        if (p && p.cost > 0.05) applyMove(hama, p, p.cost);
        hama.done = true;
      }
      S.COMPUTER.move(side);
    },
  },
  'Hail of Arrows': generic,
  'Armour Matters': {
    ...generic,
    move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) shooterMove(u, t => (t.t === 'hillTribesmanBow' ? 1 : 0.2)); },
    shoot(s) {
      let best = null;
      for (const t of foes('good')) { const i = R.shotInfo(s, t); const v = i.ok ? i.p * (t.t === 'hillTribesmanBow' ? 1 : 0.2) : 0; if (v > 0 && (!best || v > best.v)) best = { t, i, v }; }
      return best;
    },
  },
  // The shields hold the pass; every spear stands behind a fighting shield.
  'Spear Wall': {
    ...generic,
    move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) if (u.T.spear) spearSupport(u); },
  },
  'Pike Square': { ...generic, move: pikeSquareMove },
  'Over Hedge and Cliff': { ...generic, move: messengerMove, shield: () => true },
  // Two defenders hold the gate; when one falls or is pushed out of it, the nearest model from the yard takes its spot
  // (or charges the orc standing there). Models in the yard charge any orc that got through. The goal is only to hold,
  // so every fight that can be Shielded is. SHIELD=never or SHIELD=value (shield only where it pays in models,
  // counting kills) plays it the other ways, to check that the choice matters.
  'Axe and Shield': {
    ...generic,
    move(side) {
      const m = G().m, mine = R.sideAlive(side), inGate = u => m.gate.some(([x, y]) => Math.hypot(u.x - x, u.y - y) < 0.3);
      for (const [x, y] of m.gate) {
        if (mine.some(u => Math.hypot(u.x - x, u.y - y) < 0.3)) continue;
        const r = mine.filter(u => R.canMove(u) && !inGate(u)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (!r) continue;
        const v = R.validateMove(r, { x, y }, R.remaining(r));
        if (v.ok) { applyMove(r, { x, y }, v.cost); continue; }
        const c = foes(side).map(o => R.chargeSpot(r, o, R.remaining(r))).filter(Boolean).sort((a, b) => a.cost - b.cost)[0];
        if (c) applyMove(r, c, c.cost);
      }
      if (foes(side).some(o => o.y > m.terrain[0].y + 0.6)) for (const u of mine.filter(R.canMove)) if (!inGate(u)) fighterMove(u);
    },
    shield: (c, other) => (process.env.SHIELD === 'never' ? false : process.env.SHIELD === 'value' ? C.shieldPays(c, 'good', other) : true),
  },
  // A Captain's Might: the Captain goes for the Chieftain (charging him when in reach, with a Warrior joining the fight
  // where it can); the Warriors fight the tribesmen, and join the Captain's fight when the Chieftain is engaged.
  "A Captain's Might": {
    ...generic,
    move(side) {
      const m = G().m, cap = m.captain(), chief = m.chief();
      for (const u of R.sideAlive(side).filter(R.canMove)) {
        if (u === cap) {
          // The Captain charges the Chieftain only in company: a Royal Guard already fighting him, or one that can reach him too.
          const c = R.alive(chief) && R.chargeSpot(u, chief, R.remaining(u));
          const company = R.alive(chief) && R.sideAlive(side).some(o => o !== u && (C.touching(o, chief) || (R.canMove(o) && R.chargeSpot(o, chief, R.remaining(o)))));
          if (c && (company || process.env.CAPTAIN === 'alone')) { applyMove(u, c, c.cost); continue; }
          if (R.alive(chief) && dist(u, chief) > 8) { const p = R.bestApproach(u, chief, R.remaining(u)); if (p) { applyMove(u, p, p.cost); continue; } }
          const other = foes(side).filter(f => f !== chief && R.chargeSpot(u, f, R.remaining(u)))[0];
          if (other) { const c2 = R.chargeSpot(u, other, R.remaining(u)); applyMove(u, c2, c2.cost); }
          continue;
        }
        const join = R.alive(chief) && R.engaged(chief) && R.chargeSpot(u, chief, R.remaining(u));
        if (join) { applyMove(u, join, join.cost); continue; }
        fighterMove(u);
      }
    },
  },
  // The Line Wavers: shields hold the mouths of the two passes (posts), spears stand behind them, two shields wait in
  // reserve to fill a gap. Once the orcs are Broken, every model that is not Engaged steps 1.5″ back from the nearest orc,
  // so the orcs have to Activate (and test) to reach it again. WAVER=fight: never step back.
  'The Line Wavers': {
    ...generic,
    move(side) {
      const m = G().m, mine = R.sideAlive(side), atPost = u => m.posts.some(([x, y]) => Math.hypot(u.x - x, u.y - y) < 0.3);
      if (G().broken && G().broken.evil && process.env.WAVER !== 'fight') {
        for (const u of mine.filter(R.canMove)) {
          const f = foes(side).sort((a, b) => dist(u, a) - dist(u, b))[0]; if (!f || gap(u, f) > 2.5) continue;
          const d = dist(u, f) || 1, P = { x: u.x + (u.x - f.x) / d * 1.5, y: u.y + (u.y - f.y) / d * 1.5 };
          const v = R.validateMove(u, P, R.remaining(u)); if (v.ok) applyMove(u, P, v.cost);
        }
        return;
      }
      for (const u of mine.filter(u => R.canMove(u) && u.T.spear)) spearSupport(u);
      for (const [x, y] of m.posts) {
        if (mine.some(u => Math.hypot(u.x - x, u.y - y) < 0.3)) continue;
        const r = mine.filter(u => R.canMove(u) && !u.T.spear && !atPost(u)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (!r) continue;
        const v = R.validateMove(r, { x, y }, R.remaining(r));
        if (v.ok) applyMove(r, { x, y }, v.cost);
        else { const c = foes(side).map(o => R.chargeSpot(r, o, R.remaining(r))).filter(Boolean).sort((a, b) => a.cost - b.cost)[0]; if (c) applyMove(r, c, c.cost); }
      }
    },
  },
  // The King's Guard: Théoden Activates first (his test, then Stand Fast) and stays back; everyone else Charges the
  // Uruk-hai with no Shieldwall bonus first (the ends of the wall), then ones a friend already fights, Strength-for-
  // Strength; out of reach, they walk at that target. ENDS=never: the target is simply the nearest Uruk-hai.
  // OFF=bodyguard / OFF=shieldwall (see play) measure the two rules.
  'The King\'s Guard': {
    ...generic,
    move(side) {
      const k = G().m.king(), mine = R.sideAlive(side).filter(u => u !== k);
      if (R.alive(k) && R.canMove(k)) { S.activate(k); k.done = true; }
      const score = (u, f) => (process.env.ENDS === 'never' ? 0 : (R.shieldwallOn(f) ? 0 : 6) + mine.filter(o => o !== u && C.touching(o, f)).length * 2) - gap(u, f) * 0.3;
      for (const u of mine.filter(u => u.T.spear && R.canMove(u))) spearSupport(u);
      for (const u of mine) {
        if (!R.canMove(u) || R.engaged(u) || u.movedDist) continue;
        const list = foes(side).map(f => ({ f, sc: score(u, f), c: R.chargeSpot(u, f, R.remaining(u)) })).sort((a, b) => b.sc - a.sc);
        const hit = list.find(o => o.c);
        if (hit) { applyMove(u, hit.c, hit.c.cost); continue; }
        const p = list.length && R.bestApproach(u, list[0].f, R.remaining(u));
        if (p) applyMove(u, p, p.cost);
      }
    },
  },
  // Stand Fast!: the Captain Activates first (his test, then Stand Fast) and stays behind the line within 6″ of it; the
  // shields hold four posts across the ford, the spears Support them. Nobody Charges the Troll unless a friend already
  // fights it (Terror); the Captain never fights while he can help it. SF=naive: no Captain first.
  'Stand Fast!': {
    ...generic,
    move(side) {
      const m = G().m, cap = m.captain(), mine = R.sideAlive(side), troll = m.troll();
      const posts = [[10.4, 7.7], [10.4, 9.1], [10.4, 10.9], [10.4, 12.3]], atPost = u => posts.some(([x, y]) => Math.hypot(u.x - x, u.y - y) < 0.3);
      const fair = (u, f) => f !== troll || mine.some(o => o !== u && C.touching(o, f));
      if (R.alive(cap) && R.canMove(cap) && process.env.SF !== 'naive') {
        if (S.activate(cap) && R.canMove(cap)) {
          // He keeps out of the fight (an Engaged Hero does not Activate, so calls no Stand Fast): 2.5″ behind the posts.
          const P = { x: 7.6, y: Math.max(8, Math.min(12, cap.y)) }, v = Math.hypot(P.x - cap.x, P.y - cap.y) > 0.1 && R.validateMove(cap, P, R.remaining(cap));
          const c = v && v.ok ? { ...P, cost: v.cost } : null;
          if (c) applyMove(cap, c, c.cost);
        }
        cap.done = true;
      }
      for (const u of mine.filter(u => R.canMove(u) && u.T.spear)) spearSupport(u);
      for (const [x, y] of posts) {
        if (mine.some(u => Math.hypot(u.x - x, u.y - y) < 0.3)) continue;
        const r = mine.filter(u => u !== cap && R.canMove(u) && !u.T.spear && !atPost(u)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (!r) continue;
        const v = R.validateMove(r, { x, y }, R.remaining(r));
        if (v.ok) { applyMove(r, { x, y }, v.cost); continue; }
        const c = foes(side).filter(f => fair(r, f)).map(o => R.chargeSpot(r, o, R.remaining(r))).filter(Boolean).sort((a, b) => a.cost - b.cost)[0];
        if (c) applyMove(r, c, c.cost);
      }
      // Anyone still free: Charge an enemy on this bank (not the Troll alone).
      for (const u of mine.filter(u => u !== cap && R.canMove(u) && !u.movedDist)) {
        const c = foes(side).filter(f => f.x < 11 && fair(u, f)).map(f => R.chargeSpot(u, f, R.remaining(u))).filter(Boolean).sort((a, b) => a.cost - b.cost)[0];
        if (c) applyMove(u, c, c.cost);
      }
    },
    shield: (c, other) => C.shieldPays(c, 'good', other),
  },
  // With Me!: both bands walk to the ford (the mission's aiGoal, the computer's own plan). The Captain declares a Heroic
  // Move in the turns DECL lists (default: 2 and 3, when the race is decided) while he has Might, and shouts With Me;
  // HEROIC=never: no Heroic Actions (about 10% wins against 80%; DECL=1,2 about 30%).
  'With Me!': {
    ...byAI,
    declare(q) {
      if (process.env.HEROIC === 'never') return null;
      const turns = (process.env.DECL || '2,3').split(',').map(Number), o = q.options.find(x => x.k === 'move' && x.u.t === 'captainOfRohan');
      return o && turns.includes(G().turn) ? { u: o.u, k: 'move' } : null;
    },
  },
  // At the Double!: the column walks to the gate (ai.js: exitX), never Charging. Each turn the Captain spends his Might where it
  // counts: a Heroic Move when the Uruk-hai have Priority and one could reach any of the column first, otherwise a Heroic March
  // (shouting At the Double) when the rear cannot make the gate at 6″ a turn. MOVE=never: no Heroic Moves; DECL=1,2 (or any
  // list): March in those turns instead of when needed; HEROIC=never: no Heroic Actions.
  'At the Double!': {
    ...byAI,
    declare(q) {
      if (process.env.HEROIC === 'never') return null;
      const g = G(), m = g.m, cap = m.captain(), mine = R.sideAlive('good'), opt = k => q.options.find(x => x.k === k && x.u === cap);
      const threat = g.priority === 'evil' && foes('good').some(f => mine.some(u => gap(u, f) <= f.mv + 0.5));
      if (threat && process.env.MOVE !== 'never' && opt('move')) return { u: cap, k: 'move' };
      const rear = Math.min(...mine.map(u => u.x)), short = m.exitX - rear > 6 * (m.limit - g.turn + 1) - 0.5;
      const march = process.env.DECL ? process.env.DECL.split(',').map(Number).includes(g.turn) : g.turn <= 2 || short;
      return march && opt('march') ? { u: cap, k: 'march' } : null;
    },
  },
  // Loose!: the archers stay put (the stream stops any Charge) and shoot the best shot. The Heroes spend their Might in the
  // Shoot phase in the turns CAP and HAMA list, one letter a turn: S Heroic Shoot (Loose), A Heroic Accuracy (Take Aim),
  // - nothing (default: the Captain SS, Háma AA); HEROIC=never: no Heroic Actions.
  'Loose!': {
    ...generic,
    move() {},
    declare(q) {
      if (process.env.HEROIC === 'never') return null;
      const t = G().turn - 1, want = [['captainOfRohan', process.env.CAP || 'SS'], ['hamaPrince', process.env.HAMA || 'AA']];
      for (const [who, plan] of want) {
        const k = { S: 'shoot', A: 'accuracy' }[plan[t]], o = q.options.find(x => x.k === k && x.u.t === who);
        if (o) return { u: o.u, k };
      }
      return null;
    },
  },
  // The Hammerhand: Helm Charges Wulf when he can, otherwise the enemy nearest Wulf, otherwise walks at Wulf; the others
  // Charge the enemy nearest Wulf they can reach (Haleth Wulf first). Helm takes his free Heroic Combat whenever he fights
  // one enemy, Haleth challenges Wulf, Háma answers Freca's Heroic Strength with a Heroic Defence; the rest as the computer.
  // FRAY=never: Helm declares no Heroic Combat; HEROIC=never: the player declares nothing.
  'The Hammerhand': (() => {
    const go = u => {
      if (!R.canMove(u) || R.engaged(u)) return;
      const g = G(), w = g.m.wulf(), mv = R.remaining(u), near = f => (R.alive(w) ? dist(f, w) : 0);
      const c = foes(u.side).filter(f => gap(u, f) <= mv).sort((a, b) => (a === w ? -99 : near(a)) - (b === w ? -99 : near(b)))
        .map(f => R.chargeSpot(u, f, mv)).find(Boolean);
      if (c) { applyMove(u, c, c.cost); return; }
      const t = u === g.m.helm() || u === g.m.haleth() ? w : foes(u.side).sort((a, b) => dist(u, a) - dist(u, b))[0];
      const p = t && R.alive(t) && R.bestApproach(u, t, mv);
      if (p) applyMove(u, p, p.cost);
    };
    const order = list => { const g = G(), first = [g.m.helm(), g.m.haleth()]; return [...list].sort((a, b) => first.includes(b) - first.includes(a)); };
    return {
      ...generic,
      move(side) { for (const u of order(R.sideAlive(side).filter(R.canMove))) { go(u); u.done = true; } },
      heroicMove(list) {
        const w = G().m.wulf(), left = [...list];
        for (let u; R.alive(w) && (u = left.find(o => R.chargeSpot(o, w, R.remaining(o)))); ) { go(u); u.done = true; left.splice(left.indexOf(u), 1); }
        for (const u of order(left)) { go(u); u.done = true; }
      },
      declare(q) {
        if (process.env.HEROIC === 'never') return null;
        const g = G(), helm = g.m.helm(), hal = g.m.haleth(), hama = g.m.hama(), w = g.m.wulf(), fr = g.m.freca();
        const opt = (u, k) => q.options.find(x => x.u === u && x.k === k);
        const fightOf = u => (g.combats || []).find(x => x.includes(u)) || [];
        const them = fightOf(helm).filter(o => o.side !== helm.side);
        if (process.env.FRAY !== 'never' && opt(helm, 'combat') && them.length === 1) return { u: helm, k: 'combat' };
        const ch = opt(hal, 'challenge'); if (ch && ch.targets.includes(w)) return { u: hal, k: 'challenge', t: w };
        if (opt(hama, 'defence') && R.alive(fr) && fr.sx2 && C.touching(fr, hama)) return { u: hama, k: 'defence' };
        return null;
      },
    };
  })(),
  // Unbreakable: Háma stays in the pass and waits; in the Fight phase he answers Freca's Heroic Strength with a Heroic
  // Defence, and spends no Might on dice (keepMight; MIGHT=dice lets him). PLAN overrides the declaring, one letter a
  // turn: D Heroic Defence (at his first chance), - none; HEROIC=never: none.
  'Unbreakable': {
    ...generic,
    keepMight: true,
    move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) u.done = true; },
    declare(q) {
      if (process.env.HEROIC === 'never') return null;
      const g = G(), h = g.m.hama(), f = g.m.freca(), opt = q.options.find(x => x.k === 'defence' && x.u === h);
      if (!opt) return null;
      const plan = process.env.PLAN;
      if (plan) return plan[g.turn - 1] === 'D' ? { u: h, k: 'defence' } : null;
      return R.alive(f) && f.sx2 && C.touching(f, h) ? { u: h, k: 'defence' } : null;
    },
  },
  // The Challenge: Haleth Charges Freca when he can, otherwise walks at him; the Warriors Charge the tribesmen. In the
  // Fight phase Haleth challenges Freca. CH=never: no challenge, a Heroic Strike when fighting Freca instead; HEROIC=never:
  // no Heroic Actions. (Freca never challenges Haleth: the computer only challenges a Hero no stronger than its own.)
  'The Challenge': (() => {
    const ch = process.env.CH || '';
    const go = u => {
      if (!R.canMove(u) || R.engaged(u)) return;
      const g = G(), w = g.m.freca(), mv = R.remaining(u);
      if (u === g.m.haleth()) {
        const c = R.alive(w) && R.chargeSpot(u, w, mv);
        if (c) { applyMove(u, c, c.cost); return; }
        const p = R.alive(w) && R.bestApproach(u, w, mv);
        if (p && p.cost > 0.5) { applyMove(u, p, p.cost); return; }
      }
      const f = foes(u.side).filter(o => o !== w && gap(u, o) <= mv).map(o => R.chargeSpot(u, o, mv)).find(Boolean);
      if (f) { applyMove(u, f, f.cost); return; }
      const t = foes(u.side).filter(o => o !== w).sort((a, b) => dist(u, a) - dist(u, b))[0];
      const p = t && R.bestApproach(u, t, mv);
      if (p) applyMove(u, p, p.cost);
    };
    return {
      ...generic,
      move(side) {
        const h = G().m.haleth(), list = R.sideAlive(side).filter(R.canMove).sort((a, b) => (b === h) - (a === h));
        for (const u of list) { go(u); u.done = true; }
      },
      declare(q) {
        if (process.env.HEROIC === 'never') return null;
        const g = G(), h = g.m.haleth(), w = g.m.freca();
        const c = q.options.find(x => x.k === 'challenge' && x.u === h && x.targets.includes(w));
        if (c && !ch) return { u: h, k: 'challenge', t: w };
        if (ch === 'never') { const s = q.options.find(x => x.k === 'strike' && x.u === h); return s && C.touching(h, w) ? { u: h, k: 'strike' } : null; }
        return null;
      },
    };
  })(),
  // Through the Line: Haleth Charges Wulf when he can, otherwise the tribesman nearest Wulf (after a successful Heroic
  // Combat too). In the Fight phase he declares a Heroic Combat when he fights one tribesman alone, otherwise a Heroic
  // Strike. PLAN overrides it, one letter a turn: C Heroic Combat, S Heroic Strike, - none; HEROIC=never: no Heroic Actions.
  'Through the Line': (() => {
    const go = u => {
      if (!R.canMove(u) || R.engaged(u)) return;
      const t = G().m.wulf(), near = f => (R.alive(t) ? dist(f, t) : 0);
      const h = G().m.haleth(), hf = u !== h && R.alive(h) && foes(u.side).find(f => C.touching(f, h));   // join Haleth's fight
      const j = hf && R.chargeSpot(u, hf, R.remaining(u));
      if (j) { applyMove(u, j, j.cost); return; }
      const c = foes(u.side).filter(f => gap(u, f) <= R.remaining(u)).sort((a, b) => (a === t ? -99 : near(a)) - (b === t ? -99 : near(b)))
        .map(f => R.chargeSpot(u, f, R.remaining(u))).find(Boolean);
      if (c) { applyMove(u, c, c.cost); return; }
      const p = R.alive(t) && R.bestApproach(u, t, R.remaining(u));
      if (p) applyMove(u, p, p.cost);
    };
    return {
      ...generic,
      move(side) { for (const u of R.sideAlive(side).filter(R.canMove)) { go(u); u.done = true; } },
      // Whoever can Charge Wulf goes first (a Warrior in front may block Haleth's sight of him), until nobody else can.
      heroicMove(list) {
        const w = G().m.wulf(), left = [...list];
        for (let u; R.alive(w) && (u = left.find(o => R.chargeSpot(o, w, R.remaining(o)))); ) { go(u); u.done = true; left.splice(left.indexOf(u), 1); }
        for (const u of left) { go(u); u.done = true; }
      },
      declare(q) {
        if (process.env.HEROIC === 'never') return null;
        const g = G(), h = g.m.haleth(), opt = k => q.options.find(x => x.k === k && x.u === h);
        const plan = process.env.PLAN;
        if (plan) { const k = { C: 'combat', S: 'strike' }[plan[g.turn - 1]]; return k && opt(k) ? { u: h, k } : null; }
        const c = (g.combats || []).find(x => x.includes(h)), them = c ? c.filter(u => u.side !== h.side) : [];
        if (them.length === 1 && them[0] !== g.m.wulf() && opt('combat')) return { u: h, k: 'combat' };
        return opt('strike') ? { u: h, k: 'strike' } : null;
      },
    };
  })(),
  // Wolves of Isengard: Riders shoot while the Warg Riders are out of charge reach (and keep 10.5″ from them), and charge
  // in company: a Warg Rider a friend already fights, or one that another Rider can reach this turn too. Never one Rider into
  // two enemies. Riders on foot fight like any warrior. WOLVES=naive: every Rider charges whatever it can reach, alone.
  'Wolves of Isengard': {
    ...generic,
    move(side) {
      const naive = process.env.WOLVES === 'naive', mine = R.sideAlive(side);
      for (const u of mine.filter(R.canMove)) {
        if (naive) { fighterMove(u); continue; }
        if (!u.cav) { if (foes(side).some(f => !f.cav && gap(u, f) <= R.remaining(u))) fighterMove(u); continue; }   // on foot: only fight orcs on foot
        let best = null;
        for (const f of foes(side)) {
          if (gap(u, f) > R.remaining(u)) continue;
          const c = R.chargeSpot(u, f, R.remaining(u)); if (!c) continue;
          const crowd = foes(side).filter(o => o !== f && gapXY(c.x, c.y, u.r, o) <= 0.08).length;
          if (crowd) continue;
          const mates = mine.filter(o => o !== u && C.touching(o, f)).length;
          const others = mine.filter(o => o !== u && o.cav && R.canMove(o) && gap(o, f) <= R.remaining(o)).length;
          const foot = !f.cav && !f.T.mountModel && !R.inBrush(c.x, c.y, u.r);   // infantry on open ground: the bonus charge, fine alone
          if (!mates && !others && !foot) continue;
          const sc = mates * 3 + Math.min(others, 1) - c.cost * 0.1 + (foot ? 4 : 0);
          if (!best || sc > best.sc) best = { c, sc };
        }
        if (best) { applyMove(u, best.c, best.c.cost); continue; }
        shooterMove(u, () => 1, 10.5);
      }
    },
  },
  // The Éored Rides: a Rider charges where it keeps the Cavalry Charge bonus (infantry, a spot outside the brush), and
  // likes a target a friend already fights; a Rider that cannot charge keeps out of the infantry's 6″ reach (ready to
  // charge next turn). Riders on foot fight like any warrior. EORED=naive charges anything, brush or not, and never
  // pulls back.
  'The Éored Rides': {
    ...generic,
    move(side) {
      const naive = process.env.EORED === 'naive';
      for (const u of R.sideAlive(side).filter(R.canMove)) {
        if (!u.cav) { fighterMove(u); continue; }
        let best = null;
        for (const f of foes(side)) {
          if (gap(u, f) > R.remaining(u)) continue;
          const c = R.chargeSpot(u, f, R.remaining(u)); if (!c) continue;
          const bonus = !f.cav && !R.inBrush(c.x, c.y, u.r);
          if (!bonus && !naive) continue;
          const mates = R.sideAlive(side).filter(o => o !== u && C.touching(o, f)).length;
          const crowd = foes(side).filter(o => o !== f && gapXY(c.x, c.y, u.r, o) <= 0.08).length;   // more enemies the spot touches
          if (crowd && !mates && !naive) continue;   // one Rider against two men is a bad bet
          const sc = (bonus ? 4 : 0) + Math.min(mates, 1) * 2 - c.cost * 0.1 - crowd * 3;
          if (!best || sc > best.sc) best = { c, sc };
        }
        if (best) { applyMove(u, best.c, best.c.cost); continue; }
        if (naive) { fighterMove(u); continue; }
        const f = foes(side).sort((a, b) => dist(u, a) - dist(u, b))[0]; if (!f) continue;
        const want = 7.5 + u.r + f.r, d = dist(u, f) || 1;
        const P = { x: f.x + (u.x - f.x) / d * want, y: f.y + (u.y - f.y) / d * want };
        const Q = R.furthestMove(u, P, R.remaining(u)), v = R.validateMove(u, Q, R.remaining(u));
        if (v.ok && Math.hypot(Q.x - u.x, Q.y - u.y) > 0.3) applyMove(u, Q, v.cost);
      }
    },
  },
  // Hold the Wall: every post against the wall (and in the gate) stays filled: a model at a post stands still, the nearest
  // free model walks to an empty post, and the reserves (and anyone else free) charge any tribesman that got behind the
  // wall. SHIELD=never or SHIELD=value as for Axe and Shield; by default every fight that can be shielded is.
  // HOLD=naive plays it like any other fight: everyone charges whatever it can reach.
  'Hold the Wall': {
    ...generic,
    move(side) {
      if (process.env.HOLD === 'naive') { generic.move(side); return; }
      const m = G().m, mine = R.sideAlive(side), atPost = u => m.posts.some(([x, y]) => Math.hypot(u.x - x, u.y - y) < 0.3);
      // First, anything that got through is charged by as many models as can reach it: the reserves, then the defenders
      // near it (they gather on one intruder: more dice in that Combat).
      const inside = foes(side).filter(o => o.y > m.wallY + 0.6);
      if (inside.length) for (const u of mine.filter(R.canMove).sort((a, b) => atPost(a) - atPost(b))) {
        let best = null;
        for (const o of inside) {
          const c = R.chargeSpot(u, o, R.remaining(u)); if (!c) continue;
          const sc = mine.filter(x => x !== u && C.touching(x, o)).length * 3 - c.cost * 0.1;
          if (!best || sc > best.sc) best = { c, sc, o };
        }
        if (best && (!atPost(u) || dist(best.o, u) < 4.5)) applyMove(u, best.c, best.c.cost);
      }
      for (const [x, y] of m.posts) {
        if (mine.some(u => Math.hypot(u.x - x, u.y - y) < 0.3)) continue;
        const r = mine.filter(u => R.canMove(u) && !atPost(u)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (!r) continue;
        const v = R.validateMove(r, { x, y }, R.remaining(r));
        if (v.ok) applyMove(r, { x, y }, v.cost);
        else { const Q = R.furthestMove(r, { x, y }, R.remaining(r)), w = R.validateMove(r, Q, R.remaining(r)); if (w.ok && Math.hypot(Q.x - r.x, Q.y - r.y) > 0.3) applyMove(r, Q, w.cost); }
      }
    },
    // Shield to hold the wall and the gate; fight for real against a tribesman that got behind the wall.
    shield: (c, other) => (process.env.SHIELD === 'never' ? false : process.env.SHIELD === 'value' ? C.shieldPays(c, 'good', other) : !C.evilsOf(c).some(o => o.y > G().m.wallY + 0.6)),
  },
  // The troll holds the dead end of the ravine. Close in as a group, then charge together once most warriors can
  // reach it (or the rest cannot get any closer), nearest first, bases packed side by side in front of it,
  // so the rocks behind it leave it Trapped.
  'Troll in the Ravine': {
    ...generic,
    move(side) {
      const troll = foes(side)[0]; if (!troll) return;
      const mine = R.sideAlive(side).filter(R.canMove).sort((a, b) => dist(a, troll) - dist(b, troll));
      const ready = mine.filter(u => R.chargeSpot(u, troll, R.remaining(u)));
      const stuck = mine.filter(u => !ready.includes(u) && !R.bestApproach(u, troll, R.remaining(u)));
      if (ready.length && (ready.length >= Math.min(6, mine.length) || ready.length + stuck.length >= mine.length)) {
        for (const u of mine) { const c = R.chargeSpot(u, troll, R.remaining(u)); if (c) applyMove(u, c, c.cost); }
        return;
      }
      for (const u of mine) { const p = R.bestApproach(u, troll, R.remaining(u)); if (p) applyMove(u, p, p.cost); }
    },
  },
};

/* ---------- One game ---------- */
// The player's side: the mission's strategy (moving, shooting, Priority, Shielding); everything else as the computer.
// MIGHT=never: the player's Heroes never spend Might on dice (a strategy with keepMight neither, unless MIGHT=dice).
function brain(plan) {
  const never = process.env.MIGHT === 'never' || (plan.keepMight && process.env.MIGHT !== 'dice');
  return {
    takePriority: g => plan.takePriority(g),
    move: side => plan.move(side),
    shoot: s => plan.shoot(s),
    ...(plan.heroicMove ? { heroicMove: list => plan.heroicMove(list) } : {}),
    ...(plan.cast ? { cast: u => plan.cast(u) } : {}),
    ...(plan.throwAt ? { throwAt: (u, t) => plan.throwAt(u, t) } : {}),
    shield: (c, side, other) => (plan.shield ? plan.shield(c, other) : false),
    answer: q => (plan.resist && q.k === 'resist' && q.u.side === 'good' ? plan.resist(q) : q.k === 'declare' && q.side === 'good' && plan.declare ? plan.declare(q) : never && q.k === 'might' ? 0 : never && q.k === 'duelMight' ? null : undefined),
  };
}
function play(mi) {
  // SIDE=evil: a Battle of Edoras mission from the Hill Tribes' side (missions.js: flipSide), the player's side played
  // by the computer's planner; only to see that it plays through (these missions have no balance target).
  const evil = process.env.SIDE === 'evil' && MISSIONS[mi].series === 'E';
  const m = evil ? flipSide(MISSIONS[mi]) : MISSIONS[mi], plan = evil ? byAI : STRATEGY[m.title] || generic;
  // Heroic Actions and Stand Fast only from the missions that teach them, or the mission's own list (m.heroics).
  // OFF=bodyguard,shieldwall (special.js keys): those special rules switched off, to measure what they are worth.
  S.startGame(m, { mi, broken: knows('broken', mi) && !m.narrative, shielding: knows('shielding', mi), standFast: knows('standFast', mi), heroics: H.HEROIC_KEYS.filter(k => (Array.isArray(m.heroics) ? m.heroics.includes(k) : knows(H.HEROIC[k].rule, mi))), specials: SP.SPECIALS.filter(k => knows(k, mi) && !(process.env.OFF || '').split(',').includes(k)) });
  const g = G(), b = { good: brain(plan), trace: DEBUG ? t => DEBUG.push(`T${g.turn} ${t}`) : null };
  for (;;) {
    const r = S.playTurn(b);
    if (DEBUG) DEBUG.push(`end T${g.turn} (Priority ${g.priority}): good ${R.sideAlive('good').length} (fled ${g.units.filter(u => u.fled && u.side === 'good').length}, escaped ${g.units.filter(u => u.escaped && u.side === 'good').length}${process.env.DEBUG_POS ? ' ' + R.sideAlive('good').map(u => Math.round(u.x) + ',' + Math.round(u.y)).join(' ') : ''}) evil (gone ${g.units.filter(u => u.side === 'evil' && u.gone).length}, esc ${g.units.filter(u => u.side === 'evil' && u.escaped).length}, dead ${g.units.filter(u => u.side === 'evil' && u.dead).length}) ${R.sideAlive('evil').map(u => u.t[0] + u.t.slice(-3) + '@' + Math.round(u.x) + ',' + Math.round(u.y)).join(' ')}${m.chief ? ` | chief W${m.chief().w} M${m.chief().might} F${m.chief().fate} captain W${m.captain().w} M${m.captain().might} F${m.captain().fate} d=${Math.round(dist(m.chief(), m.captain()))}` : ''}`);
    if (r) return r;
    if (g.turn >= 60) return 'unfinished';   // a mission without a turn limit that stalls
    g.turn++;
  }
}

/* ---------- Report ---------- */
if (DEBUG) {
  const mi = indexOf(process.argv[3]);
  for (let k = 0; k < +process.env.DEBUG; k++) { DEBUG.length = 0; const r = play(mi); console.log(r, G().turn, '|', DEBUG.join(' ; ')); }
  process.exit(0);
}
const runs = +process.argv[2] || 300;
const pick = process.argv.slice(3).map(indexOf);
for (let mi = 0; mi < MISSIONS.length; mi++) {
  if (pick.length && !pick.includes(mi)) continue;
  const m = MISSIONS[mi];
  if (m.title === 'The Scout') { console.log(`${missionNo(mi)}. ${m.title}: no dice involved, skipped`); continue; }
  let wins = 0, turns = 0, timeouts = 0, goodLeft = 0, evilLeft = 0;
  const t0 = Date.now();
  for (let k = 0; k < runs; k++) {
    const r = play(mi);
    if (r === 'win') { wins++; turns += G().turn; goodLeft += R.sideAlive('good').length; }
    else { if (R.sideAlive('good').length) timeouts++; evilLeft += R.sideAlive('evil').length; }
  }
  const pctWin = Math.round((wins / runs) * 100), losses = runs - wins;
  const how = [wins ? `won in turn ${(turns / wins).toFixed(1)} of ${m.limit || '-'} with ${(goodLeft / wins).toFixed(1)} models left` : '',
    losses ? `${Math.round((timeouts / losses) * 100)}% of losses on time, ${(evilLeft / losses).toFixed(1)} enemies left` : ''].filter(Boolean).join('; ');
  console.log(`${missionNo(mi)}. ${m.title}: ${pctWin}% wins (${how}; ${runs} games, ${((Date.now() - t0) / 1000).toFixed(1)} s)${pctWin < 75 ? '  <- too hard' : ''}`);
  if (process.env.CASTS) console.log('  Casts (power: tried, Cast, Resisted):', JSON.stringify(S.stats.casts)), S.stats.casts = {};
}
