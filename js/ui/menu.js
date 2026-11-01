// Mission list, mission briefing and result dialogs, and saved progress.
import { G } from '../state.js';
import { rollHistoryHTML } from './logview.js';
import { $ } from '../util.js';
import { MISSIONS, SANDBOX, missionNo, missionOf, asPicked, edorasSide, setEdorasSide } from '../data/missions.js';
import { RULES, MANUAL } from '../data/rules-text.js';
import { newGame, runGame, keepFighting } from '../game/flow.js';
import { resetLessons } from './lessons.js';
import { makeMatch } from '../engine/matched.js';
import { alive } from '../engine/rules.js';
import { openBuilder, showMatchResult } from './army.js';
import { VERSION, STAGE, NOTES, KNOWN_ISSUES } from '../data/version.js';

// Completed missions are stored by title, so reordering the missions keeps the right ones ticked.
const STORE = 'captains-school-v2';
const done = new Set();
try { JSON.parse(localStorage.getItem(STORE) || '[]').forEach(t => done.add(t)); } catch (e) { /* no browser storage */ }
export function markDone(i) { done.add(MISSIONS[i].title); try { localStorage.setItem(STORE, JSON.stringify([...done])); } catch (e) { /* ignore */ } }

// cls: an extra class for the dialog box, e.g. 'wide' for the army builder.
export function dialog(html, cls) { const d = $('#dialog'); d.className = 'dialog' + (cls ? ' ' + cls : ''); d.innerHTML = html; d.onclick = null; d.onchange = null; $('#modal').hidden = false; }
export function closeDialog() { $('#modal').hidden = true; }

// Release notes, newest first, and the known issues of this version.
const SEEN = 'captains-school-seen-version';
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function showNotes() {
  try { localStorage.setItem(SEEN, VERSION); } catch (e) { /* ignore */ }
  $('#whatsNew').classList.remove('fresh');
  const rel = n => `<section class="rel"><h3>${esc(n.title)} <span class="rel-v">${n.version} · ${n.date}</span></h3><ul>${n.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`;
  dialog(`<p class="eyebrow">${STAGE} · v${VERSION}</p><h2>What's new</h2>
    <div class="notes">${NOTES.map(rel).join('')}
    <section class="rel"><h3>Known issues</h3><ul>${KNOWN_ISSUES.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section></div>
    <div class="dlg-actions"><button class="act" type="button" id="notesClose">Close</button></div>`, 'notes-dlg');
  $('#notesClose').onclick = closeDialog;
}

export function initMenu() {
  // Mission rows in the list and the "next mission" card both start a mission (or open the army builder).
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('.mrow'); if (!b) return;
    $('#menu').hidden = true;
    if (b.dataset.matched != null) openBuilder(); else startMission(+b.dataset.i);
  });
  $('#menuClose').addEventListener('click', () => { $('#menu').hidden = true; });
  $('#menuBtn').addEventListener('click', showMenu);
  $('#lessonReset').addEventListener('click', e => { resetLessons(); e.target.textContent = 'Done: every rule will be explained again'; });
  // Version label; "What's new" is marked until the player has opened the notes of this version.
  // What the campaign covers, counted from the mission list (so it stays right as missions are added).
  const main = MISSIONS.filter(m => !m.series), chaps = main.filter(m => m.chapter).map(m => m.chapter), side = MISSIONS.filter(m => m.series === 'E');
  $('#menuScope').innerHTML = `<b>${main.length} missions</b> in ${chaps.length} chapters: ${chaps.join(', ')}. Then the Battle of Edoras (${side.length} scenarios from the starter box, as either side) and matched play with the 2024 army lists.`;
  $('#menuVersion').textContent = `${STAGE} · v${VERSION.split('-')[0]}`;
  let seen = null; try { seen = localStorage.getItem(SEEN); } catch (e) { /* no browser storage */ }
  $('#whatsNew').classList.toggle('fresh', seen !== VERSION);
  $('#whatsNew').addEventListener('click', showNotes);
  // Restart: the same mission, or the same matched play battle (same armies and table, deployed afresh).
  $('#restartBtn').addEventListener('click', () => { if (!G) return; closeDialog(); newGame(G.mi, G.m.matched ? makeMatch(G.m.cfg) : G.m.sandbox || G.m.flipped ? G.m : null); runGame(); });
  // The Menu button in the top bar: Missions, Restart, Options. A choice, a click elsewhere or Esc closes it.
  const tg = $('#menuToggle'), dd = $('#menuDD');
  const openDD = on => { dd.hidden = !on; tg.setAttribute('aria-expanded', on); if (on) dd.querySelector('.dd-item').focus(); };
  tg.addEventListener('click', e => { e.stopPropagation(); openDD(dd.hidden); });
  dd.addEventListener('click', e => { if (e.target.closest('.dd-item')) openDD(false); });
  document.addEventListener('click', e => { if (!dd.hidden && !e.target.closest('.menu-dd')) openDD(false); });
  document.addEventListener('keydown', e => {
    if (dd.hidden) return;
    if (e.key === 'Escape') { e.stopPropagation(); openDD(false); tg.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const it = [...dd.querySelectorAll('.dd-item')], i = it.indexOf(document.activeElement);
      it[(i + (e.key === 'ArrowDown' ? 1 : it.length - 1)) % it.length].focus(); e.preventDefault();
    }
  }, true);
}

