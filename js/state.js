// Shared mutable state. Other modules import these as live bindings,
// so they always see the current game even after a restart.
export let G = null;        // the current game, created by newGame() in game/flow.js
export let gen = 0;         // bumps on every new game; stale async work compares against it
export let waiter = null;   // the player action the game flow is waiting for: { res, rej, label, second, off }
// A wait that starts while another is pending (a question in the middle of the player's move or shooting: Might on a
// Jump Test, a Hero's shout) goes on top; the one below comes back once it is answered.
const below = [];
export const ABORT = { abort: true };

// Player preferences kept in the browser (the Options dialog, js/ui/options.js).
// odds: show percentages (chance to win a fight, to wound) on the board and panel.
// ruler: while a model with a bow is moved, lines of fire from the planned spot (the archer's ruler).
// autoPair, autoBack, autoWay: the app Pairs Off, Backs Away and Makes Way for the player even after those rules are taught.
// autoRoll: dice are thrown without pressing Roll, all at once; a banner re-roll picks the best dice itself.
// autoplay: the computer takes every decision for the player's side.
// detail: how much the screen shows at once (DETAIL, least first). Guided keeps to the essentials with the rest a click
// away; Full table shows everything a player at the table can see. Read it with showsAtLeast(), not by comparing names.
const OPT_KEY = 'captains-school-options';
const ODDS_KEY = 'captains-school-odds';   // the old key of Show odds, read once so the choice carries over
export const DETAIL = ['guided', 'standard', 'full'];
export const prefs = { detail: 'guided', odds: false, ruler: true, autoPair: false, autoBack: false, autoWay: false, autoRoll: false, autoplay: false };
try {
  const saved = JSON.parse(localStorage.getItem(OPT_KEY) || 'null');
  if (saved) {
    for (const k of Object.keys(prefs)) if (typeof saved[k] === 'boolean' && typeof prefs[k] === 'boolean') prefs[k] = saved[k];
    if (DETAIL.includes(saved.detail)) prefs.detail = saved.detail;
  }
  else prefs.odds = localStorage.getItem(ODDS_KEY) === 'on';
} catch (e) { /* no browser storage (or the balance tool) */ }
function savePrefs() { try { localStorage.setItem(OPT_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
export function setPref(k, v) { prefs[k] = k === 'detail' ? (DETAIL.includes(v) ? v : prefs.detail) : !!v; savePrefs(); }
// Whether the chosen detail level is at least lvl ('guided' is always true, 'full' only on Full table).
export const showsAtLeast = lvl => DETAIL.indexOf(prefs.detail) >= DETAIL.indexOf(lvl);
export function setOdds(on) { setPref('odds', on); }

export function setG(g) { G = g; }
export function setWaiter(w) { if (w && waiter) below.push(waiter); waiter = w || below.pop() || null; }

// Cancels everything in flight: pending waits reject with ABORT.
export function abortFlow() {
  gen++;
  const all = [waiter, ...below.splice(0)];
  waiter = null;
  for (const w of all) if (w) w.rej(ABORT);
}

export function sleep(ms) {
  const g = gen;
  return new Promise((res, rej) => setTimeout(() => (g === gen ? res() : rej(ABORT)), ms));
}
