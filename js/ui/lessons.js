// "New rule" popups. The first time a rule comes into play in the whole game, the game pauses and a popup explains
// how the rule works and how to use it, with a line about the situation on the table. Lessons already seen are
// remembered in the browser, so later missions skip them. Only rules the current mission has taught get a popup;
// rules the app still handles for the player keep their muted chips instead.
import { G, gen, ABORT, showsAtLeast } from '../state.js';
import { $ } from '../util.js';
import { LESSONS } from '../data/lessons.js';
import { inPlay, taughtIn, missionNo } from '../data/missions.js';
import { RULES, MANUAL } from '../data/rules-text.js';
import { sfx } from './audio.js';

const LESSON_KEY = 'captains-school-lessons-v1';
const seenLessons = new Set();
try { JSON.parse(localStorage.getItem(LESSON_KEY) || '[]').forEach(k => seenLessons.add(k)); } catch (e) { /* no browser storage */ }
function saveSeen() { try { localStorage.setItem(LESSON_KEY, JSON.stringify([...seenLessons])); } catch (e) { /* ignore */ } }
export function resetLessons() { seenLessons.clear(); saveSeen(); }

let lesson = null;   // the open popup: { keys, i, ctx, done }

// Whether rule k is in play here (data/missions.js: inPlay, the same test as for the rule chips).
const met = k => inPlay(k, G);

// Shows the lessons among `keys` that the current mission has taught and the player has never seen.
// A lesson that is a later step of a rule (`of`, such as the banner re-roll) is taught where that rule is.
// Resolves when the popup is closed (at once if there is nothing new). ctx feeds the "Right now" line.
// Rules an earlier mission teaches that the player meets here without having seen them (it skipped that mission, or
// plays the sandbox or matched play): two or more at once become one recap card with a line each, not a popup each.
export function teach(keys, ctx) {
  if (!G) return Promise.resolve();
  const todo = keys.filter(k => LESSONS[k] && met(LESSONS[k].of || k) && !seenLessons.has(k));
  if (!todo.length) return Promise.resolve();
  todo.forEach(k => seenLessons.add(k));
  saveSeen();
  const skipped = todo.filter(k => fromEarlier(LESSONS[k].of || k));
  return openLesson(skipped.length >= 2 ? [{ recap: skipped }, ...todo.filter(k => !skipped.includes(k))] : todo, ctx);
}
const fromEarlier = k => { const i = taughtIn(k); return i >= 0 && (G.m.sandbox || G.m.matched || i < G.mi); };

// Shows lessons whether or not they were seen (the "step by step" button on a rule card uses this), each followed by
// its later steps. Rejects with ABORT if a new game started meanwhile, like the other waits in the game flow.
export function showLesson(keys, ctx) {
  return openLesson(keys.flatMap(k => [k, ...Object.keys(LESSONS).filter(x => LESSONS[x].of === k)]), ctx);
}
function openLesson(keys, ctx) {
  closeLesson();
  const g = gen;
  return new Promise((res, rej) => {
    lesson = { keys, i: 0, ctx, done: () => (g === gen ? res() : rej(ABORT)) };
    sfx.lesson();
    render();
  });
}
export function closeLesson() {
  if (!lesson) return;
  const l = lesson;
  lesson = null;
  $('#lesson').hidden = true;
  l.done();
}

const titleOf = k => (k.recap ? 'Rules from earlier missions' : LESSONS[k].t);
// The recap card: one line per rule (the lesson's lead), each opening to its "How it works" list in place.
function renderRecap(keys, i, n) {
  const items = keys.map(k => {
    const L = LESSONS[k], m = taughtIn(L.of || k);
    return `<li><details><summary><b>${L.t}</b>${m >= 0 ? ` <span class="rmis">mission ${missionNo(m)}</span>` : ''}<br>${L.lead}</summary><ul>${L.how.map(x => `<li>${x}</li>`).join('')}</ul></details></li>`;
  }).join('');
  $('#lessonBox').innerHTML = `<p class="eyebrow">New rules${n > 1 ? ` · ${i + 1} of ${n}` : ''}</p>
    <h2 id="lessonTitle">Rules from earlier missions</h2>
    <p class="lead">The missions that teach these come before this one. A line each; click one for how it works.</p>
    <ul class="recap">${items}</ul>
    <div class="dlg-actions"><button class="act" id="lNext" type="button">${i === n - 1 ? 'Got it' : `Next: ${titleOf(lesson.keys[i + 1])}`}</button></div>
    <p class="lfoot">Each rule's chip opens its card later, with the full explanation step by step.</p>`;
  $('#lesson').hidden = false;
  $('#lessonBox').scrollTop = 0;
  $('#lNext').focus({ preventScroll: true });
}

