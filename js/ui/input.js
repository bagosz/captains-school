// Mouse and touch on the board: selecting, moving, charging and shooting; zooming and moving the view.
import { G, ABORT, prefs } from '../state.js';
import { $, fmt } from '../util.js';
import {
  alive, sideAlive, canMove, engaged, remaining, validateMove, furthestMove, chargeSpot, chargeFail, shooterReason, throwWeapon, shotInfo, shotsFrom, snapSpots, wallSpots, names, alignOf, canDefend, moveVal,
} from '../engine/rules.js';
import { mustCharge } from '../engine/heroes.js';
import { frayBound } from '../engine/named.js';
import { spellbound } from '../engine/magic.js';
import { canDeploy } from '../engine/matched.js';
import { joinCombat, unpaired, describeCombat } from '../engine/combat.js';
import { doMove, doShoot, finish, outcome, resolveWaiter, refreshPairing, doCross, needsActivation, activateModel, chargeNerveAct, throwOnCharge, playerRamp } from '../game/flow.js';
import { rams } from '../engine/beasts.js';
import { chargeTests } from '../engine/special.js';
import { planCross } from '../engine/terrain.js';
import { sfx } from './audio.js';
import { coach } from './lessons.js';
import { boardCanvas, toBoard, animTo, animFrom, zoomAt, panBy, resetZoom, zoomInfo, pxPerInch } from './board.js';
import { pushUndo, popUndo, canUndo } from '../game/undo.js';
import { renderLog } from './logview.js';
import { updateHint, renderCard, updateMission, log, hlChart, setBusy, toggleDetails } from './panel.js';
import { tool, setTool, toolOn, toolPointer, toggleZones, zonesShown, initOverlays } from './overlays.js';
import { setRefTab } from './reference.js';

let lastPtr = 'mouse', toolPtr = null;
// The tool buttons beside the zoom show which tool is on (overlays.js); the board shows a hint while one is.
export function toolButtons() {
  $('#toolMeasure').setAttribute('aria-pressed', tool.kind === 'measure');
  $('#toolLook').setAttribute('aria-pressed', tool.kind === 'look');
  $('#toolZones').setAttribute('aria-pressed', zonesShown());
  boardCanvas.classList.toggle('tooling', !!tool.kind);
  updateHint();
}

// Moving the view: the mouse wheel (or a trackpad pinch) zooms around the pointer; once zoomed in, dragging the table
// or the middle mouse button moves it, two fingers pinch and move it; the zoom buttons and +, -, 0 and the arrow keys.
// A drag that moved the view is not a click.
const ptrs = new Map();   // pointers pressed on the board: id -> { x, y }
let drag = null;          // one pointer that may become a drag: { id, x, y, moved }
let pinch = null;         // two fingers: { d: their distance, mx, my: their midpoint }
let noClickUntil = 0;
const DRAG_PX = 6;
// Keeps the drag going when the pointer leaves the board (a pointer that is already gone cannot be captured).
const capture = (cv, id) => { try { cv.setPointerCapture(id); } catch (e) { /* ignore */ } };

function hoverAt(e) {
  if (!G || e.pointerType === 'touch') return;
  const p = toBoard(e); G.hoverPt = p;
  G.hoverUnit = targetAt(p, unitAt(p));
  updateHover();
}

