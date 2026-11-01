// Undo of the player's moves in the Move phase, until the first dice of the phase are thrown (as in Into the Breach,
// and the undo policy of Board Game Arena: a move that revealed nothing random can be taken back). Each player move
// first saves every model's state; Undo puts the last one back and drops the log entries made since. No DOM here.
import { G } from '../state.js';

let undo = null;   // { from: G.record length when the player's Move step began, stack: [snapshots] }

// The player's Move step begins (and ends: null).
export function beginUndo() { undo = G ? { from: (G.record || []).length, stack: [] } : null; }
export function endUndo() { undo = null; }

const copy = v => (Array.isArray(v) ? v.map(copy) : v instanceof Set ? new Set(v) : v instanceof Map ? new Map(v)
  : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && !v.k && !v.n ? { ...v } : v);
// A model's own state; its profile (T), its mount's profile and other shared objects stay shared.
function unitState(u) {
  const s = {};
  for (const k of Object.keys(u)) s[k] = k === 'T' || k === 'anim' ? u[k] : k === 'mount' && u.mount ? { ...u.mount } : copy(u[k]);
  return s;
}

// Called right before a player move is carried out.
export function pushUndo() {
  if (!undo || !G) return;
  undo.stack.push({ units: G.units.map(unitState), rec: (G.record || []).length, active: G.active ? G.active.id : null, sel: G.sel ? G.sel.id : null });
}
// Whether the last move can be taken back: the player's Move step, nothing thrown in this phase since it began.
export function canUndo() {
  if (!undo || !undo.stack.length || !G || G.phase !== 'move' || G.step !== 'good' || G.mode !== 'move' || G.busy) return false;
  return !(G.record || []).slice(undo.from).some(r => r.kind === 'roll');
}
// Puts the last move back. Returns the models whose position changed (to animate them back), or null.
export function popUndo() {
  if (!canUndo()) return null;
  const S = undo.stack.pop(), moved = [];
  G.units.forEach((u, i) => {
    const s = S.units[i];
    if (!s) return;
    const from = { x: u.x, y: u.y };
    for (const k of Object.keys(u)) if (!(k in s)) delete u[k];
    for (const k of Object.keys(s)) u[k] = k === 'T' || k === 'anim' ? s[k] : k === 'mount' && s.mount ? { ...s.mount } : copy(s[k]);
    if (from.x !== u.x || from.y !== u.y) moved.push({ u, from });
  });
  if (G.record) G.record.length = S.rec;
  G.active = G.units.find(u => u.id === S.active) || null;
  G.sel = G.units.find(u => u.id === S.sel) || null;
  return moved;
}
