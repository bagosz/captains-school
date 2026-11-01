// The reference column beside the board (left of it on wide screens, under it on narrow ones): tabs for the dice log,
// the rules (in play now, effects on the table, every rule with a search), the To Wound chart, both armies with their
// state now, and the scenario. Nothing in it covers the board or the orders. The last tab is remembered in this
// browser; a dot on the Log tab counts entries that came in while another tab was open.
// panel.js hands it its helpers (initReference), so the two modules do not import each other.
import { G } from '../state.js';
import { $, esc } from '../util.js';
import { RULES, MANUAL, ruleShort, ruleAliases } from '../data/rules-text.js';
import { taughtIn } from '../data/missions.js';
import { LESSONS } from '../data/lessons.js';
import { alive, casualties, breakPoint } from '../engine/rules.js';
import { active } from '../engine/magic.js';
import { HEROIC } from '../engine/heroes.js';
import { TOKENS } from './status.js';
import { statusIcon } from './tokens.js';

const TAB_KEY = 'captains-school-ref-tab';
const TABS = ['log', 'rules', 'chart', 'armies', 'scenario'];
let tab = 'log', H = null, unread = 0, openRule = null, query = '', allOpen = false, legendOpen = false;
const openSet = new Set();   // rule entries the player opened, kept when the list is drawn again
const cache = {};            // what each pane shows now, so it is only drawn again when that changes

// helpers: { chip, statusOf, rulesInPlay, known, later, renderCard, markChips }
export function initReference(helpers) {
  H = helpers;
  try { const t = localStorage.getItem(TAB_KEY); if (TABS.includes(t)) tab = t; } catch (e) { /* no browser storage */ }
  const bar = $('.ref-tabs');
  bar.addEventListener('click', e => { const b = e.target.closest('.ref-tab'); if (b) setRefTab(b.dataset.tab, true); });
  // Arrow keys move between the tabs, as in any tab list.
  bar.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const vis = [...bar.querySelectorAll('.ref-tab')].filter(b => !b.hidden), i = vis.findIndex(b => b.dataset.tab === tab);
    const n = vis[(i + (e.key === 'ArrowRight' ? 1 : vis.length - 1)) % vis.length];
    setRefTab(n.dataset.tab); n.focus(); e.preventDefault();
  });
  $('#ruleSearch').addEventListener('input', e => { query = e.target.value.trim(); renderRef(); });
  // <details> toggles do not bubble: listen while capturing, and remember what is open.
  $('#refRules').addEventListener('toggle', e => {
    const d = e.target;
    if (d.dataset.group === 'legend') { legendOpen = d.open; return; }
    if (d.dataset.group) { allOpen = d.open; return; }
    const k = d.dataset.rule; if (!k) return;
    if (d.open) openSet.add(k);
    else { openSet.delete(k); if (openRule === k) { openRule = null; H.markChips(null); } }
  }, true);
  // Armies: pointing at a row lights the model on the table and shows its card; a click keeps the card.
  const army = $('#refArmies');
  army.addEventListener('pointerover', e => { const u = rowUnit(e); if (u && G.hoverUnit !== u) { G.hoverUnit = u; H.renderCard(); } });
  army.addEventListener('pointerout', e => { const u = rowUnit(e); if (u && G.hoverUnit === u && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(`[data-u="${u.id}"]`))) { G.hoverUnit = null; H.renderCard(); } });
  army.addEventListener('click', e => { const u = rowUnit(e); if (u) { G.inspect = G.inspect === u ? null : u; H.renderCard(true); renderRef(true); } });
  initFold();
  setRefTab(tab);
}
const rowUnit = e => { const r = e.target.closest('[data-u]'); return r && G ? G.units.find(u => u.id === +r.dataset.u) : null; };

// Folding: on a wide screen the column folds to a narrow rail of tab buttons and the board takes the room (remembered);
// on a phone it is a sheet over the bottom of the screen that a tab button (or a rule chip) slides up, folded at first.
const FOLD_KEY = 'captains-school-ref-fold';
const phone = () => matchMedia('(max-width: 900px)').matches;
let folded = false, sheetOpen = false;
try { folded = localStorage.getItem(FOLD_KEY) === '1'; } catch { /* no browser storage */ }
function applyFold() {
  const main = $('.main'), shut = phone() ? !sheetOpen : folded;
  main.classList.toggle('ref-folded', !phone() && folded);
  main.classList.toggle('sheet-open', phone() && sheetOpen);
  const b = $('#refFold');
  b.setAttribute('aria-expanded', !shut);
  b.title = shut ? 'Open the column' : phone() ? 'Close the sheet' : 'Fold the column (the board gets the room)';
  b.setAttribute('aria-label', b.title);
}
export function setFold(on) {
  if (phone()) sheetOpen = !on;
  else { folded = on; try { localStorage.setItem(FOLD_KEY, on ? '1' : '0'); } catch { /* private window */ } }
  applyFold();
}
const isShut = () => (phone() ? !sheetOpen : folded);
export function initFold() {
  $('#refFold').addEventListener('click', () => setFold(!isShut()));
  matchMedia('(max-width: 900px)').addEventListener('change', applyFold);
  applyFold();
}