export function initInput() {
  const cv = boardCanvas;
  cv.addEventListener('pointerdown', e => {
    lastPtr = e.pointerType || 'mouse';
    if (e.button !== 0 && e.button !== 1) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null;
      return;
    }
    if (e.button === 0 && toolOn()) { const p = toBoard(e); if (toolPointer('down', p, unitAt(p))) { capture(cv, e.pointerId); toolPtr = e.pointerId; return; } }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: e.button === 1 };
    if (e.button === 1) { e.preventDefault(); capture(cv, e.pointerId); cv.classList.add('panning'); }
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch.d > 0 && d > 0) zoomAt(d / pinch.d, mx, my);
      panBy(pinch.mx - mx, pinch.my - my);
      pinch = { d, mx, my };
      return;
    }
    if (toolPtr === e.pointerId) { const p = toBoard(e); toolPointer('move', p, unitAt(p)); hoverAt(e); return; }
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > DRAG_PX && zoomInfo().zoom > 1) { drag.moved = true; capture(cv, e.pointerId); cv.classList.add('panning'); }
      if (drag.moved) { panBy(-dx, -dy); drag.x = e.clientX; drag.y = e.clientY; return; }
    }
    hoverAt(e);
  });
  const release = e => {
    ptrs.delete(e.pointerId);
    if (toolPtr === e.pointerId) { toolPtr = null; toolPointer('up'); noClickUntil = performance.now() + 100; }
    if (pinch) noClickUntil = performance.now() + 300;
    if (ptrs.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId) { if (drag.moved) noClickUntil = performance.now() + 100; drag = null; cv.classList.remove('panning'); }
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('pointerleave', () => { if (!G) return; G.hoverPt = null; G.hoverUnit = null; updateHover(); });
  cv.addEventListener('click', e => { if (performance.now() < noClickUntil || toolOn()) return; onClick(toBoard(e)); });
  cv.addEventListener('wheel', e => {
    if (!G) return;
    e.preventDefault();
    // A mouse wheel notch is about 100 (3 lines in Firefox); trackpads send small steps, and a pinch as ctrl + wheel.
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    hoverAt(e);
  }, { passive: false });
  $('#zoomIn').addEventListener('click', () => zoomAt(1.25));
  $('#zoomOut').addEventListener('click', () => zoomAt(0.8));
  $('#zoomFit').addEventListener('click', resetZoom);
  $('#toolMeasure').addEventListener('click', () => setTool('measure'));
  $('#toolLook').addEventListener('click', () => setTool('look'));
  $('#toolZones').addEventListener('click', toggleZones);
  initOverlays(toolButtons);
  // Deselect: right-click on the board, Escape, or the Deselect button in the orders panel.
  cv.addEventListener('contextmenu', e => { e.preventDefault(); deselect(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) && canUndo()) { e.preventDefault(); undoMove(); return; }
    if (e.key === 'Escape') { if (toolOn()) { setTool(tool.kind); return; } deselect(); }
    // Zoom and move the view from the keyboard, unless a dialog or menu is open or a form field has the focus.
    if (!G || e.ctrlKey || e.metaKey || e.altKey || !$('#modal').hidden || !$('#menu').hidden || !$('#lesson').hidden || !$('#options').hidden
      || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const step = 60, arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-' || e.key === '_') zoomAt(0.8);
    else if (e.key === '0') resetZoom();
    else if (e.key === 'i' || e.key === 'I') toggleDetails();
    else if (e.key === 'm' || e.key === 'M') setTool('measure');
    else if (e.key === 'v' || e.key === 'V') setTool('look');
    else if (e.key === 'z' || e.key === 'Z') toggleZones();
    else if (e.key === 'l' || e.key === 'L') setRefTab('log', true);
    else if (e.key === '?') setRefTab('rules', true);
    else if ((e.key === 'u' || e.key === 'U') && canUndo()) undoMove();
    else if (arrows[e.key] && zoomInfo().zoom > 1) { e.preventDefault(); panBy(...arrows[e.key]); }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-act="deselect"]')) deselect();
    else if (e.target.closest('[data-act="pair-reset"]')) resetPairing();
    else if (e.target.closest('[data-act="undo"]')) undoMove();
  });
}

// Undo (game/undo.js): the last move goes back, its log lines with it; the models slide back to where they stood.
function undoMove() {
  const moved = popUndo();
  if (!moved) return;
  for (const { u, from } of moved) animFrom(u, from, 260);
  G.preview = null; G.armed = null; G.flash = null;
  renderLog(true); updateMission(); renderCard(true); updateHover();
}

function deselect() {
  if (!G || G.busy || (!G.sel && !G.armed)) return;
  G.sel = null; G.armed = null; G.flash = null;
  updateHover();
}

