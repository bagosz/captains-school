// The dice log, drawn from the records of the battle (panel.js: log() keeps them in G.record): one icon-led line per
// event in its side's colour, grouped by turn and phase, newest first, the turns before the current one folded. A
// click on a line opens it: the whole text, every dice, the modifiers, the rules (chips), and the models it names
// light up on the table. Filters: All, Rolls, Mine. Automatic steps (the rules made them happen) carry "auto".
// rollHistoryHTML() lists every roll of the battle for the end screen.
import { G } from '../state.js';
import { $, esc } from '../util.js';
import { linkTerms } from './terms.js';

const FILTER_KEY = 'captains-school-log-filter';
const FILTERS = { all: 'All', rolls: 'Rolls', mine: 'Mine' };
let H = null, filter = 'all', openLines = new Set(), openTurns = new Set(), shownTurn = null, newest = -1;

// The line's text: its first sentence, cut at a word near 120 characters (the whole text is in the open line).
const firstSentence = t => {
  const m = /^(.+?[.!?])(?=\s+[A-Z"(]|$)/.exec(t || ''), s = m ? m[1] : t || '';
  return s.length <= 130 ? s : s.slice(0, s.lastIndexOf(' ', 120)) + ' …';
};
const keep = r => filter === 'all' || (filter === 'rolls' ? r.kind === 'roll' : r.side === 'good');

// helpers: { records, chip, diceHTML }
export function initLog(helpers) {
  H = helpers;
  try { const f = localStorage.getItem(FILTER_KEY); if (FILTERS[f]) filter = f; } catch { /* no browser storage */ }
  const bar = $('#logFilters');
  bar.innerHTML = Object.entries(FILTERS).map(([k, n]) => `<button class="lf" type="button" data-lf="${k}" aria-pressed="${k === filter}">${n}</button>`).join('');
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-lf]'); if (!b) return;
    filter = b.dataset.lf;
    try { localStorage.setItem(FILTER_KEY, filter); } catch { /* private window */ }
    bar.querySelectorAll('[data-lf]').forEach(x => x.setAttribute('aria-pressed', x.dataset.lf === filter));
    renderLog(true);
  });
  const box = $('#log');
  box.addEventListener('click', e => {
    if (e.target.closest('.rchip, .term, a')) return;
    const s = e.target.closest('.lsum'); if (!s) return;
    const line = s.closest('.lline'), n = +line.dataset.n, on = !openLines.has(n);
    if (on) openLines.add(n); else openLines.delete(n);
    line.classList.toggle('open', on); s.setAttribute('aria-expanded', on);
    line.querySelector('.ldet').hidden = !on;
    if (on) flashUnits(H.records()[n]);
  });
  // A folded turn is drawn when it is opened.
  box.addEventListener('toggle', e => {
    const d = e.target; if (!d.classList || !d.classList.contains('lturn')) return;
    const t = +d.dataset.turn;
    if (d.open) { openTurns.add(t); if (!d.dataset.drawn) { d.querySelector('.lbody').innerHTML = turnHTML(t); d.dataset.drawn = '1'; linkTerms(d.querySelector('.lbody')); } }
    else openTurns.delete(t);
  }, true);
}
export function resetLog() { openLines = new Set(); openTurns = new Set(); shownTurn = null; newest = -1; renderLog(true); }

// The models a line names light up on the table for a moment (board.js draws G.logFlash).
function flashUnits(r) {
  if (!r || !G || !r.units.length) return;
  G.logFlash = { ids: r.units, t: performance.now() };
}

