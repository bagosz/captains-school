// Side panel: phase bar, orders and hints, rule chips and cards, model profile, To Wound chart and dice log.
import { G, waiter, prefs, ABORT, showsAtLeast } from '../state.js';
import { $, esc, fmt, pct } from '../util.js';
import { RULES } from '../data/rules-text.js';
import { MISSIONS, taughtIn, inPlay, missionNo, missionOf } from '../data/missions.js';
import { alive, sideAlive, canMove, engaged, remaining, needStr, names, woundNeed, coverNote, alignOf, canDefend, inBrush, needsCourage, moveVal, hitParts, casualties, breakPoint } from '../engine/rules.js';
import { RULE_TEXT, POWER_TEXT } from '../data/army-lists.js';
import { castable, played, active, targets } from '../engine/magic.js';
import { combatOdds, goodsOf, evilsOf, strikeChance, trappedIfLose, supOf, unpaired, bannerFor, topDice, BANNER_RANGE, touching, canShield, barrierOf, chargeBonus, bestPart, isHero, strikesOf, woundBonus, canDismount, duelDice, attacksParts, duelModParts, woundBonusParts } from '../engine/combat.js';
import { HEROIC, heroActions, declared, fvOf, strikeS, challenging, strikePending, SHOUT_RANGE } from '../engine/heroes.js';
import { resolveWaiter, dismountAct, canCastNow, castAct, canRingNow, ringAct, canPushNow, pushLadderAct } from '../game/flow.js';
import { SPECIALS, specialKey } from '../engine/special.js';
import { statusOf } from './status.js';
import { compareHTML } from './compare.js';
import { linkTerms, initTerms } from './terms.js';
import { initLog, renderLog, resetLog } from './logview.js';
import { resetTools, zonesShown, tool } from './overlays.js';
import { canUndo } from '../game/undo.js';
import { showLesson } from './lessons.js';
import { initReference, openRuleRef, closeRuleRef, renderRef, resetRef, noteLog, noteRules, showChartTab, setRefTab, setFold } from './reference.js';

const PHASES = ['priority', 'move', 'shoot', 'fight', 'end'];

export function initPanel() {
  $('#act').addEventListener('click', () => resolveWaiter('first'));
  $('#act2').addEventListener('click', () => resolveWaiter('second'));
  document.addEventListener('click', e => {
    const c = e.target.closest('.rchip');
    if (c) { showRule(c.dataset.rule); return; }
    const l = e.target.closest('[data-lesson]');
    if (l) { showLesson([l.dataset.lesson]).catch(() => {}); return; }
    // Fight choice from the panel, next to clicking models on the table: which Combat goes next.
    const cb = e.target.closest('[data-combat]');
    if (cb && G && G.mode === 'order') { const c = G.combats[+cb.dataset.combat]; if (c) { G.curFight = c; updateHint(); } }
    // The Declare Heroic Actions step: one of the listed actions; the order of Heroic Actions: one of the listed Heroes.
    const dc = e.target.closest('[data-decl]');
    if (dc && G && G.declare && waiter) { const ch = G.declare.choices[+dc.dataset.decl]; if (ch) resolveWaiter(ch); }
    if (e.target.closest('[data-dismount]') && G && G.sel) dismountAct(G.sel);
    if (e.target.closest('[data-details]')) toggleDetails();
    const lad = e.target.closest('#phases li, #substeps li');
    if (lad && lad.dataset.rule) showRule(lad.dataset.rule);
    // The strip shows one line of each; the whole objective, briefing and tip are in the Scenario tab.
    if (e.target.closest('#mTipBtn, #mStatus, #mGoal, #mTitle')) { setFold(false); setRefTab('scenario'); }
    if (e.target.closest('[data-why]')) { whyOpen = !whyOpen; updateHint(); }
    if (e.target.closest('[data-pvwhy]')) { pvWhyOpen = !pvWhyOpen; updateHint(); }
    // Magic: a power to Cast from the model card, and the answers to the questions it asks (target, Will, Resist).
    const cp = e.target.closest('[data-cast]');
    if (cp && G) { const u = G.units.find(o => o.id === +cp.dataset.u); if (u) castAct(u, +cp.dataset.cast).catch(err => { if (err !== ABORT) console.error(err); }); }
    const pl = e.target.closest('[data-push]');
    if (pl && G) { const u = G.units.find(o => o.id === +pl.dataset.u); if (u) pushLadderAct(u).catch(err => { if (err !== ABORT) console.error(err); }); }
    const rg = e.target.closest('[data-ring]');
    if (rg && G) { const u = G.units.find(o => o.id === +rg.dataset.u); if (u) ringAct(u).catch(err => { if (err !== ABORT) console.error(err); }); }
    const co = e.target.closest('[data-choice]');
    if (co && G && G.ask && G.ask.kind === 'choice' && waiter) { const o = G.ask.list[+co.dataset.choice]; if (o) resolveWaiter({ pick: true, val: o.val }); }
    const hp = e.target.closest('[data-heropick]');
    if (hp && G && G.ask && G.ask.kind === 'heroicPick' && waiter) { const u = G.ask.list[+hp.dataset.heropick]; if (u) resolveWaiter(u); }
  });
  document.addEventListener('keydown', e => { const lad = e.key === 'Enter' && e.target.closest && e.target.closest('#phases li, #substeps li'); if (lad) showRule(lad.dataset.rule); });
  initReference({ chip, statusOf, rulesInPlay, known, later, renderCard, markChips });
  initTerms(k => showRule(k));
  initLog({ records: logRecords, chip, diceHTML });
}

export function resetPanel(i) {
  const m = G && (G.m.matched || G.m.sandbox || G.m.flipped) ? G.m : MISSIONS[i];   // flipped: the Battle of Edoras from the Evil side
  resetLog();
  resetTools();
  $('#mTitle').title = (m.matched ? m.lesson : m.sandbox ? `Practice · ${m.lesson}` : `${missionOf(i)} · ${m.lesson}`) + ' · the Scenario tab has the briefing';
  $('#mTitle').textContent = m.title;
  $('#mGoal').textContent = m.goal;
  $('#mTipBtn').hidden = !m.tip;
  closeRule();
  resetRef();
  hlChart(null);
  applyDetail();
}

// The parts of the screen the detail level (Options, state.js: DETAIL) shows, folds or hides: the To Wound tab beside
// the dice log shows once the player has met To Wound rolls (always on Full table); the rule chips fold on Guided.
// Called at the start of every game and when the level changes.
export function applyDetail() {
  showChartTab(showsAtLeast('full') || known('wound'));
  updateHint();
}

// The top-bar tag that says who has Priority this turn. side: 'good', 'evil', 'roll' (not rolled yet) or null (hidden).
export function showPriority(side) {
  const t = $('#prio');
  t.hidden = !side;
  t.className = `prio ${side || ''}`;
  t.textContent = side === 'good' ? 'Priority: you' : side === 'evil' ? 'Priority: enemy' : 'Priority: to roll';
}

// The mission's tip under the strip above the board: open in turn 1 under Guided, then folded behind the Tip button
// (unless the player opened it themselves); the Scenario tab always has it.

// The ladder in the top bar: the phase that is on, and in the Fight phase its steps as a second row.
function updateLadder() {
  const sub = $('#substeps'), on = !!G && G.running && !G.over && G.phase === 'fight';
  sub.hidden = !on;
  if (!on) return;
  const m = G.mode, s = m === 'declare' ? 'heroic' : ['pair', 'enemyPair'].includes(m) && !(G.enemyPick && G.enemyPick.stage !== 'pair') ? 'pair' : G.combats || G.curFight ? 'duel' : 'heroic';
  const k = ['heroic', 'pair', 'duel'].indexOf(s);
  sub.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('on', i === k); li.classList.toggle('past', i < k); });
}

// One pill per side in the top bar: models left, losses against the Break Point (once Broken armies are taught),
// Broken, and the Victory Points in matched play.
let scoreKey = '';
function updateScore() {
  const el = $('#score');
  if (!G || !G.running || !G.units) { if (scoreKey) { el.innerHTML = ''; scoreKey = ''; } return; }
  const vp = G.m.matched && G.m.score ? G.m.score() : null;
  const pills = ['good', 'evil'].map(side => {
    const left = G.units.filter(u => u.side === side && alive(u)).length, start = G.start ? G.start[side] : left, lost = casualties(side), bp = breakPoint(side);
    const br = G.broken && G.broken[side], showBp = Number.isFinite(bp) && bp < start && known('broken') && !!G.broken;   // none in Narrative Play, nor for an army that cannot break
    const tip = `${side === 'good' ? 'Your army' : 'The enemy'}: ${left} on the table, ${lost} of ${start} lost (slain, fled or escaped).${showBp ? ` It is Broken when, at the start of a turn, more than its Break Point of ${fmt(bp)} have been lost (a rider counts as soon as it is slain).` : ''}${vp ? ` Victory Points if the battle ended now: ${vp[side].total}.` : ''}`;
    return `<span class="spill ${side}${br ? ' broken' : ''}" title="${esc(tip)}"><b>${side === 'good' ? 'You' : 'Enemy'}</b> ${left}${showBp ? ` · lost ${lost} of ${start}, Broken at ${Math.floor(bp) + 1}` : lost ? ` · lost ${lost}` : ''}${br ? ' · Broken' : ''}${vp ? ` · ${vp[side].total} VP` : ''}</span>`;
  }).join('');
  if (pills === scoreKey) return;
  scoreKey = pills; el.innerHTML = pills;
}

export function setPhase(p) {
  if (G) G.phase = p;
  const k = PHASES.indexOf(p);
  document.querySelectorAll('#phases li').forEach((li, i) => { li.classList.toggle('on', i === k); li.classList.toggle('past', k >= 0 && i < k); });
  if (G) $('#turn').textContent = G.m.limit && !G.freeplay ? `Turn ${G.turn} of ${G.m.limit}` : `Turn ${G.turn}`;
  updateHint();
}

// label: the button text; off: show the text but keep the button disabled (the game waits for a click on the board).
export function setAction(label, off) {
  const b = $('#act');
  $('#act2').hidden = true;
  if (label) { b.disabled = !!off; b.textContent = label; orderLabel(); shieldButton(); return; }
  b.disabled = true;
  b.textContent = !G || !G.running ? 'Waiting for Start' : G.over ? (G.m.matched ? 'Battle over' : 'Mission over') : G.step === 'evil' ? 'Enemy is acting…' : G.mode === 'auto' ? 'The app is acting for you…' : G.throwing ? 'Throw your dice in the tray' : 'Wait…';
}