// Where a move to point p really ends: a point beyond the model's reach is pulled back along the line to the
// edge of its Move, then snapped into base contact with a nearby friend if that is legal.
// A Prone model Crawls (up to 1″, then its move is over) when the point is that close, and otherwise Stands Up for
// half its Move and moves on with the rest (p. 37): P then carries crawl or stand, and v.cost includes standing.
function moveTarget(m, p, rem) {
  const crawl = !!m.prone && Math.hypot(p.x - m.x, p.y - m.y) <= 1.05, stand = m.prone && !crawl ? moveVal(m) / 2 : 0;
  const lim = crawl ? Math.min(1, rem) : rem - stand;
  const mark = (r, P) => ({ ...r, P: { ...P, crawl, stand }, v: { ...r.v, cost: r.v.cost != null ? r.v.cost + stand : r.v.cost }, crawl, stand });
  const Q = furthestMove(m, p, Math.max(0, lim));
  // The snap reaches at least 8 pixels, so bases that look touching on a zoomed-out table do touch.
  for (const snap of snapSpots(m, Q, Math.max(0.35, 8 / pxPerInch()))) {
    const v = validateMove(m, snap, lim);
    if (v.ok) return mark({ v, contact: snap.friend }, { x: snap.x, y: snap.y });
  }
  // Just short of a wall or hedge, or on top of it: the model stops in base contact with it (to shoot over a wall,
  // or to Jump the hedge next turn). wall: what it stands against ('the wall' or 'the hedge').
  for (const ws of wallSpots(m, Q)) {
    const v = validateMove(m, ws, lim);
    if (v.ok) return mark({ v, contact: null, wall: `the ${ws.wall.k}${canDefend(m, ws.wall) ? ', defending it' : ''}` }, { x: ws.x, y: ws.y });
  }
  return mark({ v: validateMove(m, Q, lim), contact: null }, Q);
}
// Where a model deployed at p stands: in base contact with a low wall it was placed just short of, when that is allowed.
function deploySpot(m, p) {
  const w = wallSpots(m, p).find(w => canDeploy(m, w.x, w.y).ok);
  return w ? { x: w.x, y: w.y } : { x: p.x, y: p.y };
}
// A point beyond a hedge, a cliff or a gap: the model walks up to it and takes a Jump, Leap or Climb Test (terrain.js).
// A Crawling model cannot take one. Returns the plan, or null when the click is an ordinary move.
function crossTarget(m, p) {
  if (m.prone && Math.hypot(p.x - m.x, p.y - m.y) <= 1.05) return null;
  return planCross(m, p);
}

// The Back Away spot closest to point p (within 0.8″), while the player chooses one.
export function nearestBackAway(p) {
  if (!G.backAway || !p) return null;
  let best = null, bd = 0.8;
  for (const o of G.backAway.opts) { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } }
  return best;
}

function unitAt(p) {
  let best = null, bd = Infinity;
  for (const u of G.units) { if (u.dead || u.gone) continue; const d = Math.hypot(u.x - p.x, u.y - p.y); if (d <= u.r + 0.2 && d < bd) { bd = d; best = u; } }
  return best;
}
// Which side of the enemy's base the pointer is on; null near the centre (then the shortest path wins).
function aimAround(p, t) {
  return Math.hypot(p.x - t.x, p.y - t.y) < t.r * 0.3 ? null : Math.atan2(p.y - t.y, p.x - t.x);
}
// While moving a selected model, the rim around a friend's base means "place next to it",
// and only a click inside the base selects that friend.
function targetAt(p, u) {
  if (u && G.mode === 'move' && G.sel && u !== G.sel && u.side === G.sel.side && Math.hypot(u.x - p.x, u.y - p.y) > u.r) return null;
  return u;
}

// On touch screens the first tap previews and a second tap on the same spot confirms.
function needsConfirm(p) {
  if (lastPtr !== 'touch') return false;
  if (G.armed && Math.hypot(G.armed.x - p.x, G.armed.y - p.y) < 0.6) { G.armed = null; return false; }
  G.armed = p; G.hoverPt = p; G.hoverUnit = unitAt(p); updateHover();
  return true;
}
function flash(msg, rule) { G.flash = { msg, rule }; updateHint(); }
function clearFlash() { if (G.flash) { G.flash = null; updateHint(); } }