function lineHTML(r) {
  const open = openLines.has(r.n), short = firstSentence(r.text), top = r.dice.flatMap(g => g.d.map(d => d.v));
  const icon = r.kind === 'roll' ? `<span class="lic die">${top.length ? Math.max(...top) : ''}</span>` : `<span class="lic dot"></span>`;
  const more = short !== r.text || r.dice.length || r.why.length || r.mods.length;
  const det = `<div class="ldet"${open ? '' : ' hidden'}>${short !== r.text ? `<p class="ltxt">${esc(r.text)}</p>` : ''}${r.dice.length ? `<div class="dice">${H.diceHTML(r.dice)}</div>` : ''}${r.mods.length ? `<p class="lmods">${r.mods.map(m => esc(`${m.v > 0 ? '+' : ''}${m.v} ${m.t || m.why || ''}`)).join(', ')}</p>` : ''}${r.why.length ? `<div class="chips">${r.why.map(H.chip).join('')}</div>` : ''}</div>`;
  return `<div class="lline${r.tone ? ' t-' + r.tone : ''}${r.side ? ' s-' + r.side : ''}${open ? ' open' : ''}${r.n === newest ? ' fresh' : ''}" data-n="${r.n}">`
    + `<button class="lsum" type="button" aria-expanded="${open}"${more ? '' : ' data-plain="1"'}>${icon}<span class="lshort">${esc(short)}</span>${r.auto ? '<span class="lauto" title="The rules made this happen on their own">auto</span>' : ''}${top.length && r.kind === 'roll' ? `<span class="ldice">${top.slice(0, 8).join(' ')}${top.length > 8 ? ' …' : ''}</span>` : ''}</button>${det}</div>`;
}
function turnHTML(t) {
  const rs = H.records().filter(r => r.turn === t && keep(r)).reverse();
  if (!rs.length) return '<p class="log-empty">Nothing here with this filter.</p>';
  let out = '', ph = null;
  for (const r of rs) {
    if (r.ph !== ph) { ph = r.ph; out += `<p class="lph">${esc(ph || 'Turn')}</p>`; }
    out += lineHTML(r);
  }
  return out;
}

// Draws the log again. Only the current turn is redrawn when a line comes in; a folded turn is drawn when opened.
export function renderLog(force) {
  if (!H) return;
  const box = $('#log'), rs = H.records();
  if (!rs.length) { box.innerHTML = '<p class="log-empty">Every dice roll appears here, one line each: click a line for its dice and rules.</p>'; return; }
  newest = rs[rs.length - 1].n;
  const cur = rs[rs.length - 1].turn;
  if (force || shownTurn !== cur || !box.querySelector(`.lturn[data-turn="${cur}"]`)) {
    const turns = [...new Set(rs.map(r => r.turn))].sort((a, b) => b - a);
    box.innerHTML = turns.map(t => {
      const open = t === cur || openTurns.has(t), n = rs.filter(r => r.turn === t && keep(r)).length;
      return `<details class="lturn" data-turn="${t}"${open ? ' open data-drawn="1"' : ''}><summary>${t ? `Turn ${t}` : 'Before the battle'} <span class="lcount">${n}</span></summary><div class="lbody">${open ? turnHTML(t) : ''}</div></details>`;
    }).join('');
    shownTurn = cur;
    box.querySelectorAll('.lturn[open] .lbody').forEach(b => linkTerms(b));
    return;
  }
  const d = box.querySelector(`.lturn[data-turn="${cur}"]`), body = d.querySelector('.lbody');
  body.innerHTML = turnHTML(cur);
  d.querySelector('.lcount').textContent = rs.filter(r => r.turn === cur && keep(r)).length;
  linkTerms(body);
}

// Every roll of the battle, for the end screen: how the dice fell for each side, then each roll by turn.
export function rollHistoryHTML() {
  const rs = (G && G.record || []).filter(r => r.kind === 'roll');
  if (!rs.length) return '';
  const st = { good: [], evil: [] };
  for (const r of rs) for (const g of r.dice) {
    const side = /^(you|yours|your)\b/i.test(g.l) ? 'good' : /^(enemy|theirs|the enemy)\b/i.test(g.l) ? 'evil' : r.side;
    if (st[side]) st[side].push(...g.d.map(d => d.v).filter(v => v >= 1 && v <= 6));
  }
  const sum = (s, label) => { const v = st[s]; if (!v.length) return ''; const avg = v.reduce((a, b) => a + b, 0) / v.length; return `<tr><td>${label}</td><td>${v.length}</td><td>${avg.toFixed(2)}</td><td>${v.filter(x => x === 6).length}</td><td>${v.filter(x => x === 1).length}</td></tr>`; };
  const byTurn = [...new Set(rs.map(r => r.turn))].map(t => `<p class="lph">Turn ${t}</p>${rs.filter(r => r.turn === t).map(r => `<p class="rh-line${r.side ? ' s-' + r.side : ''}">${esc(firstSentence(r.text))} <span class="ldice">${r.dice.map(g => `${esc(g.l)}: ${g.d.map(d => d.v).join(' ')}`).join(' · ')}</span></p>`).join('')}`).join('');
  return `<details class="rollhist"><summary>Every roll of the battle (${rs.length})</summary>
    <table class="mp-vp"><thead><tr><th></th><th>Dice</th><th>Average</th><th>6s</th><th>1s</th></tr></thead><tbody>${sum('good', 'You')}${sum('evil', 'Enemy')}</tbody></table>
    <p class="muted-inline">An average dice shows 3.5; a sixth of the dice should be 6s.</p><div class="rh-list">${byTurn}</div></details>`;
}