// While the player picks the order of the Combats, the roll button names the Combat it will fight.
function orderLabel() {
  const b = $('#act');
  if (!G || !G.fightNo || b.disabled || !G.curFight) return;
  const d3 = strikePending(G.curFight).length ? ': Heroic Strike D3 first' : '';
  if (G.mode === 'order') b.textContent = `Roll Combat ${G.combats.indexOf(G.curFight) + 1} (fight ${G.fightNo.k} of ${G.fightNo.total})${d3}`;
  else if (d3 && G.phase === 'fight' && !G.mode) b.textContent = `Start the Combat${d3}`;
}

// Before a Combat in which every model of yours carries a shield, the second button declares Shielding.
// G.offerShield is set by the game flow while it waits for the roll (it holds the enemy's own declaration so far);
// at other times the second button belongs to other choices, such as taking Priority.
function shieldButton() {
  if (!G || !G.offerShield) return;
  const b2 = $('#act2'), ok = !!(waiter && G.curFight && canShield(G.curFight, 'good') && !strikePending(G.curFight).length && !G.ask);
  b2.hidden = !ok;
  if (ok) b2.textContent = 'Shield, then roll';
}
// Both choices for the next Combat: dice, chance to win (with Show odds) and what happens if you win.
function shieldInfo(c) {
  if (!c || !G.offerShield || !canShield(c, 'good')) return '';
  const other = G.offerShield, sup = supOf(c, 'good'), base = goodsOf(c).reduce((n, u) => n + u.a, 0);
  const enemy = other.evil ? '<br>The enemy declared Shielding first: it rolls twice the dice but makes no Strikes.' : '';
  return `<br><b>Roll the dice</b>: ${base + sup.length} dice${odd(combatOdds(c, other), ' to win')}, and Strikes if you win.`
    + `<br><b>Shield, then roll</b>: ${2 * base} dice${odd(combatOdds(c, { ...other, good: true }), ' to win')}, but no Strikes${sup.length ? `, and ${esc(names(sup))} cannot Support` : ''}.${enemy}`;
}

// Locks the board and the action button while the player's dice are rolling.
export function setBusy(b) { G.busy = b; $('#act').disabled = b || !waiter; }

// Each part of the status (split at " · ") stays on one line, so a narrow column wraps between parts.
export function updateMission() { if (G) { const st = G.m.status(); $('#mStatus').innerHTML = st.split(' · ').map(s => `<span>${esc(s)}</span>`).join(' · '); $('#mStatus').title = st; $('#mGoal').title = G.m.goal || ''; renderRef(); } }

/* ---------- Rule chips and rule card ---------- */
let openRule = null;
// A rule the player has not met yet (the app handled it) gets a muted chip that says where it is taught.
const later = k => { const i = taughtIn(k); return i < 0 ? 'a later mission' : `mission ${missionNo(i)}`; };
// Whether the player has met rule k: taught by this mission or an earlier one (the heroes sandbox and matched play have
// every rule; data/missions.js: inPlay).
const known = k => inPlay(k, G);
export const chip = k => {
  const fresh = G && !known(k);
  return `<button class="rchip${openRule === k ? ' on' : ''}${fresh ? ' later' : ''}" type="button" data-rule="${k}"${fresh ? ` title="The app handles this for you; ${later(k)} teaches it"` : ''}>${RULES[k].t}</button>`;
};

// Chips for the rules that matter right now, limited to rules the player has met (this mission or earlier).
function rulesInPlay() {
  return phaseRules().filter(known);
}
// The rules in play are listed at the top of the Rules tab (reference.js), so the panel shows no chips of its own: a rule
// that turns up for the first time in this game is counted on the Rules tab instead, so it is not missed.
function inplayHTML(list) {
  const seen = G.chipsSeen || (G.chipsSeen = new Set()), fresh = list.filter(k => !seen.has(k));
  fresh.forEach(k => seen.add(k));
  if (G.turn > 1) noteRules(fresh.length);   // in turn 1 every rule is new; later ones are worth a count
  return '';
}
// The Heroic Action chips of a phase, when Heroic Actions are in play and a Hero is on the table.
function heroicRules(phase) {
  if (!G.heroics || !G.heroics.size || !G.units.some(u => alive(u) && isHero(u))) return [];
  return ['heroic', ...[...G.heroics].filter(k => HEROIC[k].phase === phase).map(k => HEROIC[k].rule), phase === 'shoot' && 'sharpshooter'].filter(Boolean);
}
function phaseRules() {
  if (!G || !G.running || G.over) return [];
  if (G.phase === 'priority') return G.broken ? ['priority', 'broken'] : ['priority'];
  if (G.phase === 'move') {
    const mine = sideAlive('good'), has = k => mine.some(u => u.T[k]);
    const t = k => G.terrain.some(T => T.k === k), prone = mine.some(u => u.prone);
    return [has('bow') && 'shoot', 'move', 'cz', 'charge', 'terrain', has('spear') && 'spear', has('pike') && 'pike', has('banner') && 'banner',
      (t('wall') || t('hedge')) && 'obstacles', t('hedge') && 'jump', t('plateau') && 'climb', t('plateau') && 'leap', prone && 'prone',
      mine.some(u => G.terrain.some(T => canDefend(u, T))) && 'barriers', mine.some(u => u.cav) && 'cavalry', mine.some(u => u.cav) && 'cavalrycharge',
      G.broken && 'broken', G.broken && (G.broken.good || G.broken.evil) && 'courage', G.broken && mine.some(u => u.mwf) && 'will',
      G.broken && (G.broken.good || G.broken.evil) && mine.some(u => u.mwf) && 'standFast', ...heroicRules('move')].filter(Boolean);
  }
  if (G.phase === 'shoot') return [...(G.step === 'evil' ? ['shoot', 'hit', 'itw', 'cover', 'wound', 'shootFight'] : ['shoot', 'hit', 'itw', 'cover', 'wound']), ...(G.units.some(u => alive(u) && u.cav) ? ['shootcav', 'thrownrider'] : []), ...(G.units.some(u => alive(u) && u.mwf) ? ['might', 'fate'] : []), ...heroicRules('shoot')];
  if (G.phase === 'fight') return ['prone', 'falling', 'pairoff', 'order', 'duel', 'multi', 'shielding', 'twohanded', 'spear', 'pike', 'banner', 'tie', 'rolloff', 'backaway', 'makeway', 'trapped', 'barriers', 'bothsides', 'cavalrycharge', 'cavalry', 'thrownrider', 'loosemount', 'strikes', ...(G.units.some(u => alive(u) && u.mwf) ? ['might', 'fate'] : []), ...heroicRules('fight')];
  return [];
}
// A rule chip opens the rule's entry in the Rules tab beside the dice log (reference.js); clicking it again closes it.
export function showRule(k) { openRule = openRuleRef(k); markChips(); }
export function closeRule() { openRule = null; closeRuleRef(); markChips(); }
// The chip of the open rule is lit; reference.js calls this with null when the player folds that entry.
function markChips(k = openRule) { openRule = k; document.querySelectorAll('.rchip').forEach(c => c.classList.toggle('on', c.dataset.rule === openRule)); }