// Starting to move another model ends the previous model's move (one activation at a time).
function finishActive(except) {
  const a = G.active;
  if (a && a !== except && !a.done && a.movedDist > 0) {
    a.done = true;
    log({ ph: 'Move', text: `${a.name} finishes its move (${fmt(a.movedDist)}″ of ${moveVal(a)}″ used).`, why: ['move'] });
  }
}

/* ---------- Fight phase: Pairing Off, order of Combats, Strikes ---------- */
// The group of models in base contact a model belongs to. The player splits every group by hand, with no hints
// on the table: a click that breaks the rules is refused and the reason shown.
const openOf = u => G.pairing && G.pairing.open.find(o => o.units.includes(u));
function onPairClick(u) {
  if (!u) { deselect(); return; }
  const sel = G.sel;
  if (sel && u !== sel) {
    // Another model of the same side that is not in a Combat yet: select it instead.
    const ou = openOf(u);
    if (ou && u.side === sel.side && unpaired(ou).includes(u)) { G.sel = u; clearFlash(); updateHover(); return; }
    const o = openOf(sel), r = joinCombat(o.made, o.opts, sel, u);
    if (!r.made) { G.sel = null; flash(r.why, 'pairoff'); updateHover(); return; }
    o.made = r.made;
    const c = o.made[o.made.length - 1];
    log({ ph: 'Fight', why: ['pairoff'], text: `${sel.name} ${c.length > 2 ? 'joins' : 'forms'} a Combat: ${describeCombat(c)}.${r.freed.length ? ` ${names(r.freed)} ${r.freed.length > 1 ? 'are' : 'is'} no longer in a Combat.` : ''}` });
    G.sel = null; clearFlash(); refreshPairing(); updateHover(); return;
  }
  if (!openOf(u)) { G.sel = null; flash(`${u.name} is not in base contact with an enemy, so it does not fight this turn.`, 'pairoff'); updateHover(); return; }
  G.sel = sel === u ? null : u;
  clearFlash(); updateHover();
}
// The panel's Start again button: every Combat is taken apart.
function resetPairing() {
  if (!G || G.mode !== 'pair' || !G.pairing) return;
  for (const o of G.pairing.open) o.made = [];
  G.sel = null; G.flash = null;
  refreshPairing(); updateHover();
}
function onOrderClick(u) {
  const c = u && G.combats.find(x => x.includes(u));
  if (!c) { if (u) { G.inspect = u; renderCard(true); } return; }
  G.curFight = c; clearFlash(); updateHint();
}

/* ---------- Deployment (matched play) ---------- */
// Click one of your models, then the spot inside your deployment zone where it should stand.
function onDeployClick(p, u) {
  if (u && u.side === 'good') { G.sel = G.sel === u ? null : u; clearFlash(); updateHover(); return; }
  if (!G.sel) { if (u) { G.inspect = u; renderCard(true); } return; }
  const m = G.sel, P = deploySpot(m, p), v = canDeploy(m, P.x, P.y);
  if (!v.ok) { flash(v.why, 'move'); return; }
  if (needsConfirm(p)) return;
  animTo(m, P, 220);
  G.sel = null; G.preview = null; G.armed = null; clearFlash(); updateHover();
}

// Why the player's model u may not be picked now: a Heroic Move, its With Me or a Heroic Combat lets only some models
// act (G.only). null when it may.
const onlyWhy = u => (G.only && !G.only.includes(u) ? `Only ${names(G.only)} may act now; press the button when you are done.` : null);
// An accepted Heroic Challenge (p. 85): the Hero must Charge its opponent when it can, so no other move is allowed.
function duelWhy(m, t) {
  const o = mustCharge(m);
  if (!o || t === o || !chargeSpot(m, o, remaining(m))) return null;   // into o's fight too ("if possible", p. 68)
  return `${m.name} is in an accepted Heroic Challenge with ${o.name}, and both must Charge each other when they can: ${m.name} can reach ${o.name}, so it must Charge it.`;
}
// Into the Fray (Helm Hammerhand): once he has slain an enemy, a Move must be a Charge when one is possible.
function frayWhy(m) {
  if (!frayBound(m) || !sideAlive('evil').some(f => chargeSpot(m, f, remaining(m)))) return null;
  return `Into the Fray: ${m.name} has slain an enemy, so whenever he Moves he must Charge if he can. Click an enemy he can reach.`;
}

