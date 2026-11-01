// Entry point: wires the modules together and runs the render loop.
import { G, waiter } from './state.js';
import { $ } from './util.js';
import { buildChart, initPanel, updateHint, setAction } from './ui/panel.js';
import { tray } from './ui/tray.js';
import { initInput } from './ui/input.js';
import { initMenu, showMenu, startSandbox } from './ui/menu.js';
import { newGame, resolveWaiter } from './game/flow.js';
import { fit, draw, rebuildBackground } from './ui/board.js';
import { loadTokenArt } from './ui/tokens.js';
import { initLessons, coach } from './ui/lessons.js';
import { initSound, setMusic } from './ui/audio.js';
import { initColumns } from './ui/columns.js';
import { initOptions } from './ui/options.js';

buildChart();
tray.init();
// While the tray waits for the player to throw a dice, the orders say so (and the idle action button points to the tray).
tray.onAsk = a => { if (!G) return; G.throwing = a; updateHint(); if (!waiter) setAction(null); if (a) coach('throw'); };
// A banner re-roll: the dice the player clicks in the tray answers the game's wait.
tray.onPick = ref => { if (G && (G.mode === 'reroll' || G.mode === 'might')) resolveWaiter(ref); };
initPanel();
initInput();
initMenu();
initLessons();
initSound();
initColumns();
initOptions();
newGame(0);
// ?sandbox in the address opens the heroes sandbox (data/missions.js) instead of the mission list.
if (/[?&]sandbox\b/.test(location.search)) startSandbox(); else showMenu();

new ResizeObserver(() => fit()).observe($('#boardwrap'));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (G) rebuildBackground(); });
loadTokenArt(() => rebuildBackground());

// The battle music plays while a mission runs (at full strength in the Fight phase), 'Before the battle' in menus and briefings.
const musicMood = () => G && G.running && !G.over && $('#menu').hidden ? 'battle' : 'eve';

function loop(now) {
  try { draw(now); tray.draw(now); setMusic(musicMood(), G && G.phase === 'fight' ? 2 : 1); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
