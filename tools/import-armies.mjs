// Builds js/data/army-lists.js for matched play from the BattleScribe data of "Middle-earth v2: War of the Rohirrim"
// (https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim, kept up to date with the 2024 army lists and FAQ).
// For every army list it takes the Warrior models the trainer can play (infantry) and the infantry Heroes that lead a
// Warband (with Might, Will, Fate, Heroic Tier and Heroic Actions) with their 2024 profiles, points, wargear options and
// special rules, plus the army's own special rules.
// Options with wargear the rules engine does not simulate (war horns, slings, mounts, ...) are left out.
// Usage:
//   git clone --depth 1 https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim <dir>
//   node tools/import-armies.mjs <dir>
// The data is Games Workshop material maintained by fans, so the same rule as for the profiles applies: personal use only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node tools/import-armies.mjs <BattleScribe data folder>'); process.exit(1); }
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'data', 'army-lists.js');
const REPO = 'https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim';

/* ---------- A small XML reader (BattleScribe files have no DTD or CDATA) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m));
function parseXML(src) {
  const root = { tag: '#root', a: {}, c: [], t: '' }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) stack.pop();
    else if (m[2]) {
      const a = {}, ar = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let x;
      while ((x = ar.exec(m[3]))) a[x[1]] = unesc(x[3] ?? x[4]);
      const n = { tag: m[2], a, c: [], t: '' };
      stack[stack.length - 1].c.push(n);
      if (!m[4]) stack.push(n);
    } else if (m[5]) stack[stack.length - 1].t += unesc(m[5]);
  }
  return root.c[0];
}
const kids = (n, tag) => (n ? n.c.filter(k => k.tag === tag) : []);
const kid = (n, tag) => (n ? n.c.find(k => k.tag === tag) : null);
function* walk(n) { yield n; for (const k of n.c) yield* walk(k); }

/* ---------- Load the game system and the army lists ---------- */
const files = fs.readdirSync(dir);
const gstFile = files.find(f => f.endsWith('.gst'));
if (!gstFile) { console.error(`No .gst file in ${dir}`); process.exit(1); }
const gst = parseXML(fs.readFileSync(path.join(dir, gstFile), 'utf8'));
// Legacy army lists are left out, like the legacy models inside the current lists ("Allow Legacies" is never selected).
const cats = files.filter(f => f.endsWith('.cat') && !f.startsWith('[Legacies]')).sort()
  .map(f => parseXML(fs.readFileSync(path.join(dir, f), 'utf8')));