// A mission row: number, title and lesson, with a tick once it has been completed.
const missionRow = (m, i) => `<button class="mrow${done.has(m.title) ? ' done' : ''}" type="button" data-i="${i}"><span class="mnum">${missionNo(i)}</span><span class="mtext"><b>${m.title}</b><span>${m.lesson}</span></span><span class="mstate" title="${done.has(m.title) ? 'Completed' : ''}">${done.has(m.title) ? '✓' : ''}</span></button>`;
export function showMenu() {
  // Chapter headings carry the chapter's progress; the list is a grid, so headings span every column.
  const chapters = MISSIONS.map((m, i) => m.chapter ? i : -1).filter(i => i >= 0);
  const chapEnd = i => { const k = chapters.indexOf(i); return k + 1 < chapters.length ? chapters[k + 1] : MISSIONS.length; };
  const progress = i => { const ms = MISSIONS.slice(i, chapEnd(i)); return `<small>${ms.filter(m => done.has(m.title)).length} / ${ms.length}</small>`; };
  $('#mlist').innerHTML = MISSIONS.map((m, i) => `${m.chapter ? `<li class="mchap">${m.chapter}${progress(i)}</li>` : ''}<li>${missionRow(m, i)}</li>`).join('')
    + '<li class="mchap">Matched play</li><li><button class="mrow" type="button" data-matched><span class="mnum">⚔</span><span class="mtext"><b>To the Death!</b><span>Build two armies from the 2024 army lists and fight a battle, Good or Evil</span></span><span class="mstate"></span></button></li>';
  // The next mission to play: the first one not completed yet (or matched play once every mission is done).
  const next = MISSIONS.findIndex(m => !done.has(m.title));
  $('#menuNext').innerHTML = next >= 0
    ? `<button class="mrow" type="button" data-i="${next}"><span class="mlabel">${next === 0 ? 'Start here' : 'Next mission'}</span><span class="mnum">${missionNo(next)}</span><span class="mtext"><b>${MISSIONS[next].title}</b><span>${MISSIONS[next].lesson}</span></span><span class="mstate"></span></button>`
    : '<button class="mrow" type="button" data-matched><span class="mlabel">Every mission completed</span><span class="mnum">⚔</span><span class="mtext"><b>To the Death!</b><span>Matched play: build two armies and fight</span></span><span class="mstate"></span></button>';
  $('#menuClose').hidden = !(G && G.running && !G.over);
  $('#menu').hidden = false;
  $('#menu').scrollTop = 0;
}

