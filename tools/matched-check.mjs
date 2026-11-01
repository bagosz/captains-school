// Matched play check: every imported army list (js/data/army-lists.js) fights random battles, the computer playing
// both sides, with the real rules engine and no drawing. Catches broken profiles after re-importing the army data
// (tools/import-armies.mjs) and shows how long battles last and how long the computer thinks.
// Usage: node tools/matched-check.mjs [battles per army] [points]   e.g. node tools/matched-check.mjs 2 150
// The battles follow the turn sequence of js/engine/sim.js, as the game does, with the computer deciding for both sides.
globalThis.matchMedia = () => ({ matches: false });
process.removeAllListeners('warning');

const st = await import('../js/state.js');
const R = await import('../js/engine/rules.js');
const C = await import('../js/engine/combat.js');
const { buildUnits, freshTurn } = await import('../js/engine/setup.js');
const S = await import('../js/engine/sim.js');
const M = await import('../js/engine/matched.js');
const { ARMIES } = await import('../js/data/army-lists.js');
const { HEROIC_KEYS } = await import('../js/engine/heroes.js');

const per = +process.argv[2] || 2, limit = +process.argv[3] || 150;
const pick = list => list[Math.floor(Math.random() * list.length)];
function battle(me, foe) {
  const m = M.makeMatch({ me: me.id, foe: foe.id, limit, mine: M.randomArmy(me, limit), theirs: M.randomArmy(foe, limit), seed: 1 + Math.floor(Math.random() * 1e9) });
  // Matched play has every rule the missions teach, every Heroic Action among them.
  S.startGame(m, { broken: true, shielding: true, standFast: true, heroics: HEROIC_KEYS, align: M.alignmentOf(m) });
  const G = st.G;
  let slowest = 0;
  for (;;) {
    const t0 = Date.now();
    const r = S.playTurn({});
    slowest = Math.max(slowest, Date.now() - t0);
    if (r || G.turn >= 40) return { r: r || 'unfinished', turn: G.turn, slowest };
    G.turn++;
  }
}

const tally = { win: 0, lose: 0, draw: 0, unfinished: 0 }, failed = [];
let turns = 0, games = 0, slowest = 0;
const t0 = Date.now();
for (const me of ARMIES) {
  for (let k = 0; k < per; k++) {
    const foe = pick(ARMIES.filter(a => a.align !== me.align));
    try {
      const b = battle(me, foe);
      tally[b.r]++; turns += b.turn; games++; slowest = Math.max(slowest, b.slowest);
      if (b.r === 'unfinished') failed.push(`${me.name} vs ${foe.name}: no result after 40 turns`);
    } catch (e) { failed.push(`${me.name} vs ${foe.name}: ${e.stack.split('\n').slice(0, 5).join(' ')}`); }
  }
}
console.log(`${games} battles at ${limit} points, ${ARMIES.length} army lists: average ${(turns / games).toFixed(1)} turns, slowest computer turn ${slowest} ms, ${((Date.now() - t0) / 1000).toFixed(1)} s in all.`);
const { charges, missed } = S.stats;
console.log(`The computer Charged ${charges} times; ${missed} of them ended out of base contact.`);
console.log(`Results for the first army: ${tally.win} wins, ${tally.lose} losses, ${tally.draw} draws, ${tally.unfinished} unfinished.`);
const casts = Object.entries(S.stats.casts).sort((a, b) => b[1][0] - a[1][0]);
if (casts.length) console.log(`Magical Powers (tried/Cast/Resisted): ${casts.map(([k, v]) => `${k} ${v.join('/')}`).join(', ')}.`);
if (Object.keys(S.stats.brutal).length) console.log(`Monsters: ${Object.entries(S.stats.brutal).map(([k, v]) => `${k} ${v}`).join(', ')} (Brutal Power Attacks; free: Strikes at a slain model's supporters).`);
if (S.stats.siege.shots || S.stats.siege.disabled) console.log(`Siege Engines: ${S.stats.siege.shots} shots, ${S.stats.siege.hits} hits, ${S.stats.siege.slain} enemies slain, ${S.stats.siege.disabled} engines disabled.`);
if (S.stats.ramps.n) console.log(`Chariots and War Beasts: ${S.stats.ramps.n} Chariot Charges or Tramples, ${S.stats.ramps.impacts} models run into, ${S.stats.ramps.slain} enemies slain.`);
if (S.stats.cross.n) console.log(`Jump, Leap and Climb Tests by the computer: ${S.stats.cross.n}, ${S.stats.cross.ok} of them across.`);
if (missed) { failed.push(`${missed} Charges ended out of base contact: ${(S.stats.misses || []).join('; ')}`); }
if (failed.length) { console.log(`${failed.length} problems:\n  ${failed.join('\n  ')}`); process.exitCode = 1; }
