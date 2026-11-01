// Matched play screens: the army builder (an army list and Warriors for each side, up to a points limit), the battle
// briefing, and the result with its Victory Points. Top-level names are unique across js/ (tools/build-single.js).
import { G } from '../state.js';
import { rollHistoryHTML } from './logview.js';
import { $, esc } from '../util.js';
import { MISSIONS } from '../data/missions.js';
import { ARMIES, ARMY_TYPES, RULE_TEXT, SOURCE } from '../data/army-lists.js';
import { POINT_LIMITS, armyById, armyStats, randomArmy, makeMatch } from '../engine/matched.js';
import { armyRulePlayed } from '../engine/special.js';
import { newGame, runGame } from '../game/flow.js';
import { dialog, closeDialog, showMenu } from './menu.js';

// The last armies, remembered in the browser so the builder opens where the player left it.
const MP_STORE = 'captains-school-matched-v1';
const MP_DEFAULT = { good: 'armyOfEdoras', evil: 'usurpersOfEdoras' };
let MP = null;   // { limit, me, foe, mine: { type: n }, theirs: { type: n }, scen: 'death' | 'siegeDef' | 'siegeAtt' }
// The Grand Siege: the attacker has a quarter more points (p. 163).
const SCENARIOS = [['death', 'To the Death!'], ['domination', 'Domination'], ['hold', 'Hold Ground'], ['supplies', 'Destroy the Supplies'], ['recon', 'Reconnoitre'], ['fog', 'Fog of War'], ['siegeDef', 'The Grand Siege: you defend'], ['siegeAtt', 'The Grand Siege: you attack']];
const limitOf = col => Math.round(MP.limit * ((MP.scen === 'siegeAtt' && col === 'me') || (MP.scen === 'siegeDef' && col === 'foe') ? 1.25 : 1));

function loadArmies() {
  try { MP = JSON.parse(localStorage.getItem(MP_STORE) || 'null'); } catch (e) { MP = null; }
  if (!MP || !armyById(MP.me) || !armyById(MP.foe) || !POINT_LIMITS.includes(MP.limit)) {
    MP = { limit: 150, me: MP_DEFAULT.good, foe: MP_DEFAULT.evil };
    MP.mine = randomArmy(armyById(MP.me), MP.limit); MP.theirs = randomArmy(armyById(MP.foe), MP.limit);
  }
}
function saveArmies() { try { localStorage.setItem(MP_STORE, JSON.stringify(MP)); } catch (e) { /* no browser storage */ } }

const otherAlign = a => (a === 'good' ? 'evil' : 'good');
const alignLabel = a => (a === 'good' ? 'Good' : 'Evil');
const statLineOf = T => `MV ${T.mv}″ · FV ${T.f} · SV ${T.sh}+ · S ${T.s} · A ${T.a} · W ${T.w} · C ${T.c}+${T.mwf ? ` · M/W/F ${T.mwf.join('/')}` : ''}`;
// A Hero's line under its name: its Heroic Tier and the Warriors its Warband may hold.
const heroTag = u => (u.hero ? ` <span class="muted-inline">${u.hero === 'Minor' || u.hero === 'Independent' ? `${u.hero} Hero` : `Hero of ${u.hero}`}, leads up to ${u.lead}</span>` : '');

/* ---------- Builder ---------- */
export function openBuilder() {
  if (!MP) loadArmies();
  $('#menu').hidden = true;
  dialog(`<div class="mp">
    <p class="eyebrow">Matched play</p>
    <h2>Muster your armies</h2>
    <p class="mp-lede">Pick an army list for each side and spend up to the same points on its Warriors. You lead one army; the computer leads the other.
      Profiles, points and options follow the 2024 army lists. Heroes, cavalry and wargear the game cannot play yet (war horns, slings, ...) are left out.</p>
    <div class="mp-limit" role="radiogroup" aria-label="Points limit"><span>Points limit</span>${POINT_LIMITS.map(p => `<button type="button" class="tbtn" role="radio" data-limit="${p}" aria-checked="${p === MP.limit}">${p}</button>`).join('')}</div>
    <div class="mp-limit" role="radiogroup" aria-label="Scenario"><span>Scenario</span>${SCENARIOS.map(([k, n]) => `<button type="button" class="tbtn" role="radio" data-scen="${k}" aria-checked="${k === (MP.scen || 'death')}">${n}</button>`).join('')}</div>
    <div class="mp-cols"><section class="mp-col" data-col="me"></section><section class="mp-col" data-col="foe"></section></div>
    <p class="mp-src">Army data: <a href="${SOURCE.repo}" target="_blank" rel="noopener">BattleScribe data for MESBG ↗</a>${SOURCE.date ? ` (${SOURCE.date})` : ''}. Special rules are listed but not simulated yet.</p>
    <div class="dlg-actions"><button class="act" id="mpGo" type="button">To battle</button><button class="tbtn" id="mpBack" type="button">Mission list</button></div>
  </div>`, 'wide');
  renderArmyCol('me'); renderArmyCol('foe'); refreshArmies();
  const box = $('#dialog');
  box.onclick = onBuilderClick;
  box.onchange = e => {
    const sel = e.target.closest('.mp-army'); if (!sel) return;
    const col = sel.closest('.mp-col').dataset.col, a = armyById(sel.value);
    if (col === 'me') {
      MP.me = a.id; MP.mine = randomArmy(a, limitOf('me'));
      // The computer always leads the other side: Good against Evil.
      if (armyById(MP.foe).align === a.align) { MP.foe = MP_DEFAULT[otherAlign(a.align)]; MP.theirs = randomArmy(armyById(MP.foe), limitOf('foe')); renderArmyCol('foe'); }
    } else { MP.foe = a.id; MP.theirs = randomArmy(a, limitOf('foe')); }
    renderArmyCol(col); refreshArmies();
  };
  $('#mpGo').focus();
}