/* ---------- Orders: what to do now ---------- */
let hintCache = '', lastStep = null, whyOpen = false, pvWhyOpen = false;
// How often the player has met each kind of step: "Why?" is open the first two times (kept in the browser).
const WHY_KEY = 'captains-school-why-seen';
function seenStep(step) {
  let m = {};
  try { m = JSON.parse(localStorage.getItem(WHY_KEY) || '{}') || {}; } catch { m = {}; }
  const n = m[step] || 0;
  m[step] = n + 1;
  try { localStorage.setItem(WHY_KEY, JSON.stringify(m)); } catch { /* private window */ }
  return n;
}
export const resetWhySeen = () => { try { localStorage.removeItem(WHY_KEY); } catch { /* private window */ } };
// A modifier part (engine explainers: { v, t, why }) with its rule term as a link.
const partHTML = x => (x.why && RULES[x.why] ? `<span class="term" data-rule="${x.why}" tabindex="0">${esc(x.t)}</span>` : esc(x.t));
const signed = v => (v > 0 ? `+${v}` : `${v}`);
// The Duel Roll of Combat c, outcome first: dice on each side (as the roll throws them) and who wins a tie.
function duelForecast(c) {
  const g = goodsOf(c), e = evilsOf(c);
  if (!g.length || !e.length) return '';
  const d = duelDice(c), fg = Math.max(...g.map(fvOf)), fe = Math.max(...e.map(fvOf));
  const tie = fg > fe ? 'you win ties' : fe > fg ? 'the enemy wins ties' : 'a tie goes to a roll-off';
  const tr = trappedIfLose(c, 'evil').length ? ' · enemy Trapped if it loses' : '', mine = trappedIfLose(c, 'good').length ? ' · yours Trapped if you lose' : '';
  return `<span class="fc">Duel: ${d.good} v ${d.evil} dice, ${tie}${odd(combatOdds(c), ' to win')}${tr}${mine}</span>`;
}
// Why: each model's dice and their parts, the modifiers on its dice, Supports and banners, and the Fight Values.
function duelWhy(c) {
  if (!c) return '';
  const g = goodsOf(c), e = evilsOf(c);
  if (!g.length || !e.length) return '';
  const line = (u, foes) => {
    const a = attacksParts(u, {}, foes), m = duelModParts(u);
    return `${esc(u.name)}: ${a.map((x, i) => `${i ? '+' : ''}${x.v} ${partHTML(x)}`).join(', ')}${m.length ? `; each dice ${m.map(x => `${signed(x.v)} ${partHTML(x)}`).join(', ')}` : ''}; FV ${fvOf(u)}`;
  };
  const sup = side => supOf(c, side).map(s => `${esc(s.name)} Supports: +1 dice (<span class="term" data-rule="${s.T.pike ? 'pike' : 'spear'}" tabindex="0">${s.T.pike ? 'pike' : 'spear'}</span>)`);
  const ban = side => (bannerFor(c, side) ? [`${side === 'good' ? 'Your' : 'The enemy\'s'} <span class="term" data-rule="banner" tabindex="0">banner</span>: one re-roll`] : []);
  return [...g.map(u => line(u, e)), ...sup('good'), ...ban('good'), ...e.map(u => line(u, g)), ...sup('evil'), ...ban('evil'),
    'The highest dice wins; on a tie the higher Fight Value wins, and equal Fight Values roll off.'].join('<br>');
}
// Why a Strike at t needs what it needs: Strength against Defence on the chart, and every bonus with its rule.
function woundWhy(w, t, twice) {
  const S = strikeS(w), part = bestPart(w, t), D = part === 'mount' ? t.mount.d : t.d, B = woundBonusParts(w, t, twice);
  return `${esc(t.name)}${part === 'mount' ? ` (${esc(t.mount.n.toLowerCase())})` : ''}: Strength ${S} v Defence ${D} = ${needStr(woundNeed(S, D))} on the chart${B.length ? `, ${B.map(x => `${signed(x.v)} ${partHTML(x)}`).join(', ')}` : ''}${twice ? `, ${t.prone ? 'Prone' : 'Trapped'}: each Strike rolls twice` : ''}${t.def6 ? ', Heroic Defence: natural 6s only' : ''}`;
}
const DESELECT = ' <button class="linkbtn" type="button" data-act="deselect">Deselect</button> <span class="muted-inline">(or right-click, Esc)</span>';
// The orders block: a short title, one sentence (say) with the rule terms as links, "Why?" opening the full paragraph
// (body), the forecast (pv: outcome first, "Why?" listing every modifier with its rule: pvWhy) and the choices
// (buttons: Combats, Heroes, Heroic Actions). step names the kind of step, for opening "Why?" the first two times.
export function updateHint() {
  if (!G) return;
  let title = '', body = '', pv = '', say = '', choices = '', pvWhy = '', step = G.mode || G.phase || '';
  if (!G.running) { title = 'Ready'; body = 'Read the mission card and press Start.'; }
  else if (G.over) { title = G.m.matched ? 'Battle over' : 'Mission over'; body = G.m.matched ? 'Play again, or change the armies.' : 'Pick the next mission or try again.'; }
  else if (G.throwing) {
    const left = G.throwing.n - G.throwing.i;
    title = 'Throw your dice'; step = 'throw';
    say = 'Press the Throw button in the dice tray, or click the tray.';
    body = `Throw your dice one at a time: press <b>${G.throwing.n > 1 ? `Throw dice ${G.throwing.i + 1} of ${G.throwing.n}` : 'Throw your dice'}</b> in the dice tray, or click the tray.${left > 1 ? ` <b>Throw the other ${left}</b> throws the rest at once.` : ''} The enemy's dice follow on their own. Untick One by one in Options to throw all your dice at once.`;
  } else if (G.ask && G.ask.kind !== 'heroicPick') {
    ({ title, body, pv, say = '', choices = '' } = askHint(G.ask)); step = 'ask-' + G.ask.kind;
  } else if (G.mode === 'declare' && G.declare) {
    ({ title, body, pv, say, choices } = declareHint(G.declare));
  } else if (G.ask && G.ask.kind === 'heroicPick') {
    const { list, k } = G.ask;
    title = `${HEROIC[k].n}: which Hero?`; step = 'heroicPick';
    say = `Choose which of your Heroes performs its ${HEROIC[k].n} now.`;
    body = `Several of your Heroes declared a ${HEROIC[k].n}. You choose which one goes now: click it below or on the table. The enemy's Heroes and yours take turns.`;
    choices = list.map((u, i) => `<button class="cline" type="button" data-heropick="${i}">${esc(u.name)}</button>`).join('');
  } else if (G.mode === 'auto') {
    title = 'The app plays for you';
    say = 'AI plays for you is on: the computer acts for your side.';
    body = '<b>AI plays for you</b> is on in Options: the computer moves, shoots and fights for your side, and every roll goes into the dice log as usual. Untick it, or press the tag at the top, to take over at the next step.';
  } else if (G.rollPrompt) { title = 'Roll for Priority'; step = 'rollPriority'; say = 'Both sides roll a D6: the higher roller chooses who has Priority.'; body = 'Both players roll a D6. The higher roller chooses which side has Priority this turn. Press the button to throw your dice.'; }
  else if (G.choosing) { title = 'Choose Priority'; step = 'choosePriority'; say = 'You won the roll: keep Priority and act first, or hand it over.'; body ='You won the roll. With Priority your side moves first and can charge before the enemy does. Hand it over and you get to see the enemy\'s moves and react to them.'; }
  else if (G.step === 'evil') { title = 'Enemy\'s turn'; body = 'The enemy is acting in this phase. Its rolls go into the dice log too.'; }
  else if (G.mode === 'deploy') {
    title = 'Deploy your army';
    say = G.sel ? `<b>${esc(G.sel.name)}</b>: click a spot inside your lit deployment zone.${DESELECT}` : 'Click a model, then a spot in your lit zone. Then press Start the battle.';
    body = G.sel ? `<b>${esc(G.sel.name)}</b>: click where it should stand, wholly inside your deployment zone (the lit strip along your edge).${DESELECT}`
      : 'Your models stand in the lit strip along your edge; the enemy has deployed along the far edge. Click one of your models, then a spot inside your zone, to move it. Put spears and pikes right behind a friend, and keep banners close behind the fighters. Press <b>Start the battle</b> when you are ready.';
    const p = G.preview;
    if (p && p.type === 'deploy' && !p.ok) pv = `<span class="no">${esc(p.why)}</span>`;
  } else if (G.mode === 'move') {
    title = 'Your move';
    if (G.only && !G.sel) {
      const tag = G.phase === 'fight' ? 'The Heroic Combat succeeded: these models may Move or Charge again, and nothing else' : G.only.some(u => u.tether != null) ? 'With Me: these models Activate now, right after their Hero, and each must finish within 6″ of it (or not move at all)' : 'Heroic Move: this Hero Activates before every other model';
      body = `${tag}: ${esc(names(G.only))}. Click one of them, then where it goes. Press the button when you are done.`;
      say = `Click ${G.only.length === 1 ? esc(G.only[0].name) : 'one of the bright models'}, then where it goes.`; step = 'move-only';
    } else if (!G.sel) {
      const any = sideAlive('good').some(canMove);
      say = any ? `Click a model with a bright base, then a point on the table.${G.m.noCharge ? '' : ' Click an enemy to Charge.'}` : 'All your models have moved. Press End move.';
      body = any
        ? `Click one of your models (bright bases can still move), then a point on the table. ${G.m.noCharge ? '' : 'Click an enemy to Charge: point at the side of its base you want to fight from, and the base slides in tight next to friends already fighting it. '}A model can move in several legs until its Move is used up. Red rings are enemy Control Zones.`
        : 'All your models have moved. Press End move.';
      if (!G.m.noShoot && sideAlive('good').some(u => u.bow && canMove(u))) body += '<br><br><b>Shooting later this turn?</b> Any move makes To Hit 1 worse, and a model that moves more than half its Move (3″) cannot shoot at all. A crossbow cannot shoot after any move.';
    } else {
      const s = G.sel, bw = s.bow, rem = remaining(s);
      step = 'move-sel';
      say = `<b>${esc(s.name)}</b>: ${fmt(rem)}″ of ${moveVal(s)}″ left. Click where it goes${G.m.noCharge ? '' : ', or an enemy to Charge'}.${DESELECT}`;
      body =`<b>${esc(s.name)}</b>: ${fmt(rem)}″ of ${moveVal(s)}″ Move left${s.mvPlus ? ` (${s.mv}″ + ${s.mvPlus}″ for ${s.noCharge}; no Charge)` : ''}.`;
      if (s.tether != null) { const h = G.units.find(o => o.id === s.tether); if (h && alive(h)) body += ` It must finish within ${SHOUT_RANGE}″ of ${esc(h.name)} (${h.shouted === 'march' ? 'At the Double' : 'With Me'}).`; }
      if (bw && !G.m.noShoot) body += bw.still ? ' A crossbow can only shoot if the model does not move this turn.' : ` To shoot this turn, move no more than ${fmt(moveVal(s) / 2)}″ in total (inner ring). Any move makes To Hit 1 worse.`;
      if (s.movedDist > 0) body += ' Selecting another model ends this model\'s move.';
      body += DESELECT;
      const p = G.preview;
      if (s.prone) body += ' <b>Prone:</b> point within 1″ to Crawl there (then its move is over), or further away to Stand Up for half its Move and move on with the rest.';
      if (s.climb) body += ` <b>Climbing:</b> it hangs ${fmt(s.climb.z - s.climb.foot)}″ above the foot of the cliff. Click the ${s.climb.dir === 'up' ? 'top' : 'bottom'} to carry on: another Climb Test.`;
      if (p && p.type === 'cross') pv = crossNote(s, p.X);
      else if (p) pv = p.ok
        ? `<span class="ok">${p.type === 'charge' ? `Charge: ${fmt(p.cost)}″${p.P && p.P.stand ? ', Standing Up first' : ''}${cavNote(s, p)}${p.P && p.P.over ? ` over the ${p.P.over.T.k}: it stops against the ${p.P.over.T.k} opposite ${esc(p.t.name)}, which defends it (Strikes before Backing Away, each of yours after In The Way 4+, nobody Trapped)` : ''}` : p.crawl ? `Crawl: ${fmt(p.cost)}″, then its move is over` : `Move: ${fmt(p.cost)}″${p.stand ? ` (Standing Up takes ${fmt(p.stand)}″)` : ''}, then ${fmt(Math.max(0, rem - p.cost))}″ left`}${p.inBrush > 0 ? ` (Difficult Terrain adds ${fmt(p.inBrush)}″)` : ''}${p.contact ? `, ending in base contact with ${esc(p.contact)}` : ''}.</span>${supportNote(s, p.contactU)}`
        : `<span class="no">${esc(p.why)}</span>`;
      if (G.fire) pv += (pv ? '<br>' : '') + fireNote(G.fire, p && p.ok ? 'From there' : 'From here');
    }
  } else if (G.mode === 'shoot') {
    title = 'Your shooting';
    if (!G.sel) { say = 'Click a shooter, then a target.'; body = 'Click a shooter, then a target. You see the odds of every step before you shoot.'; }
    else {
      step = 'shoot-sel';
      say = `<b>${esc(G.sel.name)}</b> (${G.sel.bow.n.toLowerCase()}, ${G.sel.bow.rng}″): point at an enemy, click to shoot.${DESELECT}`;
      body = `<b>${esc(G.sel.name)}</b>: ${G.sel.bow.n.toLowerCase()}, range ${G.sel.bow.rng}″, Strength ${G.sel.bow.s}. Hover over an enemy to see every step of the shot: To Hit, the models and terrain In The Way (4+ each), and To Wound.`;
      const p = G.preview;
      if (p && p.type === 'shot') {
        const i = p.info;
        // Cover the shooter (or the friend it shoots over) touches is ignored; say so, as it is why no test is needed.
        // A friend in base contact the shooter fires over the shoulder of is not In The Way; say so too.
        const cov = [...(i.ok && i.over ? i.over.map(n => esc(`It shoots over the shoulder of ${n}, a friend in base contact: ${n} is not In The Way`)) : []),
          ...(i.ok ? i.ignored.map(c => esc(`It ${coverNote(c)}: no In The Way test`)) : [])].join('<br>');
        const lof = [cov, i.ok && (i.itw.length ? `In The Way: ${i.itw.map(o => esc(o.name)).join(', ')}, 4+ each${odd(i.pI, ' together')}` : cov ? '' : 'Clear line of fire'),
          // A wall the shooter stands near but does not touch: in base contact it would shoot over it with no test.
          ...(i.ok && i.close ? i.close.map(c => `<span class="no">${esc(`${G.sel.name} stands ${fmt(c.gap)}″ from the ${c.k}, not in base contact with it, so the ${c.k} is In The Way. Touching it, it would shoot over the ${c.k} with no test.`)}</span>`) : [])].filter(Boolean).join('<br>');
        const wound = p.t.cav ? `Rider or ${esc(p.t.mount.n.toLowerCase())}? 4+ the rider.<br>To Wound S${G.sel.bow.s}: rider D${p.t.d} ${needStr(i.need)}, ${esc(p.t.mount.n.toLowerCase())} D${p.t.mount.d} ${needStr(i.needM)}${odd(i.pW, ' on average')}` : `To Wound S${G.sel.bow.s} vs D${p.t.d}: ${needStr(i.need)}${odd(i.pW)}`;
        const acc = i.ok && i.reroll ? `<br>${esc(G.sel.itwReroll)}: a failed In The Way Test is re-rolled.` : '';
        const sharp = i.ok && i.sharp ? `<br>Sharpshooter: it aims at the rider or the ${esc(p.t.mount.n.toLowerCase())}, and hits the part it aims at with no test.` : '';
        const might = i.ok && i.pM != null ? `<br>${esc(G.sel.name)} has ${G.sel.might} Might: it may raise its own To Hit, In The Way and To Wound rolls${prefs.odds ? ` (${pct(i.pM)} to wound if it spends them where a roll falls short)` : ''}.` : '';
        // Outcome first: what each step needs; Why? lists the parts of the To Hit roll and every line of the old note.
        const sum = [`Hits on ${i.sv}+`, i.itw.length ? `${i.itw.length} In The Way (4+ each)` : i.over && i.over.length ? `clear line over the shoulder of ${esc(i.over.join(', '))}` : 'clear line', `wounds on ${p.t.cav ? `${needStr(i.need)} rider / ${needStr(i.needM)} ${esc(p.t.mount.n.toLowerCase())}` : needStr(i.need)}`, prefs.odds && pct(i.p)].filter(Boolean).join(' · ');
        pv = i.ok ? `<span class="ok fc">${sum}</span>` : `<span class="no">${esc(i.why)}</span>`;
        if (i.ok) {
          const H = hitParts(G.sel, p.t);
          pvWhy = `To Hit ${H.value}+: ${H.parts.map(x => `${x === H.parts[0] ? x.v : `+${x.v}`} ${partHTML(x)}`).join(', ')}${H.value === 6 && H.parts.reduce((a, x) => a + x.v, 0) > 6 ? ' (never worse than 6)' : ''}${odd(i.pH)}<br>${lof}<br>${wound}${acc}${sharp}${might}`;
        }
      }
    }
  } else if (G.mode === 'pair') {
    title = 'Pair Off the fights';
    const left = G.pairing ? G.pairing.open.flatMap(unpaired) : [];
    body = 'You have Priority, so you split the brawl into Combats yourself. A Combat may have several models on one side, never on both, and a model can only fight enemies it touches. Models with a dashed yellow ring are not in a Combat yet: click one, then the enemy it should fight (or a model already in the Combat it should join). Every model in base contact must end up in a Combat.';
    say = G.sel ? `<b>${esc(G.sel.name)}</b>: click the enemy it fights, or a model in the Combat it joins.${DESELECT}`
      : left.length ? 'Click a model with a dashed ring, then the enemy it fights. Two against one is best.' : 'Every model is in a Combat. Press Done.';
    if (G.sel) step = 'pair-sel';
    pv = combatList(G.combats);
    choices = G.pairing && G.pairing.open.some(o => o.made.length) ? '<button class="tbtn csplit" type="button" data-act="pair-reset">Start again: take the Combats apart</button>' : '';
  } else if (G.mode === 'order') {
    title = 'Choose the next Combat';
    body = 'You have Priority, so you choose the order of the Combats. Click a Combat in the list below, or any of its models on the table, to fight it next (dashed ring), then roll. Fight first where an enemy would be Trapped, before the friend that blocks its way back fights and perhaps Backs Away.';
    say = 'Click the Combat to fight next, in the list or on the table, then roll.';
    choices = combatList(G.combats, G.curFight, true);
    pv = shieldInfo(G.curFight).replace(/^<br>/, '');
    pvWhy = duelWhy(G.curFight);
    orderLabel(); shieldButton();
  } else if (G.mode === 'might' && G.might) {
    const { D, u, plan } = G.might, eM = topDice(D.e), gM = topDice(D.g);
    title = 'Might: raise a dice?';
    say = `Click a dice of ${esc(u.name)} in the tray to raise it by 1, or keep the dice.`;
    body =`<b>${esc(u.name)}</b> has ${u.might} Might Point${u.might === 1 ? '' : 's'} left. Your side is ${gM > eM ? 'ahead' : gM === eM ? 'level' : 'behind'} in this Duel Roll, ${gM} against ${eM}${D.gF === D.eF ? ' (equal Fight Values: a tie is a roll-off)' : ` (Fight Value ${D.gF} against ${D.eF})`}. Click one of ${esc(u.name)}'s dice in the dice tray to raise it by 1 for a Might Point, or press <b>Keep the dice</b>. Might comes last: after re-rolls and modifiers, and never above 6.`;
    pv = plan ? `<span class="ok">${plan.k === 1 ? 'One point' : `${plan.k} points`} on a ${plan.die.v} ${plan.k === 1 ? 'makes it' : 'make it'} a ${plan.die.v + plan.k}: ${D.gF > D.eF ? 'a tie, and you win on Fight Value' : 'and you win outright'}.</span> The enemy may answer with Might of its own.` : '<span class="no">No dice of yours can be raised far enough to win.</span>';
  } else if (G.mode === 'reroll' && G.reroll) {
    const { c, D } = G.reroll, b = bannerFor(c, 'good'), eM = topDice(D.e), need = eM + (D.gF > D.eF ? 0 : 1);
    title = 'Banner: re-roll a dice?';
    say = 'Click one of your dice in the tray to re-roll it, or keep the dice.';
    body =`Your side is losing this Duel Roll, ${topDice(D.g)} against ${eM}${D.gF === D.eF ? '' : ` (Fight Value ${D.gF} against ${D.eF})`}. ${b ? esc(b.name) : 'Your banner'} is within ${BANNER_RANGE}″ of this fight, so one of your models may re-roll one of its dice. Click a dice in the dice tray to re-roll it, or press <b>Keep the dice</b>. The new result stands, even if it is worse.`;
    pv = need > 6 ? '<span class="no">No re-roll can win this fight: the enemy has a 6 and wins ties.</span>'
      : `The re-rolled dice needs ${need === 6 ? 'a 6' : `a ${need} or more`} to win${odd((7 - need) / 6)}. ${D.g.some(d => d.mod) ? 'Pick a dice without the −1 (it would need one more)' : 'Any of your dice will do'}: only the new result matters.`;
  } else if (G.mode === 'backaway' && G.backAway) {
    const { l, opts } = G.backAway, mw = opts.filter(o => o.makeWay).length;
    title = 'Back Away';
    say = `Click a dot to Back Away ${esc(l.name)} 1″.${mw ? ' A yellow dot makes a friend step aside.' : ''}`;
    body =`<b>${esc(l.name)}</b> lost and must Back Away 1″. You choose where: point at a dot to see the move, then click it. Green dots are free.${mw ? ' On a yellow dot a friend is in the way, so it Makes Way: it steps aside up to 1″ (a spear behind the fighter steps back with it, and the line stays together).' : ''}`;
    pv = `${opts.length - mw} free spot${opts.length - mw === 1 ? '' : 's'}${mw ? `, ${mw} with Make Way` : ''}.`;
  } else if (G.mode === 'part' && G.strike) {
    const { w, cands } = G.strike, t = cands[0], mount = t.mount.n.toLowerCase();
    title = 'Rider or mount?';
    say = `Strike at the rider of ${esc(t.name)}, or at its ${mount}?`;
    body =`<b>${esc(w.name)}</b> strikes <b>${esc(t.name)}</b>, a Cavalry model: choose whether the Strike goes at the rider or at its ${mount}. Slay the rider and the whole model is gone (a horse flees); slay the ${mount} and the rider is thrown, then fights on foot.`;
    pv = `Rider: Defence ${t.d}, ${needStr(woundNeed(w.s, t.d))} To Wound${odd(strikeChance(w, t, !!t.prone, 'rider'))}, ${t.w} Wound${t.w === 1 ? '' : 's'} left.<br>${esc(t.mount.n)}: Defence ${t.mount.d}, ${needStr(woundNeed(w.s, t.mount.d))} To Wound${odd(strikeChance(w, t, !!t.prone, 'mount'))}, ${t.mount.w} Wound${t.mount.w === 1 ? '' : 's'} left.`;
  } else if (G.mode === 'strike' && G.strike) {
    const { w, cands, trapped } = G.strike;
    title = 'Choose the Strike';
    body = `<b>${esc(w.name)}</b> won and fights more than one enemy, so you choose where the Strike goes. Click a red-ringed enemy.`;
    say = 'Click the enemy this Strike goes at. Tags show what each needs to wound.';
    const S = strikeS(w);
    pvWhy = cands.filter(alive).map(t => woundWhy(w, t, trapped.has(t.id) || !!t.prone)).join('<br>');
    pv = cands.filter(alive).map(t => `${esc(t.name)}: ${needStr(woundNeed(S, t.cav ? t.mount.d : t.d))} To Wound${t.cav ? ` (${t.mount.n.toLowerCase()}; rider ${needStr(woundNeed(S, t.d))})` : ''}${woundBonus(w, t) ? ` +${woundBonus(w, t)}` : ''}${t.def6 ? ', Heroic Defence: natural 6s only' : ''}${trapped.has(t.id) ? ', Trapped so two rolls' : t.prone ? ', Prone so two rolls' : ''}${odd(strikeChance(w, t, trapped.has(t.id) || !!t.prone, bestPart(w, t)))}${prefs.odds && isHero(w) && w.might > 0 && !t.def6 ? ` (${pct(strikeChance(w, t, trapped.has(t.id) || !!t.prone, bestPart(w, t), w.might))} with Might)` : ''}`).join('<br>');
    if (S !== w.s) pv += `<br>Heroic Strength: Strength ${S} for these Strikes.`;
  } else if (G.mode === 'enemyPair' && G.enemyPick) {
    const ep = G.enemyPick;
    if (ep.stage === 'pair') {
      title = 'The enemy pairs off'; step = 'enemyPair';
      say = 'The enemy has Priority, so it splits the fights into Combats.';
      body ='The enemy has Priority this turn, so it splits the fights into Combats, just as you do when you have Priority. Watch it pick one of its models, then the model it should fight. Models with a dashed yellow ring are not in a Combat yet.';
      pv = [ep.note && `<b>${esc(ep.note)}</b>`, ...G.combats.map(c => `${esc(names(goodsOf(c)))} vs ${esc(names(evilsOf(c)))}`)].filter(Boolean).join('<br>');
    } else if (ep.stage === 'order') {
      title = 'The enemy picks the order'; step = 'enemyOrder';
      say = 'The enemy chooses which Combat is fought first.';
      body ='Now the enemy chooses which Combat is fought first, second and so on. Each Combat gets its number when it is picked.';
      pv = combatList(G.combats.slice(0, ep.shown));
    } else {
      title = 'The enemy split the fights'; step = 'enemyDone';
      say = 'The Combats are numbered in the enemy\'s order. Press Continue to fight them.';
      body ='The enemy has Priority this turn, so it decided who fights whom and in which order the Combats are fought. The Combats are numbered in that order. Press Continue to fight them.';
      pv = combatList(G.combats);
    }
  } else if (G.phase === 'fight') {
    title = 'Fight';
    body = G.curFight ? `Duel: ${esc(names(G.curFight))}. Press the button to roll.` : 'Resolving the fights.';
    if (G.curFight) { say = body; body = ''; pv = duelForecast(G.curFight); pvWhy = duelWhy(G.curFight); }
    if (G.curFight && G.offerShield && canShield(G.curFight, 'good')) {
      body = 'All your models in this Combat carry shields, so you may declare Shielding first: twice the dice, but no Strikes if you win.';
      say += ' Or Shield first: twice the dice, but no Strikes.';
      pv += shieldInfo(G.curFight);
      shieldButton();
    }
    if (G.curFight && G.priority === 'evil' && G.fightNo && G.fightNo.total > 1) body = `The enemy has Priority and fights Combat ${G.combats.indexOf(G.curFight) + 1} next (fight ${G.fightNo.k} of ${G.fightNo.total}). ${body}`;
    if (G.curFight) step = 'duel';
  } else if (G.phase === 'priority') { title = 'Priority'; body = 'Working out who acts first this turn.'; }
  else if (G.phase === 'end') { title = 'End of turn'; body = 'Checking the victory conditions.'; }
  if (G.armed) pv += (pv ? '<br>' : '') + 'Tap the same spot again to confirm.';
  updateLadder(); updateScore();
  if (canUndo()) choices += '<button class="tbtn undo" type="button" data-act="undo" title="Take back the last move (U or Ctrl+Z). Possible until the first dice of this phase are thrown.">Undo the last move</button>';
  $('#toolZones').setAttribute('aria-pressed', zonesShown());
  if (tool.kind) { say = (tool.kind === 'measure' ? 'Measuring tape: drag from a model or a point to another. M or Esc puts it away.' : 'Look from here: click a model to see what it can see. V or Esc ends it.') + (say ? ' ' + say : ''); }
  const inplay = rulesInPlay();
  renderRef();   // the reference column (its open tab) follows the game too
  let desel = '';
  if (say) { body = body.replace(DESELECT, ''); if (say.includes(DESELECT)) { say = say.replace(DESELECT, ''); desel = DESELECT; } }
  if (step !== lastStep) { lastStep = step; whyOpen = showsAtLeast('full') || (!!say && !!body && seenStep(step) < 2); pvWhyOpen = showsAtLeast('full'); }
  const key = [title, say, desel, body, pv, pvWhy, choices, whyOpen, pvWhyOpen, G.flash ? G.flash.msg : '', inplay.join(), prefs.odds, prefs.ruler, prefs.detail].join('|');
  if (key === hintCache) return;
  hintCache = key;
  $('#hTitle').textContent = title;
  $('#hBody').innerHTML = say
    ? `${say}${body ? ` <button class="linkbtn why" type="button" data-why aria-expanded="${whyOpen}" title="The full explanation of this step">Why?</button>` : ''}${desel}${body ? `<span class="why-text"${whyOpen ? '' : ' hidden'}>${body}</span>` : ''}`
    : body;
  $('#hPrev').innerHTML = pv + (pvWhy ? `${pv ? ' ' : ''}<button class="linkbtn why" type="button" data-pvwhy aria-expanded="${pvWhyOpen}" title="Every modifier of this roll, with its rule">Why?</button><span class="why-text pv-why"${pvWhyOpen ? '' : ' hidden'}>${pvWhy}</span>` : '');
  $('#hChoices').innerHTML = choices;
  $('#hChoices').hidden = !choices;
  const seen = new Set();
  linkTerms($('#hBody'), seen); linkTerms($('#hPrev'), seen);
  const f = $('#flash');
  if (G.flash) {
    f.innerHTML = `<b>Not allowed.</b> ${esc(G.flash.msg)}${G.flash.rule && RULES[G.flash.rule] ? chip(G.flash.rule) : ''}`;
    f.hidden = false;
  } else f.hidden = true;
  $('#inplay').innerHTML = inplayHTML(inplay);
  markChips();
}

