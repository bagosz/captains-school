// Special rules of named Heroes and the army special rules of the target armies (Kingdom of Rohan, Army of Edoras,
// Minas Tirith, Usurpers of Edoras, Muster of Isengard, Wolves of Isengard): the profile or army list names them, the
// texts are in js/data/army-lists.js (RULE_TEXT, ARMIES[].rules). Each function here is called from the one place where
// the rule changes the game (Fight Value: heroes.js fvOf, To Wound: combat.js woundReroll, Courage: special.js autoPass,
// ...). A profile rule is played through rule(), so a mission keeps it off until it is taught (special.js: SPECIALS).
// Rules about other Heroes by name ('Théoden', 'Pippin') find them by the start of their profile name.
// Card only (not played): Orders from Edoras, Lord of Harrowdale, Merry, For Théoden!, Stalwart Fighter, Pinpoint
// Accuracy, Faithful Servant, Boldest of the Bold, Broken Mind, Resolute Fighter, Defend the White City, Warg Scouts,
// Ambush, and the list-building rules (Additional Rules, Traitor of Rohan). Must Charge (The Price of Grief, Reckless
// Charge, Is there a captain here...) binds the computer's moves only (ai.js), not the player's.

import { G } from '../state.js';
import { gap } from './geometry.js';
import { alive, sideAlive } from './rules.js';
import { isHero } from './dice.js';
import { rule, hasKeyword, armyRule } from './special.js';

const within = (a, b, d) => gap(a, b) <= d + 1e-6;
const has = (u, name) => rule(u, name) != null;
const named = (o, X) => [o.T.n, o.base].some(n => typeof n === 'string' && n.toLowerCase().startsWith(X.toLowerCase()));
const friendNamed = (u, X) => G.units.find(o => o !== u && o.side === u.side && alive(o) && named(o, X)) || null;
const friendsWith = (u, name) => sideAlive(u.side).filter(o => o !== u && has(o, name));
const nearFriendWith = (u, name, d) => friendsWith(u, name).some(h => within(u, h, d));
const generalOf = side => G.units.find(o => o.side === side && o.general && alive(o)) || null;
const warrior = u => !isHero(u) && !u.T.hero;
const lost = u => !!(u.dead || u.fled || (u.gone && !u.escaped));
const broken = side => !!(G.broken && G.broken[side]);
const thisTurn = (x, side) => !!(x && x.turn === G.turn && (side == null || x.side === side));

/* ---------- The fight a model is in ---------- */
// The Combat of u while fights are split (G.combats), with each side's models in it, or null.
function fightOf(u) {
  const c = (G.combats || []).find(x => Array.isArray(x) && x.includes(u));
  if (!c) return null;
  const mine = c.filter(o => o.side === u.side && alive(o)), foes = c.filter(o => o.side !== u.side && alive(o));
  return { c, mine, foes, sup: (c.sup || []).filter(s => alive(s)) };
}
// Outnumbered: more enemy models than friends in its Combat (Defender of Edoras).
const outnumbered = u => { const f = fightOf(u); return !!f && f.foes.length > f.mine.length; };
// One model on each side and nobody Supporting (Daughter of Rohan).
const oneOnOne = u => { const f = fightOf(u); return !!f && f.mine.length === 1 && f.foes.length === 1 && !f.sup.length; };

