// LOS check: Line of Sight, In The Way and cover for shooting, through every kind of terrain, for the player and the
// computer (both go through rules.js: shotInfo). Usage: node tools/los-check.mjs
globalThis.matchMedia = () => ({ matches: false });
process.removeAllListeners('warning');
const st = await import('../js/state.js');
const R = await import('../js/engine/rules.js');
const S = await import('../js/engine/sim.js');
const H = await import('../js/engine/heroes.js');
const FO = await import('../js/engine/fortress.js');
const AI = await import('../js/engine/ai.js');
const G = () => st.G;
function table(units, terrain = []) {
  S.startGame({ board: [24, 18], terrain, units, check: () => null, status: () => '', priority: 'good' }, { heroics: H.HEROIC_KEYS, broken: true, shielding: true, standFast: true });
  G().units.forEach(u => { u.decl = {}; });
  return G().units;
}
const rows = [];
const run = (name, expect, units, terrain) => {
  const [s, t] = table(units, terrain);
  const i = R.shotInfo(s, t);
  const got = !i.ok ? `no shot (${i.rule})` : i.itw.length ? `shot, In The Way: ${i.itw.map(o => o.name).join(', ')}` : i.ignored.length ? `shot, ignores ${i.ignored.map(c => c.k).join(', ')}` : 'clear shot';
  rows.push({ ok: got.startsWith(expect), name, expect, got });
};
const bowG = { t: 'warriorOfRohanBow', side: 'good' }, bowE = { t: 'mordorOrcBow', side: 'evil' };
const orc = { t: 'mordorOrc', side: 'evil' }, man = { t: 'warriorOfRohan', side: 'good' };
run('open ground', 'clear shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }]);
run('rock hides all', 'no shot (shoot)', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'rock', x: 8, y: 7, w: 2, h: 4 }]);
run('rock hides part', 'shot, In The Way: rock', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'rock', x: 8, y: 9.05, w: 2, h: 4 }]);
run('brush between', 'shot, In The Way: brush', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'brush', x: 8, y: 7, w: 2, h: 4 }]);
run('low wall midway: the sight line passes over it', 'clear shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'wall', x: 9, y: 6, w: 0.5, h: 6 }]);
run('target behind a low wall', 'shot, In The Way: wall', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'wall', x: 12.9, y: 6, w: 0.5, h: 6 }]);
run('target behind a hedge', 'shot, In The Way: hedge', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'hedge', x: 12.9, y: 6, w: 0.5, h: 6 }]);
run('man behind a troll', 'no shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }, { t: 'mordorTroll', side: 'evil', x: 9, y: 9 }]);
run('troll behind a man', 'shot, In The Way', [{ ...bowE, x: 4, y: 9 }, { t: 'mordorTroll', side: 'good', x: 14, y: 9 }, { ...orc, x: 9, y: 9 }]);
run('3" cliff: archer on top → man below', 'clear shot', [{ ...bowG, x: 6, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'plateau', x: 0, y: 0, w: 7, h: 18, z: 3, sheer: true }]);
run('3" cliff: archer far back on top → man at its foot', 'no shot', [{ ...bowG, x: 1, y: 9 }, { ...orc, x: 7.6, y: 9 }], [{ k: 'plateau', x: 0, y: 0, w: 7, h: 18, z: 3, sheer: true }]);
run('shooter touching wall', 'shot, ignores wall', [{ ...bowG, x: 8.5, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'wall', x: 9, y: 6, w: 0.5, h: 6 }]);
run('evil past a model', 'shot, In The Way', [{ ...bowE, x: 4, y: 9 }, { ...man, x: 14, y: 9 }, { ...orc, x: 9, y: 9.6 }]);
run('good past a friend', 'no shot (itw)', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }, { ...man, x: 9, y: 9.6 }]);
run('cliff 3" between (ground to ground)', 'no shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 18, y: 9 }], [{ k: 'plateau', x: 8, y: 2, w: 6, h: 14, z: 3, sheer: true }]);
run('archer on hill, man in front', 'clear shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }, { ...man, x: 6, y: 9 }], [{ k: 'plateau', x: 0, y: 0, w: 5.5, h: 18, z: 3 }]);
const wall = [{ k: 'plateau', x: 0, y: 10, w: 24, h: 2, z: FO.WALL_Z, sheer: true, fort: true, face: 'n' }];
run('fort: defender on battlements → attacker', 'clear shot', [{ ...bowG, x: 12, y: 10.6 }, { ...orc, x: 12, y: 4 }], wall);
run('fort: attacker → defender on battlements', '', [{ ...bowE, x: 12, y: 4 }, { ...man, x: 12, y: 10.6 }], wall);
run('fort: defender in courtyard → attacker', 'no shot', [{ ...bowG, x: 12, y: 15 }, { ...orc, x: 12, y: 4 }], wall);
run('fort: attacker → defender in courtyard', 'no shot', [{ ...bowE, x: 12, y: 4 }, { ...man, x: 12, y: 15 }], wall);
// Turned pieces (a: degrees about the centre).
run('house turned 45° between', 'no shot (shoot)', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'building', house: true, x: 7, y: 7.5, w: 4, h: 3, a: 45 }]);
run('rock beside the line', 'clear shot', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'rock', x: 7, y: 7.1, w: 4, h: 1 }]);
run('the same rock turned 90° into the line', 'no shot (shoot)', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'rock', x: 7, y: 7.1, w: 4, h: 1, a: 90 }]);
run('target behind a wall turned 20°', 'shot, In The Way: wall', [{ ...bowG, x: 4, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'wall', x: 12.75, y: 6, w: 0.5, h: 6, a: 20 }]);
run('shooter touching a wall turned 30°', 'shot, ignores wall', [{ ...bowG, x: 8.34, y: 9 }, { ...orc, x: 14, y: 9 }], [{ k: 'wall', x: 9, y: 6, w: 0.5, h: 6, a: 30 }]);
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.got}${r.ok ? '' : `  (expected ${r.expect})`}`);
// The computer picks its shots with the same check: it never aims at a model the wall hides.
{
  const [a, hid, seen] = table([{ ...bowE, x: 12, y: 4 }, { ...man, x: 12, y: 15 }, { ...man, x: 3, y: 6 }], wall);
  const pick = AI.aiPickShot(a), ok = !!pick && pick.t === seen;
  rows.push({ ok, name: 'AI target', expect: '', got: '' });
  console.log(`${ok ? 'ok  ' : 'FAIL'} AI shoots the man in the open, not the one behind the wall: ${pick ? `${pick.t.name} at y ${pick.t.y}` : 'no shot'}`);
}
// Range from higher ground (p. 40): to the closest part of the target; from below, base to base.
{
  const [up, low] = table([{ ...bowG, x: 6, y: 9 }, { ...orc, x: 16, y: 9 }], [{ k: 'plateau', x: 0, y: 0, w: 7, h: 18, z: 3, sheer: true }]);
  const flat = Math.hypot(up.x - low.x, up.y - low.y) - up.r - low.r, down = R.shotGap(up, low), back = R.shotGap(low, up);
  const ok = Math.abs(down - Math.hypot(flat, 3 - 1.2)) < 0.01 && Math.abs(back - Math.hypot(flat, 3)) < 0.01;
  rows.push({ ok, name: 'range from a 3" cliff', expect: '', got: `down ${down.toFixed(2)}″, up ${back.toFixed(2)}″ (flat ${flat.toFixed(2)}″)` });
  console.log(`${ok ? 'ok  ' : 'FAIL'} range from a 3" cliff: down ${down.toFixed(2)}″, up ${back.toFixed(2)}″ (flat ${flat.toFixed(2)}″)`);
}
const bad = rows.filter(r => !r.ok).length;
console.log(`${rows.length - bad} checks passed, ${bad} failed.`);
process.exitCode = bad ? 1 : 0;