const byId = new Map();
for (const r of [gst, ...cats]) for (const n of walk(r)) if (n.a.id && !byId.has(n.a.id)) byId.set(n.a.id, n);
let commit = 'unknown', date = '';
try { [commit, date] = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%H %cs'], { encoding: 'utf8' }).trim().split(' '); } catch (e) { /* not a git checkout */ }

const COST = { pts: '39c8-4238-d8ca-bac5', bow: '5c04-22f1-fd0b-9279', war: '5141-e5a1-1d1f-e715', thr: '59c3-8846-5912-9f3b' };
// The two Followers groups that Warbands link to: one for Good armies, one for Evil.
const FOLLOWERS = { 'f88d-1ecb-eb54-b9eb': 'good', '4b3d-aa13-9a19-0d55': 'evil' };

/* ---------- Conditions and modifiers ---------- */
// ctx: { cat: the army list's id, anc: ids and categories of the Warband the model is in, sel: id => 1 when that option is taken }.
// Counts in the roster are 0: no Heroes, no "Allow Legacies".
function cond(c, ctx) {
  const { scope, childId, type, field } = c.a, v = +c.a.value;
  if (type === 'instanceOf' || type === 'notInstanceOf') {
    const is = scope === 'primary-catalogue' ? childId === ctx.cat : scope === 'ancestor' || scope === 'parent' ? ctx.anc.has(childId) : false;
    return type === 'instanceOf' ? is : !is;
  }
  const n = field === 'selections' && (scope === 'parent' || scope === 'self') ? ctx.sel(childId) : 0;
  return { equalTo: n === v, notEqualTo: n !== v, atLeast: n >= v, atMost: n <= v, greaterThan: n > v, lessThan: n < v }[type] ?? false;
}
function group(g, ctx) {
  const parts = [...kids(kid(g, 'conditions'), 'condition').map(c => cond(c, ctx)), ...kids(kid(g, 'conditionGroups'), 'conditionGroup').map(x => group(x, ctx))];
  return g.a.type === 'or' ? parts.some(Boolean) : parts.every(Boolean);
}
const applies = (m, ctx) => group({ a: { type: 'and' }, c: m.c }, ctx);
const mods = n => [...kids(kid(n, 'modifiers'), 'modifier'), ...kids(kid(n, 'modifierGroups'), 'modifierGroup').flatMap(g => kids(kid(g, 'modifiers'), 'modifier'))];
function hidden(n, ctx) {
  let h = n.a.hidden === 'true';
  for (const m of mods(n)) if (m.a.field === 'hidden' && m.a.type === 'set' && applies(m, ctx)) h = m.a.value === 'true';
  return h;
}
function named(n, ctx) {
  let s = n.a.name;
  for (const m of mods(n)) if (m.a.field === 'name' && m.a.type === 'set' && applies(m, ctx)) s = m.a.value;
  return s;
}
const plain = s => s.replace(/\s*\[(Active|Passive)\]\s*$/i, '').trim();
const cost = (n, type) => +(kids(kid(n, 'costs'), 'cost').find(c => c.a.typeId === type)?.a.value || 0);
const incr = (n, type) => mods(n).filter(m => m.a.type === 'increment' && m.a.field === type).reduce((s, m) => s + +m.a.value, 0);

/* ---------- Special rules: names and texts ---------- */
const RULE_TEXT = {};
// Typos in rule names the engine looks up by name.
const RULE_FIXES = { 'Isengard Unleased': 'Isengard Unleashed', 'Reolute Fighter': 'Resolute Fighter' };
const ruleName = n => RULE_FIXES[n] || n;
function ruleOf(link, ctx) {
  const t = byId.get(link.a.targetId);
  const n = ruleName(plain(named(link, ctx)));
  if (t && kid(t, 'description')) RULE_TEXT[n] = kid(t, 'description').t.trim();
  return n;
}

/* ---------- Wargear the engine simulates ---------- */
// Every wargear name is sorted into: supported, supported with a note, or not supported (the option is left out).
const RANGED = new Map();   // name -> { rng, s, still }
for (const p of walk(gst)) if (p.tag === 'profile' && p.a.typeName === 'Ranged Weapon') {
  const ch = Object.fromEntries(kids(kid(p, 'characteristics'), 'characteristic').map(c => [c.a.name, c.t.trim()]));
  RANGED.set(plain(p.a.name), { rng: parseInt(ch.Range), s: +ch.Strength, move: ch['Movement Restriction'] });
}
const NOTE = {
  'Berserker Blade': 'Berserker Blade: a hand-and-a-half weapon. Winning with it two-handed, it may make one Strike at every enemy it is Engaged with instead of its Strikes.',
};
// Named wargear (p. 104–111 and the army lists) and what the engine plays it as.
const GEAR_AS = {
  'Sword': 'hand', 'Unarmed': 'unarmed', 'Master-Forged': 'master', 'Master-forged Two-handed Weapon': 'two',
  'Easterling Halberd': 'halberd', 'Mattock': 'two', 'hand-and-a-half': 'half', 'Wood Elf Spear': 'spear', 'Troll Spear': 'spear',
  'Elven Glaive': 'spear', 'Glamdring': 'half', 'Hadhafang': 'half', 'Andúril, Flame of the West': 'half', 'Sting': 'hand',
  'Narya': 'item', 'Nenya': 'item', 'Ring of Barahir': 'item', 'Mithril Coat': 'item', 'Flaming Brand': 'item', 'Horn of Gondor': 'horn',
  'Royal Standard of Rohan': 'banner', 'Banner of Minas Tirith': 'banner', 'The One Ring': 'ring',
};
const THROWN = 'Spear Mastery: the throwing spear also fights as a spear, so it can Support.';
function gearKind(g) {
  if (g === 'Elven') return 'ok';   // the Elven weapon marker: combat.js: elvenBlade
  if (MOUNT_NAMES.has(g)) return 'ok';   // a mount: T.mount
  if (CHARIOT_NAMES.has(g)) return 'ok';   // a Chariot a Hero rides: T.chariot
  const k = g.replace(/^Elven /i, '').toLowerCase();
  if (k === 'hand-and-a-half weapon' || k === 'staff of power') return 'ok';   // engine/magic.js: staffWill
  // Weapons and wargear the engine plays under another name (combat.js, dice.js, magic.js: GEAR notes below).
  if (GEAR_AS[g] || GEAR_AS[k]) return 'ok';
  if (/hand weapon/.test(k) || ['armour', 'heavy armour', 'dwarf armour', 'heavy dwarf armour', 'mithril armour', 'shield', 'light shield', 'spear', 'pike', 'banner', 'two-handed weapon', 'lance', 'war spear', 'light armour', 'cloak', 'war horn'].includes(k)) return 'ok';
  if (/^war drum/.test(k)) return 'ok';   // heroes.js: drumOf
  if (NOTE[g]) return 'note';
  if (/^throwing (spears?|weapons?)$/.test(k) || k === 'whip') return 'thrown';
  if (RANGED.has(g)) { const r = RANGED.get(g); return /^(bow|crossbow|sling|blowpipe)$/.test(k) || /bow$/.test(k) ? 'ranged' : 'no'; }
  return 'no';
}
// A Hero's Magical Powers (p. 114-121): [{ n, cast, rng }] from the 'Magical Powers' group of its profile, with the
// Casting Value and range the infoLink sets (range 0: Self). Fury (X) is renamed with its keyword ('Fury (Uruk-hai)').
const POWER_TEXT = {};
function powersOf(e, ctx) {
  const out = [];
  for (const g of [...own(e)].filter(n => n.tag === 'infoGroup' && /^Magical Powers?$/.test(n.a.name) && !hidden(n, ctx))) {
    for (const l of kids(kid(g, 'infoLinks'), 'infoLink').filter(l => l.a.type === 'profile' && !hidden(l, ctx))) {
      const p = byId.get(l.a.targetId);
      if (!p || p.a.typeName !== 'Magical Power') continue;
      const ch = Object.fromEntries(kids(kid(p, 'characteristics'), 'characteristic').map(c => [c.a.typeId, c.t.trim()]));
      for (const m of mods(l)) if (m.a.type === 'set' && applies(m, ctx) && m.a.field in ch) ch[m.a.field] = m.a.value;
      const cast = parseInt(ch['362b-8822-a065-da22']), rng = /self/i.test(ch['51ed-0de5-710e-bbf2'] || '') ? 0 : parseInt(ch['51ed-0de5-710e-bbf2']);
      if (!(cast >= 1 && cast <= 6) || Number.isNaN(rng)) continue;   // data errors (a range in the Casting Value)
      const n = named(l, ctx).trim();
      POWER_TEXT[n.replace(/\s*\(.*\)$/, '')] = (ch['f254-a611-e65d-7f32'] || '').trim();
      out.push({ n, cast, rng });
    }
  }
  return out;
}
// Mounts (p. 67, list of mounts p. 72–75): a Warrior-type profile whose Unit Type is Mount. A mounted Warrior links its
// mount from its Wargear (a profile, or an infoGroup holding the profile and the mount's rules); a Hero buys one as a
// Wargear option (an upgrade such as the shared "Horse"). Returns { n, mv, f, sh, s, d, a, w, c, i, base, rules } or null.
const MOUNT_NAMES = new Set();
function mountFromProfile(p) {
  const by = Object.fromEntries(kids(kid(p, 'characteristics'), 'characteristic').map(c => [c.a.name, c.t.trim()]));
  if (!/\bMount\b/.test(by['Unit Type'] || '')) return null;
  const num = k => parseInt(by[k]);
  return { n: plain(p.a.name), mv: num('Move Value'), f: num('Fight Value'), sh: num('Shoot Value'), s: num('Strength'), d: num('Defence'), a: num('Attacks'), w: num('Wounds'), c: num('Courage'), i: num('Intelligence'), base: parseInt(by['Base Size']) || 40, ...(/Monster/.test(by['Unit Type']) ? { monster: true } : {}) };
}
for (const n of walk(gst)) if (n.tag === 'profile' && n.a.typeName === 'Warrior' && mountFromProfile(n)) MOUNT_NAMES.add(plain(n.a.name));
function mountIn(nodes, ctx) {
  for (const n of nodes) {
    if (n.tag === 'profile' && n.a.typeName === 'Warrior' && !hidden(n, ctx)) { const m = mountFromProfile(n); if (m) return m; }
    if (n.tag !== 'infoLink' || hidden(n, ctx)) continue;
    const t = byId.get(n.a.targetId);
    if (!t) continue;
    if (n.a.type === 'profile' && t.a.typeName === 'Warrior') { const m = mountFromProfile(t); if (m) return m; }
    if (n.a.type === 'infoGroup') {
      const m = mountIn([...walk(t)], ctx);
      if (m) { MOUNT_NAMES.add(plain(t.a.name)); return { ...m, rules: [...walk(t)].filter(x => x.tag === 'infoLink' && x.a.type === 'rule').map(x => ruleOf(x, ctx)) }; }
    }
  }
  return null;
}
// Chariots (p. 152–153): the Impact Hits of a Chariot Charge (or a War Beast's Trample), read from the rule written
// into the profile ("it will inflict 2 Strength 4 Impact Hits"). Returns { n, s } or null.
function impactIn(nodes) {
  for (const n of nodes) {
    if (n.tag !== 'rule' || !/^(Chariot Charge|Trample)/.test(plain(n.a.name))) continue;
    const m = /(\d+) Strength (\d+)/.exec((kid(n, 'description') || {}).t || '');
    if (m) return { n: +m[1], s: +m[2] };
  }
  return null;
}
// A Chariot a Hero may ride (an option linking the Chariot's profile, Unit Type Chariot). Returns the Chariot's
// { n, mv, f, sh, s, d, a, w, c, i, base, impact, rules } or null.
const CHARIOT_NAMES = new Set();
function chariotIn(nodes, ctx) {
  for (const n of nodes) {
    let g = n;
    if (n.tag === 'infoLink' && n.a.type === 'infoGroup' && !hidden(n, ctx)) g = byId.get(n.a.targetId);
    if (!g || (g !== n && g.tag !== 'infoGroup')) continue;
    const p = [...walk(g)].find(x => x.tag === 'profile' && x.a.typeName === 'Warrior' && /Chariot/.test((kids(kid(x, 'characteristics'), 'characteristic').find(c => c.a.name === 'Unit Type') || {}).t || ''));
    if (!p) continue;
    const by = Object.fromEntries(kids(kid(p, 'characteristics'), 'characteristic').map(c => [c.a.name, (c.t || '').trim()])), num = k => parseInt(by[k]);
    const base0 = parseInt(by['Base Size']) || 60, impact = impactIn([...walk(g)]) || impactIn(nodes);   // a profile written into the option: its rule beside it
    if (!impact) continue;
    CHARIOT_NAMES.add(plain(g.a.name)); CHARIOT_NAMES.add(plain(p.a.name));
    const rules = [...walk(g)].filter(x => x.tag === 'infoLink' && x.a.type === 'rule').map(x => ruleOf(x, ctx));
    return { n: plain(p.a.name), mv: num('Move Value'), f: num('Fight Value'), sh: num('Shoot Value'), s: num('Strength'), d: num('Defence'), a: num('Attacks'), w: num('Wounds'), c: num('Courage'), i: num('Intelligence'),
      base: /oval/i.test(by['Base Size']) ? Math.round(base0 * 0.8) : base0, impact, rules };
  }
  return null;
}
const skipped = new Map();   // unsupported wargear -> how often an option was left out because of it

/* ---------- Token icons ---------- */
function iconOf(T, race) {
  if (T.banner) return 'banner';
  if (T.pike) return 'pikeman';
  if (T.bow) return T.bow.still ? 'crossbowman' : 'archer';
  if (T.monster || /Troll|Ent/.test(race)) return 'troll';
  if (T.spear) return 'spearman';
  if (/Goblin/.test(race)) return 'goblin';
  if (/^Orc/.test(race)) return 'orc';
  if (/Uruk-hai/.test(race)) return 'armoured';
  if (/Elite/.test(T.kw)) return 'veteran';
  return 'warrior';
}

/* ---------- One army list ---------- */
const TYPES = {}, typeKeyOf = new Map();
const camel = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (m, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toLowerCase());
function addType(T) {
  const json = JSON.stringify(T);
  if (typeKeyOf.has(json)) return typeKeyOf.get(json);
  let key = camel(T.full || T.n), i = 2;
  while (TYPES[key]) key = camel(T.full || T.n) + i++;
  TYPES[key] = T; typeKeyOf.set(json, key);
  return key;
}
const BLOCKED_KW = /\b(Hero|Siege Engine|War Beast|Swarm)\b/;
// Models whose movement the engine cannot do yet.
const BLOCKED_RULES = [];
// Typos in the data, fixed in names and keywords.
const FIXES = [[/\bIsengard Toll\b/g, 'Isengard Troll'], [/\bGablin-Town\b/g, 'Goblin-town'], [/\bLakw-town\b/g, 'Lake-town'], [/\bLake-Town\b/g, 'Lake-town']];
const fix = s => FIXES.reduce((t, [re, to]) => t.replace(re, to), s);
// The model's own nodes, without its wargear options (their rules count only when the option is taken).
function* own(n) { yield n; for (const k of n.c) if (k.tag !== 'selectionEntryGroups' && !(k.tag === 'selectionEntry' && k.a.type === 'upgrade')) yield* own(k); }

function warriorProfile(e, ctx, type = 'Warrior') {
  for (const n of walk(e)) {
    if (n.tag === 'profile' && n.a.typeName === type && !hidden(n, ctx)) return n;
    if (n.tag === 'infoLink' && n.a.type === 'profile' && !hidden(n, ctx)) { const t = byId.get(n.a.targetId); if (t && t.a.typeName === type) return t; }
  }
  return null;
}
// Heroes (p. 151 matched play): the Heroic Tier comes from the Warband's primary category (the profile's own Heroic Tier
// is often empty), and the tier sets how many Followers the Warband may have.
const TIER_CAT = { '6483-b676-c7e7-0831': 'Legend', 'f17d-8301-f19c-f80d': 'Valour', 'ef35-8c21-6b9c-cbb8': 'Fortitude', '69e9-a8ab-6276-49e0': 'Minor', '13f2-59a9-5a73-a03f': 'Independent' };
const FOLLOWERS_MAX = { Legend: 18, Valour: 15, Fortitude: 12, Minor: 6, Independent: 0 };
const HERO_BLOCKED_KW = /\b(Siege Engine|War Beast|Swarm)\b/;
// 'Heroic March, Heroic Strike' -> ['march', 'strike'], without the three every Hero has (heroes.js: UNIVERSAL).
const heroicKeys = txt => [...new Set((txt || '').split(/[,;\n]/).map(x => x.trim().toLowerCase().replace(/^heroic\s+/, '')).filter(k => /^(march|resolve|accuracy|strike|strength|defence|challenge|channelling)$/.test(k)))];
// Characteristics after the profile's modifiers. Defence is left as printed: the data's shield modifiers are not
// reliable (some are missing, some test the wrong option), so importArmy works Defence out from the wargear instead.
function stats(prof, ctx) {
  const ch = new Map(kids(kid(prof, 'characteristics'), 'characteristic').map(c => [c.a.typeId, { name: c.a.name, v: c.t.trim() }]));
  let name = prof.a.name;
  for (const m of mods(prof)) {
    if (!applies(m, ctx)) continue;
    if (m.a.field === 'name') { if (m.a.type === 'set') name = m.a.value; continue; }
    const c = ch.get(m.a.field); if (!c || c.name === 'Defence') continue;
    const num = parseInt(c.v), suf = c.v.replace(/^-?\d+/, '');
    if (m.a.type === 'set') c.v = m.a.value;
    else if (m.a.type === 'increment') c.v = num + +m.a.value + suf;
    else if (m.a.type === 'decrement') c.v = num - +m.a.value + suf;
  }
  const by = Object.fromEntries([...ch.values()].map(c => [c.name, c.v]));
  return { name, by };
}

// Defence that wargear adds on top of the printed profile (p. 110-111): armour 1, heavy armour 2, a shield 1.
const ARMOUR = { 'Armour': 1, 'Heavy Armour': 2, 'Dwarf Armour': 2, 'Heavy Dwarf Armour': 3, 'Mithril Armour': 3, 'Mithril Coat': 3, 'Shield': 1 };
// "Exchange shield for Banner", "Swap Shield for War Drum (Isengard)": the wargear the option takes away.
const swapped = label => { const m = label.match(/^(?:exchange|swap) (.+?) for /i); return m ? m[1].split(/,\s*|\s+and\s+/).map(s => s.trim().toLowerCase()) : []; };
// A Warband led by a War Beast (a War Mûmak): its Warriors ride in the howdah, so they are left out.
const ledByBeast = w => kids(kid(w, 'entryLinks'), 'entryLink').some(l => l.a.type === 'selectionEntry' && byId.get(l.a.targetId)
  && [...walk(byId.get(l.a.targetId))].some(n => n.tag === 'characteristic' && n.a.name === 'Unit Type' && /War Beast/.test(n.t)));

// One model entry (a Warrior's unit, or a Hero: hero = { tier }) with its loadouts: { n, loadouts }, or null.
function importModel(e, model, prof, ctx, hero = null) {
  const base = stats(prof, ctx);
  // The entry's name: some profiles in the data are misnamed ("Special Rules", "Isengard").
  base.name = fix(named(e, ctx));
  const kw = fix([base.by.Race, base.by.Faction, base.by['Unit Type']].filter(Boolean).join(' · '));
  const cats = kids(kid(model, 'categoryLinks'), 'categoryLink').map(c => c.a.name);
  const ut = base.by['Unit Type'] || '';
  // A mounted Warrior's mount comes with it (its Wargear); a Hero on foot may buy one (an option below).
  const baseMount = /Cavalry/.test(ut) ? mountIn([...own(e)], ctx) : null;
  if (hero ? !/Hero/.test(ut) || !/Infantry|Cavalry/.test(ut) || HERO_BLOCKED_KW.test(ut) || cats.some(c => HERO_BLOCKED_KW.test(c))
    : !/Warrior/.test(ut) || !(/Infantry|Chariot/.test(ut) || baseMount) || BLOCKED_KW.test(ut) || cats.some(c => BLOCKED_KW.test(c))) return null;
  const ownImpact = /Chariot/.test(ut) ? impactIn([...own(e)]) : null;   // a Warrior that is a Chariot (Khandish Charioteer)
  if (/Chariot/.test(ut) && !ownImpact) return null;
  if (/Cavalry/.test(ut) && !baseMount && !/Infantry/.test(ut)) return null;
  const rules = [...own(e)].filter(n => n.tag === 'infoLink' && n.a.type === 'rule' && !hidden(n, ctx)).map(n => ruleOf(n, ctx)).filter(r => r !== 'Elven' && !/^[\d.]+$/.test(r));   // '0.0': a broken Leader (X) link
  // Rules written straight into the entry (rare), not linked from the shared list.
  for (const r of [...own(e)].filter(n => n.tag === 'rule' && !hidden(n, ctx))) { rules.push(plain(r.a.name)); if (kid(r, 'description')) RULE_TEXT[plain(r.a.name)] = kid(r, 'description').t.trim(); }
  if (rules.some(r => BLOCKED_RULES.includes(r))) return null;
  const powers = hero ? powersOf(e, ctx) : [];
  const baseGear = [...walk(e)].filter(n => n.tag === 'infoGroup' && n.a.name === 'Wargear' && !hidden(n, ctx))
    .flatMap(g => kids(kid(g, 'infoLinks'), 'infoLink').filter(l => !hidden(l, ctx)).map(l => plain(named(l, ctx))));
  // Options: each group gives one choice (or none, unless the profile must take one).
  const groups = kids(kid(e, 'selectionEntryGroups'), 'selectionEntryGroup').filter(g => !hidden(g, ctx)).map(g => {
    const cons = kids(kid(g, 'constraints'), 'constraint');
    const min = +(cons.find(c => c.a.type === 'min')?.a.value || 0);
    const opts = kids(kid(g, 'selectionEntries'), 'selectionEntry').filter(o => !hidden(o, ctx)).map(o => ({
      id: o.a.id, label: o.a.name.replace(/\bamd\b/, 'and').replace(/\s*&\s*/g, ' and '),
      pts: incr(o, COST.pts), bow: incr(o, COST.bow), thr: incr(o, COST.thr),
      items: kids(kid(o, 'infoLinks'), 'infoLink').map(l => plain(l.a.name)),
      buys: kids(kid(o, 'infoLinks'), 'infoLink').filter(l => l.a.type === 'rule' && plain(l.a.name) !== 'Elven').map(l => ruleOf(l, ctx)),
      drops: swapped(o.a.name), mount: mountIn([...walk(o)], ctx), chariot: hero ? chariotIn([...walk(o)], ctx) : null,
    }));
    // Shared upgrades linked into the group (a Hero's "Horse", "Armoured Horse", "Warg"): the link's own cost changes
    // on top of the upgrade's.
    for (const l of kids(kid(g, 'entryLinks'), 'entryLink')) {
      const t = byId.get(l.a.targetId);
      if (!t || l.a.type !== 'selectionEntry' || hidden(l, ctx) || hidden(t, ctx)) continue;
      const m = mountIn([...walk(t)], ctx);
      if (!m) continue;   // only mounts are read from links for now
      opts.push({ id: t.a.id, label: named(l, ctx), pts: cost(t, COST.pts) + incr(l, COST.pts) + incr(t, COST.pts), bow: 0, thr: 0, items: [m.n], buys: [], drops: [], mount: m });
    }
    for (let k = 0; k < opts.length; k++) if (!opts[k].items.length) opts[k] = { ...opts[k], items: [opts[k].label] };   // an option with no wargear profile is named after what it buys   // an option with no wargear profile is named after what it buys
    return min >= 1 ? opts : [null, ...opts];
  }).filter(g => g.length);
  let combos = [[]];
  for (const g of groups) combos = combos.flatMap(c => g.map(o => (o ? [...c, o] : c)));
  const loadouts = [];
  for (const chosen of combos.slice(0, 24)) {
    const drops = chosen.flatMap(o => o.drops), kept = baseGear.filter(g => !drops.includes(g.toLowerCase()));
    const items = [...kept, ...chosen.flatMap(o => o.items)];
    const bought = new Set(chosen.flatMap(o => o.buys));
    const bad = items.filter(g => !bought.has(g) && gearKind(g) === 'no');
    // A special rule an option buys goes on the profile (the card marks the ones the engine does not play yet).
    const thrownAsSpear = items.some(g => gearKind(g) === 'thrown') && rules.includes('Spear Mastery');
    if (bad.length) { for (const b of bad) skipped.set(b, (skipped.get(b) || 0) + 1); continue; }
    const picked = new Set(chosen.map(o => o.id));
    const s = stats(prof, { ...ctx, sel: id => (picked.has(id) || id === model.a.id ? 1 : 0) });
    const num = k => parseInt(s.by[k]);
    // "Exchange shield for Banner" reads "Banner (instead of shield)".
    const label = chosen.map(o => (o.drops.length ? `${o.label.replace(/^.*? for /i, '')} (instead of ${o.drops.join(' and ')})` : o.label)).join(', ');
    const T = { n: s.name, ...(label ? { full: `${s.name} with ${label.replace(/ \(instead of .*\)$/, '').toLowerCase()}` } : {}), kw, base: (parseInt(base.by['Base Size']) || 25) * (/oval/i.test(base.by['Base Size'] || '') ? 0.8 : 1) };
    const mount = baseMount || chosen.map(o => o.mount).find(Boolean) || null;
    // Defence: the printed value, plus what the options add, minus what they take away.
    const printed = num('Defence'), arm = list => list.reduce((n, g) => n + (ARMOUR[g] || 0), 0);
    const d = printed + arm(chosen.flatMap(o => o.items)) - arm(baseGear.filter(g => !kept.includes(g)));
    Object.assign(T, { mv: num('Move Value'), f: num('Fight Value'), sh: num('Shoot Value'), s: num('Strength'), d });
    if (d !== printed && chosen.some(o => o.items.includes('Shield'))) T.pd = printed;
    Object.assign(T, { a: num('Attacks'), w: num('Wounds'), c: num('Courage'), i: num('Intelligence') });
    // A Hero: Might, Will and Fate (some values in the data carry stray whitespace), its tier and Heroic Actions.
    if (hero) Object.assign(T, { hero: true, mwf: ['Might', 'Will', 'Fate'].map(k => parseInt(String(s.by[k] || '0').replace(/\s+/g, '')) || 0), tier: hero.tier, heroic: heroicKeys(s.by['Heroic Actions']) });
    if (hero && powers.length) T.powers = powers;
    const drumKw = /war drum \(([^)x][^)]*)\)/i.exec(label);   // the option names the drum's keyword where the item says (X)
    T.gear = items.filter(g => !bought.has(g)).map(g => (g === 'War Drum (X)' && drumKw ? `War Drum (${drumKw[1][0].toUpperCase()}${drumKw[1].slice(1)})` : g));
    T.rules = [...new Set([...rules, ...bought, ...(items.includes('War Horn') ? ['Dominant (2)'] : [])])];   // a war horn gives Dominant (2) (p. 110)
    const rw = items.find(g => gearKind(g) === 'ranged');
    if (rw) { const r = RANGED.get(rw); T.bow = { n: rw, rng: r.rng, s: r.s, ...(/^full/i.test(r.move) ? { still: true } : {}), ...(rw === 'Sling' ? { sling: true } : {}), ...(rw === 'Blowpipe' ? { poison: true } : {}) }; }
    const tw = items.find(g => gearKind(g) === 'thrown');
    if (tw) { const nm = /spear/i.test(tw) ? 'Throwing Spear' : /whip/i.test(tw) ? 'Whip' : 'Throwing Weapon', r = RANGED.get(nm); T.thrown = { n: nm, rng: r.rng, s: r.s, thrown: true }; }
    const has = w => items.some(g => g.replace(/^Elven /i, '') === w);
    const as = k => items.some(g => GEAR_AS[g] === k || GEAR_AS[g.replace(/^Elven /i, '').toLowerCase()] === k);
    if (has('Spear') || has('War Spear') || thrownAsSpear || as('spear')) T.spear = true;
    if (has('Pike') || as('halberd')) T.pike = true;   // an Easterling Halberd is a pike or a two-handed weapon
    if (items.includes('Banner') || as('banner')) T.banner = true;
    if (items.includes('Two-handed Weapon') || as('two') || as('halberd')) T.twoHanded = true;
    if (items.includes('Flaming Brand')) T.rules = [...T.rules, 'Terror (Cavalry)', 'Terror (Beast)'];   // Flaming Brand
    if (as('horn') && !T.gear.includes('War Horn')) T.gear = [...T.gear, 'War Horn'];
    if (items.includes('The One Ring')) T.ring = true;   // the Ringbearer (engine/advanced.js)
    if (/Monster/.test(base.by['Unit Type'])) T.monster = true;
    const notes = [thrownAsSpear && THROWN, ...items.filter(g => gearKind(g) === 'note').map(g => NOTE[g] || NOTE[g.replace(/^Elven /i, '')])].filter(Boolean);
    if (notes.length) T.note = [...new Set(notes)].join(' ');
    T.icon = hero ? 'captain' : iconOf(T, base.by.Race || '');
    // Chariots (p. 152–153): a Warrior that is one, or a Hero riding one. The Hero lends the Chariot its Fight Value,
    // Strength, Courage and Intelligence where they are better and adds its Attacks; the Chariot's Wounds are the
    // model's, the Hero's own are kept for when the Chariot is destroyed (T.foot, Knocked Flying).
    const chariot = chosen.map(o => o.chariot).find(Boolean) || null;
    if (ownImpact) { T.chariot = ownImpact; T.icon = 'chariot'; T.base = Math.round(T.base); }
    if (chariot) {
      const foot = { ...T, full: `${T.n} on foot` };
      T.foot = addType(foot);
      Object.assign(T, { mv: chariot.mv, f: Math.max(T.f, chariot.f), s: Math.max(T.s, chariot.s), d: chariot.d, a: T.a + chariot.a, w: chariot.w,
        c: Math.min(T.c, chariot.c), i: Math.min(T.i, chariot.i), base: chariot.base, chariot: { ...chariot.impact, rider: true, n2: chariot.n }, full: `${T.n} in a ${chariot.n.replace(/^.*?(chariot|sleigh)$/i, (m, k) => k.toLowerCase())}` });
      delete T.pd;
      T.rules = [...new Set([...T.rules, ...chariot.rules])];
      T.kw = T.kw.replace(/\bInfantry\b/, 'Chariot');
    }
    if (T.chariot) { T.rules = [...new Set([...T.rules, 'Chariot Charge'])]; T.note = [T.note, `Chariot Charge: ${T.chariot.n} Impact Hits at Strength ${T.chariot.s}.`].filter(Boolean).join(' '); }
    // Cavalry (p. 67): the rider's profile with its mount; the model on foot is a profile of its own (T.foot), and a mount
    // that can fight on alone (Attacks 1 or more) is one too (mount.loose). A lance is dropped on foot.
    if (mount) {
      const foot = { ...T, kw: T.kw.replace(/\bCavalry\b/, 'Infantry'), gear: T.gear.filter(g => !MOUNT_NAMES.has(g) && !/^lance$/i.test(g)), full: `${T.n} on foot` };
      if (foot.kw === T.kw && !/Infantry/.test(foot.kw)) foot.kw += ', Infantry';
      T.foot = addType(foot);
      const { base: mb, rules: mr, ...M } = mount;
      T.mount = { ...M, ...(mr && mr.length ? { rules: mr } : {}) };
      if (M.a > 0) T.mount.loose = addType({ n: M.n, kw: `${M.n} · ${M.monster ? 'Monster' : 'Beast'}`, base: mb, mv: M.mv, f: M.f, sh: M.sh, s: M.s, d: M.d, a: M.a, w: M.w, c: M.c, i: M.i, gear: [], rules: mr || [], icon: /warg/i.test(M.n) ? 'warg' : 'warrior', mountModel: true });
      T.base = Math.max(T.base, mb);
      if (!/Cavalry/.test(T.kw)) T.kw = T.kw.replace(/\bInfantry\b/, 'Cavalry');
      T.icon = hero ? 'captain' : /warg/i.test(M.n) ? 'wargrider' : 'rider';
    }
    const bows = cost(model, COST.bow) + chosen.reduce((n, o) => n + o.bow, 0);
    const thr = cost(model, COST.thr) + chosen.reduce((n, o) => n + o.thr, 0);
    loadouts.push({ t: addType(T), label: label || 'Standard', pts: cost(model, COST.pts) + chosen.reduce((n, o) => n + o.pts, 0),
      ...(bows ? { bow: 1 } : {}), ...(thr ? { thr: 1 } : {}), ...(cost(model, COST.war) ? {} : { free: 1 }) });
  }
  return loadouts.length ? { n: base.name, ...(hero ? { hero: hero.tier, lead: FOLLOWERS_MAX[hero.tier] } : {}), loadouts } : null;
}