/* ---------- Fight Value and Attacks ---------- */
// The Fight Value of u before Heroic Strike and halving: its own, set or raised by these rules.
export function fightValue(u) {
  let f = u.f;
  if (has(u, 'Fury of the Pack') && u.cav && u.charged) f = Math.max(f, 5);
  // The will of Men is easily corrupted: Théoden within 6″ of an enemy Gríma fights at 3.
  if (has(u, 'The will of Men is easily corrupted') && gripped(u)) f = Math.min(f, 3);
  // Arise, Riders of Rohan!: +1 in a turn it Charged, as Cavalry within 12″ of a Rohan General.
  if (has(u, 'Arise, Riders of Rohan!') && u.cav && u.charged) { const g = generalOf(u.side); if (g && hasKeyword(g, 'Rohan') && within(u, g, 12)) f++; }
  // Dunlending Heritage (Freca): Dunland Warriors within 6″.
  if (warrior(u) && hasKeyword(u, 'Dunland') && nearFriendWith(u, 'Dunlending Heritage', 6)) f++;
  // Edoras Shall Fall (Lord Thorne): Rohirrim Traitors within 6″ in the Fight phase.
  if (named(u, 'Rohirrim Traitor') && G.phase === 'fight' && nearFriendWith(u, 'Edoras Shall Fall', 6)) f++;
  if (faramirCharge(u) && u.charged) f++;
  return f;
}
const gripped = u => G.units.some(o => o.side !== u.side && alive(o) && named(o, 'Gríma') && within(u, o, 6));
// The Attacks u gains: Fury of the Pack (3 after a Charge), Daughter of Rohan (3 one against one).
export function attacksPlus(u) {
  if ((has(u, 'Fury of the Pack') && u.cav && u.charged) || (has(u, 'Daughter of Rohan') && oneOnOne(u))) return Math.max(0, 3 - u.a);
  return 0;
}
// Savage Charge (Wolves of Isengard): the Cavalry Charge's Extra Attack also against Cavalry. foes: the enemies.
export const savageCharge = (u, foes) => !!(u.cav && u.charged && !u.prone && !u.stunned && foes.length && armyRule(u, 'Savage Charge')
  && foes.every(f => !f.T.monster || hasKeyword(f, 'Infantry')));

/* ---------- To Wound ---------- */
// The re-roll of failed To Wound rolls these rules give w's Strikes at t: 'fails', 'ones' or null.
export function woundRerollNamed(w, t) {
  const fails = (has(w, 'Defender of Edoras') && outnumbered(w))
    || (has(w, 'The Price of Grief') && grieving(w))
    || (has(w, 'I shall kill you if you touch him!') && G.slayer && G.slayer[w.side] === t.id)
    || (has(w, 'Reckless Charge') && w.charged)
    || (has(w, 'A Chance for Faramir, Captain of Gondor to show his Quality') && broken(w.side))
    || (has(w, 'An Unlikely Friendship') && (p => p && within(w, p, 3))(friendNamed(w, 'Peregrin')));
  if (fails) return 'fails';
  const ones = (thisTurn(G.poet, w.side) && hasKeyword(w, 'Rohan') && alive(G.poet.h) && within(w, G.poet.h, 6))
    || (has(w, 'Daughter of Rohan') && oneOnOne(w))
    || (has(w, 'I shall kill you if you touch him!') && (h => h && within(w, h, 3))(friendNamed(w, 'Théoden')))
    || (has(w, 'In Defence of the King') && kingNear(w, 3))
    || (thisTurn(G.gave, w.side) && warrior(w) && hasKeyword(w, 'Dunland') && nearFriendWith(w, 'Dunlending Commander', 6))
    || (has(w, 'The Usurper King') && isHero(t));
  return ones ? 'ones' : null;
}
// The Price of Grief: Théoden or Éowyn of Éomer's army has been removed as a casualty.
const grieving = u => G.units.some(o => o.side === u.side && (named(o, 'Théoden') || named(o, 'Éowyn')) && lost(o));
// In Defence of the King: within d″ of the General, who has the Gondor keyword.
const kingNear = (u, d) => { const g = generalOf(u.side); return !!(g && g !== u && hasKeyword(g, 'Gondor') && within(u, g, d)); };
// Captain of the Citadel Guard (Irolas): +1 To Wound for Citadel Guard within 3″.
export const woundPlusNamed = w => (named(w, 'Citadel Guard') && nearFriendWith(w, 'Captain of the Citadel Guard', 3) ? 1 : 0);
// Usurper King: Wulf re-rolls one dice of the Duel Roll when he fights an enemy Hero. c: the Combat, side: Wulf's.
export const duelRerolls = (c, side) => (c.some(u => u.side === side && alive(u) && has(u, 'The Usurper King')) && c.some(u => u.side !== side && alive(u) && isHero(u)) ? 1 : 0);