function onClick(p) {
  if (!G || G.over || G.busy) return;
  const u = targetAt(p, unitAt(p));
  if (G.ask && G.ask.kind === 'heroicPick') { if (u && G.ask.list.includes(u)) resolveWaiter(u); else if (u) flash(`Pick one of ${names(G.ask.list)}.`, 'heroic'); return; }
  // A choice among models (a Magical Power's target): clicking one of them on the board picks it; nothing else moves meanwhile.
  if (G.ask && G.ask.kind === 'choice') { const o = u && G.ask.list.find(x => x.val === u); if (o) resolveWaiter({ pick: true, val: o.val }); else flash('Pick one of the choices in the panel.'); return; }
  if (G.step === 'good' && G.mode === 'deploy') { onDeployClick(p, u); return; }
  if (G.step === 'good' && G.mode === 'pair') { onPairClick(u); return; }
  if (G.step === 'good' && G.mode === 'order') { onOrderClick(u); return; }
  if (G.step === 'good' && G.mode === 'backaway') {
    const o = nearestBackAway(p);
    if (o) resolveWaiter(o); else flash(`Click one of the marked spots around ${G.backAway.l.name}: that is where it Backs Away.`, 'backaway');
    return;
  }
  if (G.step === 'good' && G.mode === 'strike') {
    if (u && G.strike.cands.includes(u)) { resolveWaiter(u); return; }
    if (u) flash(`${G.strike.w.name} can only strike an enemy it is fighting in this Combat.`, 'strikes');
    return;
  }
  if (G.mode === 'move' && G.step === 'good') {
    if (u && u.side === 'good') {
      const ow = onlyWhy(u);
      if (ow && u !== G.sel) { flash(ow, 'heroic'); return; }
      if (canMove(u) && rams(u)) {   // a Chariot Charge or a Trample: the player picks where it goes
        finishActive(u); G.sel = null; G.armed = null; clearFlash(); setBusy(true); updateHover();
        playerRamp(u).then(() => { setBusy(false); updateHover(); }).catch(e => { if (e !== ABORT) console.error(e); });
        return;
      }
      if (canMove(u)) {
        if (G.sel === u) G.sel = null;
        else if (needsActivation(u)) {   // the start of its Activation: a Broken army's Courage Test, a Heroic March's shout
          finishActive(u); G.sel = null; G.armed = null; clearFlash(); setBusy(true); updateHover();
          activateModel(u).then(ok => { setBusy(false); if (ok && canMove(u)) G.sel = u; updateHover(); }).catch(e => { if (e !== ABORT) console.error(e); });
          return;
        } else { finishActive(u); G.sel = u; }
        G.armed = null; clearFlash();
      }
      else {
        G.sel = null; G.inspect = u; renderCard(true);   // its card may still offer a Magical Power (it just moved)
        if (spellbound(u)) flash(`${u.name} is Transfixed or Paralysed: it cannot Activate.`, 'magic');
        else if (engaged(u) && u !== G.active) flash(`${u.name} is Engaged in Combat and cannot move.`, 'charge');
        else flash(`${u.name} has already finished its move this turn.`, 'move');
      }
      updateHover(); return;
    }
    if (!G.sel) { if (u) { G.inspect = u; renderCard(true); } return; }
    const m = G.sel, rem = remaining(m);
    if (u && u.side === 'evil') {
      if (G.m.noCharge) { flash(G.m.noCharge, 'cz'); return; }   // scenario rule
      const dw = duelWhy(m, u); if (dw) { flash(dw, 'heroicChallenge'); return; }
      const c = chargeSpot(m, u, rem, aimAround(p, u));
      if (!c) { flash(chargeFail(m, u), 'charge'); return; }
      if (needsConfirm(p)) return;
      pushUndo();
      if (chargeTests(m, u).length || u.ringOn) {   // Terror, Fearful: Courage Tests first; a failure ends the model's Move (an Invisible target: an Intelligence Test)
        setBusy(true);
        chargeNerveAct(m, u).then(ok => { setBusy(false); if (ok) charge(m, u, c); else { G.active = m; afterPlayerMove(); } updateHover(); }).catch(e => { if (e !== ABORT) console.error(e); });
        return;
      }
      charge(m, u, c); return;
    }
    const dw = duelWhy(m, null); if (dw) { flash(dw, 'heroicChallenge'); return; }
    const fw = frayWhy(m); if (fw) { flash(fw, 'intoTheFray'); return; }
    const X = crossTarget(m, p);
    if (X && X.ok) {
      if (needsConfirm(p)) return;
      pushUndo(); finishActive(m); G.active = m; G.sel = null; G.preview = null;
      setBusy(true); updateHint();
      doCross(m, X).then(() => { setBusy(false); afterPlayerMove(); }).catch(e => { if (e !== ABORT) console.error(e); });
      return;
    }
    const { P, v, contact, wall, stand, crawl } = moveTarget(m, p, rem);
    if (!v.ok) { flash(X && !v.barrier ? v.why : X ? X.why : v.why, X ? (X.kind === 'jump' ? 'jump' : X.kind === 'leap' ? 'leap' : 'climb') : v.rule); return; }
    if (needsConfirm(p)) return;
    pushUndo();
    if (stand) log({ ph: 'Move', text: `${m.name} Stands Up (${fmt(stand)}″ of its Move).`, why: ['prone'] });
    doMove(m, P, v.cost); G.active = m;
    if (crawl) log({ ph: 'Move', text: `${m.name} is Prone and Crawls ${fmt(v.cost)}″: that is all it can do this move.`, why: ['prone'] });
    const left = remaining(m);
    log({ ph: 'Move', text: `${m.name} moves ${fmt(v.cost)}″${v.inBrush > 0 ? `, including ${fmt(v.inBrush)}″ extra for Difficult Terrain` : ''}${contact ? `, into base contact with ${contact.name}` : wall ? `, into base contact with ${wall}` : ''}. ${left > 0.05 ? `${fmt(left)}″ of Move left.` : 'Move used up.'}`, why: v.inBrush > 0 ? ['move', 'terrain'] : ['move'] });
    afterPlayerMove(); return;
  }
  if (G.mode === 'shoot' && G.step === 'good') {
    if (u && u.side === 'good') {
      const ow = onlyWhy(u);
      if (ow) { flash(ow, 'heroicShoot'); return; }
      const r = shooterReason(u);
      if (!r) { G.sel = G.sel === u ? null : u; G.armed = null; clearFlash(); }
      else { G.sel = null; flash(`${u.name} ${r}.`, 'shoot'); }
      updateHover(); return;
    }
    if (G.sel && u && u.side === 'evil') {
      const i = shotInfo(G.sel, u);
      if (!i.ok) { flash(i.why, i.rule); return; }
      if (needsConfirm(p)) return;
      const s = G.sel; G.sel = null; G.preview = null;
      setBusy(true); updateHint();
      doShoot(s, u, i).then(() => { setBusy(false); afterPlayerShoot(); }).catch(e => { if (e !== ABORT) console.error(e); });
      return;
    }
    if (u) { G.inspect = u; renderCard(true); } else deselect();   // a click on empty table drops the shooter
    return;
  }
  if (u) { G.inspect = u; renderCard(true); }
}

