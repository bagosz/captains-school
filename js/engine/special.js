// Special rules from the profiles (Rules Manual p. 122–133, docs/rules/special_rules.md). A profile lists them by name in
// T.rules, with the value in brackets where the rule has one: 'Terror', 'Terror (Orc)', 'Dominant (2)'. A Cavalry
// model has the rules of its rider and of its mount.

import { G } from '../state.js';
import { gap } from './geometry.js';
import { TIERS } from './heroes.js';
import { magicRule, magicPass } from './magic.js';
import { namedPass } from './named.js';

// The special rules the engine plays, by key (the name in camelCase: 'Fearful' → 'fearful', 'Mighty Blow' →
// 'mightyBlow'). G.specials: those in play, or null for all of them (matched play, the sandbox, the tools); a mission
// plays the ones it or an earlier mission has taught (missions.js: knows), the others stay on the card only.
// 'weaponChoice' and 'elevated' are not profile rules but are switched on the same way: the choice of Melee Weapon
// (combat.js), defending an Elevated Position (rules.js: elevatedFor).
export const SPECIALS = ['terror', 'fearful', 'fearless', 'weaponChoice', 'elevated',
  'hatred', 'backstabbers', 'ancientEnemies', 'poisonedAttacks', 'baneOfKings', 'venom', 'mightyBlow', 'baneWeapons',
  'bladesOfTheDead', 'swornProtector', 'bodyguard', 'harbingerOfEvil', 'survivalInstinct', 'timid',
  'shieldwall', 'spearMastery', 'burly', 'intoTheFray', 'unyieldingCombatStance', 'mightyHero', 'generalHunter', 'masterOfBattle', 'horseLord', 'expertRider',
  'woodlandCreature', 'mountainDweller', 'caveDweller', 'swiftMovement', 'spectralWalk',
  'magic', 'monsters', 'monstrousCharge', 'fly', 'willOfEvil', 'resistantToMagic', 'expertShot', 'sharpshooter', 'fellSight', 'largeTarget', 'throwStones',
  'glorySeekers', 'phalanx', 'dominant', 'obliviousToPain', 'sigilsOfDefiance', 'awesomePresence',
  // Rules of named Heroes (named.js).
  'ariseRidersOfRohan', 'defenderOfEdoras', 'theWarriorPoet', 'daughterOfRohan', 'mutualRespect', 'thePriceOfGrief',
  'iShallKillYouIfYouTouchHim', 'doorwardOfMeduseld', 'forthAndFearNoDarkness', 'theWillOfMenIsEasilyCorrupted', 'recklessCharge',
  'anUnlikelyFriendship', 'aChanceForFaramirCaptainOfGondorToShowHisQuality', 'wizardSPupil', 'protectorsOfTheWhiteTree',
  'inDefenceOfTheKing', 'lineOfCommand', 'captainOfTheCitadelGuard', 'voiceOfCurunir', 'sarumanSDeceit',
  'dunlendingHeritage', 'claimTheThrone', 'dunlendingCommander', 'edorasShallFall', 'theUsurperKing', 'furyOfThePack', 'masterArcher'];