// The archer's ruler (Options): what the selected shooter could shoot from the planned spot (shotsFrom in rules.js).
function fireNote(F, where) {
  if (F.reason) return `<span class="no">${where} it could not shoot: it ${esc(F.reason)}.</span>`;
  const clear = F.shots.filter(s => s.info.ok), near = F.shots.filter(s => !s.info.ok);
  if (!clear.length && !near.length) return `<span class="muted-inline">${where}: no enemy in range (${F.rng}″).</span>`;
  const line = s => `${esc(s.t.name)}: ${s.info.ok
    ? `To Hit ${s.info.sv}+${s.info.itw.length ? `, In The Way: ${s.info.itw.map(o => esc(o.name)).join(', ')}` : ', clear'}${prefs.odds ? ` (${pct(s.info.p)} to wound)` : ''}`
    : esc(s.info.why.replace(/\.$/, ''))}`;
  const list = [...clear, ...near].slice(0, 5);
  return `<span class="ok">${where}: ${clear.length ? `${clear.length} clear ${clear.length === 1 ? 'shot' : 'shots'}` : 'no clear shot'}</span>${near.length && clear.length ? `, ${near.length} in range but blocked` : ''}.<br>${list.map(line).join('<br>')}${F.shots.length > list.length ? '<br>…' : ''}`;
}