export function setRefTab(t, user = false) {
  if (user && isShut()) setFold(false);
  else if (user && t === tab && !isShut()) { setFold(true); return; }   // the open tab again folds the column
  const btn = $(`.ref-tab[data-tab="${t}"]`);
  if (!btn || btn.hidden) t = 'log';
  tab = t;
  for (const b of document.querySelectorAll('.ref-tab')) { const on = b.dataset.tab === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; }
  for (const p of document.querySelectorAll('.ref-pane')) p.hidden = p.id !== `pane-${t}`;
  try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* ignore */ }
  if (t === 'log') { unread = 0; showUnread(); }
  if (t === 'rules') { newRules = 0; showNewRules(); }
  renderRef(true);
}

// A new game: nothing unread, the entries folded again.
export function resetRef() { unread = 0; showUnread(); newRules = 0; showNewRules(); openRule = null; openSet.clear(); allOpen = false; for (const k in cache) delete cache[k]; renderRef(true); }

// A log entry came in (panel.js: log): counted on the Log tab while another tab is open.
export function noteLog() { if (tab !== 'log') { unread++; showUnread(); } }
// Rules that came into play for the first time this game (panel.js): counted on the Rules tab until it is opened.
let newRules = 0;
export function noteRules(n) { if (n && (tab !== 'rules' || isShut())) { newRules += n; showNewRules(); } }
function showNewRules() { const n = $('#rulesNew'); if (!n) return; n.hidden = !newRules; n.textContent = newRules > 9 ? '9+' : String(newRules); }
function showUnread() { const n = $('#logNew'); if (!n) return; n.hidden = !unread; n.textContent = unread > 9 ? '9+' : String(unread); }

// The To Wound tab shows once the player has met To Wound rolls, or always on Full table (panel.js: applyDetail).
export function showChartTab(on) {
  $('#tab-chart').hidden = !on;
  if (!on && tab === 'chart') setRefTab('log');
}