/* ---------- Siege Engines ---------- */
const siegeProfile = e => [...walk(e)].find(n => n.tag === 'profile' && n.a.typeName === 'Siege Engine') || null;
const SIEGE_RULE_TEXT = {
  'Arcing Shot': 'The engine needs no Line of Sight if a friend can see the target, and its shot comes down over models and terrain (no In The Way Tests).',
  'Direct Shot': 'The engine needs Line of Sight from its firing point, and its shot makes In The Way Tests like any other.',
  'Static': 'The engine can never be moved or turned.',
};
// A crew member's profile (Siege Veteran or crew, or the Mordor Siege Troll) as a type of its own.
function crewType(m, ctx, hero) {
  const prof = warriorProfile(m, ctx, hero ? 'Hero' : 'Warrior') || warriorProfile(m, ctx, 'Warrior');
  if (!prof) return null;
  const s = stats(prof, ctx), num = k => parseInt(String(s.by[k] || '0').replace(/\s+/g, '')) || 0;
  const gear = [...walk(m)].filter(n => n.tag === 'infoGroup' && n.a.name === 'Wargear').flatMap(g => kids(kid(g, 'infoLinks'), 'infoLink').map(l => plain(named(l, ctx))));
  const rules = [...own(m)].filter(n => n.tag === 'infoLink' && n.a.type === 'rule' && !hidden(n, ctx)).map(n => ruleOf(n, ctx));
  const T = { n: fix(s.name), kw: fix([s.by.Race, s.by.Faction, (s.by['Unit Type'] || '').replace(/\bWarrior\b/, hero ? 'Hero' : 'Warrior')].filter(Boolean).join(' · ')), base: parseInt(s.by['Base Size']) || 25,
    mv: num('Move Value'), f: num('Fight Value'), sh: num('Shoot Value'), s: num('Strength'), d: num('Defence'), a: num('Attacks'), w: num('Wounds'), c: num('Courage'), i: num('Intelligence'), gear, rules };
  if (hero) Object.assign(T, { hero: true, mwf: ['Might', 'Will', 'Fate'].map(k => num(k) || 1), tier: 'Minor', heroic: [] });   // a Siege Veteran 1/1/1, a War Beast's Commander its own
  if (/Monster/.test(s.by['Unit Type'] || '')) T.monster = true;
  T.icon = hero ? 'captain' : T.monster ? 'troll' : 'warrior';
  return addType(T);
}
function importSiege(e, ctx) {
  const prof = siegeProfile(e), by = Object.fromEntries(kids(kid(prof, 'characteristics'), 'characteristic').map(c => [c.a.name, c.t.trim()]));
  const rng = /(\d+)\D+(\d+)/.exec(by.Range || '') || [0, 0, 0];
  const top = function* (n) { yield n; for (const k of n.c) if (k.tag !== 'selectionEntries' && k.tag !== 'selectionEntryGroups') yield* top(k); };   // not the crew's rules
  const rules = [...top(e)].filter(n => n.tag === 'infoLink' && n.a.type === 'rule' && !hidden(n, ctx)).map(n => { const r = ruleOf(n, ctx); if (!RULE_TEXT[r] && SIEGE_RULE_TEXT[r]) RULE_TEXT[r] = SIEGE_RULE_TEXT[r]; return r; });
  const crew = [];
  for (const m of kids(kid(e, 'selectionEntries'), 'selectionEntry').filter(x => x.a.type === 'model' && !hidden(x, ctx))) {
    const n = +(kids(kid(m, 'constraints'), 'constraint').find(c => c.a.type === 'min')?.a.value || 1);
    const key = crewType(m, ctx, /Veteran/i.test(m.a.name));
    if (key && n > 0) crew.push([key, n]);
  }
  if (!crew.length) return null;
  if (/Bolt Thrower/.test(e.a.name) && !rules.includes('Rapid Fire')) rules.push('Rapid Fire');   // linked from the crew in the data
  if (crew.some(([k]) => /troll/i.test(k)) && !rules.includes('Troll Loader')) rules.push('Troll Loader');
  const base0 = parseInt(by['Base Size']) || 50, oval = /oval/i.test(by['Base Size'] || '');
  const name = fix(e.a.name.replace(/^Assualt/, 'Assault'));
  const T = { n: name, kw: 'Siege Engine', base: oval ? Math.round(base0 * 0.8) : base0, mv: 0, f: 0, sh: 6, s: +by.Strength, d: +by.Defence, a: 0, w: +by.Wounds, c: 2, i: 2, gear: [], rules,
    siege: { large: /large/i.test(by['Size of Engine'] || ''), min: +rng[1], max: +rng[2], s: +by.Strength, d: +by.Defence, w: +by.Wounds, arcing: rules.includes('Arcing Shot'), static: rules.includes('Static') },
    crewKeys: crew.map(c => c[0]), crew, icon: 'siege' };
  // Options (Flaming Ammunition, Swift Reload, Severed Heads): one loadout each, besides the plain engine.
  const opts = [];
  for (const g of kids(kid(e, 'selectionEntryGroups'), 'selectionEntryGroup')) {
    for (const o of kids(kid(g, 'selectionEntries'), 'selectionEntry')) if (!hidden(o, ctx)) opts.push({ label: plain(o.a.name), pts: cost(o, COST.pts) + incr(o, COST.pts) });
    for (const l of kids(kid(g, 'entryLinks'), 'entryLink')) { const t = byId.get(l.a.targetId); if (t && !hidden(l, ctx)) opts.push({ label: plain(named(l, ctx)), pts: cost(t, COST.pts) + incr(l, COST.pts) }); }
  }
  for (const o of [...kids(kid(e, 'selectionEntries'), 'selectionEntry').filter(x => x.a.type === 'upgrade' && !hidden(x, ctx))]) opts.push({ label: plain(o.a.name), pts: cost(o, COST.pts) + incr(o, COST.pts) });
  const pts = cost(e, COST.pts);
  const loadouts = [{ t: addType(T), label: 'Standard', pts, free: 1 }];
  for (const o of opts) loadouts.push({ t: addType({ ...T, full: `${name} with ${o.label.toLowerCase()}`, rules: [...rules, o.label] }), label: o.label, pts: pts + o.pts, free: 1 });
  return { n: name, siege: true, loadouts };
}

