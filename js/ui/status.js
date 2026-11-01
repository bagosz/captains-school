// The state of every model, in one list: the model card, the comparison card, the Armies tab and the status tokens on
// the table all read it, so they always agree. No DOM here.
import { G, showsAtLeast } from '../state.js';
import { fmt } from '../util.js';
import { RULES } from '../data/rules-text.js';
import { alive, engaged, remaining, needsCourage } from '../engine/rules.js';
import { active } from '../engine/magic.js';
import { HEROIC, standFastFor } from '../engine/heroes.js';

// The status tokens drawn beside the base (as the round counters beside a miniature in tabletop Necromunda). Each kind
// always sits at the same clock position (degrees clockwise from 12 o'clock), so the eye learns where to look; the
// Wound pips take the bottom of the rim. lvl: the least detail level that shows it (Guided: what changes what the
// player may do; Full table adds the bookkeeping). The rule key opens its glossary entry.
export const TOKENS = {
  heroic: { n: 'Heroic Action', at: 0, col: '#f2c45c', rule: 'heroic', lvl: 'guided', what: 'a Heroic Action declared this turn, or a Hero’s call it must follow' },
  prone: { n: 'Prone', at: 45, col: '#ffb347', rule: 'prone', lvl: 'guided', what: 'the model is lying on the ground' },
  thrown: { n: 'Thrown from the saddle', at: 45, col: '#ffb347', rule: 'thrownrider', lvl: 'guided', what: 'its mount fell under it this turn' },
  trapped: { n: 'Trapped', at: 90, col: '#e5484d', rule: 'trapped', lvl: 'guided', what: 'it lost the Duel and cannot Back Away' },
  courage: { n: 'Courage Test due', at: 315, col: '#b07cff', rule: 'broken', lvl: 'guided', what: 'its army is Broken: it tests its Courage before it acts' },
  spell: { n: 'Magical Power', at: 270, col: '#5fb3ff', rule: 'magic', lvl: 'guided', what: 'a spell is on it' },
  moved: { n: 'Moved', at: 135, col: '#cfc8b8', rule: 'move', lvl: 'full', what: 'it has moved this turn' },
  shot: { n: 'Has shot', at: 225, col: '#cfc8b8', rule: 'shoot', lvl: 'full', what: 'it has shot this turn' },
};

const heroicRule = k => { const r = 'heroic' + k[0].toUpperCase() + k.slice(1); return RULES[r] ? r : 'heroic'; };

// The states of model u, each as { s: a word or two (the Armies tab), t: the full sentence (the cards), k: its status
// token kind or undefined, rule: the glossary entry when it differs from the kind's }.
export function statusOf(u) {
  const st = [], add = (s, t, k, rule) => st.push({ s, t: t || s, k, rule });
  if (!alive(u)) { add(u.gone ? (u.fled ? 'fled' : 'escaped') : 'slain'); return st; }
  if (engaged(u)) add('Engaged', 'Engaged in Combat', 'engaged');
  if (u.prone) add('Prone', null, 'prone');
  if (G.strike && G.strike.trapped && G.strike.trapped.has(u.id)) add('Trapped', 'Trapped: lost the Duel and cannot Back Away', 'trapped');
  if (u.stunned) add('thrown', 'thrown from the saddle: out of action this turn', u.prone ? undefined : 'thrown');
  const sf = needsCourage(u) && standFastFor(u);   // Stand Fast: nothing to roll, so no Courage token
  if (sf) add('Stand Fast', `Broken army, but ${sf.name} called Stand Fast: it passes its Courage Test without a roll`, undefined, 'standFast');
  else if (needsCourage(u)) add('Courage Test due', `Broken army: a Courage Test (${u.T.c}+ on 2D6) before it acts, or it flees`, 'courage');
  else if (G.broken && G.broken[u.side] && u.tested) add('passed Courage', 'passed its Courage Test this turn');
  if (u.cav) add(`${u.mount.n.toLowerCase()} ${u.mount.w}/${u.mount.maxW} W`, `mounted (${u.mount.n.toLowerCase()}: ${u.mount.w}/${u.mount.maxW} Wounds)`);
  if (u.climb) add('climbing', `climbing, ${fmt(u.climb.z - u.climb.foot)}″ above the foot`);
  if (u.movedDist > 0) add('moved', `moved ${fmt(u.movedDist)}″${u.done ? '' : `, ${fmt(remaining(u))}″ left`}`, 'moved');
  if (u.shot) add('has shot', null, 'shot');
  for (const ph of ['move', 'shoot', 'fight']) { const k = u.decl && u.decl[ph]; if (k && HEROIC[k]) add(HEROIC[k].n, `${HEROIC[k].n} this turn${k === 'strike' && u.fvPlus ? ` (+${u.fvPlus} FV)` : ''}`, 'heroic', heroicRule(k)); }
  if (u.tether != null) { const h = G.units.find(o => o.id === u.tether); if (h) { const n = h.shouted === 'march' ? 'At the Double' : 'With Me'; add(n, `${n}: must finish within 6″ of ${h.name}`, 'heroic', h.shouted === 'march' ? 'heroicMarch' : 'heroicMove'); } }
  if (u.noCharge && !u.decl.move) add('no Charge', 'may not Charge this turn');
  if (u.channel) add('Channelling', 'Heroic Channelling: its next Casting Test counts as a 6', 'heroic', 'heroicChannelling');
  if (u.cast) add(`cast ${u.cast}`, `Cast ${u.cast} this turn`);
  for (const s of active()) {
    const by = G.units.find(o => o.id === s.by);
    if (s.t === u.id && s.by !== u.id) add(s.p, `${s.p} (${by.name}, ${s.dur === 'temporary' ? 'until the End phase' : 'while it has Will'})`, 'spell');
    else if (s.by === u.id) add(`its ${s.p}`, `its ${s.p} is in play${s.t != null && s.t !== u.id ? ` on ${(G.units.find(o => o.id === s.t) || {}).name}` : ''}`, s.t === u.id ? 'spell' : undefined);
  }
  if (u.drained) add('Drain Courage', `Drain Courage: Courage ${u.drained} worse`, 'spell');
  if (u.withered) add('Wither', `Wither: Strength ${u.withered} lower`, 'spell');
  return st;
}

// The status tokens to draw on model u at the chosen detail level, in clock order: [{ k, n, at, col, rule, lines }],
// lines being the sentences of every state behind that token. The enemy's declared Heroic Actions are bookkeeping
// (Full table); the player's own are not.
export function tokensOf(u, st = statusOf(u)) {
  const by = new Map();
  for (const x of st) {
    const T = x.k && TOKENS[x.k];
    if (!T) continue;
    const lvl = x.k === 'heroic' && u.side !== 'good' ? 'standard' : T.lvl;   // the enemy's Heroic Actions: from Standard on
    if (!showsAtLeast(lvl)) continue;
    if (!by.has(x.k)) by.set(x.k, { k: x.k, ...T, rule: x.rule || T.rule, lines: [] });
    by.get(x.k).lines.push(x.t);
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}