// A rule chip was clicked: open its entry in the Rules tab, or close it if it is the one open. Returns the open rule.
export function openRuleRef(k) {
  if (openRule === k && tab === 'rules') { openRule = null; openSet.delete(k); renderRef(true); return null; }
  openRule = k; openSet.add(k);
  if (query) { query = ''; $('#ruleSearch').value = ''; }
  if (!H.rulesInPlay().includes(k)) allOpen = true;
  if (isShut()) setFold(false);
  setRefTab('rules');
  // A plain jump to the entry (in the open column, or the sheet on a phone).
  const el = document.querySelector(`#refRules details[data-rule="${k}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
  return k;
}
export function closeRuleRef() { if (openRule) { openSet.delete(openRule); openRule = null; renderRef(true); } }

/* ---------- Drawing the open pane ---------- */
export function renderRef(force) {
  if (!H) return;
  const pane = { rules: ['#refRules', rulesHTML], armies: ['#refArmies', armiesHTML], scenario: ['#refScenario', scenarioHTML] }[tab];
  if (!pane) return;
  const [sel, fn] = pane, out = fn();
  if (!force && cache[tab] === out) return;
  cache[tab] = out;
  const el = $(sel), top = el.closest('.logbox').scrollTop;
  el.innerHTML = out;
  el.closest('.logbox').scrollTop = top;   // drawing again keeps the place the player scrolled to
}

const unit = id => G.units.find(u => u.id === id);
const later = k => H.later(k);

// One rule: its title and short text; open, the full text, the step-by-step popup and the Rules Manual links.
function ruleItem(k) {
  const r = RULES[k], met = H.known(k);
  return `<details class="rref${met ? '' : ' later'}${openRule === k ? ' hit' : ''}" data-rule="${k}"${openSet.has(k) ? ' open' : ''}>`
    + `<summary><b>${r.t}</b>${met ? '' : ` <span class="rmis">${later(k)}</span>`}<span class="rshort">${esc(ruleShort(k))}</span></summary>`
    + `<div class="rbody"><p>${r.x}</p>${met ? '' : `<p class="rc-later">The app handles this for you; ${later(k)} teaches it.</p>`}`
    + `${LESSONS[k] ? `<p><button class="linkbtn" type="button" data-lesson="${k}">How it works, step by step</button></p>` : ''}`
    + `<p class="rc-links">${r.refs.map(([p, label]) => `<a href="${MANUAL + p}" target="_blank" rel="noopener">Rules Manual: ${label} ↗</a>`).join('')}</p></div></details>`;
}
// Every rule, the ones met first in the order the missions teach them, then the rest.
const ALL = () => Object.keys(RULES).sort((a, b) => {
  const ta = taughtIn(a), tb = taughtIn(b), ka = H.known(a) ? 0 : 1, kb = H.known(b) ? 0 : 1;
  return ka - kb || (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb) || RULES[a].t.localeCompare(RULES[b].t);
});
const matches = (k, q) => {
  const r = RULES[k], hay = [r.t, ...ruleAliases(k), ruleShort(k), r.x].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
};
// What the rims, status tokens and pips on the models mean. The icons are drawn by the same code as on the table.
let icons = null;
function legendHTML() {
  if (!icons) icons = Object.fromEntries(Object.entries(TOKENS).map(([k, t]) => [k, statusIcon({ k, ...t }, 28)]));
  const rows = Object.entries(TOKENS).map(([k, t]) => `<li><img class="tok-ic" src="${icons[k]}" alt="" width="28" height="28"><span><b>${esc(t.n)}</b>: ${esc(t.what)}${t.lvl === 'full' ? ' (shown on Full table)' : ''}. ${H.chip(t.rule)}</span></li>`).join('');
  return `<details class="rgroup" data-group="legend"${legendOpen ? ' open' : ''}><summary class="rgh">On the models</summary>
    <ul class="legend">
      <li><span class="rim-ic"></span><span><b>Bright base</b>: it may act now; a faded one has done what it can in this step.</span></li>
      <li><span class="rim-ic eng"></span><span><b>Orange ring</b>: Engaged in Combat.</span></li>
      <li><span class="pip-ic"></span><span><b>Gold pips</b> on the rim: Wounds left; brown ones beside them: the mount's.</span></li>
      <li><span class="pip-ic mwf"></span><span><b>Pips under a Hero</b>: Might (orange), Will (blue) and Fate (green) left. ${H.chip('might')}</span></li>
      ${rows}
      <li><span class="tok-plus">+3</span><span>When a base is small on screen its tokens fold into one badge: zoom in, or point at it.</span></li>
    </ul><p class="muted-inline">Point at a token on the table for its rule. The enemy's Heroic Actions show as tokens from Standard detail on; Effects above lists them always.</p></details>`;
}
function rulesHTML() {
  if (query) {
    const hits = ALL().filter(k => matches(k, query));
    return `<p class="rgh">${hits.length ? `${hits.length} rule${hits.length === 1 ? '' : 's'} match` : 'No rule matches'} "${esc(query)}"</p>${hits.map(ruleItem).join('')}`;
  }
  const now = G && G.running && !G.over ? H.rulesInPlay() : [];
  const all = ALL();
  return (now.length ? `<h4 class="rgh">In play now</h4>${now.map(ruleItem).join('')}` : '')
    + effectsHTML()
    + legendHTML()
    + `<details class="rgroup" data-group="all"${allOpen || !now.length ? ' open' : ''}><summary class="rgh">All rules (${all.length})</summary>${all.map(ruleItem).join('')}</details>`;
}
// What is in play on the table beyond the rules themselves: spells, Heroic Actions declared, challenges, Broken armies.
function effectsHTML() {
  if (!G || !G.running) return '';
  const items = [], who = side => (side === 'good' ? 'yours' : 'enemy');
  for (const s of active()) {
    const by = unit(s.by), t = s.t != null ? unit(s.t) : null;
    if (!by) continue;
    items.push(`<li><b>${esc(s.p)}</b> by ${esc(by.name)}${t && t !== by ? ` on ${esc(t.name)}` : ''}: ${s.dur === 'temporary' ? 'until the End phase' : 'while the caster has Will'}</li>`);
  }
  for (const u of G.units.filter(alive)) for (const ph of ['move', 'shoot', 'fight']) {
    const k = u.decl && u.decl[ph];
    if (k && HEROIC[k]) items.push(`<li><b>${HEROIC[k].n}</b>: ${esc(u.name)} (${who(u.side)}), this turn</li>`);
  }
  for (const c of G.challenges || []) {
    const a = unit(c.a), t = unit(c.t);
    if (a && t && alive(a) && alive(t)) items.push(`<li><b>Heroic Challenge</b>: ${esc(a.name)} against ${esc(t.name)}${c.acc ? ', accepted' : c.acc === false ? ', declined' : ''}</li>`);
  }
  if (G.broken) for (const s of ['good', 'evil']) if (G.broken[s]) items.push(`<li><b>Broken army</b>: ${s === 'good' ? 'yours' : 'the enemy\'s'}; its models take a Courage Test as they Activate</li>`);
  return items.length ? `<h4 class="rgh">Effects on the table</h4><ul class="effects">${items.join('')}</ul>` : '';
}

// Both armies as they stand: models left against the Break Point, each model's Wounds, Might/Will/Fate and state, and
// the models that are gone.
function armiesHTML() {
  if (!G || !G.units) return '';
  return ['good', 'evil'].map(side => {
    const us = G.units.filter(u => u.side === side), live = us.filter(alive), gone = us.filter(u => !alive(u));
    live.sort((a, b) => (b.mwf ? 1 : 0) - (a.mwf ? 1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const bp = breakPoint(side), start = G.start ? G.start[side] : us.length, lost = casualties(side);
    const broken = G.broken && G.broken[side];
    const head = `<h4 class="army-h"><span class="side-tag ${side}">${side === 'good' ? 'Yours' : 'Enemy'}</span>${G.m.armies && G.m.armies[side] ? esc(G.m.armies[side].name) : side === 'good' ? 'Your army' : 'The enemy'}${broken ? ' <span class="broken-tag">Broken</span>' : ''}</h4>`;
    // The Break Point only once the player has met Broken armies (a mission before that does not play them).
    const sum = `<p class="army-sum">${live.length} on the table · lost ${lost} of ${start}${Number.isFinite(bp) && bp < start && H.known('broken') && G.broken ? ` · Broken at ${Math.floor(bp) + 1} lost` : ''}</p>`;
    const rows = live.map(u => {
      const bits = [];
      if (u.maxW > 1 || u.w < u.maxW) bits.push(`Wounds ${u.w}/${u.maxW}`);
      if (u.mwf) bits.push(`M/W/F ${u.might}/${u.will}/${u.fate}`);
      const st = H.statusOf(u).filter(x => x.s !== 'moved');
      return `<li class="urow${G.inspect === u ? ' on' : ''}" data-u="${u.id}"><span class="uname">${esc(u.name)}</span>${bits.length ? `<span class="ubits">${bits.join(' · ')}</span>` : ''}`
        + `${st.length ? `<span class="ust">${st.map(x => `<span title="${esc(x.t)}">${esc(x.s)}</span>`).join(' · ')}</span>` : ''}</li>`;
    }).join('');
    const out = gone.length ? `<details class="removed"><summary>Removed (${gone.length})</summary><ul>${gone.map(u => `<li>${esc(u.name)}: ${u.gone ? (u.fled ? 'fled' : 'escaped') : 'slain'}</li>`).join('')}</ul></details>` : '';
    return `<section class="army">${head}${sum}<ul class="units">${rows}</ul>${out}</section>`;
  }).join('');
}

// The scenario: the briefing, the rules this mission is about, and in matched play the Victory Points so far. The
// objective and the status stay in the mission card below the column.
function scenarioHTML() {
  if (!G || !G.m) return '';
  const m = G.m, keys = [...new Set([...(m.rules || []), ...(m.also || [])])].filter(k => RULES[k]);
  let vp = '';
  if (m.score) {
    const S = m.score();
    vp = `<h4 class="rgh">Victory Points if the battle ended now</h4>` + ['good', 'evil'].map(s => `<p class="vp-h"><span class="side-tag ${s}">${s === 'good' ? 'Yours' : 'Enemy'}</span> <b>${S[s].total}</b></p>`
      + `<ul class="vp">${S[s].rows.map(r => `<li${r.n ? '' : ' class="zero"'}><span>${esc(r.label)}</span><b>${r.n}</b></li>`).join('')}</ul>`).join('');
  }
  return `${m.goal ? `<h4 class="rgh">Objective</h4><p class="brief">${esc(m.goal)}</p>` : ''}${m.intro ? `<h4 class="rgh">Briefing</h4><p class="brief">${esc(m.intro)}</p>` : ''}${m.tip ? `<h4 class="rgh">Tip</h4><p class="brief">${esc(m.tip)}</p>` : ''}`
    + `${keys.length ? `<h4 class="rgh">${m.matched ? 'Rules of this battle' : 'Rules of this mission'}</h4><ul class="mrules">${keys.map(k => `<li>${H.chip(k)}<span>${esc(ruleShort(k))}</span></li>`).join('')}</ul>` : ''}`
    + vp;
}

export const refTab = () => tab;   // the open tab, for checks in the browser