function render() {
  const { keys, i, ctx } = lesson, k = keys[i];
  if (k.recap) { renderRecap(k.recap, i, keys.length); return; }
  const L = LESSONS[k], last = i === keys.length - 1;
  const ref = RULES[L.rule] && RULES[L.rule].refs[0];
  let now = '', click = [];
  try { now = L.now ? L.now(ctx) : ''; } catch (e) { now = ''; }
  try { click = (typeof L.click === 'function' ? L.click(ctx) : L.click) || []; } catch (e) { click = []; }
  const next = last ? 'Got it' : `Next: ${titleOf(keys[i + 1])}`;
  $('#lessonBox').innerHTML = `<p class="eyebrow">New rule${keys.length > 1 ? ` · ${i + 1} of ${keys.length}` : ''}</p>
    <h2 id="lessonTitle">${L.t}</h2>
    <p class="lead">${L.lead}</p>
    ${now ? `<p class="lnow"><b>Right now:</b> ${now}</p>` : ''}
    ${click.length ? `<section class="lclick"><h3>Do this</h3>${click.length > 1 ? `<ol>${click.map(x => `<li>${x}</li>`).join('')}</ol>` : `<p>${click[0]}</p>`}
      <p class="lclick-foot">The orders above the main button always say what to click next.</p></section>` : !now && L.use.length ? `<section class="lclick"><h3>Do this</h3><p>${L.use[0]}</p></section>` : ''}
    ${L.fig ? `<figure class="lfig">${L.fig}</figure>` : ''}
    <details class="lmore"${showsAtLeast('full') ? ' open' : ''}><summary>More: how it works${L.use.length ? ' and how to use it' : ''}</summary>
      <h3>How it works</h3><ul>${L.how.map(x => `<li>${x}</li>`).join('')}</ul>
      ${L.use.length ? `<h3>How to use it</h3><ul>${L.use.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}</details>
    <div class="dlg-actions"><button class="act" id="lNext" type="button">${next}</button>
      ${ref ? `<a class="lref" href="${MANUAL + ref[0]}" target="_blank" rel="noopener">Rules Manual: ${ref[1]} ↗</a>` : ''}</div>
    <p class="lfoot">This explanation appears once. Click a rule chip later to read it again.</p>`;
  $('#lesson').hidden = false;
  $('#lessonBox').scrollTop = 0;
  $('#lNext').focus({ preventScroll: true });
}

/* ---------- First clicks: the control that matters pulses ---------- */
// The first time the player has to use a new control (Pairing Off on the table, the Shield button, a banner re-roll in
// the dice tray…), that control pulses for a few seconds. Call it after the lesson popup for the moment has closed.
// Remembered with the lessons, so "Show these popups again" brings the pulses back too.
const COACH = {
  priority: ['#act', '#prio'], choose: ['#act', '#act2'], throw: ['#trayGo'],
  pair: ['#board'], order: ['#hChoices'], cross: ['#hPrev'], shield: ['#act2'], reroll: ['.tray-felt', '#act'], backaway: ['#board'], strike: ['#board'],
};
const pulsing = new Map();   // element -> timer that ends its pulse
export function coach(key) {
  const k = `click:${key}`;
  if (!COACH[key] || seenLessons.has(k)) return;
  seenLessons.add(k);
  saveSeen();
  for (const sel of COACH[key]) {
    const el = document.querySelector(sel); if (!el) continue;
    const off = () => { el.classList.remove('coach'); clearTimeout(pulsing.get(el)); pulsing.delete(el); };
    off();
    void el.offsetWidth;   // restart the animation
    el.classList.add('coach');
    pulsing.set(el, setTimeout(off, 7000));
    el.addEventListener('pointerdown', off, { once: true });
  }
}

export function initLessons() {
  $('#lesson').addEventListener('click', e => {
    if (!lesson || !e.target.closest('#lNext')) return;
    if (lesson.i < lesson.keys.length - 1) { lesson.i++; render(); } else closeLesson();
  });
  document.addEventListener('keydown', e => { if (lesson && e.key === 'Escape') { e.stopPropagation(); closeLesson(); } }, true);
}
