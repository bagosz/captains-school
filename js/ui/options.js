// The Options dialog: the detail level, odds, the archer's ruler, dice, the steps the app may play for the player (or the whole side),
// music and sounds. Switches are kept in the browser (prefs in state.js; the tray and the sound keep their own).
// Changing a switch while the game waits for the player takes effect at once (optionsChanged in game/flow.js).
import { prefs, setPref } from '../state.js';
import { $ } from '../util.js';
import { optionsChanged } from '../game/flow.js';
import { applyDetail } from './panel.js';

// Checkbox id -> preference key.
const OPT_IDS = { oddsOpt: 'odds', rulerOpt: 'ruler', autoRollOpt: 'autoRoll', autoPairOpt: 'autoPair', autoBackOpt: 'autoBack', autoWayOpt: 'autoWay', autoplayOpt: 'autoplay' };

export function initOptions() {
  for (const [id, k] of Object.entries(OPT_IDS)) {
    const box = $('#' + id);
    box.checked = prefs[k];
    box.addEventListener('change', () => { setPref(k, box.checked); showAutoTag(); optionsChanged(); });
  }
  // Detail level (state.js: DETAIL): three radio buttons; the panel shows or folds its parts at once.
  for (const r of document.querySelectorAll('input[name=detail]')) {
    r.checked = r.value === prefs.detail;
    r.addEventListener('change', () => { if (r.checked) { setPref('detail', r.value); applyDetail(); } });
  }
  $('#optionsBtn').addEventListener('click', openOptions);
  $('#menuOptions').addEventListener('click', openOptions);
  $('#trayOptions').addEventListener('click', openOptions);
  $('#optClose').addEventListener('click', closeOptions);
  $('#options').addEventListener('click', e => { if (e.target === e.currentTarget) closeOptions(); });
  // The tag in the top bar hands the game back to the player.
  $('#autoTag').addEventListener('click', () => { setPref('autoplay', false); $('#autoplayOpt').checked = false; showAutoTag(); optionsChanged(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#options').hidden) { e.stopPropagation(); closeOptions(); } }, true);
  showAutoTag();
}

export function openOptions() {
  $('#options').hidden = false;
  $('#optClose').focus({ preventScroll: true });
}
export function closeOptions() { $('#options').hidden = true; }

function showAutoTag() { $('#autoTag').hidden = !prefs.autoplay; }