/* ---------- Courage ---------- */
// The rule that passes u's Courage Tests without a roll, or null: { why: 'heroRule', h, n: the rule's name }.
export function namedPass(u) {
  if (has(u, 'In Defence of the King') && kingNear(u, 3)) return { why: 'heroRule', h: u, n: 'In Defence of the King' };
  if (named(u, 'Faramir') && armyRule(u, 'Is there a captain here') && friendNamed(u, 'Denethor')) return { why: 'heroRule', h: u, n: 'Is there a captain here who still has the courage to do his lord\'s will?' };
  if (faramirCharge(u)) return { why: 'heroRule', h: G.units.find(o => o.id === G.faramir.id) || u, n: 'Faramir\'s Charge' };
  if (has(u, 'I shall kill you if you touch him!') && G.slayer && G.slayer[u.side] != null) return { why: 'heroRule', h: u, n: 'I shall kill you if you touch him!' };
  return null;
}
// Faramir's Charge (Minas Tirith): this turn Faramir Charged as Cavalry; Gondor Cavalry Warriors within 6″ of where he
// began his Activation are Fearless and +1 Fight Value if they Charge.
const faramirCharge = u => !!(thisTurn(G.faramir, u.side) && u.cav && warrior(u) && hasKeyword(u, 'Gondor') && Math.hypot(u.x - G.faramir.x, u.y - G.faramir.y) - u.r <= 6 + 1e-6);
// Called when model u Charges (rules.js / flow.js set u.charged): Faramir notes where he began.
export function charged(u) {
  if (named(u, 'Faramir') && u.cav && armyRule(u, 'Faramir\'s Charge') && !thisTurn(G.faramir, u.side)) {
    const p = u.moveStart || u;
    G.faramir = { side: u.side, turn: G.turn, id: u.id, x: p.x, y: p.y };
  }
}

/* ---------- Banners and Stand Fast ---------- */
// The models that count as banners for side's models: [{ b, range, for(u) }]. Claim the Throne (Freca, after the enemy
// General fell within 6″ of him: Dunland models, 6″), Awesome Presence (a Mûmak: every friendly model, 6″).
export function namedBanners(side) {
  const out = [];
  for (const b of sideAlive(side)) {
    if (has(b, 'Claim the Throne') && G.claimed && G.claimed[side]) out.push({ b, range: 6, for: u => hasKeyword(u, 'Dunland') });
    if (has(b, 'Awesome Presence')) out.push({ b, range: 6, for: () => true });
  }
  return out;
}
// The range of Hero h's Stand Fast: 12″ for "Forth, and Fear no Darkness" (Théoden) and Voice of Curunir (Saruman).
export const standFastRange = h => (has(h, 'Forth, and Fear no Darkness') || has(h, 'Voice of Curunir') ? 12 : 6);
// Voice of Curunir: friendly Heroes benefit from Saruman's Stand Fast too.
export const heroesStandFast = h => has(h, 'Voice of Curunir');

/* ---------- Wounds ---------- */
// The rule that ignores a Wound to t on a natural 6, or null: Whipped into a frenzy (Hill Tribesmen and their
// Chieftains of the Usurpers of Edoras), Oblivious to Pain (Uruk-hai Berserkers), Sigils of Defiance (the Mûmak).
export function ignoreOnSix(t) {
  if (/^Hill Tribes(man| Chieftain)/.test(t.T.n) && armyRule(t, 'Whipped into a frenzy')) return 'Whipped into a frenzy';
  if (has(t, 'Oblivious to Pain')) return 'Oblivious to Pain';
  if (has(t, 'Sigils of Defiance')) return 'Sigils of Defiance';
  return null;
}
// After w slays t: who killed Théoden (Éowyn), whether the enemy General fell within 6″ of Freca (Claim the Throne).
export function slain(w, t) {
  if (!t || !w) return;
  if (named(t, 'Théoden')) (G.slayer || (G.slayer = {}))[t.side] = w.id;
  // Master Archer: a shooting attack that slays an enemy Hero or Monster restores the shooter's Might.
  if (has(w, 'Master Archer') && G.phase === 'shoot' && (isHero(t) || t.T.monster) && w.mwf) w.might = Math.max(w.might || 0, w.mwf[0]);
  if (has(w, 'Into the Fray')) w.frayed = true;   // Into the Fray (Helm): from his first kill on he must Charge
  if (t.general && G.units.some(f => f.side !== t.side && alive(f) && has(f, 'Claim the Throne') && within(f, t, 6))) (G.claimed || (G.claimed = {}))[foe(t.side)] = true;
}
const foe = s => (s === 'good' ? 'evil' : 'good');