function onBuilderClick(e) {
  const t = e.target;
  if (t.closest('#mpBack')) { closeDialog(); showMenu(); return; }
  if (t.closest('#mpGo')) { if (!t.closest('#mpGo').disabled) matchBriefing(); return; }
  const lim = t.closest('[data-limit]');
  if (lim) {
    MP.limit = +lim.dataset.limit;
    document.querySelectorAll('[data-limit]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.limit === MP.limit)));
    // A bigger or smaller game: the computer's army is chosen again; the player's stays (it may need trimming).
    MP.theirs = randomArmy(armyById(MP.foe), limitOf('foe')); renderArmyCol('foe'); refreshArmies(); return;
  }
  const sc = t.closest('[data-scen]');
  if (sc) {   // the attacker of a siege gets a quarter more points: the computer's army is chosen again
    MP.scen = sc.dataset.scen;
    document.querySelectorAll('[data-scen]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.scen === MP.scen)));
    MP.theirs = randomArmy(armyById(MP.foe), limitOf('foe')); renderArmyCol('foe'); refreshArmies(); return;
  }
  const colEl = t.closest('.mp-col'); if (!colEl) return;
  const col = colEl.dataset.col, list = col === 'me' ? MP.mine : MP.theirs, army = armyById(col === 'me' ? MP.me : MP.foe);
  const step = t.closest('[data-step]');
  if (step) {
    const k = step.dataset.t, n = Math.max(0, (list[k] || 0) + +step.dataset.step);
    if (n) list[k] = n; else delete list[k];
    colEl.querySelector(`output[data-t="${k}"]`).textContent = n;
    refreshArmies(); return;
  }
  if (t.closest('[data-act="random"]')) { const l = randomArmy(army, limitOf(col)); if (col === 'me') MP.mine = l; else MP.theirs = l; renderArmyCol(col); refreshArmies(); return; }
  if (t.closest('[data-act="clear"]')) { if (col === 'me') MP.mine = {}; else MP.theirs = {}; renderArmyCol(col); refreshArmies(); }
}

function renderArmyCol(col) {
  const mine = col === 'me', army = armyById(mine ? MP.me : MP.foe), list = mine ? MP.mine : MP.theirs;
  const choices = ARMIES.filter(a => mine || a.align !== armyById(MP.me).align);
  const group = al => { const l = choices.filter(a => a.align === al); return l.length ? `<optgroup label="${alignLabel(al)}">${l.map(a => `<option value="${a.id}"${a.id === army.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : ''; };
  const rules = army.rules.filter(r => r.x);
  $(`.mp-col[data-col="${col}"]`).innerHTML = `
    <h3>${mine ? 'Your army' : 'The enemy (computer)'} <span class="side-tag ${mine ? 'good' : 'evil'}">${alignLabel(army.align)}</span></h3>
    <label class="mp-pick"><span class="sr">Army list</span><select class="mp-army">${group('good')}${group('evil')}</select></label>
    ${rules.length ? `<details class="mp-rules"><summary>Army special rules</summary>${rules.map(r => `<p><b>${esc(r.n)}.</b> <span class="muted-inline">(${armyRulePlayed(r.n, army.id) ? 'played' : 'card only'})</span> ${esc(r.x).replace(/\n/g, '<br>')}</p>`).join('')}</details>` : ''}
    <div class="mp-units">${army.units.map(u => {
      const T0 = ARMY_TYPES[u.loadouts[0].t];
      return `<div class="mp-unit"><h4>${esc(u.n)}${heroTag(u)}</h4><p class="mp-stats">${statLineOf(T0)}${T0.rules.length ? `<br><span title="${esc(T0.rules.map(r => RULE_TEXT[r] ? `${r}: ${RULE_TEXT[r]}` : r).join('\n\n'))}">${esc(T0.rules.join(', '))}</span>` : ''}</p>
        ${u.loadouts.map(l => { const T = ARMY_TYPES[l.t]; return `<div class="mp-row"><span class="mp-lbl">${esc(l.label)}${T.note ? ` <span class="mp-note" title="${esc(T.note)}">*</span>` : ''}</span><span class="mp-d" title="Defence">D${T.d}</span><span class="mp-pts">${l.pts} pts</span>
          <span class="mp-step"><button type="button" class="tbtn" data-step="-1" data-t="${l.t}" aria-label="One fewer: ${esc(u.n)}, ${esc(l.label)}">−</button><output data-t="${l.t}">${list[l.t] || 0}</output><button type="button" class="tbtn" data-step="1" data-t="${l.t}" aria-label="One more: ${esc(u.n)}, ${esc(l.label)}">+</button></span></div>`; }).join('')}</div>`;
    }).join('')}</div>
    <div class="mp-sum" aria-live="polite"></div>
    <div class="mp-tools"><button type="button" class="tbtn" data-act="random">Random army</button><button type="button" class="tbtn" data-act="clear">Clear</button></div>`;
}

// Totals and warnings for both armies; To battle only once both are legal.
function refreshArmies() {
  let ok = true;
  for (const col of ['me', 'foe']) {
    const lim = limitOf(col), army = armyById(col === 'me' ? MP.me : MP.foe), s = armyStats(army, col === 'me' ? MP.mine : MP.theirs, lim);
    ok = ok && s.ok;
    $(`.mp-col[data-col="${col}"] .mp-sum`).innerHTML = `<div class="mp-bar"><i style="width:${Math.min(100, s.pts / lim * 100)}%"${s.pts > lim ? ' class="over"' : ''}></i></div>
      <p><b>${s.pts}</b> / ${lim} points · ${s.models} model${s.models === 1 ? '' : 's'}${s.heroes ? ` · ${s.heroes} Hero${s.heroes === 1 ? '' : 'es'} leading ${s.warriors} of ${s.lead}` : ''} · bows ${s.bows} of ${s.bowLimit}${s.thr ? ` · throwing ${s.thr} of ${s.thrLimit}` : ''}${s.banners ? ` · ${s.banners} banner${s.banners === 1 ? '' : 's'}` : ''}</p>
      ${s.problems.map(p => `<p class="no">${esc(p)}</p>`).join('')}`;
  }
  $('#mpGo').disabled = !ok;
  saveArmies();
}

/* ---------- Briefing ---------- */
function matchBriefing() {
  startMatch({ me: MP.me, foe: MP.foe, limit: MP.limit, scenario: MP.scen || 'death', mine: { ...MP.mine }, theirs: { ...MP.theirs }, seed: 1 + Math.floor(Math.random() * 1e9) });
}
// Sets up the battle and shows the briefing over the table (also Play again: the same armies on a new table).
export function startMatch(cfg) {
  const m = makeMatch(cfg);
  newGame(MISSIONS.length - 1, m);   // matched play comes after the last mission: every rule taught so far is in play
  const me = m.armies.good, foe = m.armies.evil;
  dialog(`<p class="eyebrow">${esc(m.lesson)}</p><h2>${esc(me.name)} <span class="mp-vs">against</span> ${esc(foe.name)}</h2>
    <p>You lead ${esc(me.name)} (${alignLabel(me.align)}, ${m.start.good} models); the computer leads ${esc(foe.name)} (${alignLabel(foe.align)}, ${m.start.evil} models).
      ${m.zones ? 'The enemy has deployed along the far edge. Your models stand in the lit strip along your edge: before the battle you may move them anywhere inside it.' : 'Nobody deploys: every Warband arrives as Reinforcements during the Move phase.'}</p>
    ${m.scen !== 'death' ? `<p class="goalbox"><b>${esc(m.lesson.split(' · ')[1] || '')}</b> ${esc(m.goal)} An army wiped out loses outright.</p><p>${esc(m.tip || '')}</p>` : `<p class="goalbox"><b>To the Death!</b> The battle ends at the end of a turn in which an army is down to a quarter of its models (or is wiped out: then the other side wins outright). Then the side with more Victory Points wins.</p>
    <table class="mp-vp"><tbody>
      <tr><td>The enemy General is wounded / down to 1 Wound / slain</td><td>1 / 3 / 5 VP</td></tr>
      <tr><td>The enemy army is Broken (it has lost more than half its models${foe.breakPoint && foe.breakPoint !== 0.5 ? `; ${esc(foe.name)}: more than ${Math.round(foe.breakPoint * 100)}%` : ''})</td><td>3 VP, or 5 if yours is not</td></tr>
      <tr><td>The enemy has no banner left (or never had one)</td><td>2 VP</td></tr>
      <tr><td>You have a banner left</td><td>1 VP, or 2 with more banners than the enemy</td></tr>
      <tr><td>The enemy army is down to a quarter of its models</td><td>3 VP</td></tr>
      <tr><td>Each enemy Hero slain (up to 3)</td><td>1 VP</td></tr>
    </tbody></table>`}
    <p class="mp-fine">Simplified for now: the armies deploy in one go, not Warband by Warband. Priority is rolled every turn.</p>
    <div class="dlg-actions"><button class="act" id="bGo" type="button">Deploy</button><button class="tbtn" id="bArmy" type="button">Change armies</button></div>`);
  $('#bGo').onclick = () => { closeDialog(); runGame(); };
  $('#bArmy').onclick = () => openBuilder();
  $('#bGo').focus();
}

/* ---------- Result ---------- */
export function showMatchResult(r) {
  const m = G.m, v = m.score(), wiped = !v.good.left || !v.evil.left;
  if (m.siege) {   // The Grand Siege: models within the walls, or the attacker cut down to a quarter
    const S = m.siege, head = r === 'win' ? 'Victory' : r === 'lose' ? 'Defeat' : 'Draw';
    dialog(`<p class="eyebrow">${esc(m.lesson)} · turn ${G.turn}</p><h2 class="${r === 'win' ? 'result-win' : r === 'lose' ? 'result-lose' : ''}">${head}</h2>
      <p>${esc(m.debrief[r])}</p>
      <table class="mp-vp"><tbody><tr><td>Attackers on or within the walls</td><td>${m.inside()} of ${S.need}</td></tr>
        <tr><td>Attacker models left</td><td>${v[S.att].left} of ${m.start[S.att]}</td></tr><tr><td>Defender models left</td><td>${v[S.def].left} of ${m.start[S.def]}</td></tr></tbody></table>${rollHistoryHTML()}
      <div class="dlg-actions"><button class="act" id="rAgain" type="button">Play again</button><button class="tbtn" id="rArmy" type="button">Change armies</button><button class="tbtn" id="rMenu" type="button">Mission list</button></div>`);
    $('#rAgain').onclick = () => startMatch({ ...m.cfg, seed: 1 + Math.floor(Math.random() * 1e9) });
    $('#rArmy').onclick = () => openBuilder();
    $('#rMenu').onclick = () => { closeDialog(); showMenu(); };
    return;
  }
  const head = r === 'win' ? 'Victory' : r === 'lose' ? 'Defeat' : 'Draw';
  dialog(`<p class="eyebrow">${esc(m.lesson)} · turn ${G.turn}</p><h2 class="${r === 'win' ? 'result-win' : r === 'lose' ? 'result-lose' : ''}">${head}</h2>
    <p>${wiped ? `${v.good.left ? 'The enemy army' : 'Your army'} was wiped out, so ${v.good.left ? 'you win' : 'the enemy wins'} whatever the points say. ` : ''}${esc(m.debrief[r])}</p>
    <table class="mp-vp"><thead><tr><th></th><th>You</th><th>Enemy</th></tr></thead><tbody>
      ${v.good.rows.map((row, i) => `<tr><td>${esc(row.label)}</td><td>${row.n}</td><td>${v.evil.rows[i] ? v.evil.rows[i].n : 0}</td></tr>`).join('')}
      <tr class="tot"><td>Victory Points</td><td>${v.good.total}</td><td>${v.evil.total}</td></tr>
      <tr><td>Models left</td><td>${v.good.left} of ${m.start.good}</td><td>${v.evil.left} of ${m.start.evil}</td></tr>
    </tbody></table>${rollHistoryHTML()}
    <div class="dlg-actions"><button class="act" id="rAgain" type="button">Play again</button><button class="tbtn" id="rArmy" type="button">Change armies</button><button class="tbtn" id="rMenu" type="button">Mission list</button></div>`);
  $('#rAgain').onclick = () => startMatch({ ...m.cfg, seed: 1 + Math.floor(Math.random() * 1e9) });
  $('#rArmy').onclick = () => openBuilder();
  $('#rMenu').onclick = () => { closeDialog(); showMenu(); };
}