/* ---------- War Beasts ---------- */
// The War Beast's profile (Unit Type War Beast), written into the entry or in a shared group it links.
const deep = n => [...walk(n)].flatMap(x => (x.tag === 'infoLink' && (x.a.type === 'infoGroup' || x.a.type === 'profile') && byId.get(x.a.targetId) ? [x, ...walk(byId.get(x.a.targetId))] : [x]));
const utOf = p => ((kids(kid(p, 'characteristics'), 'characteristic').find(c => c.a.name === 'Unit Type') || {}).t || '');
const beastProfile = e => deep(e).find(n => n.tag === 'profile' && n.a.typeName === 'Warrior' && /War Beast/.test(utOf(n))) || null;
// Impact Hits where the profile's Trample text does not give them (the Mûmak's text in the data is another rule's).
const TRAMPLE = { 'Mûmak': { n: 3, s: 9 }, 'Royal War Mûmak': { n: 4, s: 9 }, 'Troll Brute': { n: 2, s: 10 } };
const BEAST_OPTIONS = { 'Gnarled Hide': T => { T.d += 1; }, 'Tusk Weapons': T => { T.warBeast.n = 4; }, 'Foul Temperament': T => { T.a += 1; T.warBeast.foul = true; } };
function importWarBeast(e, ctx) {
  const prof = beastProfile(e), by = Object.fromEntries(kids(kid(prof, 'characteristics'), 'characteristic').map(c => [c.a.name, (c.t || '').trim()]));
  const num = k => parseInt(by[k]), name = plain(prof.a.name).trim();
  const hp = deep(e).find(n => n.tag === 'profile' && plain(n.a.name) === 'Howdah');
  const hb = hp ? Object.fromEntries(kids(kid(hp, 'characteristics'), 'characteristic').map(c => [c.a.name, (c.t || '').trim()])) : null;
  const all = deep(e), ruleNodes = all.filter(n => n.tag === 'rule' || (n.tag === 'infoLink' && n.a.type === 'rule'));
  const rules = [...new Set(ruleNodes.filter(n => n.tag === 'infoLink').map(n => ruleOf(n, ctx)).filter(r => !/^(Howdah|Trample)/.test(r)))];
  const impact = impactIn(all) || TRAMPLE[name];
  if (!impact) return null;
  const archers = all.some(n => n.tag === 'rule' && /^Orc Archers/.test(plain(n.a.name))), cmdDies = all.some(n => n.tag === 'rule' && /^Plenty of Orcs/.test(plain(n.a.name)));
  // The Commanders: the Hero models in the entry (one of them, as a choice).
  const cmds = [...walk(e)].filter(n => n.tag === 'selectionEntry' && n.a.type === 'model' && !hidden(n, ctx) && warriorProfile(n, ctx, 'Hero'))
    .map(m => ({ key: crewType(m, ctx, true), pts: cost(m, COST.pts), n: plain(m.a.name) })).filter(c => c.key);
  // A Commander written straight into the entry (the Great Beast's Orc Commander).
  if (!cmds.length) { const hpf = all.find(n => n.tag === 'profile' && n.a.typeName === 'Hero'); if (hpf) { const key = crewType(e, ctx, true); if (key) cmds.push({ key, pts: 0, n: plain(hpf.a.name) }); } }
  if (!cmds.length) return null;
  const base0 = parseInt(by['Base Size']) || 120;
  const T = { n: name, kw: fix([by.Race, by.Faction, 'War Beast'].filter(Boolean).join(' · ')), base: /oval|x/i.test(by['Base Size'] || '') ? Math.round(base0 * 0.8) : base0,
    mv: num('Move Value'), f: num('Fight Value'), sh: archers && hb ? parseInt(hb['Shoot Value']) || 5 : num('Shoot Value'), s: num('Strength'), d: num('Defence'), a: num('Attacks'), w: num('Wounds'), c: num('Courage'), i: num('Intelligence'),
    gear: [], rules: [...rules, 'Trample'], icon: 'beast',
    warBeast: { ...impact, ...(hb ? { howdah: { d: parseInt(hb.Defence) || 0, w: parseInt(hb.Wounds) || 0 } } : {}), ...(archers ? { archers: true } : {}), ...(cmdDies ? { cmdDies: true } : {}) } };
  T.note = `Trample: ${impact.n} Impact Hits at Strength ${impact.s}.${hb ? ` Howdah: Defence ${T.warBeast.howdah.d}, ${T.warBeast.howdah.w} Wounds.` : ''}${archers ? ' The Orc archers in the Howdah shoot as many arrows as it has Wounds left.' : ''}`;
  if (archers) T.bow = { n: 'Orc bows (Howdah)', rng: 18, s: 2, howdah: true };
  const opts = [...walk(e)].filter(n => n.tag === 'selectionEntry' && n.a.type === 'upgrade' && BEAST_OPTIONS[plain(n.a.name)] && !hidden(n, ctx)).map(o => ({ n: plain(o.a.name), pts: cost(o, COST.pts) }));
  const pts = cost(e, COST.pts), loadouts = [];
  for (const c of cmds) for (const o of [null, ...opts]) {
    const B = JSON.parse(JSON.stringify(T));
    if (o) { BEAST_OPTIONS[o.n](B); B.rules = [...B.rules, o.n]; }
    B.cmd = c.key; B.full = `${name} with ${c.n}${o ? ` and ${o.n.toLowerCase()}` : ''}`;
    loadouts.push({ t: addType(B), label: o ? `${c.n}, ${o.n}` : c.n, pts: pts + c.pts + (o ? o.pts : 0), free: 1 });
  }
  return { n: plain(e.a.name), warBeast: true, loadouts };
}
RULE_TEXT.Trample = 'The War Beast Moves by Trampling: it turns to face any way and Moves its full Move Value in a straight line, ignoring Control Zones, Difficult Terrain and water, over Obstacles up to 2″ high. Every model it runs into suffers its Impact Hits; if slain it goes on, if not it stops there, Charging it, and if it wins the beaten with no more Strength than it are knocked Prone. It is never knocked Prone, Hurled, Barged or Trapped, and never Backs Away. Each Wound: a Courage Test (its Commander\'s Courage), or it Stampedes.';