/* ---------- Heroic Actions ---------- */
// Heroic Action k that Hero u declares without Might: Isengard Unleashed (Heroic March of an Uruk-hai Hero in the first
// turn), Leader of the Pack (Sharku: a Heroic Combat each turn), A Chance for Faramir (a Heroic Resolve each turn once
// his army is Broken).
export function freeHeroic(u, k) {
  if (k === 'march' && G.turn === 1 && isHero(u) && hasKeyword(u, 'Uruk-hai') && armyRule(u, 'Isengard Unleashed')) return true;
  if (u.giftTurn === G.turn) return false;
  if (k === 'combat' && named(u, 'Sharku') && armyRule(u, 'Leader of the Pack')) return true;
  if (k === 'combat' && has(u, 'Into the Fray')) return true;   // Into the Fray (Helm): a Heroic Combat each Fight phase
  if (k === 'resolve' && has(u, 'A Chance for Faramir, Captain of Gondor to show his Quality') && broken(u.side)) return true;
  return false;
}
// Must Charge an enemy when it can (the computer's moves, ai.js): The Price of Grief once Théoden or Éowyn fell, Reckless
// Charge (Théodred), and Faramir while Denethor lives ("Is there a captain here...", Minas Tirith).
// Into the Fray (Helm, once he has slain an enemy) binds the player's moves too (input.js: frayWhy).
export const frayBound = u => !!u.frayed && has(u, 'Into the Fray');
export const mustChargeAny = u => (has(u, 'The Price of Grief') && grieving(u)) || has(u, 'Reckless Charge') || frayBound(u)
  || (named(u, 'Faramir') && armyRule(u, 'Is there a captain here') && !!friendNamed(u, 'Denethor'));
// Théoden near Gríma cannot declare Heroic Actions.
export const noHeroics = u => has(u, 'The will of Men is easily corrupted') && gripped(u);
// Master of Battle (X) from a named rule: Mutual Respect (Fréaláf within 6″ of Héra: 4+).
export const masterOfBattleNamed = u => (has(u, 'Mutual Respect') && (h => h && within(u, h, 6))(friendNamed(u, 'Héra')) ? '4' : null);