// What a spear or pike moving into base contact with friend f will do (shown under the move preview).
function supportNote(u, f) {
  if (!f || !(u.T.spear || u.T.pike)) return '';
  const fighting = o => G.units.some(e => e.side !== o.side && alive(e) && touching(o, e));
  const behindFighter = q => G.units.some(o => o !== q && o.side === q.side && alive(o) && !o.T.pike && !o.T.spear && !o.T.banner && touching(q, o)) || fighting(q);
  let t;
  if (fighting(f)) t = `It will Support ${f.name}: +1 dice.`;
  else if (!f.T.spear && !f.T.pike) t = `It will Support ${f.name} whenever ${f.name} fights: +1 dice.`;
  else if (u.T.pike && f.T.pike && behindFighter(f)) t = `A pike behind a pike: it Supports the fighter in front of ${f.name} too, so that fighter gets two Supports.`;
  else if (u.T.pike && f.T.spear) t = `Only a pike can Support through a pike. Behind a spear, this pike adds nothing.`;
  else return '';
  return `<br>${esc(t)}`;
}

// The plan for a Jump, Leap or Climb Test (terrain.js planCross): what it costs and what each roll does.
function crossNote(u, X) {
  const name = X.kind === 'leap' ? 'Leap' : X.kind === 'jump' ? 'Jump' : 'Climb', b = X.b;
  const what = b.T ? (b.T.k === 'hedge' ? `a hedge ${fmt(b.dz)}″ high` : `a wall ${fmt(b.dz)}″ high`) : X.kind === 'leap' ? `a gap ${fmt(b.gapW)}″ wide and ${fmt(b.dz)}″ deep`
    : X.kind === 'down' ? `a drop of ${fmt(b.dz)}″` : X.cont ? 'the rest of the cliff' : `a cliff ${fmt(b.dz)}″ high`;
  const walk = [X.stand && `Stand Up (${fmt(X.stand)}″)`, X.approach > 0.1 && `walk ${fmt(X.approach)}″ to it`].filter(Boolean).join(', then ');
  const cost = X.kind === 'jump' || X.kind === 'leap' ? `the ${name} itself takes ${fmt(X.cost)}″ of Move` : `climbing takes ${fmt(X.full)}″ of Move (every inch up or down counts double, as Difficult Terrain)`;
  const one = X.kind === 'jump' ? 'it stumbles and stays, its move over' : X.kind === 'leap' ? `it falls ${fmt(b.dz)}″ into the gap and is Prone${b.dz > 1.2 ? ', with Falling Damage' : ''}`
    : X.cont ? 'it falls from where it hangs and is Prone' : X.kind === 'down' ? 'it falls to the bottom and is Prone, with Falling Damage if the drop is taller than the model' : 'it falls back at the foot and is Prone';
  const part = X.partial ? `<br><span class="no">Not enough Move to finish: on a 2–5 or 6 it climbs ${fmt(X.cost / 2)}″ and hangs there, testing again next turn. A 1 then means a fall from that height.</span>` : '';
  return `<span class="ok">${name} Test over ${what}: ${walk ? walk + ', then ' : ''}${cost}.</span><br>1: ${one}. 2–5: across, and its move is over (if it lands in an enemy's Control Zone it must Charge that enemy). 6: across, and it may carry on moving.${part}`;
}