// The key of a rule name: camelCase, quotes and end punctuation dropped ('"Forth, and Fear no Darkness"' →
// 'forthAndFearNoDarkness').
export const specialKey = name => bare(name).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
// A rule name to compare: lower case, without quotation marks.
const bare = n => n.replace(/["“”]/g, '').trim().toLowerCase();
// The rule's bracket value ('Orc', '2'), true when it has none, or null when model u does not have the rule (or it is
// not in play).
export function rule(u, name) {
  if (G && G.specials && !G.specials.has(specialKey(name))) return null;
  const lists = [u.T.rules, u.cav && u.mount && u.mount.rules];
  for (const L of lists) for (const r of L || []) {
    const m = /^(.+?)(?:\s*\((.+)\))?$/.exec(r.trim());
    if (m && bare(m[1]) === bare(name)) return m[2] != null ? m[2] : true;
  }
  return magicRule(u, name);   // Terrifying Aura, Instil Fear, Enrage Beast (magic.js)
}
// Every bracket value of a rule model u has more than once ('Bane Weapons (Orcbane)', 'Bane Weapons (Goblinbane)'):
// a list, empty when it does not have the rule (or it is not in play).
export function rules(u, name) {
  if (G && G.specials && !G.specials.has(specialKey(name))) return [];
  const out = [];
  for (const L of [u.T.rules, u.cav && u.mount && u.mount.rules]) for (const r of L || []) {
    const m = /^(.+?)(?:\s*\((.+)\))?$/.exec(r.trim());
    if (m && bare(m[1]) === bare(name)) out.push(m[2] != null ? m[2] : true);
  }
  return out;
}
// Whether rule name of model w (Hatred (Man), Ancient Enemies (Elf)) applies against model t: its keyword, or every
// model when the rule has none.
export const against = (w, name, t) => rules(w, name).some(v => v === true || v.split(/\s*,\s*|\s+and\s+/).some(k => hasKeyword(t, k)));
// The army special rules the engine plays (combat.js, heroes.js, chargeTests, named.js), by army id; the others stay on
// the card. (Army of Dale has a different Protect the King.)
export const ARMY_RULES_PLAYED = {
  kingdomOfRohan: ['Home of the Horse Lords'], armyOfEdoras: ['Forth Eorlingas', 'Protect the King'],
  usurpersOfEdoras: ['Whipped into a frenzy', 'Barbarous Killers'], musterOfIsengard: ['There will be no dawn for Men', 'Isengard Unleashed'],
  legionsOfMordor: ['Bring the City to its Knees'],
  minasTirith: ['Do you think the eyes of the white tower are blind', "Faramir's Charge", 'Is there a captain here'],
  wolvesOfIsengard: ['Leader of the Pack', 'Savage Charge'],
};
export const armyRulePlayed = (n, army) => (ARMY_RULES_PLAYED[army] || []).some(k => bare(n).startsWith(k.toLowerCase()));
// Whether the army of model u (matched play: G.m.armies) has the army special rule that starts with name (quotes
// ignored: 'There will be no dawn for Men').
export function armyRule(u, name) {
  const A = G && G.m && G.m.armies && G.m.armies[u.side], k = name.toLowerCase();
  return !!A && (A.rules || []).some(r => bare(r.n).startsWith(k));
}
// Whether model u has the keyword k (T.kw: 'Man · Rohan · Warrior, Infantry').
export const hasKeyword = (u, k) => (u.T.kw || '').split(/[·,]/).some(s => s.trim().toLowerCase() === k.toLowerCase());

/* ---------- Courage (p. 60, 123–131) ---------- */
const living = u => !u.dead && !u.gone;
// Fearless: the model passes every Courage Test it has to take.
export const fearless = u => rule(u, 'Fearless') != null;
// The rule that passes every Courage Test of model u without a roll, or null: { why, h } (h: the model that makes it so).
// Fearless; Sworn Protector (X) while the named model is alive and on the battlefield; Bodyguard while the guarded Hero is.
export function autoPass(u) {
  if (fearless(u)) return { why: 'fearless', h: u };
  const sp = rule(u, 'Sworn Protector');
  if (sp && sp !== true) {
    const h = G.units.find(o => o !== u && o.side === u.side && living(o) && named(o, sp));
    if (h) return { why: 'swornProtector', h };
  }
  if (rule(u, 'Bodyguard') != null) {
    const h = G.units.find(o => o.id === u.guard);
    if (h && living(h)) return { why: 'bodyguard', h };
  }
  return namedPass(u) || magicPass(u);   // rules of named Heroes (named.js); Aura of Command, Fury (magic.js)
}
// Whether model o is the one a Sworn Protector (X) names: 'Théoden' is Théoden, King of Rohan; 'Thorin' covers both
// Thorins (FAQ).
const named = (o, X) => [o.T.n, o.base].some(n => n && n.toLowerCase().startsWith(X.toLowerCase().trim()));
// Bodyguard (p. 123): at the start of the game every Bodyguard picks a Hero of its side with its Faction keyword: the
// General (not played yet), else the one with the highest Heroic Tier; all models of the same type pick the same Hero.
// Sets u.guard (a unit id) on the units given.
export const factionOf = u => ((u.T.kw || '').split('·')[1] || '').trim();
const tierOf = h => Math.max(0, TIERS.indexOf(h.T.tier || 'Fortitude'));
// The General (p. 151 matched play): each side's Hero with the highest Heroic Tier (the first of equals). Sets u.general.
export function assignGenerals(units) {
  for (const side of ['good', 'evil']) {
    const L = units.filter(h => h.side === side && h.T.hero);
    if (L.length) L.reduce((a, b) => (tierOf(b) > tierOf(a) ? b : a)).general = true;
  }
}
export function assignGuards(units) {
  const tier = tierOf;
  for (const u of units) {
    if (!(u.T.rules || []).some(r => /^bodyguard$/i.test(r.trim()))) continue;
    const f = factionOf(u);
    const L = units.filter(h => h.side === u.side && h.T.hero && (!f || hasKeyword(h, f)));
    const gen = L.find(h => h.general);   // the General when it has the Faction keyword
    u.guard = gen ? gen.id : L.length ? L.reduce((a, b) => (tier(b) > tier(a) ? b : a)).id : null;
  }
}
// Harbinger of Evil (X) (p. 125): the nearest enemy model within X″ with the rule, whose −1 applies to u's Courage Tests
// (once, however many there are), or null. A model with the rule is immune.
export function harbingerNear(u) {
  if (!G || !G.units || rule(u, 'Harbinger of Evil') != null) return null;
  return G.units.find(e => e.side !== u.side && living(e) && (v => v != null && gap(u, e) <= (parseFloat(v) || 0) + 1e-6)(rule(e, 'Harbinger of Evil'))) || null;
}
// Timid (p. 132): a Cavalry model whose Mount is Timid tests to Charge, and no rule passes that test for it.
export const timid = u => !!(u.cav && u.mount && (u.mount.rules || []).some(r => /^timid$/i.test(r.trim())) && rule(u, 'Timid') != null);
// Terror (X): a model that wishes to Charge it tests first; with a keyword, only models with that keyword test.
export function causesTerrorIn(t, u) {
  const v = rule(t, 'Terror');
  return v != null && (v === true || hasKeyword(u, v));
}
// The Courage Tests model u takes at the start of its Move to Charge t, one for each rule (FAQ: Fearful against Terror
// is two tests): 'fearful' for its own Fearful, 'terror' for the target's Terror. A test it passed this turn for the same
// rule counts as passed again (p. 60: Taking Multiple Courage Tests); u.passed holds those.
// Protect the King (Army of Edoras): a Rohan Warrior within 6″ of a Rohan Hero that Charged this turn passes Terror.
const kingNear = u => !u.T.hero && hasKeyword(u, 'Rohan') && armyRule(u, 'Protect the King')
  && G.units.some(h => h.side === u.side && h.T.hero && living(h) && h.charged && hasKeyword(h, 'Rohan') && gap(u, h) <= 6 + 1e-6);
export function chargeTests(u, t) {
  const L = timid(u) ? ['timid'] : [];
  if (rule(u, 'Fearful') != null) L.push('fearful');
  if (t && causesTerrorIn(t, u) && !kingNear(u)) L.push('terror');
  return L.filter(k => !(u.passed && u.passed.has(k)));
}
