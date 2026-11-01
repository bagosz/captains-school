// Board tools beside the game's own clicks: the measuring tape (the rules allow measuring any distance at any time,
// base edge to base edge), "Look from here" (Line of Sight from any model, with what is In The Way), and the switch
// for the Control Zones. board.js draws them; input.js hands them the pointer while a tool is on.
import { G } from '../state.js';
import { gap } from '../engine/geometry.js';
import { alive, hiddenBy, inTheWay } from '../engine/rules.js';

export const tool = { kind: null, a: null, b: null, look: null, zones: null };
let onChange = () => {};
export function initOverlays(changed) { onChange = changed; }

// kind: 'measure' or 'look'; the same again switches it off.
export function setTool(kind) {
  tool.kind = tool.kind === kind ? null : kind;
  if (tool.kind !== 'measure') { tool.a = tool.b = null; }
  if (tool.kind !== 'look') tool.look = null;
  onChange();
}
export const toolOn = () => !!tool.kind;
// Control Zones: drawn in the player's Move step (and always where a mission says so); key Z shows or hides them at
// any time, until the next game (null: the default).
export function toggleZones() { tool.zones = !zonesShown(); onChange(); }
export function zonesShown() {
  if (tool.zones != null) return tool.zones;
  return !!G && !!(G.m.alwaysCZ || (G.mode === 'move' && G.step === 'good'));
}
export function resetTools() { tool.kind = null; tool.a = tool.b = tool.look = null; tool.zones = null; cache = null; }

// A point of the tape: on a model it measures from that model's base edge.
const end = (p, u) => ({ x: p.x, y: p.y, u: u && alive(u) ? u : null });
// Pointer events while a tool is on; returns true when the tool took the event.
export function toolPointer(kind, p, u) {
  if (!tool.kind || !G) return false;
  if (tool.kind === 'measure') {
    if (kind === 'down') { tool.a = end(u ? { x: u.x, y: u.y } : p, u); tool.b = end(p, null); tool.dragging = true; }
    else if (kind === 'move' && tool.dragging) tool.b = end(u && u !== (tool.a && tool.a.u) ? { x: u.x, y: u.y } : p, u && u !== tool.a.u ? u : null);
    else if (kind === 'up') tool.dragging = false;
    onChange();
    return kind !== 'move' || tool.dragging;
  }
  if (tool.kind === 'look' && kind === 'down') { tool.look = u && alive(u) ? u : null; cache = null; onChange(); return true; }
  return kind !== 'move';
}
// The measured distance in inches: base edge to base edge between models, from a base edge to a point, or point to point.
export function tapeLength() {
  const { a, b } = tool;
  if (!a || !b) return 0;
  if (a.u && b.u) return Math.max(0, gap(a.u, b.u));
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.max(0, d - (a.u ? a.u.r : 0) - (b.u ? b.u.r : 0));
}

// Line of Sight from the chosen model to every model of the other side: hidden whole (by what), or seen, with what
// stands In The Way. Worked out again only when a model moved.
let cache = null;
export function lookLines() {
  const s = tool.look;
  if (!s || !alive(s) || !G) return [];
  const key = G.units.map(u => `${u.x.toFixed(2)},${u.y.toFixed(2)},${alive(u) ? 1 : 0}`).join(';');
  if (cache && cache.key === key && cache.s === s) return cache.lines;
  const lines = G.units.filter(t => t.side !== s.side && alive(t)).map(t => {
    const hid = hiddenBy(s, t);
    return { t, hidden: hid, itw: hid.length ? [] : inTheWay(s, t).map(o => o.name) };
  });
  cache = { key, s, lines };
  return lines;
}