// A mounted model's charge: whether the Cavalry Charge bonus would apply at the spot, and why not otherwise.
function cavNote(s, p) {
  if (!s.cav || !p.P || !p.t) return '';
  if (p.t.cav || p.t.T.mount) return ' (no Cavalry Charge bonus against cavalry)';
  if (p.P.over) return ' (no Cavalry Charge bonus across a Barrier)';
  if (inBrush(p.P.x, p.P.y, s.r)) return ' (the spot is in Difficult Terrain: no Cavalry Charge bonus)';
  return '. <b>Cavalry Charge:</b> +1 Attack, and the losers are knocked Prone';
}
// A percentage in brackets, only when the player has Show odds on.
const odd = (p, what = '') => prefs.odds ? ` (${pct(p)}${what})` : '';

// Numbered Combats with dice counts (and the chance to win the Duel Roll with Show odds on).
// pick: each line is a button that makes that Combat the next one.
function combatList(cs, cur, pick) {
  if (!cs) return '';
  return cs.map((c, i) => {
    const g = goodsOf(c), e = evilsOf(c); if (!g.length || !e.length) return '';
    const gs = supOf(c, 'good'), es = supOf(c, 'evil');
    const dg = g.reduce((s, u) => s + strikesOf(u, e), 0) + gs.length, de = e.reduce((s, u) => s + strikesOf(u, g), 0) + es.length;
    const tr = trappedIfLose(c, 'evil'), mine = trappedIfLose(c, 'good');
    const sup = list => (list.length ? ` (supported by ${esc(names(list))})` : '');
    const ban = bannerFor(c, 'good') ? '; banner re-roll' : '';
    const B = barrierOf(c);
    const cav = [...g.filter(u => chargeBonus(u, e)), ...e.filter(u => chargeBonus(u, g))];
    const denied = [...g, ...e].filter(u => u.cav && u.charged && !chargeBonus(u, u.side === 'good' ? e : g) && (u.side === 'good' ? e : g).some(f => f.cav || f.T.mountModel));
    const cavNote2 = cav.length ? `; Cavalry Charge for ${esc(names(cav))} (+1 dice, losers knocked Prone)` : denied.length ? `; no Cavalry Charge bonus for ${esc(names(denied))}: enemy cavalry in the Combat` : '';
    const over = !B ? '' : B.mode === 'barrier' ? `; over the ${B.T.k}: ${esc(B.def.name)} defends it, ${esc(B.att.name)}'s Strikes need In The Way 4+, nobody Trapped` : B.mode === 'bothSides' ? `; ${esc(B.def.name)} is attacked from both sides of the ${B.T.k}: no protection` : `; ${esc(B.att.name)} is attacked on its own side of the ${B.T.k}: a normal Combat`;
    // With Show odds: the chance to win, and with Heroes in the fight the chance when a Hero bids all the Might it takes
    // (combat.js: duelOdds): the enemy's always, yours as a second number.
    const gh = g.some(u => isHero(u) && u.might > 0), eh = e.some(u => isHero(u) && u.might > 0);
    const odds = !prefs.odds ? '' : !gh && !eh ? `, ${pct(combatOdds(c))} to win`
      : !gh ? `, ${pct(combatOdds(c, {}, { evil: true }))} to win if the enemy Hero bids its Might`
        : !eh ? `, ${pct(combatOdds(c))} to win, ${pct(combatOdds(c, {}, { good: true }))} with your Hero's Might`
          : `, ${pct(combatOdds(c, {}, { evil: true }))} to win if only the enemy Hero bids Might, ${pct(combatOdds(c, {}, { good: true, evil: true }))} if yours bids too`;
    const ha = [...g, ...e].filter(u => u.decl && u.decl.fight && HEROIC[u.decl.fight]).map(u => `${esc(u.name)}: ${HEROIC[u.decl.fight].n}${u.fvPlus ? ` (FV ${fvOf(u)})` : ''}`);
    const line = `Combat ${i + 1}: ${esc(names(g))}${sup(gs)} vs ${esc(names(e))}${sup(es)}: ${dg} vs ${de} dice${ban}${odds}${cavNote2}${over}${ha.length ? `; ${ha.join(', ')}` : ''}${tr.length ? `; ${esc(names(tr))} Trapped if it loses` : ''}${mine.length ? `; careful: ${esc(names(mine))} Trapped if you lose` : ''}`;
    if (pick) return `<button class="cline${c === cur ? ' on' : ''}" type="button" data-combat="${i}">${line}${c === cur ? ' <b>(next)</b>' : ''}</button>`;
    return c === cur ? `<span class="ok">${line} (next)</span>` : line;
  }).filter(Boolean).join(pick ? '' : '<br>');
}