function importArmy(cat) {
  const warbands = kids(kid(cat, 'selectionEntries'), 'selectionEntry').map(w => ({ w, f: [...walk(w)].find(n => n.tag === 'entryLink' && FOLLOWERS[n.a.targetId]) })).filter(x => x.f);
  if (!warbands.length) return null;
  const align = FOLLOWERS[warbands[0].f.a.targetId];
  const ctxs = warbands.filter(({ w }) => !ledByBeast(w)).map(({ w }) => ({ cat: cat.a.id, anc: new Set([w.a.id, ...kids(kid(w, 'categoryLinks'), 'categoryLink').map(c => c.a.targetId)]), sel: () => 0 }));
  const G = byId.get(warbands[0].f.a.targetId);
  const entries = [...kids(kid(G, 'selectionEntries'), 'selectionEntry').map(e => ({ e, link: null })),
    ...kids(kid(G, 'entryLinks'), 'entryLink').map(l => ({ e: byId.get(l.a.targetId), link: l }))];
  const units = [];
  for (const { e, link } of entries) {
    if (!e) continue;
    const ctx = ctxs.find(cx => !(link && hidden(link, cx)) && !hidden(e, cx));
    if (!ctx) continue;
    const models = kids(kid(e, 'selectionEntries'), 'selectionEntry').filter(x => x.a.type === 'model');
    if (models.length !== 1) continue;
    const model = models[0], prof = warriorProfile(e, ctx);
    if (!prof) continue;
    const u = importModel(e, model, prof, ctx);
    if (u) units.push(u);
  }
  // The Heroes that lead the Warbands: infantry only for now (no mounts), Independent Heroes not yet.
  for (const { w } of warbands) {
    if (ledByBeast(w)) continue;
    const wc = kids(kid(w, 'categoryLinks'), 'categoryLink');
    const ctx = { cat: cat.a.id, anc: new Set([w.a.id, ...wc.map(c => c.a.targetId)]), sel: () => 0 };
    for (const l of kids(kid(w, 'entryLinks'), 'entryLink')) {
      const e = byId.get(l.a.targetId);
      if (!e || e.a.type !== 'model' || hidden(l, ctx) || hidden(e, ctx)) continue;
      const prof = warriorProfile(e, ctx, 'Hero');
      if (!prof) continue;
      const printed = /Legend|Valour|Fortitude|Minor|Independent/.exec(stats(prof, ctx).by['Heroic Tier'] || '');
      const tier = TIER_CAT[(wc.find(c => c.a.primary === 'true') || { a: {} }).a.targetId] || (printed ? printed[0] : 'Fortitude');
      const u = importModel(e, e, prof, ctx, { tier });
      if (u && !units.some(x => x.n === u.n)) units.push(u);
    }
  }
  // Siege Engines (p. 140–147): linked anywhere in the catalogue; each comes with its Siege Veteran and crew.
  const seen = new Set();
  for (const l of [...walk(cat)].filter(n => n.tag === 'entryLink' && n.a.type === 'selectionEntry')) {
    const e = byId.get(l.a.targetId);
    if (!e || seen.has(e.a.id) || hidden(l, { cat: cat.a.id, anc: new Set(), sel: () => 0 }) || !siegeProfile(e)) continue;
    seen.add(e.a.id);
    const u = importSiege(e, { cat: cat.a.id, anc: new Set([e.a.id]), sel: () => 0 });
    if (u) units.push(u);
  }
  // War Beasts (p. 148–151): linked anywhere in the catalogue; each comes with its Commander.
  for (const l of [...walk(cat)].filter(n => n.tag === 'entryLink' && n.a.type === 'selectionEntry')) {
    const e = byId.get(l.a.targetId);
    if (!e || seen.has(e.a.id) || hidden(l, { cat: cat.a.id, anc: new Set(), sel: () => 0 }) || !beastProfile(e)) continue;
    seen.add(e.a.id);
    const u = importWarBeast(e, { cat: cat.a.id, anc: new Set([e.a.id]), sel: () => 0 });
    if (u) units.push(u);
  }
  if (!units.length) return null;
  const rules = kids(kid(cat, 'rules'), 'rule').filter(r => r.a.hidden !== 'true').map(r => ({ n: ruleName(plain(r.a.name)), x: (kid(r, 'description')?.t || '').trim() }));
  const bp = rules.map(r => r.x.match(/Break Point[^.]*?(\d+)%/i)).find(Boolean);
  return { id: camel(cat.a.name), name: cat.a.name, align, ...(bp ? { breakPoint: +bp[1] / 100 } : {}), rules, units: units.sort((a, b) => a.n.localeCompare(b.n)) };
}