/* ---------- Phases ---------- */
// The Warrior Poet (Háma): at the start of the Fight phase he may spend a Will Point; then friendly Rohan models within
// 6″ re-roll To Wound 1s until the end of the turn. poetOptions: the Hámas of side that may (a Will Point, a friendly
// Rohan model within 6″ Engaged): [{ h, n: how many }]. The computer uses it with two or more (warriorPoet).
export function poetOptions(side, engaged) {
  return sideAlive(side).filter(h => has(h, 'The Warrior Poet') && (h.will || 0) > 0 && !thisTurn(G.poet, side))
    .map(h => ({ h, n: sideAlive(side).filter(o => hasKeyword(o, 'Rohan') && within(o, h, 6) && engaged(o)).length })).filter(o => o.n > 0);
}
export function usePoet(h) { h.will--; G.poet = { side: h.side, turn: G.turn, h }; return h; }
// The computer's choice for side (both sides in sim.js): Háma or null.
export function warriorPoet(engaged, sides = ['good', 'evil']) {
  for (const s of sides) { const o = poetOptions(s, engaged).find(x => x.n >= 2); if (o) return usePoet(o.h); }
  return null;
}
// "Do you think the eyes of the white tower are blind?" (Minas Tirith): once per game, before the Priority roll, while
// Denethor lives, his side wins it. canClaim: side may use it now; wantsClaim: the computer's choice (the first turn the
// armies are within 18″ of each other). claimPriority(sides that use it): the side that wins, 'roll' when both used it
// (roll as normal), or null.
export function canClaim(side) {
  const d = G.units.find(o => o.side === side && alive(o) && named(o, 'Denethor'));
  return !!(d && armyRule(d, 'Do you think the eyes of the white tower are blind') && !(G.eyesUsed && G.eyesUsed[side]));
}
export const wantsClaim = side => canClaim(side) && sideAlive(side).some(u => sideAlive(foe(side)).some(e => within(u, e, 18)));
export function claimPriority(sides) {
  if (!sides.length) return null;
  G.eyesUsed = { ...(G.eyesUsed || {}) };
  for (const s of sides) G.eyesUsed[s] = true;
  return sides.length > 1 ? 'roll' : sides[0];
}
export const priorityClaim = () => claimPriority(['good', 'evil'].filter(wantsClaim));   // both sides by the computer (sim.js)
// The side that won the roll and handed Priority over (Wizard's Pupil, Dunlending Commander).
export function priorityGiven(chooser) { G.gave = chooser && G.priority !== chooser ? { side: chooser, turn: G.turn } : null; }

/* ---------- Scenarios ---------- */
// The number of models u counts as near an objective or escaping: Dominant (X), Doorward of Meduseld (Háma and the
// Royal Guard within 6″ of him while Théoden lives: 2), Protectors of the White Tree (within 6″ of a Gondor General: 2),
// Wizard's Pupil (Faramir and Warriors within 3″ of him in a turn his side handed Priority over: 2).
export function dominance(u) {
  let n = parseInt(rule(u, 'Dominant')) || 1;
  if (G.m && G.m.brandDominant && (u.T.gear || []).some(g => /flaming brand/i.test(g))) n = Math.max(n, 2);   // the Battle of Edoras profile
  const theoden = () => !!friendNamed(u, 'Théoden');
  if (has(u, 'Doorward of Meduseld') && theoden()) n = Math.max(n, 2);
  if (named(u, 'Rohan Royal Guard') && theoden() && nearFriendWith(u, 'Doorward of Meduseld', 6)) n = Math.max(n, 2);
  if (has(u, 'Protectors of the White Tree')) { const g = generalOf(u.side); if (g && hasKeyword(g, 'Gondor') && within(u, g, 6)) n = Math.max(n, 2); }
  if (thisTurn(G.gave, u.side) && ((has(u, 'Wizard\'s Pupil')) || (warrior(u) && nearFriendWith(u, 'Wizard\'s Pupil', 3)))) n = Math.max(n, 2);
  return n;
}
// Line of Command (Húrin): while he lives, the enemy scores nothing for the side's Gondor General.
export const generalShielded = side => { const g = G.units.find(o => o.side === side && o.general); return !!(g && hasKeyword(g, 'Gondor') && sideAlive(side).some(o => has(o, 'Line of Command'))); };
// Saruman's Deceit: the enemy Hero that Resists Saruman's powers at −1 (chosen once: the General, else the highest tier).
export function deceived(r, by) {
  if (!has(by, 'Saruman\'s Deceit')) return false;
  const k = by.id;
  if (!(G.deceit || (G.deceit = {}))[k]) {
    const L = G.units.filter(o => o.side !== by.side && isHero(o) && !lost(o));
    const tier = h => ['Independent', 'Minor', 'Fortitude', 'Valour', 'Legend'].indexOf(h.T.tier || 'Fortitude');
    G.deceit[k] = (L.find(o => o.general) || L.sort((a, b) => tier(b) - tier(a))[0] || {}).id ?? -1;
  }
  return G.deceit[k] === r.id;
}