// Hero points as pips: ● left, ○ spent.
const pips = (n, max) => '●'.repeat(n) + '○'.repeat(Math.max(0, max - n)) + ` ${n}/${max}`;
// A Hero's Heroic Actions on its card (those in play are named in full), and any Heroic Challenge it is in.
function heroCard(u) {
  const acts = heroActions(u).map(k => (G.heroics && G.heroics.has(k) ? HEROIC[k].n : `<span class="muted-inline">${HEROIC[k].n}</span>`)).join(', ');
  const ch = (G.challenges || []).filter(c => c.a === u.id || c.t === u.id).map(c => {
    const o = G.units.find(x => x.id === (c.a === u.id ? c.t : c.a));
    if (!o || !alive(o)) return '';
    return c.a === u.id ? `challenged ${esc(o.name)} (${c.acc ? 'accepted' : c.acc === false ? 'declined' : 'no answer yet'})` : `challenged by ${esc(o.name)} (${c.acc ? 'accepted' : 'declined'})`;
  }).filter(Boolean);
  return `<p class="weapon"><span class="lbl">Heroic Actions</span> ${acts}${ch.length ? ` · Heroic Challenge: ${ch.join('; ')}` : ''}</p>`;
}
// The orders while the game asks the player something about their Heroes (G.ask, set by game/flow.js).
function askHint(a) {
  const h = askHint0(a);
  return { ...h, say: h.say || askSay(a) };
}
// One sentence for each question (the full paragraph goes behind Why?).
function askSay(a) {
  switch (a.kind) {
    case 'might': return `Spend Might to raise ${esc(a.q.u.name)}'s ${a.q.die.v}?`;
    case 'fate': return `Spend a Fate Point? On a 4+ ${esc(a.u.name)} ignores the Wound.`;
    case 'courage': return `Spend Will or Might to pass ${esc(a.u.name)}'s Courage Test?`;
    case 'intelligence': return `Spend Might to pass ${esc(a.u.name)}'s Intelligence Test?`;
    case 'shout': return `Shout ${HEROIC[a.k].shout}? Friends within 6″ join ${esc(a.h.name)}.`;
    case 'challenge': return `Accept the Heroic Challenge of ${esc(a.by.name)}?`;
    case 'weapon': return `Fight with the hand weapon, or two-handed?`;
    case 'throw': return `Throw the ${esc(a.w.n.toLowerCase())} before the Charge?`;
    case 'aim': return `Aim at the rider or at the ${esc(a.t.mount.n.toLowerCase())}?`;
  }
  return '';
}
function askHint0(a) {
  if (a.kind === 'useRule') return { title: esc(a.title), body: esc(a.body), pv: '' };   // a rule of the player's army (flow.js: askRule)
  if (a.kind === 'might') {
    const q = a.q, o = q.opts[0], u = q.u;
    const what = { hit: 'its To Hit roll', itw: 'an In The Way Test', fight: 'the In The Way Test of a shot into a fight', cav: 'the test for rider or mount', wound: 'its To Wound roll', fate: 'its Fate Roll', jump: 'its Jump Test', leap: 'its Leap Test', climb: 'its Climb Test', thrown: 'its Thrown Rider Test', cast: 'its Casting Test (the best dice)', resist: 'its Resist Test (the best dice)' }[q.step] || 'its roll';
    return { title: 'Might: raise the dice?', body: `<b>${esc(u.name)}</b> rolled a ${q.die.v} on ${what} and has ${pl2(u.might, 'Might Point')} left. Might comes last, after any re-roll: each point raises one of the Hero's own dice by 1, never above 6. Points spent here are gone for the rest of the battle, for dice and Heroic Actions alike.`,
      pv: `<span class="ok">${pl2(o.n, 'point')}: ${q.die.v} → ${o.to}, ${esc(a.goal)}.</span>` };
  }
  if (a.kind === 'fate') return { title: 'Fate: prevent the Wound?', body: `<b>${esc(a.u.name)}</b> suffers a Wound. Spend a Fate Point and roll a D6: on a 4+ the Wound is prevented. One point at a time; Might may raise a Fate Roll that falls short.`, pv: `Fate ${a.u.fate}, Might ${a.u.might}, Wounds ${a.u.w}/${a.u.maxW}${odd(0.5)}` };
  if (a.kind === 'courage') return { title: 'Courage: Will or Might?', body: `<b>${esc(a.u.name)}</b> rolled ${a.T.total} against Courage ${a.T.need}+. A Hero may raise the total by 1 for each Will Point, and each Might Point, it spends. If it still fails it flees.`, pv: `Will ${a.u.will}, Might ${a.u.might}: ${a.T.need - a.T.total} more needed.` };
  if (a.kind === 'intelligence') return { title: 'Intelligence: spend Might?', body: `<b>${esc(a.u.name)}</b> rolled ${a.T.total} against Intelligence ${a.T.need}+. A Hero may raise an Intelligence Test by 1 for each Might Point it spends (Will does not help here).`, pv: `Might ${a.u.might}: ${a.T.need - a.T.total} more needed.` };
  if (a.kind === 'shout') {
    const what = { move: 'With Me: the friends within 6″ that have not moved yet Activate right after the Hero, and each must finish within 6″ of it (or not move)', march: 'At the Double: the friends within 6″ that have not moved yet also move 3″ further this turn, may not Charge, and must finish within 6″ of the Hero', shoot: 'Loose: the friends within 6″ may shoot now, together with the Hero; those that do not cannot shoot later this phase', accuracy: 'Take Aim: the friends within 6″ re-roll their failed In The Way Tests this turn' }[a.k];
    return { title: `Shout ${HEROIC[a.k].shout}?`, body: `<b>${esc(a.h.name)}</b> performs a ${HEROIC[a.k].n}. ${what}.`, pv: `Within 6″: ${esc(names(a.reach))}.` };
  }
  if (a.kind === 'challenge') return { title: 'Heroic Challenge', body: `<b>${esc(a.by.name)}</b> challenges <b>${esc(a.u.name)}</b>. Accept, and both Heroes get +1 Attack and +1 To Wound against each other, and must Charge each other when they can. Decline, and ${esc(a.by.name)} still gets its bonuses against ${esc(a.u.name)}, which may never challenge it.`,
    pv: `${esc(a.u.name)}: FV ${fvOf(a.u)}, A ${a.u.a}, W ${a.u.w}, Might ${a.u.might} · ${esc(a.by.name)}: FV ${fvOf(a.by)}, A ${a.by.a}, W ${a.by.w}, Might ${a.by.might}` };
  if (a.kind === 'weapon') {
    const u = a.u, shieldNote = a.half && a.shield ? ' Its shield does not help while it swings the weapon two-handed: −1 Defence in this Combat.' : '';
    return { title: 'Which weapon?', body: `<b>${esc(u.name)}</b> picks the Melee Weapon it fights with in this Combat, before the Duel Roll. Two-handed: −1 on its Duel Roll dice (a natural 6 stays a 6), +1 on its To Wound rolls.${shieldNote}`,
      pv: `Hand weapon: To Wound ${esc(a.hand)} · two-handed: ${esc(a.two)}` };
  }
  if (a.kind === 'throw') return { title: 'Throw first?', body: `<b>${esc(a.u.name)}</b> carries a ${esc(a.w.n.toLowerCase())}. As it Charges it may stop 1″ from <b>${esc(a.t.name)}</b> and throw it, with no penalty for moving; then it finishes the Charge if the target still stands, or moves on if it fell. It cannot shoot again this turn.`, pv: `To Hit ${a.info.sv}+, ${Math.round(a.info.p * 100)}% to wound.` };
  if (a.kind === 'choice') return { title: a.title, body: a.body, pv: '', choices: a.list.map((o, i) => `<button class="cline" type="button" data-choice="${i}">${esc(o.label)}</button>`).join('') };
  if (a.kind === 'aim') return { title: 'Sharpshooter: aim at?', body: `<b>${esc(a.s.name)}</b> is a Sharpshooter: it aims at the rider or the ${esc(a.t.mount.n.toLowerCase())} of ${esc(a.t.name)}, and if the shot hits, it hits that part with no test.`, pv: '' };
  return { title: '', body: '', pv: '' };
}
const pl2 = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// The Declare Heroic Actions step: what has been declared so far, and the player's choices.
function declareHint(dcl) {
  const { q, choices } = dcl, ph = { move: 'Move', shoot: 'Shoot', fight: 'Fight' }[q.phase];
  const made = q.made.map(m => `${m.side === 'good' ? 'You' : 'Enemy'}: ${esc(m.u.name)}, ${HEROIC[m.k].n}${m.t ? ` against ${esc(m.t.name)}` : ''}`);
  const body = `Declare Heroic Actions, at the start of the ${ph} phase. The side without Priority goes first (${G.priority === 'good' ? 'the enemy' : 'you'}), then the sides take turns until both pass one after the other: a side that passed may still answer when the other declares. Now it is your turn: one Heroic Action for one Hero (1 Might Point; one per Hero in each phase), or Pass.`;
  const desc = { move: 'Activate before every other model; may shout With Me', march: '+3″ Move, no Charge; may shout At the Double', resolve: 'pass Broken army Courage Tests, call Stand Fast', shoot: 'shoot before every other model; may shout Loose', accuracy: 'Sharpshooter and re-roll failed In The Way Tests; may shout Take Aim', combat: 'fight this Combat first; win it and slay every enemy to move again', strike: '+D3 Fight Value this phase', strength: 'double Strength for Strikes', defence: 'wounded only on natural 6s', challenge: '+1 Attack and +1 To Wound against the target', channelling: 'its next Casting Test this turn counts as a 6' };
  // One row per Hero: its name, Might pips and a short button per action (the tooltip says what it does).
  const heroes = [...new Set(choices.map(c => c.u))];
  const short = c => (c.k === 'challenge' && c.t ? `Challenge ${esc(c.t.name)}` : esc(HEROIC[c.k].n.replace(/^Heroic /, '')));
  const rows = heroes.map(h => `<div class="hrow"><span class="hname"><b>${esc(h.name)}</b> <span class="mpips" title="Might ${h.might} of ${h.mwf ? h.mwf[0] : h.might}">${'<i class="on"></i>'.repeat(h.might)}${'<i></i>'.repeat(Math.max(0, (h.mwf ? h.mwf[0] : 0) - h.might))}</span></span><span class="hacts">${choices.map((c, i) => (c.u !== h ? '' : `<button class="tbtn hact" type="button" data-decl="${i}" title="${esc(HEROIC[c.k].n)}${c.t ? ` against ${c.t.name}` : ''}: ${esc(c.drum ? 'war drum: free, must shout At the Double, 12″' : `${desc[c.k]}. Might ${c.u.might} → ${c.u.might - 1}`)}">${short(c)}</button>`)).join('')}</span></div>`).join('');
  const pv = made.length ? `Declared so far: ${made.join('; ')}` : '';
  return { title: 'Declare Heroic Actions', say: 'Spend 1 Might to give a Hero a special action this phase, or Pass.', body, pv, choices: rows };
}

