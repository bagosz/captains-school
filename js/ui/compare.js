// The comparison card, docked in the panel: the selected model and the one under the pointer (or aimed at) side by
// side, with the numbers of the current phase (Move: MV, FV, A, D, since Charges are chosen there; Shoot: SV, range,
// S, D; Fight: FV, A, S, D), Wound pips, mount Wounds, Might/Will/Fate pips and states. The full profile is behind
// Details (panel.js). Profile numbers only: the modifiers of a roll are named where the roll is made.
import { G } from '../state.js';
import { esc } from '../util.js';
import { alive, alignOf, woundNeed, needStr, moveVal } from '../engine/rules.js';
import { fvOf, strikeS } from '../engine/heroes.js';
import { statusOf, tokensOf } from './status.js';

const STATS = {
  move: ['MV', 'FV', 'A', 'D'], shoot: ['SV', 'Rng', 'S', 'D'], fight: ['FV', 'A', 'S', 'D'], other: ['MV', 'FV', 'S', 'D', 'A'],
  one: ['MV', 'FV', 'SV', 'S', 'D', 'A', 'C', 'I'],
};
const TIPS = {
  MV: 'Move Value: inches it may move', FV: 'Fight Value: wins tied Duel Rolls', SV: 'Shoot Value: the D6 roll needed to hit',
  Rng: 'range of its missile weapon', S: 'Strength', D: 'Defence', A: 'Attacks: dice in a Duel Roll', C: 'Courage: 2D6 roll needed for a Courage Test',
  I: 'Intelligence: 2D6 roll needed for an Intelligence Test',
};
export const weaponOf = u => (u.missiles && u.missiles[0]) || u.bow || null;
function val(u, k, ph) {
  const w = weaponOf(u);
  switch (k) {
    case 'MV': return moveVal(u) + '″';
    case 'FV': return fvOf(u);
    case 'SV': return w ? u.sh + '+' : '–';
    case 'Rng': return w ? w.rng + '″' : '–';
    case 'S': return ph === 'shoot' ? (w ? w.s : '–') : strikeS(u);
    case 'D': return u.d;
    case 'A': return u.a;
    case 'C': return u.T.c + (u.drained || 0) + '+';
    case 'I': return u.T.i + '+';
  }
  return '';
}
const pipRow = (n, max, cls, label, short = label) => max > 0
  ? `<span class="pips ${cls}" title="${label} ${n} of ${max}"><span class="plbl">${short}</span>${'<i class="on"></i>'.repeat(Math.max(0, n))}${'<i></i>'.repeat(Math.max(0, max - n))}</span>` : '';

function column(u, keys, ph, one) {
  const st = statusOf(u), tok = new Set(tokensOf(u, st).map(t => t.k));
  const cells = keys.map(k => `<div><dt title="${TIPS[k]}">${k}</dt><dd>${val(u, k, ph)}</dd></div>`).join('');
  const pips = [
    pipRow(u.w, u.maxW, 'w', 'Wounds'),
    u.cav ? pipRow(u.mount.w, u.mount.maxW, 'mw', `${u.mount.n} Wounds`, u.mount.n) : '',
    u.mwf ? pipRow(u.might, u.mwf[0], 'm', 'Might') + pipRow(u.will, u.mwf[1], 'wi', 'Will') + pipRow(u.fate, u.mwf[2], 'f', 'Fate') : '',
  ].join('');
  // Wargear without opening Details, so it is clear who fights with what (the engine reads an option as taken).
  const gear = (u.T.gear || []).map(g => g.replace(/\s*\(option\)$/i, '')).join(', ');
  const states = st.filter(x => x.s !== 'moved' || tok.has('moved'));
  return `<div class="cmp-col ${u.side}">
    <div class="cmp-head"><span class="side-tag ${u.side}">${alignOf(u.side) === 'good' ? 'Good' : 'Evil'}</span><b>${esc(u.name)}</b></div>
    <dl class="stats cmp-stats" style="--n:${keys.length}">${cells}</dl>
    ${gear ? `<p class="cmp-gear" title="Wargear">${esc(gear)}</p>` : ''}
    ${pips ? `<div class="cmp-pips">${pips}</div>` : ''}
    <p class="cmp-state">${states.length ? states.map(x => `<span${x.k && x.k !== 'engaged' ? ` class="st-${x.k}"` : ''} title="${esc(x.t)}">${esc(x.s)}</span>`).join(' · ') : alive(u) ? (one ? 'Ready' : '') : ''}</p>
  </div>`;
}

// One line on what the profiles say when two enemies face each other: who wins a tied Duel Roll and what each needs
// To Wound on the chart (Fight and Move), or what a shot needs (Shoot).
function versus(a, b, ph) {
  if (a.side === b.side || !alive(a) || !alive(b)) return '';
  if (ph === 'shoot') {
    const bits = [[a, b], [b, a]].filter(([s]) => weaponOf(s)).map(([s, t]) => `${esc(s.name)} shoots: ${s.sh}+ to hit, ${needStr(woundNeed(weaponOf(s).s, t.d))} to wound`);
    return bits.length ? `<p class="cmp-vs">${bits.join('<br>')}</p>` : '';
  }
  const fa = fvOf(a), fb = fvOf(b);
  const tie = fa === fb ? 'equal FV, so a tie goes to a roll-off' : `${esc((fa > fb ? a : b).name)} wins ties (FV ${Math.max(fa, fb)} v ${Math.min(fa, fb)})`;
  return `<p class="cmp-vs"><span>Duel: ${tie}</span><span>To Wound: ${needStr(woundNeed(strikeS(a), b.d))} for ${esc(a.name)}, ${needStr(woundNeed(strikeS(b), a.d))} for ${esc(b.name)}</span></p>`;
}

export function compareHTML(a, b) {
  const ph = ['move', 'shoot', 'fight'].includes(G.phase) ? G.phase : 'other';
  if (!b) return `<div class="cmp one">${column(a, STATS.one, ph, true)}</div>`;
  return `<div class="cmp">${column(a, STATS[ph], ph)}${column(b, STATS[ph], ph)}</div>${versus(a, b, ph)}`;
}