// The heroes sandbox (data/missions.js: SANDBOX), opened with ?sandbox in the address: every rule taught so far and every
// Heroic Action, outside the mission list.
export function startSandbox() { startMission(MISSIONS.length - 1, SANDBOX); }
function startMission(i, sandbox) {
  newGame(i, sandbox || asPicked(i));   // the Battle of Edoras from the side the player picked (missions.js: flipSide)
  const m = G.m;
  // The Battle of Edoras: the player commands Rohan or the Hill Tribes; picking the other side sets the table up again.
  const sides = MISSIONS[i].series === 'E' && !sandbox ? `<div class="mp-limit" role="radiogroup" aria-label="Play as"><span>Play as</span>${[['good', 'Rohan'], ['evil', 'Hill Tribes']].map(([k, n]) => `<button type="button" class="tbtn" role="radio" data-side="${k}" aria-checked="${edorasSide() === k}">${n}</button>`).join('')}</div>` : '';
  dialog(`<p class="eyebrow">${sandbox ? 'Practice, not a mission' : missionOf(i)} · ${m.lesson}</p><h2>${m.title}</h2>${sides}<p>${m.intro}</p>
    <p class="goalbox"><b>Objective:</b> ${m.goal}</p>
    <div class="rcards">${m.rules.map(k => `<div><h3>${RULES[k].t}</h3><p>${RULES[k].x}</p><a href="${MANUAL + RULES[k].refs[0][0]}" target="_blank" rel="noopener">Rules Manual: ${RULES[k].refs[0][1]} ↗</a></div>`).join('')}</div>
    <div class="dlg-actions"><button class="act" id="dGo" type="button">Start</button><button class="tbtn" id="dMenu" type="button">Mission list</button></div>`);
  $('#dGo').onclick = () => { closeDialog(); runGame(); };
  $('#dMenu').onclick = () => { closeDialog(); showMenu(); };
  document.querySelectorAll('[data-side]').forEach(b => { b.onclick = () => { if (b.dataset.side === edorasSide()) return; setEdorasSide(b.dataset.side); closeDialog(); startMission(i); }; });
  $('#dGo').focus();
}

export function showResult(r) {
  if (!G || !G.over) return;
  if (G.m.matched) { showMatchResult(r); return; }
  const m = G.m, next = !m.sandbox && G.mi + 1 < MISSIONS.length ? G.mi + 1 : null;
  // Fight on: the battle goes on after the result while both armies still have models (once per game).
  const fightOn = !G.freeplay && ['good', 'evil'].every(s => G.units.some(u => u.side === s && alive(u)));
  const head = G.freeplay ? `<h2 class="result-win">Battle over</h2><p>${r === 'win' ? 'The enemy army is gone.' : 'Your army is gone.'} The mission itself was decided before you fought on.</p>`
    : `<h2 class="${r === 'win' ? 'result-win' : 'result-lose'}">${r === 'win' ? 'Mission complete' : r === 'draw' ? 'A draw' : 'Mission failed'}</h2><p>${m.debrief[r] || m.debrief.lose}</p>`;
  dialog(`<p class="eyebrow">${m.sandbox ? 'Practice' : `Mission ${missionNo(G.mi)}`} · ${m.title}</p>${head}${rollHistoryHTML()}
    <div class="dlg-actions">${r === 'win' && next != null ? '<button class="act" id="rNext" type="button">Next mission</button>' : ''}
    <button class="${r === 'win' && next != null ? 'tbtn' : 'act'}" id="rRetry" type="button">Play again</button>
    ${fightOn ? '<button class="tbtn" id="rFight" type="button" title="Play the battle out: it goes on until one army is gone">Fight on</button>' : ''}
    <button class="tbtn" id="rMenu" type="button">Mission list</button></div>`);
  const fo = $('#rFight'); if (fo) fo.onclick = () => { closeDialog(); keepFighting(); };
  const nx = $('#rNext'); if (nx) nx.onclick = () => { closeDialog(); startMission(next); };
  $('#rRetry').onclick = () => { closeDialog(); newGame(G.mi, m.sandbox || m.flipped ? m : null); runGame(); };
  $('#rMenu').onclick = () => { closeDialog(); showMenu(); };
}