const ARMIES = cats.map(importArmy).filter(Boolean).sort((a, b) => (a.align === b.align ? a.name.localeCompare(b.name) : a.align === 'good' ? -1 : 1));
const usedRules = new Set(Object.values(TYPES).flatMap(T => T.rules));
// The Chariot Charge text written into each Chariot's profile only gives its Impact Hits (on the card: T.note).
RULE_TEXT['Chariot Charge'] = 'The Chariot Moves by Chariot Charge: it pivots up to 45° (again after each full 4″), then Moves up to its Move Value in a straight line, ignoring Control Zones. Every model it runs into suffers its Impact Hits; if that model is slain it goes on, if not it stops and Charges it. It has +1 Attack after a Charge, and if it wins, the beaten Infantry and Cavalry (not Monsters) are knocked Prone. It is never knocked Prone, Hurled, Barged or Trapped, and never Backs Away.';
const texts = Object.fromEntries(Object.entries(RULE_TEXT).filter(([k]) => usedRules.has(k)).sort());

const lines = [
  '// Generated by tools/import-armies.mjs: do not edit by hand, run the importer again.',
  `// Source: BattleScribe data "Middle-earth v2: War of the Rohirrim", ${REPO} (commit ${commit.slice(0, 10)}${date ? `, ${date}` : ''}).`,
  '// Matched play armies: Warriors and the Heroes that lead Warbands (hero: Heroic Tier, lead: Followers allowed), infantry only,',
  '// with the wargear the rules engine simulates.',
  '// ARMY_TYPES uses the same profile format as TYPES in units.js. Each loadout: t = type, pts = points,',
  '// bow / thr = counts towards the bow / throwing weapon limit, free = does not count as a Warrior for those limits.',
  `export const SOURCE = ${JSON.stringify({ repo: REPO, commit, date })};`,
  'export const ARMY_TYPES = {',
  ...Object.entries(TYPES).map(([k, T]) => `  ${k}: ${JSON.stringify(T)},`),
  '};',
  'export const ARMIES = [',
  ...ARMIES.map(a => `  ${JSON.stringify(a)},`),
  '];',
  '// What each Magical Power does (p. 114-121; shown on the profile card, played by engine/magic.js: POWERS).',
  'export const POWER_TEXT = {',
  ...Object.entries(POWER_TEXT).sort().map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
  '};',
  '// What each special rule does (shown on the profile card; the engine plays those in engine/special.js: SPECIALS).',
  'export const RULE_TEXT = {',
  ...Object.entries(texts).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
  '};',
  '',
];
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`${ARMIES.length} armies (${ARMIES.filter(a => a.align === 'good').length} Good), ${Object.keys(TYPES).length} profiles, ${Object.keys(texts).length} rule texts -> ${path.relative(process.cwd(), OUT)}`);
console.log('Options left out for wargear the engine does not simulate:', [...skipped].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', '));