// The player's model m Charges u at spot c.
function charge(m, u, c) {
  if (throwWeapon(m, u)) {   // a throwing weapon: the player may throw it first (flow.js: throwOnCharge)
    setBusy(true);
    throwOnCharge(m, u, c).then(rest => {
      setBusy(false);
      if (rest == null) { G.active = m; afterPlayerMove(); return; }
      chargeOn(m, u, rest);
    }).catch(e => { if (e !== ABORT) console.error(e); });
    return;
  }
  chargeOn(m, u, c);
}
function chargeOn(m, u, c) {
  doMove(m, c, c.cost); m.done = true; G.active = m;
  sfx.horn(alignOf('good'));
  log({ ph: 'Move', text: `${m.name} charges ${u.name}${c.over ? ` over the ${c.over.T.k} it defends: it stops against the ${c.over.T.k}, as close to the defender as it can` : ''} (${fmt(c.cost)}″). Both models are now Engaged in Combat.`, why: c.over ? ['charge', 'barriers'] : ['charge'], tone: 'good' });
  afterPlayerMove();
}
function afterPlayerMove() {
  const m = G.active;
  G.sel = m && canMove(m) ? m : null;   // keep the model selected while it has Move left
  G.preview = null; G.armed = null; G.flash = null;
  updateMission(); renderCard(true);
  const r = outcome(false);
  if (r) { finish(r); return; }
  updateHover();
}