/* ---------- Model profile card ---------- */
let cardKey = '';
const STAT_TIPS = {
  MV: 'Move Value: how many inches the model can move', FV: 'Fight Value: wins tied Duel Rolls', SV: 'Shoot Value: the D6 roll needed to hit',
  S: 'Strength', D: 'Defence', A: 'Attacks: dice in a Duel Roll', W: 'Wounds left / starting Wounds',
  C: 'Courage: 2D6 roll needed for a Courage Test', I: 'Intelligence: 2D6 roll needed for an Intelligence Test',
};
// Details: the full profile under the comparison card (button, or key I). Open by default on Full table; the
// player's choice is remembered in the browser.
let details = null;
const DETAILS_KEY = 'captains-school-card-details';
function detailsOpen() {
  if (details == null) { try { const v = localStorage.getItem(DETAILS_KEY); details = v == null ? null : v === '1'; } catch { details = null; } }
  return details == null ? showsAtLeast('full') : details;
}
export function toggleDetails() {
  details = !detailsOpen();
  try { localStorage.setItem(DETAILS_KEY, details ? '1' : '0'); } catch { /* private window */ }
  renderCard(true);
}
// The two models of the card: the selected (or last clicked) one, and the one under the pointer or aimed at.
function cardPair() {
  const a = G.sel || G.inspect, h = G.hoverUnit;
  if (!a) return { a: h, b: null };
  const b = h && h !== a ? h : G.aimAt && G.aimAt !== a ? G.aimAt : null;
  return { a, b };
}
const cardKeyOf = u => [u.id, u.w, u.t, u.might, u.will, u.fate, statusOf(u).map(x => x.t).join(), u.T.powers ? canCastNow(u) : 0, canRingNow(u), canPushNow(u)].join('|');
export function renderCard(force) {
  if (!G) return;
  const { a, b } = cardPair();
  const el = $('#card');
  if (!a) {
    if (cardKey !== 'none' || force) el.innerHTML = '<p class="muted">Hover over a model to see its profile; click one to compare it with others.</p>';
    cardKey = 'none'; return;
  }
  const open = detailsOpen();
  const key = [cardKeyOf(a), b ? cardKeyOf(b) : '', open, G.phase, G.sel === a, prefs.detail, G.turn, (G.challenges || []).length, G.heroics ? G.heroics.size : 0].join('#');
  if (key === cardKey && !force) return;
  cardKey = key;
  renderRef();   // the Armies tab marks the model shown
  const acts = actionsHTML(a);
  el.innerHTML = compareHTML(a, b) + acts
    + `<p class="cmp-more"><button class="linkbtn" type="button" data-details aria-expanded="${open}" title="The full profile: wargear, special rules, Magical Powers (key I)">${open ? 'Hide details' : 'Details'}</button></p>`
    + (open ? `<div class="cmp-details">${profileHTML(a, !!acts)}${b ? profileHTML(b) : ''}</div>` : '');
  const seen = new Set();
  el.querySelectorAll('.cmp-vs, .cmp-state, .profile .state').forEach(x => linkTerms(x, seen));
}
// What the player can do with the model now, from its card: Cast, put on the Ring, push a ladder down, Dismount.
function actionsHTML(u) {
  return [
    canCastNow(u) ? powersCard(u) : '',
    canRingNow(u) ? ringCard(u) : '',
    canPushNow(u) ? `<p class="weapon"><span class="lbl">Siege Ladder</span> An enemy ladder stands here. <button class="linkbtn" type="button" data-push="1" data-u="${u.id}">Push it down (4+)</button></p>` : '',
    u === G.sel && u.side === 'good' && G.phase === 'move' && canDismount(u) ? '<p class="weapon"><button class="linkbtn" type="button" data-dismount>Dismount</button> <span class="muted-inline">(goes on foot for the rest of the game; the mount may run off)</span></p>' : '',
  ].join('');
}
// The full profile; acted: its action buttons are already shown above it.
function profileHTML(u, acted = false) {
  const T = u.T, st = statusOf(u).map(x => x.t);
  const cell = (k, v) => `<div><dt title="${STAT_TIPS[k]}">${k}</dt><dd>${v}</dd></div>`;
  const dNote = T.pd != null ? `<p class="weapon">Defence ${T.pd} on the profile, +1 for the shield = ${T.d}.</p>` : '';
  return `<div class="profile"><div class="card-head"><span class="side-tag ${u.side}">${alignOf(u.side) === 'good' ? 'Good' : 'Evil'}</span><b>${esc(u.name)}</b>${T.full ? `<span class="full">${esc(T.full)}</span>` : ''}</div>
    <p class="kw">${esc(T.kw)} · ${T.base} mm base</p>
    <dl class="stats">${cell('MV', moveVal(u) + '″')}${cell('FV', fvOf(u))}${cell('SV', u.sh + '+')}${cell('S', strikeS(u))}${cell('D', u.d)}${cell('A', u.a)}${cell('W', `${u.w}/${u.maxW}`)}${cell('C', T.c + (u.drained || 0) + '+')}${cell('I', T.i + '+')}</dl>
    <p class="weapon"><button class="linkbtn" type="button" data-lesson="profile">What do these numbers mean?</button></p>
    ${u.cav ? `<p class="weapon"><span class="lbl">${esc(u.mount.n)}</span> MV ${u.mount.mv}″ · FV ${u.mount.f} · S ${u.mount.s} · D ${u.mount.d} · A ${u.mount.a} · W ${u.mount.w}/${u.mount.maxW} · C ${u.mount.c}+. The model fights with the better of rider and mount (shown above); enemies may strike either.</p>` : ''}
    ${u.mwf ? `<p class="weapon"><span class="lbl">Hero</span> Might ${pips(u.might, u.mwf[0])} · Will ${pips(u.will, u.mwf[1])} · Fate ${pips(u.fate, u.mwf[2])}${T.tier ? ` · Hero of ${esc(T.tier)}` : ''}</p>${heroCard(u)}` : ''}
    ${acted && canCastNow(u) ? '' : powersCard(u)}
    ${acted && canRingNow(u) ? '' : ringCard(u)}
    ${canPushNow(u) ? (acted ? '' : `<p class="weapon"><span class="lbl">Siege Ladder</span> An enemy ladder stands here. <button class="linkbtn" type="button" data-push="1" data-u="${u.id}">Push it down (4+)</button></p>`) : u.carry ? '<p class="weapon"><span class="lbl">Siege Ladder</span> Carried (half Move unless its second bearer is beside it); it goes up when the bearer reaches the wall.</p>' : ''}
    ${dNote}
    <p class="weapon"><span class="lbl">Wargear</span> ${esc(T.gear.join(', '))}</p>
    ${(u.missiles && u.missiles.length ? u.missiles : u.bow ? [u.bow] : []).map(w => `<p class="weapon">${esc(w.n)} · range ${w.rng}″ · Strength ${w.s}${w.still ? ' · cannot shoot after moving' : ''}${w.sling ? ' · two shots if it did not move' : ''}${w.thrown ? ' · after any move, or thrown as it Charges' : ''}${w.poison ? ' · Poisoned' : ''}</p>`).join('')}
    ${T.spear ? '<p class="weapon">Spear: Supports a fighting friend in base contact, +1 dice.</p>' : ''}
    ${T.pike ? '<p class="weapon">Pike: Supports like a spear, and also through another pike that is Supporting. No shield, so no −1.</p>' : ''}
    ${T.banner ? `<p class="weapon">Banner: ${BANNER_RANGE}″, one re-roll per Combat for your side. −1 to its own Duel Roll dice.</p>` : ''}
    ${T.note ? `<p class="weapon">${esc(T.note)}</p>` : ''}
    ${T.rules.length ? `<p class="weapon"><span class="lbl">Special rules</span> ${T.rules.map(r => { const on = SPECIALS.includes(specialKey(r.replace(/\s*\(.*$/, ''))); return (RULE_TEXT[r] ? `<span class="rtip" title="${esc(RULE_TEXT[r])}">${esc(r)}</span>` : esc(r)) + (on ? '' : '*'); }).join(', ')}${T.rules.some(r => !SPECIALS.includes(specialKey(r.replace(/\s*\(.*$/, '')))) ? ' <span class="muted-inline">(* not simulated yet)</span>' : ''}</p>` : ''}
    <p class="state">${st.length ? esc(st.join(' · ')) : 'Ready'}</p></div>`;
}

// The One Ring (p. 111): put on or taken off during the Ringbearer's Activation.
function ringCard(u) {
  if (!u.T.ring || u.noRing) return '';
  const btn = canRingNow(u) ? ` <button class="linkbtn" type="button" data-ring="1" data-u="${u.id}">${u.ringOn ? 'Take it off (Courage Test)' : 'Put it on'}</button>` : '';
  return `<p class="weapon"><span class="lbl">The One Ring</span> ${u.ringOn ? 'Worn: Invisible. Sauron\'s Will each Activation (3+).' : 'Not worn.'}${btn}</p>`;
}
// The model's Magical Powers (p. 114–121): Casting Value and range; buttons to Cast one when the player may now.
function powersCard(u) {
  const L = u.T.powers;
  if (!L || !L.length) return '';
  const can = canCastNow(u), now = can ? castable(u).filter(p => targets(u, p).length) : [];   // only powers with a target now
  const items = L.map((p, i) => {
    const label = `${p.n} ${p.cast}+ (${p.rng ? p.rng + '″' : 'Self'})`, tip = POWER_TEXT[p.n.replace(/\s*\(.*\)$/, '')] || '';
    if (now.includes(p)) return `<button class="linkbtn" type="button" data-cast="${i}" data-u="${u.id}" title="${esc(tip)}">${esc(label)}</button>`;
    return `<span class="rtip" title="${esc(tip)}">${esc(label)}</span>${played(p) ? '' : '*'}`;
  });
  const note = now.length ? ' <span class="muted-inline">(click one to Cast it)</span>' : can ? ' <span class="muted-inline">(no target in range and in sight now)</span>' : '';
  return `<p class="weapon"><span class="lbl">Magical Powers</span> ${items.join(', ')}${note}${L.some(p => !played(p)) ? ' <span class="muted-inline">(* not simulated yet)</span>' : ''}</p>`;
}

/* ---------- To Wound chart ---------- */
export function buildChart() {
  let h = '<table class="wc"><thead><tr><th class="corner" scope="col">S \\ D</th>';
  for (let d = 1; d <= 10; d++) h += `<th scope="col" data-d="${d}">${d}</th>`;
  h += '</tr></thead><tbody>';
  for (let s = 1; s <= 10; s++) {
    h += `<tr><th scope="row" data-s="${s}">${s}</th>`;
    for (let d = 1; d <= 10; d++) { const n = woundNeed(s, d); h += `<td data-s="${s}" data-d="${d}">${n ? n.join('/') : '–'}</td>`; }
    h += '</tr>';
  }
  $('#wc').innerHTML = h + '</tbody></table>';
}
let chartKey = '';
export function hlChart(s, d) {
  const key = s == null ? '' : s + ':' + d;
  if (key === chartKey) return;
  chartKey = key;
  document.querySelectorAll('#wc .hl, #wc .hlx').forEach(e => e.classList.remove('hl', 'hlx'));
  if (s == null) return;
  const c = document.querySelector(`#wc td[data-s="${s}"][data-d="${d}"]`); if (c) c.classList.add('hl');
  const r = document.querySelector(`#wc th[data-s="${s}"]`); if (r) r.classList.add('hlx');
  const k = document.querySelector(`#wc th[data-d="${d}"]`); if (k) k.classList.add('hlx');
}

/* ---------- Dice log ---------- */
function diceHTML(groups) {
  return groups.map(g => `<span class="dg"><span class="dl">${esc(g.l)}</span>${g.d.map(x => `<span class="die${x.ok === true ? ' ok' : x.ok === false ? ' no' : ''}">${x.v}</span>`).join('')}</span>`).join('');
}
// Every log entry is also kept as a record for the whole battle (G.record), so the log can later be grouped, filtered
// and expanded, and the end screen can list every roll. A record: n (order), turn, ph, text, dice, why, tone (good or bad
// for the player), plus what the call may pass and what is worked out here when it does not:
//   units: ids of the models the entry is about, in the order the text names them (found by their names);
//   side: the side of the model acting, the first one named ('good' is the player's side, as everywhere in the game;
//     null when no model is named);
//   kind: 'roll' when dice were thrown, otherwise 'event'; auto: true for a step the rules made happen on their own;
//   mods: the modifiers of a roll, [{ v, why }] (filled by the rolls that can itemise them).
export const logRecords = () => (G && G.record) || [];
function namedUnits(text) {
  if (!text || !G) return [];
  const found = [];
  // Longest names first, so "Warrior of Rohan 1" does not match inside "Warrior of Rohan 12".
  const us = [...G.units].sort((a, b) => b.name.length - a.name.length), taken = [];
  for (const u of us) {
    const re = new RegExp(u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9])', 'g');
    let m;
    while ((m = re.exec(text))) {
      if (taken.some(([a, b]) => m.index < b && m.index + u.name.length > a)) continue;
      taken.push([m.index, m.index + u.name.length]); found.push([m.index, u]);
    }
  }
  return [...new Map(found.sort((a, b) => a[0] - b[0]).map(([, u]) => [u.id, u])).values()];
}
function record(e) {
  const named = e.units ? e.units.map(id => G.units.find(u => u.id === id)).filter(Boolean) : namedUnits(e.text);
  const r = {
    n: (G.record || []).length, turn: G.turn, ph: e.ph || '', text: e.text || '', dice: e.dice || [], why: e.why || [], tone: e.tone || null,
    units: named.map(u => u.id), side: e.side || (named[0] ? named[0].side : null),
    kind: e.kind || (e.dice && e.dice.length ? 'roll' : 'event'), auto: !!e.auto, mods: e.mods || [],
  };
  (G.record || (G.record = [])).push(r);
  return r;
}
export function log(e) {
  record(e);
  renderLog();   // logview.js draws the log from the records
  noteLog();
  renderRef();
}