function afterPlayerShoot() {
  G.armed = null; G.flash = null;
  updateMission(); renderCard(true);
  const r = outcome(false);
  if (r) { finish(r); return; }
  const more = (G.only || sideAlive('good')).some(s => s.bow && alive(s) && sideAlive('evil').some(t => shotInfo(s, t).ok));
  if (!more) setTimeout(() => { if (G.mode === 'shoot') { log({ auto: true, ph: 'Shoot', text: G.only ? 'No more shots available, so the Heroic Shoot ends.' : 'No more shots available, so your shooting ends.' }); resolveWaiter(); } }, 500);
  updateHover();
}

export function updateHover() {
  if (!G) return;
  G.preview = null; G.fire = null;
  const s = G.sel, p = G.hoverPt, u = p ? targetAt(p, G.hoverUnit) : G.hoverUnit;
  if (G.mode === 'deploy' && G.step === 'good' && s && p && !u) {
    const P = deploySpot(s, p), v = canDeploy(s, P.x, P.y);
    G.preview = { type: 'deploy', ok: v.ok, P, why: v.why };
  } else if (G.mode === 'move' && G.step === 'good' && s && p) {
    const rem = remaining(s);
    if (u && u.side !== s.side && G.m.noCharge) G.preview = { type: 'charge', ok: false, why: G.m.noCharge, t: u };
    else if (u && u.side !== s.side) {
      const c = chargeSpot(s, u, rem, aimAround(p, u));
      G.preview = c ? { type: 'charge', ok: true, P: c, cost: c.cost, inBrush: c.inBrush, t: u } : { type: 'charge', ok: false, why: chargeFail(s, u), t: u };
    } else if (!u) {
      const X = crossTarget(s, p);
      if (X && X.ok) { G.preview = { type: 'cross', ok: true, X, P: X.landing, cost: X.stand + X.approach + X.cost }; coach('cross'); }
      else {
        const { P, v, contact, wall, stand, crawl } = moveTarget(s, p, rem);
        G.preview = { type: 'move', ok: v.ok, P, cost: v.cost, inBrush: v.inBrush, why: !v.ok && X ? X.why : v.why, contact: contact ? contact.name : wall || null, contactU: contact, stand, crawl };
      }
    }
  }
  // The archer's ruler (Options): lines of fire from the planned spot, or from where the shooter stands.
  if (G.mode === 'move' && G.step === 'good' && s && s.bow && !G.m.noShoot && prefs.ruler) {
    const pv = G.preview;
    if (!pv) G.fire = shotsFrom(s, s, 0);
    else if (pv.type === 'move' && pv.ok) G.fire = shotsFrom(s, pv.P, pv.cost);
  }
  if (G.mode === 'shoot' && G.step === 'good' && s && u && u.side !== s.side) {
    const info = shotInfo(s, u);
    G.preview = { type: 'shot', t: u, info };
    hlChart(s.bow.s, u.d);
  }
  updateHint(); renderCard();
}
