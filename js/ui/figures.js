// Token figures: a miniature seen from straight above, drawn from the unit's profile so that the model and its wargear
// can be told apart at a glance. The race and faction (from the keywords) pick the body, head, helmet and colours;
// the wargear picks what it holds: shield on the model's left (x < 0), weapon in its right hand (x > 0), bow or banner
// in the left, two-handed weapons across the chest. Drawn in a box from -1 to 1 (the base field), facing up; long
// weapons may overhang the field onto the rim, as on a real base. No DOM here beyond the 2D context it is given.
import { TAU } from '../util.js';

const OUT = 'rgba(14,9,4,0.88)';
const STEEL = '#c3c6cd', STEEL_D = '#7b7f88', IRON = '#5c5e64', IRON_D = '#303136', BRONZE = '#c0913d', GOLD = '#ecc659',
  WOOD = '#9a6632', WOOD_D = '#5a3817', LEATHER = '#7a5330', BONE = '#eadfc4', BLACK = '#1b1b20', WHITE = '#f6f1e6',
  RED = '#a8302a';

/* ---------- Races: skin, hair, head size, hand weapon ---------- */
const RACES = {
  Man:      { skin: '#e6b38a', hair: '#4a3222', head: 0.3, weapon: 'sword' },
  Elf:      { skin: '#f3e1cb', hair: '#e8d08a', head: 0.29, weapon: 'elven', hairLong: true },
  Dwarf:    { skin: '#e2ad84', hair: '#8c4a22', head: 0.31, weapon: 'axe', beard: true, body: 0.9 },
  Hobbit:   { skin: '#eec39e', hair: '#6a4426', head: 0.27, weapon: 'club', body: 0.8, hairCurly: true },
  Orc:      { skin: '#7f8a58', hair: '#2a2420', head: 0.3, weapon: 'cleaver' },
  'Uruk-hai': { skin: '#5a3f31', hair: '#1a1512', head: 0.31, weapon: 'cleaver', body: 1.06 },
  Goblin:   { skin: '#b9c27c', hair: null, head: 0.28, weapon: 'cleaver', body: 0.82, ears: true },
  Troll:    { skin: '#8d8a82', hair: null, head: 0.36, weapon: 'club' },
  Spirit:   { skin: '#c9efd3', hair: '#9ad1a8', head: 0.3, weapon: 'sword', ghost: true },
  Warg:     { skin: '#6f5a46' }, Spider: { skin: '#26221f' }, Ent: { skin: '#5a4a30' }, Drake: { skin: '#6f3a2a' },
};

/* ---------- Factions: cloth, cloak, helmet, shield and banner colours ---------- */
// helm: crest (round helm with a horse-hair crest), winged, tall (a high ridge), flat (iron, flat top), spiked, cone,
// dwarf (mask), hood, hair (bare head), turban, scarf, cap, leaf (Elven), ridge, horns.
const FACTIONS = {
  Rohan:       { cloth: '#4f7d3d', cloak: '#2b4a28', helm: 'crest', metal: STEEL, trim: GOLD, crest: '#e0c67a', shield: { shape: 'round', fill: '#3f6f36', rim: GOLD, emblem: 'sun' }, flag: ['#3f6f36', GOLD, 'sun'] },
  Gondor:      { cloth: '#23252e', cloak: '#121318', helm: 'winged', metal: STEEL, trim: STEEL_D, shield: { shape: 'kite', fill: '#1f2129', rim: STEEL, emblem: 'tree' }, flag: ['#1f2129', WHITE, 'tree'] },
  'Dol Amroth': { cloth: '#2d55a0', cloak: '#1c3566', helm: 'winged', metal: STEEL, trim: STEEL, shield: { shape: 'kite', fill: '#2d55a0', rim: STEEL, emblem: 'swan' }, flag: ['#2d55a0', WHITE, 'swan'] },
  'Blackroot Vale': { cloth: '#5a6a3a', cloak: '#3a4a2a', helm: 'hood', metal: STEEL_D },
  Lamedon:     { cloth: '#6a5a3a', cloak: '#4a3a24', helm: 'cap', metal: STEEL_D, shield: { shape: 'round', fill: '#6a5a3a', rim: STEEL_D } },
  Lossarnach:  { cloth: '#5a4a34', cloak: '#3c3022', helm: 'cap', metal: STEEL_D, weapon: 'axe' },
  Dunland:     { cloth: '#8a5a32', cloak: '#5c4028', fur: true, helm: 'hair', hair: '#2d2018', paint: '#3a6a9a', metal: IRON, weapon: 'axe', shield: { shape: 'planks', fill: WOOD, rim: IRON_D }, flag: ['#8a5a32', '#2d2018', 'skull'] },
  Isengard:    { cloth: '#3a3632', cloak: '#1e1c1a', helm: 'flat', metal: IRON, trim: IRON_D, shield: { shape: 'tall', fill: '#3a3733', rim: IRON_D, emblem: 'hand' }, flag: ['#2e2b28', WHITE, 'hand'] },
  Mordor:      { cloth: '#5e3a30', cloak: '#2a1612', helm: 'spiked', metal: '#6b4a3a', trim: IRON_D, shield: { shape: 'ragged', fill: '#3b2a24', rim: IRON_D, emblem: 'eye' }, flag: ['#2a1612', RED, 'eye'] },
  Angmar:      { cloth: '#3a2a4a', cloak: '#221a2e', helm: 'spiked', metal: IRON, trim: IRON_D, shield: { shape: 'ragged', fill: '#2e2238', rim: IRON_D, emblem: 'skull' }, flag: ['#2e2238', BONE, 'skull'] },
  'Carn Dûm':  { cloth: '#3a2a4a', cloak: '#221a2e', helm: 'tall', metal: IRON, trim: IRON_D, shield: { shape: 'kite', fill: '#2e2238', rim: IRON_D, emblem: 'skull' }, flag: ['#2e2238', BONE, 'skull'] },
  Gundabad:    { cloth: '#2a2a2e', cloak: '#1a1a1e', helm: 'spiked', metal: IRON_D, trim: IRON, skin: '#c8c2b6', shield: { shape: 'ragged', fill: '#2a2a2e', rim: IRON, emblem: 'skull' }, flag: ['#2a2a2e', BONE, 'skull'] },
  Moria:       { cloth: '#4a3a2a', cloak: null, helm: 'hair', metal: IRON_D, shield: { shape: 'ragged', fill: '#3a3028', rim: IRON_D }, flag: ['#3a3028', BONE, 'skull'] },
  'Goblin-town': { cloth: '#6a5a3a', cloak: null, helm: 'hair', metal: IRON_D, skin: '#c9b48a' },
  'Dol Guldur': { cloth: '#26221f' },
  Dunharrow:   { cloth: '#7fc49a', cloak: '#5fa37c', helm: 'tall', metal: '#a9dcb9', trim: '#d9f5e2', shield: { shape: 'kite', fill: '#5fa37c', rim: '#d9f5e2' }, flag: ['#5fa37c', '#d9f5e2', 'none'] },
  Erebor:      { cloth: '#2c4a7a', cloak: '#1e3254', helm: 'dwarf', metal: STEEL, trim: GOLD, shield: { shape: 'round', fill: '#2c4a7a', rim: GOLD, emblem: 'rune' }, flag: ['#2c4a7a', GOLD, 'rune'] },
  'Iron Hills': { cloth: '#7a2e2a', cloak: '#52201c', helm: 'dwarf', metal: BRONZE, trim: '#8a6420', shield: { shape: 'round', fill: '#7a2e2a', rim: BRONZE, emblem: 'rune' }, flag: ['#7a2e2a', BRONZE, 'rune'] },
  'Khazad-dûm': { cloth: '#4a4e5a', cloak: '#30333c', helm: 'dwarf', metal: STEEL, trim: STEEL_D, shield: { shape: 'round', fill: '#4a4e5a', rim: STEEL, emblem: 'rune' }, flag: ['#4a4e5a', STEEL, 'rune'] },
  Lothlórien:  { cloth: '#8a7a4a', cloak: '#6e6a58', helm: 'leaf', metal: GOLD, trim: '#a8862a', shield: { shape: 'leaf', fill: '#b89a4a', rim: GOLD, emblem: 'leaf' }, flag: ['#8a7a4a', GOLD, 'leaf'] },
  Mirkwood:    { cloth: '#3f6a3a', cloak: '#2a4a2a', helm: 'hood', hair: '#8a5a2a', metal: '#8a7a4a', shield: { shape: 'leaf', fill: '#3f6a3a', rim: '#8a7a4a', emblem: 'leaf' }, flag: ['#3f6a3a', '#8a7a4a', 'leaf'] },
  Rivendell:   { cloth: '#2f4a8a', cloak: '#3a3466', helm: 'ridge', hair: '#2a2020', metal: STEEL, trim: GOLD, shield: { shape: 'leaf', fill: '#2f4a8a', rim: GOLD, emblem: 'star' }, flag: ['#2f4a8a', GOLD, 'star'] },
  Fangorn:     { cloth: '#4a6a2a' },
  Shire:       { cloth: '#6a8a3a', cloak: '#8a6a3a', helm: 'hair', metal: STEEL_D, shield: { shape: 'buckler', fill: WOOD, rim: IRON } },
  Arnor:       { cloth: '#3a5a8a', cloak: '#26395a', helm: 'tall', metal: STEEL, trim: STEEL, shield: { shape: 'kite', fill: '#3a5a8a', rim: STEEL, emblem: 'star' }, flag: ['#3a5a8a', WHITE, 'star'] },
  Númenor:     { cloth: '#2a4a7a', cloak: '#1c3254', helm: 'tall', metal: GOLD, trim: '#a8862a', shield: { shape: 'kite', fill: '#2a4a7a', rim: GOLD, emblem: 'star' }, flag: ['#2a4a7a', GOLD, 'star'] },
  Dale:        { cloth: '#8a2e2a', cloak: '#5a1e1a', helm: 'cone', metal: STEEL, trim: GOLD, shield: { shape: 'round', fill: '#8a2e2a', rim: GOLD, emblem: 'none' }, flag: ['#8a2e2a', GOLD, 'none'] },
  'Lake-town': { cloth: '#3a5a7a', cloak: '#6a5a3a', helm: 'cap', metal: STEEL_D, shield: { shape: 'round', fill: '#3a5a7a', rim: WOOD, emblem: 'none' }, flag: ['#3a5a7a', GOLD, 'none'] },
  Easterling:  { cloth: '#8a1e1e', cloak: '#5a1414', helm: 'cone', metal: BRONZE, trim: GOLD, veil: true, shield: { shape: 'tall', fill: BRONZE, rim: '#8a6420', emblem: 'none' }, flag: ['#8a1e1e', GOLD, 'none'] },
  'Black Dragon': { cloth: '#1e1e22', cloak: '#141416', helm: 'cone', metal: '#3a3a40', trim: GOLD, veil: true, shield: { shape: 'tall', fill: '#1e1e22', rim: GOLD, emblem: 'none' }, flag: ['#1e1e22', GOLD, 'none'] },
  Harad:       { cloth: '#5a1020', cloak: '#3e0c14', helm: 'turban', turban: '#c23a2e', metal: BRONZE, skin: '#a06a44', weapon: 'scimitar', shield: { shape: 'wicker', fill: '#c9a46a', rim: '#8a6a3a' }, flag: ['#a82e2a', GOLD, 'wave'] },
  Umbar:       { cloth: '#2a2a30', cloak: '#1a1a1e', helm: 'scarf', metal: IRON, skin: '#b88a66', weapon: 'scimitar', flag: ['#2a2a30', RED, 'wave'] },
  Corsair:     { cloth: '#2a2a30', cloak: '#1a1a1e', helm: 'scarf', metal: IRON, skin: '#b88a66', weapon: 'scimitar', flag: ['#2a2a30', RED, 'wave'] },
  Beorning:    { cloth: '#6a4a2a', cloak: '#3a2a1a', fur: true, helm: 'hair', hair: '#2a1a10', weapon: 'axe' },
  Ruffian:     { cloth: '#5a4a3a', cloak: '#3a3028', helm: 'hair', metal: IRON_D, weapon: 'club' },
};
const FKEY = new Map(Object.keys(FACTIONS).map(k => [k.toLowerCase(), k]));   // case-insensitive lookup (the data spells Lake-town both ways)
const DEFAULT_F = { cloth: '#5a5a5a', cloak: null, helm: 'hair', metal: STEEL_D, trim: STEEL_D, shield: { shape: 'round', fill: '#5a5a5a', rim: IRON_D }, flag: ['#5a5a5a', WHITE, 'none'] };

/* ---------- Working out the look from a profile ---------- */
const has = (T, re) => (T.gear || []).some(g => re.test(g));
export function lookOf(T) {
  const [race = 'Man', facs = ''] = (T.kw || '').split(' · ');
  const names = facs.split(',').map(s => s.trim());
  const F = Object.assign({}, DEFAULT_F, ...names.map(n => FACTIONS[n] || FACTIONS[FKEY.get(n.toLowerCase().replace(/^lakw/, 'lake'))] || {}));
  const Rc = RACES[race] || RACES.Man;
  const name = T.full || T.n || '';
  const L = {
    race, F, R: Rc, name, names,
    skin: F.skin || Rc.skin, hair: F.hair || Rc.hair, helm: F.helm, body: Rc.body || 1,
    heavy: has(T, /^heavy/i), armour: has(T, /armour|^elven$/i),
    shield: has(T, /^(light )?shield/i) ? (has(T, /^light shield/i) ? 'buckler' : F.shield.shape) : null,
    spear: !!T.spear && !has(T, /^throwing spear/i), pike: !!T.pike, thrown: has(T, /^throwing spear/i),
    banner: !!T.banner, bow: T.bow ? (T.bow.still ? 'crossbow' : 'bow') : null,
    twoHanded: !!T.twoHanded || has(T, /two-handed|berserker blade/i),
    weapon: F.weapon || Rc.weapon,
    hero: !!T.hero, monster: !!T.monster, ghost: !!Rc.ghost,
    fine: race === 'Man' && names.some(n => n === 'Rohan' || n === 'Dunland'),
  };
  if (has(T, /hand-and-a-half/i)) L.weapon = 'long';
  if (has(T, /elven hand-and-a-half/i)) L.weapon = 'elven';
  // Units with a look of their own.
  if (/Ranger/i.test(name)) { L.helm = 'hood'; L.heavy = false; L.cloak = race === 'Dwarf' ? '#4a3a2a' : '#3d5a33'; L.cloth = '#4a5a3a'; }
  if (/Royal Guard/i.test(name)) { L.crest = '#c8382e'; L.heavy = true; }
  if (/Citadel Guard|Fountain Court/i.test(name)) { L.crest = '#4a4a54'; L.heavy = true; }
  if (/Osgiliath Veteran/i.test(name)) { L.worn = true; L.cloak = '#3a3a34'; }
  if (/Berserker/i.test(name)) { L.helm = 'hair'; L.heavy = false; L.armour = race === 'Uruk-hai'; L.twoHanded = true; L.weapon = 'greatsword'; }
  if (/Scout/i.test(name) && race === 'Uruk-hai') { L.heavy = false; }
  if (/Chieftain/i.test(name) && L.helm === 'hair') { L.helm = 'horns'; }
  if (/^Wulf$/i.test(name)) { L.helm = 'hair'; L.hair = '#1e1612'; L.hairLong = true; L.cloth = '#7a1e1a'; L.weapon = 'long'; L.fur = true; }
  if (/Traitor/i.test(name)) { L.cloak = '#2a1a14'; L.cloth = '#5a3a2a'; L.shieldFill = '#5a1e1a'; L.shieldEmblem = 'none'; L.crest = '#2a1a14'; }
  if (/Werewolf|Warg|Wolf/i.test(name)) { L.beast = 'warg'; L.skin = race === 'Spirit' ? '#9ad1a8' : L.skin; }
  // A Cavalry model: the mount is drawn under a smaller rider. The rider keeps its own race's look.
  if (T.mount) { L.mount = /warg|wolf/i.test(T.mount.n) ? 'warg' : 'horse'; L.beast = null; }
  if (/Haradrim|Serpent/i.test(name)) { L.sash = GOLD; }
  if (/Shirriff/i.test(name)) { L.helm = 'cap'; L.feather = true; }
  if (/Prowler/i.test(name)) { L.twoBlades = true; }
  if (/Galadhrim Court|Palace Guard/i.test(name)) { L.pike = L.pike || L.spear; L.spear = false; }
  if (/Knight of Dol Amroth/i.test(name)) { L.heavy = true; }
  if (/Khazâd Guard|Iron Guard/i.test(name)) { L.heavy = true; L.twoHanded = L.twoHanded || /Khazâd/.test(name); if (L.twoHanded) L.weapon = 'greataxe'; }
  if (/Dwarf Ranger/i.test(name)) { L.helm = 'hood'; }
  if (/Wood Elf Sentinel|^Lothlórien Warrior|Mirkwood Elf Warrior/i.test(name)) { L.helm = 'hair'; }
  if (/Noldorin Exile/i.test(name)) { L.helm = 'hair'; }
  if (race === 'Uruk-hai' && /Mordor/.test(facs)) { L.helm = 'flat'; L.F = Object.assign({}, F, { shield: Object.assign({}, F.shield, { shape: 'tall', emblem: 'eye' }) }); }
  if (/Morannon/i.test(name)) { L.heavy = true; L.helm = 'flat'; L.skin = '#6a7048'; }
  if (/Hunter Orc/i.test(name)) { L.skin = '#9a7a5a'; L.helm = 'hair'; L.cloth = '#4a3a2a'; }
  if (/Goblin Mercenary/i.test(name)) { L.skin = '#c9b48a'; }
  if (/Spectre/i.test(name)) { L.helm = 'hood'; L.shield = null; L.weapon = null; }
  if (/Clansman/i.test(name)) { L.weapon = 'axe'; }
  if (/Axeman|Axemen|Beorning/i.test(name)) { L.twoHanded = true; L.weapon = 'greataxe'; }
  if (/Militia/i.test(name) && race !== 'Hobbit') { L.weapon = 'club'; }
  if (L.twoHanded && !['greatsword', 'greataxe'].includes(L.weapon)) L.weapon = ['Man', 'Elf', 'Spirit'].includes(race) && L.weapon !== 'axe' ? 'greatsword' : 'greataxe';
  return L;
}

/* ---------- Drawing helpers ---------- */
function fill(c, color, lw = 0.06, stroke = OUT) { c.fillStyle = color; c.fill(); if (lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); } }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
function line(c, pts, color, w, outline = true) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (outline) { c.strokeStyle = OUT; c.lineWidth = w + 0.08; c.stroke(); }
  c.strokeStyle = color; c.lineWidth = w; c.stroke();
}
const mix = (a, b, t) => {
  const p = h => (h[0] === '#' ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : h.match(/\d+/g).slice(0, 3).map(Number));
  const ok = h => typeof h === 'string' && (/^#[0-9a-f]{6}$/i.test(h) || /^rgb\(/.test(h));
  if (!ok(a) || !ok(b)) return a;
  const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};
// Fine finish: stronger light and shade, metal sheen, wood grain and cloth folds. Only for the looks with L.fine
// (the units the missions use so far); drawFigure sets it per figure.
let FINE = false;
// Portrait detail: stitching, embroidery, braids, wrinkles, scratches. Only when the figure is drawn large (a zoomed-in
// board or the unit card), where it can be seen; on a normal board it would only blur the shapes.
let HI = false;
function shade(c, x, y, r, color) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  if (FINE && mix(color, '#000000', 0) !== color) { g.addColorStop(0, mix(color, '#ffffff', 0.5)); g.addColorStop(0.55, color); g.addColorStop(1, mix(color, '#000000', 0.45)); return g; }
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.6, color); g.addColorStop(1, 'rgba(0,0,0,0.25)'); return g;
}
function lin(c, x0, y0, x1, y1, color, hi = 0.3, lo = 0.4) {   // lit from the top left
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, mix(color, '#ffffff', hi)); g.addColorStop(0.5, color); g.addColorStop(1, mix(color, '#000000', lo)); return g;
}
const steel = (c, x0, x1, base = STEEL) => (FINE ? lin(c, x0, 0, x1, 0, base, 0.6, 0.45) : base);
const wood = (c, x0, x1, base = WOOD) => (FINE ? lin(c, x0, 0, x1, 0, base, 0.3, 0.4) : base);
function gleam(c, x, y, r) { if (!FINE) return; ellipse(c, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.13, -0.7); fill(c, 'rgba(255,255,255,0.7)', 0); }
function edge(c, pts, w = 0.03) { if (FINE) line(c, pts, 'rgba(255,255,255,0.75)', w, false); }   // a bright cutting edge

/* ---------- Emblems (drawn in a box from -1 to 1) ---------- */
const EMBLEMS = {
  sun(c, col) { circle(c, 0, 0, 0.42); c.fillStyle = col; c.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(c, [[Math.cos(a) * 0.6, Math.sin(a) * 0.6], [Math.cos(a) * 0.95, Math.sin(a) * 0.95]], col, 0.16, false); } },
  tree(c, col) { line(c, [[0, 0.95], [0, -0.55]], col, 0.16, false); for (const [y, w] of [[0.35, 0.55], [-0.05, 0.45], [-0.4, 0.3]]) { line(c, [[-w, y - 0.35], [0, y]], col, 0.14, false); line(c, [[w, y - 0.35], [0, y]], col, 0.14, false); } circle(c, 0, -0.78, 0.16); c.fillStyle = col; c.fill(); },
  hand(c, col) { ellipse(c, 0, 0.3, 0.42, 0.5); c.fillStyle = col; c.fill(); for (const [x, y] of [[-0.42, -0.35], [-0.18, -0.6], [0.1, -0.68], [0.36, -0.5], [0.62, 0.05]]) line(c, [[x * 0.55, y * 0.2 + 0.1], [x, y]], col, 0.2, false); },
  eye(c, col) { ellipse(c, 0, 0, 0.95, 0.5); c.fillStyle = col; c.fill(); ellipse(c, 0, 0, 0.16, 0.5); c.fillStyle = BLACK; c.fill(); },
  skull(c, col) { circle(c, 0, -0.15, 0.6); c.fillStyle = col; c.fill(); c.fillRect(-0.35, 0.3, 0.7, 0.45); c.fillStyle = BLACK; circle(c, -0.22, -0.2, 0.17); c.fill(); circle(c, 0.22, -0.2, 0.17); c.fill(); },
  rune(c, col) { line(c, [[-0.5, 0.7], [0.5, -0.7]], col, 0.2, false); line(c, [[-0.5, -0.7], [0.5, 0.7]], col, 0.2, false); line(c, [[-0.5, -0.7], [-0.5, 0.7]], col, 0.2, false); line(c, [[0.5, -0.7], [0.5, 0.7]], col, 0.2, false); },
  star(c, col) { c.beginPath(); for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + i * TAU / 14, r = i % 2 ? 0.4 : 0.95; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fillStyle = col; c.fill(); },
  swan(c, col) { line(c, [[-0.6, 0.5], [-0.1, 0.5], [0.2, 0.2], [0.2, -0.5], [0.55, -0.7]], col, 0.26, false); ellipse(c, -0.3, 0.45, 0.5, 0.3); c.fillStyle = col; c.fill(); },
  leaf(c, col) { c.beginPath(); c.moveTo(0, -0.95); c.quadraticCurveTo(0.9, -0.2, 0, 0.95); c.quadraticCurveTo(-0.9, -0.2, 0, -0.95); c.fillStyle = col; c.fill(); },
  wave(c, col) { c.beginPath(); c.moveTo(-0.9, 0.2); c.quadraticCurveTo(-0.45, -0.7, 0, 0.2); c.quadraticCurveTo(0.45, 1.1, 0.9, 0.2); c.strokeStyle = col; c.lineWidth = 0.22; c.lineCap = 'round'; c.stroke(); },
  none() {},
};
function emblem(c, name, x, y, s, col) { if (!EMBLEMS[name]) return; c.save(); c.translate(x, y); c.scale(s, s); EMBLEMS[name](c, col); c.restore(); }

/* ---------- Pieces ---------- */
function cloak(c, L) {
  const col = L.cloak !== undefined ? L.cloak : L.F.cloak;
  if (!col) return;
  const fur = L.fur || L.F.fur;
  c.beginPath(); c.moveTo(-0.6, 0.1); c.quadraticCurveTo(-0.75, 0.6, -0.5, 1.0);
  if (fur) { for (let i = 0; i < 10; i++) c.lineTo(-0.5 + i * 0.1 + 0.05, i % 2 ? 1.0 : 0.86); c.lineTo(0.5, 1.0); } else c.quadraticCurveTo(0, 1.12, 0.5, 1.0);
  c.quadraticCurveTo(0.75, 0.6, 0.6, 0.1); c.closePath();
  fill(c, col);
}
function body(c, L) {
  const b = L.body, cloth = L.cloth || L.F.cloth, metal = L.F.metal;
  ellipse(c, 0, 0.1, 0.64 * b, 0.4 * b);
  fill(c, L.heavy ? shade(c, 0, 0.1, 0.64 * b, metal) : L.armour ? mix(cloth, metal, 0.35) : cloth);
  if (L.heavy) {   // plates: a central line and pauldrons
    line(c, [[0, -0.2 * b], [0, 0.45 * b]], L.F.trim || STEEL_D, 0.05, false);
    for (const s of [-1, 1]) { circle(c, s * 0.46 * b, 0.1, 0.2 * b); fill(c, shade(c, s * 0.46 * b, 0.1, 0.2 * b, metal), 0.05); }
  } else if (L.armour) {   // mail with leather pauldrons
    for (const s of [-1, 1]) { circle(c, s * 0.45 * b, 0.12, 0.18 * b); fill(c, LEATHER, 0.05); }
  } else if (L.worn) { line(c, [[-0.3, 0.3], [0.3, 0.3]], LEATHER, 0.08, false); }
  if (L.sash) line(c, [[-0.45 * b, 0.35 * b], [0.45 * b, -0.05 * b]], L.sash, 0.09, false);
}
/* A figure in the fine finish, shaped like a mini seen from the front and above: a narrow cloak behind, legs and boots
   under the tunic, a fitted torso with belt and buckle, and the kit hanging from it. */
function miniCloak(c, L) {
  const col = L.cloak !== undefined ? L.cloak : L.F.cloak;
  if (!col) return;
  const fur = L.fur || L.F.fur, dark = mix(col, '#000000', 0.45), lite = mix(col, '#ffffff', 0.3);
  c.beginPath(); c.moveTo(-0.33, 0.0); c.quadraticCurveTo(-0.52, 0.45, -0.44, 0.84);
  if (fur) { for (let i = 0; i <= 16; i++) c.lineTo(-0.44 + i * 0.055, i % 2 ? 0.92 : 0.82); } else c.quadraticCurveTo(0, 0.94, 0.44, 0.84);
  c.quadraticCurveTo(0.52, 0.45, 0.33, 0.0); c.closePath();
  fill(c, lin(c, -0.45, 0.0, 0.4, 0.9, col, 0.25, 0.45));
  if (!fur && L.names.includes('Rohan')) { c.save(); c.clip(); c.strokeStyle = GOLD; c.lineWidth = 0.05; c.stroke(); c.restore(); }   // a gold-edged cloak
  for (const s of [-1, 1]) for (const [x0, x1, w, k] of [[0.36, 0.4, 0.035, dark], [0.33, 0.36, 0.02, lite]]) { c.beginPath(); c.moveTo(s * x0, 0.3); c.quadraticCurveTo(s * (x1 + 0.04), 0.6, s * x1, 0.82); c.strokeStyle = k; c.lineWidth = w; c.stroke(); }   // folds
  if (fur) for (let i = 0; i < 9; i++) line(c, [[-0.4 + i * 0.1, 0.7], [-0.41 + i * 0.1, 0.8]], lite, 0.018, false);
  if (!HI) return;
  if (fur) {   // a coat of fur: many short strokes, and a patch stitched on
    for (let i = 0; i < 40; i++) { const x = -0.42 + (i * 0.37) % 0.84, y = 0.12 + ((i * 0.53) % 0.66); line(c, [[x, y], [x - 0.012, y + 0.05]], i % 3 ? lite : dark, 0.01, false); }
    c.beginPath(); c.rect(0.24, 0.5, 0.12, 0.12); c.fillStyle = mix(col, '#000000', 0.2); c.fill();
    c.setLineDash([0.015, 0.012]); c.strokeStyle = BONE; c.lineWidth = 0.008; c.stroke(); c.setLineDash([]);
  } else if (L.names.includes('Rohan')) {   // a band of gold embroidery above the hem: running diamonds
    for (let i = 1; i < 14; i++) { const t = i / 14, u = 1 - t, x = (t - u) * 0.44 * 0.94, y = (u * u + t * t) * 0.84 + 2 * u * t * 0.94 - 0.05; poly(c, [[x, y - 0.022], [x + 0.016, y], [x, y + 0.022], [x - 0.016, y]]); fill(c, GOLD, 0); }
  }
}
function miniBody(c, L) {
  const cloth = L.cloth || L.F.cloth, metal = L.F.metal, rohan = L.names.includes('Rohan'), fur = L.fur || L.F.fur;
  const top = L.heavy ? metal : L.armour ? mix(cloth, metal, 0.35) : cloth, trim = rohan ? GOLD : LEATHER;
  if (!L.riding) {
    for (const s of [-1, 1]) line(c, [[s * 0.1, 0.6], [s * 0.13, 0.8]], lin(c, s * 0.05, 0.6, s * 0.18, 0.8, mix(cloth, '#000000', 0.4), 0.2, 0.3), 0.12);   // legs
    for (const s of [-1, 1]) {   // boots, toes towards the viewer
      ellipse(c, s * 0.14, 0.85, 0.1, 0.07); fill(c, lin(c, s * 0.14 - 0.1, 0.78, s * 0.14 + 0.1, 0.92, fur ? '#5a4632' : '#3e2c1f', 0.35, 0.35), 0.04);
      line(c, [[s * 0.06, 0.79], [s * 0.2, 0.79]], fur ? '#8a7454' : LEATHER, 0.04, false);   // cuff
      for (const k of [0.66, 0.72]) line(c, [[s * 0.07, k], [s * 0.19, k + 0.02]], fur ? '#8a7454' : mix(LEATHER, '#000000', 0.3), 0.018, false);   // leg wraps
    }
  }
  // Tunic skirt below the belt, with a trimmed hem.
  c.beginPath(); c.moveTo(-0.2, 0.4); c.lineTo(0.2, 0.4); c.lineTo(0.29, 0.66); c.quadraticCurveTo(0, 0.73, -0.29, 0.66); c.closePath();
  fill(c, lin(c, -0.3, 0.4, 0.3, 0.72, cloth, 0.25, 0.4), 0.05);
  line(c, [[0, 0.44], [0, 0.69]], mix(cloth, '#000000', 0.35), 0.02, false);   // the split of the skirt
  c.beginPath(); c.moveTo(-0.28, 0.64); c.quadraticCurveTo(0, 0.7, 0.28, 0.64); c.strokeStyle = rohan ? GOLD : mix(cloth, '#000000', 0.3); c.lineWidth = 0.035; c.stroke();
  // Torso: broad at the shoulders, narrow at the waist.
  const torso = () => { c.beginPath(); c.moveTo(-0.2, 0.42); c.quadraticCurveTo(-0.24, 0.16, -0.37, 0.09); c.quadraticCurveTo(-0.4, 0.0, -0.24, -0.03); c.lineTo(0.24, -0.03); c.quadraticCurveTo(0.4, 0.0, 0.37, 0.09); c.quadraticCurveTo(0.24, 0.16, 0.2, 0.42); c.closePath(); };
  torso(); fill(c, L.heavy ? shade(c, -0.05, 0.12, 0.4, metal) : lin(c, -0.35, -0.03, 0.35, 0.42, top, 0.3, 0.4), 0.05);
  if (L.armour || L.heavy) {   // mail rings
    c.save(); torso(); c.clip(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.012;
    for (let r = 0, y = -0.04; y < 0.45; y += 0.045, r++) for (let x = -0.4 + (r % 2) * 0.028; x < 0.4; x += 0.056) { c.beginPath(); c.arc(x, y, 0.025, 0.2, Math.PI - 0.2); c.stroke(); }
    c.restore();
  }
  if (fur) {   // leather straps across the chest and a fur mantle on the shoulders
    line(c, [[-0.32, 0.04], [0.18, 0.41]], LEATHER, 0.045); line(c, [[0.32, 0.04], [-0.18, 0.41]], LEATHER, 0.045);
    const furCol = mix(L.cloak || L.F.cloak || cloth, '#e8d8b8', 0.35);
    c.beginPath(); for (let i = 0; i <= 18; i++) { const a = Math.PI * (1.0 + i / 18), rr = i % 2 ? 0.36 : 0.43; c.lineTo(Math.cos(a) * rr, 0.1 + Math.sin(a) * rr * 0.45); }
    for (let i = 18; i >= 0; i--) { const a = Math.PI * (1.0 + i / 18); c.lineTo(Math.cos(a) * 0.2, 0.06 + Math.sin(a) * 0.12); }
    c.closePath(); fill(c, lin(c, -0.4, -0.1, 0.4, 0.15, furCol, 0.3, 0.35), 0.04);
    for (const x of [-0.12, -0.04, 0.04, 0.12]) { circle(c, x, 0.2 + Math.abs(x) * -0.4, 0.022); fill(c, BONE, 0.015); }   // a necklace of teeth
  }
  if (L.heavy) for (const s of [-1, 1]) { ellipse(c, s * 0.32, 0.05, 0.13, 0.1, s * 0.3); fill(c, shade(c, s * 0.32, 0.05, 0.13, metal), 0.04); gleam(c, s * 0.32, 0.05, 0.13); }
  else if (L.armour) for (const s of [-1, 1]) { ellipse(c, s * 0.32, 0.06, 0.12, 0.09, s * 0.3); fill(c, lin(c, s * 0.32 - 0.12, 0, s * 0.32 + 0.12, 0.15, LEATHER, 0.3, 0.35), 0.04); }
  // Belt, buckle and pouch.
  line(c, [[-0.21, 0.41], [0.21, 0.41]], LEATHER, 0.06);
  c.beginPath(); c.roundRect(-0.045, 0.375, 0.09, 0.07, 0.015); fill(c, lin(c, -0.05, 0.37, 0.05, 0.45, rohan ? GOLD : IRON, 0.5, 0.35), 0.025);
  c.beginPath(); c.roundRect(0.1, 0.43, 0.09, 0.1, 0.03); fill(c, lin(c, 0.1, 0.43, 0.2, 0.53, LEATHER, 0.3, 0.35), 0.03);
  line(c, [[0.2, 0.4], [0.22, 0.47]], WOOD_D, 0.035); line(c, [[0.22, 0.47], [0.25, 0.6]], '#2e2016', 0.045);   // a knife in its sheath
  if (L.sash) line(c, [[-0.3, 0.3], [0.3, 0.02]], L.sash, 0.07, false);
  if (rohan && (L.cloak !== undefined ? L.cloak : L.F.cloak)) { circle(c, 0.29, 0.02, 0.045); fill(c, shade(c, 0.29, 0.02, 0.045, GOLD), 0.025); }   // the cloak brooch
  if (['sword', 'long'].includes(L.weapon) && !L.twoHanded && !L.bow && !L.spear && !L.pike) {   // the empty scabbard on the left hip
    line(c, [[-0.16, 0.44], [-0.34, 0.78]], '#2e2016', 0.06);
    circle(c, -0.345, 0.79, 0.035); fill(c, rohan ? GOLD : IRON, 0.02);
    line(c, [[-0.17, 0.46], [-0.2, 0.52]], trim, 0.07, false);
  }
  if (HI) portraitBody(c, L, rohan, fur, cloth);
}
// Stitching, laces, rivets and wear: what a painter picks out on a mini, too fine for a normal board.
function portraitBody(c, L, rohan, fur, cloth) {
  const stitch = mix(cloth, '#ffffff', 0.35);
  c.setLineDash([0.018, 0.014]); c.lineWidth = 0.008;
  c.beginPath(); c.moveTo(-0.26, 0.6); c.quadraticCurveTo(0, 0.66, 0.26, 0.6); c.strokeStyle = stitch; c.stroke();   // hem seam
  c.beginPath(); c.moveTo(0.03, 0.45); c.lineTo(0.03, 0.66); c.moveTo(-0.03, 0.45); c.lineTo(-0.03, 0.66); c.stroke();
  c.beginPath(); c.roundRect(0.11, 0.44, 0.07, 0.08, 0.02); c.strokeStyle = BONE; c.stroke();   // pouch seam
  c.setLineDash([]);
  line(c, [[0.1, 0.46], [0.19, 0.46]], mix(LEATHER, '#000000', 0.35), 0.012, false); circle(c, 0.145, 0.475, 0.012); fill(c, rohan ? GOLD : BONE, 0);   // the pouch flap and toggle
  for (const x of [-0.16, -0.11, 0.1, 0.15]) { circle(c, x, 0.41, 0.008); fill(c, '#1b1410', 0); }   // belt holes
  line(c, [[-0.05, 0.41], [-0.07, 0.5]], LEATHER, 0.035, false);   // the belt's loose end
  line(c, [[0, 0.385], [0, 0.435]], mix(rohan ? GOLD : IRON, '#000000', 0.4), 0.01, false);   // buckle tongue
  if (rohan) for (let y = 0.47; y < 0.64; y += 0.045) { poly(c, [[0, y - 0.015], [0.012, y], [0, y + 0.015], [-0.012, y]]); fill(c, GOLD, 0); }   // embroidery down the split
  if (!L.riding) for (const s of [-1, 1]) for (const k of [0.8, 0.83, 0.86]) line(c, [[s * 0.1, k], [s * 0.18, k + 0.012]], BONE, 0.008, false);   // boot laces
  if (fur) for (const [x0, y0, x1, y1] of [[-0.32, 0.04, 0.18, 0.41], [0.32, 0.04, -0.18, 0.41]]) for (const t of [0.25, 0.5, 0.75]) { circle(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.012); fill(c, IRON, 0.006); }   // strap rivets
  for (const [x, y, a] of [[-0.3, 0.02, 0.5], [0.34, 0.08, -0.6], [-0.12, 0.25, 0.3]]) line(c, [[x, y], [x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05]], 'rgba(255,255,255,0.35)', 0.01, false);   // scuffs
}
function head(c, L, px) {
  const r = L.R.head, y = FINE ? -0.22 : -0.12, skin = L.skin, hair = L.hair, helm = L.helm, metal = L.F.metal, trim = L.F.trim || STEEL_D;
  const detail = px > 9;
  // Crest, long hair and beard lie behind or outside the head.
  if (helm === 'crest' || L.crest) {
    const col = L.crest || L.F.crest || RED;
    if (FINE) {   // a horse-hair crest over the crown, its tail streaming behind the right shoulder
      const crest = lin(c, -r, y - r, r, y + r, col, 0.3, 0.4);
      c.beginPath(); c.moveTo(-r * 0.2, y - r * 1.25); c.quadraticCurveTo(r * 0.9, y - r * 1.3, r * 1.15, y - r * 0.2); c.quadraticCurveTo(r * 1.35, y + r * 0.6, r * 1.05, y + r * 1.25);
      c.quadraticCurveTo(r * 0.95, y + r * 0.4, r * 0.75, y - r * 0.2); c.quadraticCurveTo(r * 0.5, y - r * 0.9, -r * 0.2, y - r * 1.25); c.closePath(); fill(c, crest, 0.05);
      for (const k of [0.25, 0.55]) { c.beginPath(); c.moveTo(r * 0.1, y - r * (1.2 - k * 0.1)); c.quadraticCurveTo(r * (0.8 + k * 0.2), y - r * (1.1 - k * 0.4), r * (0.95 + k * 0.25), y + r * (0.2 + k)); c.strokeStyle = mix(col, '#ffffff', 0.35); c.lineWidth = 0.018; c.stroke(); }
    } else { c.beginPath(); c.moveTo(-0.07, y); c.lineTo(0.07, y); c.lineTo(0.12, 0.75); c.lineTo(-0.12, 0.75); c.closePath(); fill(c, col, 0.05); }
  }
  if (helm === 'hair' && (L.hairLong || L.R.hairLong)) { ellipse(c, 0, y + 0.35, r * 0.95, 0.5); fill(c, hair, 0.05); }
  if (L.hero && !FINE && helm !== 'hood' && helm !== 'hair' && helm !== 'horns') {   // a plume, trailing behind the head
    const col = L.names.includes('Rohan') ? WHITE : RED;
    c.beginPath(); c.moveTo(-0.06, y); c.quadraticCurveTo(0.18, y + 0.5, 0.05, y + 0.95); c.quadraticCurveTo(-0.02, y + 0.6, -0.16, y + 0.95); c.quadraticCurveTo(-0.22, y + 0.5, 0.06, y); c.closePath(); fill(c, col, 0.05);
  }
  if (L.R.beard) {   // a broad beard spread over the chest in front of the head
    c.beginPath(); c.moveTo(-r * 1.1, y + 0.1); c.quadraticCurveTo(-r * 1.2, y - 0.75, 0, y - 0.95); c.quadraticCurveTo(r * 1.2, y - 0.75, r * 1.1, y + 0.1); c.closePath(); fill(c, hair, 0.05);
    if (detail) { line(c, [[-r * 0.3, y - 0.45], [-r * 0.25, y - 0.8]], mix(hair, '#000000', 0.3), 0.04, false); line(c, [[r * 0.3, y - 0.45], [r * 0.25, y - 0.8]], mix(hair, '#000000', 0.3), 0.04, false); }
  }
  if (L.R.ears) for (const s of [-1, 1]) { poly(c, [[s * r * 0.8, y - 0.05], [s * (r + 0.2), y - 0.2], [s * r * 0.9, y + 0.12]]); fill(c, skin, 0.05); }
  switch (helm) {
    case 'crest': case 'winged': case 'tall': case 'ridge': case 'dwarf':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, metal));
      if (helm === 'winged' && detail) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.8, y - 0.05); c.quadraticCurveTo(s * (r + 0.28), y + 0.05, s * (r + 0.22), y + 0.32); c.quadraticCurveTo(s * (r + 0.05), y + 0.2, s * r * 0.75, y + 0.18); c.closePath(); fill(c, STEEL, 0.05); }
      if (helm === 'tall' || helm === 'ridge') { line(c, [[0, y - r * 0.95], [0, y + r * 0.9]], trim, helm === 'tall' ? 0.14 : 0.08); }
      if (helm === 'dwarf') { line(c, [[-r * 0.5, y - r * 0.4], [r * 0.5, y - r * 0.4]], trim, 0.07, false); if (detail) line(c, [[0, y - r], [0, y + r * 0.3]], trim, 0.06, false); }
      if (helm === 'crest') { line(c, [[0, y - r], [0, y + r * 0.6]], L.crest || L.F.crest || RED, 0.11, false); }
      if (detail && helm !== 'dwarf') { line(c, [[0, y - r * 0.6], [0, y - r * 1.05]], trim, 0.07, false); }   // nasal guard
      if (detail) { circle(c, 0, y, r * 0.86); c.strokeStyle = FINE ? trim : 'rgba(0,0,0,0.25)'; c.lineWidth = FINE ? 0.045 : 0.03; c.stroke(); }
      if (FINE && detail) for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * r * 0.2, y - r * 0.92); c.quadraticCurveTo(k * r * 0.62, y - r * 0.55, k * r * 0.75, y - r * 0.1); c.strokeStyle = mix(trim, '#000000', 0.15); c.lineWidth = 0.02; c.stroke(); }   // engraved bands
      gleam(c, -r * 0.1, y, r * 0.9);
      break;
    case 'flat': {
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, metal));
      poly(c, [[-r * 0.72, y - r * 0.72], [r * 0.72, y - r * 0.72], [r * 0.72, y + r * 0.72], [-r * 0.72, y + r * 0.72]]); fill(c, IRON_D, 0.04);
      if (detail && L.F.shield && L.F.shield.emblem === 'hand') emblem(c, 'hand', 0, y, r * 0.42, WHITE);
      else if (detail) line(c, [[0, y - r * 0.6], [0, y - r * 1.05]], IRON_D, 0.07, false);
      break;
    }
    case 'spiked':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, metal));
      for (const a of [-2.2, -0.95, 0.3, 1.55, 2.8]) { const dx = Math.cos(a), dy = Math.sin(a); poly(c, [[dx * r * 0.7 - dy * 0.07, y + dy * r * 0.7 + dx * 0.07], [dx * (r + 0.2), y + dy * (r + 0.2)], [dx * r * 0.7 + dy * 0.07, y + dy * r * 0.7 - dx * 0.07]]); fill(c, IRON_D, 0.04); }
      break;
    case 'cone':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, metal));
      if (detail) { circle(c, 0, y, r * 0.55); c.strokeStyle = trim; c.lineWidth = 0.06; c.stroke(); }
      circle(c, 0, y, r * 0.18); fill(c, trim, 0.04);
      if (detail && L.F.veil) { c.beginPath(); c.moveTo(-r * 0.9, y + r * 0.4); c.lineTo(0, y + r * 1.15); c.lineTo(r * 0.9, y + r * 0.4); c.closePath(); fill(c, trim, 0.04); }   // neck veil of scales
      break;
    case 'hood': {
      const col = L.cloak || L.F.cloak || '#4a4a3a';
      c.beginPath(); c.moveTo(-r * 1.05, y + 0.02); c.quadraticCurveTo(0, y - r * 1.3, r * 1.05, y + 0.02); c.quadraticCurveTo(r * 0.5, y + r * 1.8, 0, y + r * 1.9); c.quadraticCurveTo(-r * 0.5, y + r * 1.8, -r * 1.05, y + 0.02); c.closePath(); fill(c, col);
      ellipse(c, 0, y - r * 0.15, r * 0.55, r * 0.4); fill(c, 'rgba(0,0,0,0.55)', 0);
      break;
    }
    case 'turban':
      circle(c, 0, y, r * 1.05); fill(c, shade(c, 0, y, r, L.F.turban || L.F.cloth));
      if (detail) { circle(c, 0, y, r * 0.65); c.strokeStyle = GOLD; c.lineWidth = 0.05; c.stroke(); line(c, [[-r, y + r * 0.3], [r, y - r * 0.3]], mix(L.F.turban || L.F.cloth, '#ffffff', 0.25), 0.07, false); }
      break;
    case 'scarf':
      circle(c, 0, y, r); fill(c, skin); c.beginPath(); c.arc(0, y, r, Math.PI, 0); c.closePath(); fill(c, RED, 0.04);
      line(c, [[r * 0.7, y + r * 0.5], [r * 1.2, y + r * 1.2]], RED, 0.08);
      break;
    case 'cap':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, L.race === 'Hobbit' ? L.F.cloth : IRON));
      circle(c, 0, y, r * 0.55); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.04; c.stroke();
      if (L.feather) line(c, [[r * 0.3, y - r * 0.3], [r * 1.2, y - r * 1.1]], WHITE, 0.08);
      break;
    case 'leaf':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, metal));
      c.beginPath(); c.moveTo(0, y - r * 1.15); c.quadraticCurveTo(r * 0.55, y, 0, y + r * 1.05); c.quadraticCurveTo(-r * 0.55, y, 0, y - r * 1.15); c.closePath(); fill(c, trim, 0.04);
      break;
    case 'horns':
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, LEATHER));
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.6, y - 0.05); c.quadraticCurveTo(s * (r + 0.3), y - 0.15, s * (r + 0.25), y - 0.45); c.quadraticCurveTo(s * (r + 0.12), y - 0.2, s * r * 0.75, y + 0.12); c.closePath(); fill(c, BONE, 0.05); }
      break;
    default: {   // bare head: hair round the back
      circle(c, 0, y, r); fill(c, shade(c, 0, y, r, FINE && hair ? hair : skin));
      if (FINE && hair) { for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) line(c, [[a * r * 0.5, y - r * 0.9], [a * r * 1.25, y + r * 0.2]], mix(hair, '#ffffff', 0.14), 0.025, false); }   // strands
      else if (hair) {
        if (L.R.hairCurly) { for (const a of [2.0, 2.6, 3.3, 4.0, 4.6, 1.2]) { circle(c, Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.38); fill(c, hair, 0.04); } }
        else { c.beginPath(); c.arc(0, y, r, Math.PI * 1.85, Math.PI * 1.15); c.quadraticCurveTo(0, y - r * 0.2, Math.cos(Math.PI * 1.85) * r, y + Math.sin(Math.PI * 1.85) * r); c.closePath(); fill(c, hair, 0.04); }
      }
      if (L.F.paint && detail && !FINE) line(c, [[-r * 0.5, y - r * 0.3], [r * 0.5, y - r * 0.4]], L.F.paint, 0.07, false);
      if (detail && (L.race === 'Orc' || L.race === 'Goblin' || L.race === 'Uruk-hai')) { line(c, [[-r * 0.35, y - r * 0.35], [-r * 0.1, y - r * 0.25]], BLACK, 0.05, false); line(c, [[r * 0.35, y - r * 0.35], [r * 0.1, y - r * 0.25]], BLACK, 0.05, false); }
    }
  }
  if (helm === 'spiked' || helm === 'flat') {   // an open-faced helm shows the wearer's skin
    c.beginPath(); c.moveTo(-r * 0.62, y - r * 0.25); c.quadraticCurveTo(0, y - r * 1.25, r * 0.62, y - r * 0.25); c.quadraticCurveTo(0, y - r * 0.55, -r * 0.62, y - r * 0.25); c.closePath(); fill(c, skin, 0.04);
    if (detail) for (const s of [-1, 1]) { circle(c, s * r * 0.25, y - r * 0.6, 0.035); fill(c, L.race === 'Man' ? BLACK : '#f0c040', 0); }
  }
  if (FINE && ['crest', 'hair', 'horns'].includes(helm)) face(c, L, r, y, px);
  if (L.hero && (helm === 'hair' || helm === 'horns')) {   // a circlet; with a face drawn, only across the brow
    c.beginPath(); if (FINE) c.arc(0, y + r * 0.35, r * 1.05, Math.PI * 1.22, Math.PI * 1.78); else c.arc(0, y, r + 0.03, 0, TAU);
    c.strokeStyle = GOLD; c.lineWidth = 0.06; c.stroke();
  }
}
// The face. Seen truly from above it would read upside down, so it is drawn upright, as when a model is looked at
// from the front and above: helm or hair on the crown, the face below it, the beard falling over the chest. A crested
// helm adds a riveted brow band, cheek guards and a nasal guard.
function face(c, L, r, y, px) {
  const skin = L.skin, rohan = L.names.includes('Rohan'), helmed = L.helm === 'crest';
  const beardCol = rohan ? mix(L.F.crest || '#e0c67a', '#000000', 0.15) : mix(L.hair || '#2d2018', '#8a5a32', 0.45);
  const fine = px > 16, dark = '#1b1410', top = y - r * 0.12;   // top: the hairline or the helm's brow
  if (!helmed) for (const s of [-1, 1]) { ellipse(c, s * r * 0.82, y + r * 0.2, r * 0.14, r * 0.2); fill(c, shade(c, s * r * 0.82, y + r * 0.2, r * 0.2, skin), 0.03); }   // ears
  c.beginPath(); c.moveTo(-r * 0.78, top + r * 0.04); c.quadraticCurveTo(-r * 0.82, y + r * 0.8, 0, y + r * 0.95); c.quadraticCurveTo(r * 0.82, y + r * 0.8, r * 0.78, top + r * 0.04); c.quadraticCurveTo(0, top - r * 0.25, -r * 0.78, top + r * 0.04); c.closePath();
  fill(c, lin(c, -r, top, r, y + r, skin, 0.25, 0.3), 0.035);
  if (L.F.paint) line(c, [[-r * 0.72, y + r * 0.08], [r * 0.72, y + r * 0.08]], L.F.paint, r * 0.22, false);   // war paint across the eyes
  if (fine) {
    for (const s of [-1, 1]) {
      line(c, [[s * r * 0.52, y - r * 0.02], [s * r * 0.12, y + r * 0.04]], mix(helmed ? beardCol : L.hair || dark, '#000000', 0.25), 0.035, false);   // brow
      ellipse(c, s * r * 0.3, y + r * 0.13, r * 0.13, r * 0.08); fill(c, '#f2ead8', 0.02); circle(c, s * r * 0.3, y + r * 0.14, r * 0.055); fill(c, dark, 0); circle(c, s * r * 0.3 - r * 0.02, y + r * 0.12, r * 0.018); fill(c, '#ffffff', 0);   // eye
      ellipse(c, s * r * 0.48, y + r * 0.42, r * 0.12, r * 0.07); fill(c, 'rgba(200,80,60,0.22)', 0);   // cheek
    }
    poly(c, [[0, y + r * 0.08], [-r * 0.12, y + r * 0.44], [r * 0.12, y + r * 0.44]]); fill(c, mix(skin, '#000000', 0.2), 0);   // nose
    line(c, [[-r * 0.18, y + r * 0.62], [r * 0.18, y + r * 0.62]], mix(skin, '#000000', 0.45), 0.02, false);   // mouth
  }
  if (L.hero || !rohan) {   // a full beard over the chest
    c.beginPath(); c.moveTo(-r * 0.72, y + r * 0.3); c.quadraticCurveTo(-r * 0.4, y + r * 0.55, 0, y + r * 0.52); c.quadraticCurveTo(r * 0.4, y + r * 0.55, r * 0.72, y + r * 0.3);
    c.quadraticCurveTo(r * 0.75, y + r * 1.25, 0, y + r * 1.55); c.quadraticCurveTo(-r * 0.75, y + r * 1.25, -r * 0.72, y + r * 0.3); c.closePath();
    fill(c, lin(c, -r * 0.7, y + r * 0.3, r * 0.7, y + r * 1.5, beardCol, 0.3, 0.35), 0.035);
    if (fine) { for (const d of [-0.4, 0, 0.4]) line(c, [[d * r, y + r * 0.8], [d * r * 0.6, y + r * 1.35]], mix(beardCol, '#000000', 0.3), 0.018, false); line(c, [[-r * 0.18, y + r * 0.66], [r * 0.18, y + r * 0.66]], mix(skin, '#000000', 0.5), 0.022, false); }
  } else if (fine) {   // a drooping moustache
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, y + r * 0.5); c.quadraticCurveTo(s * r * 0.35, y + r * 0.5, s * r * 0.42, y + r * 0.78); c.strokeStyle = beardCol; c.lineWidth = 0.035; c.lineCap = 'round'; c.stroke(); }
  }
  if (helmed) {
    const trim = L.F.trim || STEEL_D, metal = L.F.metal;
    for (const s of [-1, 1]) {   // cheek guards
      c.beginPath(); c.moveTo(s * r * 0.98, top - r * 0.05); c.lineTo(s * r * 0.55, top + r * 0.12); c.quadraticCurveTo(s * r * 0.48, y + r * 0.5, s * r * 0.6, y + r * 0.78); c.quadraticCurveTo(s * r * 0.9, y + r * 0.6, s * r * 0.98, top - r * 0.05); c.closePath();
      fill(c, lin(c, s * r, top, s * r * 0.5, y + r * 0.8, metal, 0.5, 0.4), 0.035);
      if (fine) { circle(c, s * r * 0.72, y + r * 0.42, 0.018); fill(c, '#fff4c8', 0); }
    }
    c.beginPath(); c.moveTo(-r * 0.95, top + r * 0.04); c.quadraticCurveTo(0, top - r * 0.25, r * 0.95, top + r * 0.04);   // brow band
    c.strokeStyle = OUT; c.lineWidth = 0.08; c.stroke(); c.strokeStyle = lin(c, -r, top - r * 0.2, r, top + r * 0.2, trim, 0.5, 0.35); c.lineWidth = 0.05; c.stroke();
    line(c, [[0, top - r * 0.1], [0, y + r * 0.42]], trim, 0.045);   // nasal guard
    if (fine) for (const t of [0.1, 0.3, 0.7, 0.9]) { const u = 1 - t, bx = (t - u) * r * 0.95, by = (u * u + t * t) * (top + r * 0.04) + 2 * u * t * (top - r * 0.25); circle(c, bx, by, 0.018); fill(c, '#fff4c8', 0); }   // rivets
  }
  if (HI) portraitFace(c, L, r, y, top, helmed, rohan, beardCol);
}
// Eyes with colour, lines of age, braids and scars, engraving and dents on the helm.
function portraitFace(c, L, r, y, top, helmed, rohan, beardCol) {
  const skin = L.skin, crease = mix(skin, '#000000', 0.35), old = L.hero || /Chieftain/i.test(L.name);
  for (const s of [-1, 1]) {
    circle(c, s * r * 0.3, y + r * 0.14, r * 0.05); fill(c, rohan ? '#4a78a8' : '#6a4a2a', 0);   // iris
    circle(c, s * r * 0.3, y + r * 0.14, r * 0.025); fill(c, '#0e0a08', 0); circle(c, s * r * 0.3 - r * 0.018, y + r * 0.12, r * 0.015); fill(c, '#ffffff', 0);
    c.beginPath(); c.ellipse(s * r * 0.3, y + r * 0.13, r * 0.13, r * 0.08, 0, Math.PI, TAU); c.strokeStyle = '#2a1c14'; c.lineWidth = 0.008; c.stroke();   // upper lid
    if (old) for (const k of [-0.05, 0, 0.05]) line(c, [[s * r * 0.45, y + r * (0.12 + k)], [s * r * 0.55, y + r * (0.1 + k * 1.6)]], crease, 0.006, false);   // crow's feet
    c.beginPath(); c.moveTo(s * r * 0.14, y + r * 0.42); c.quadraticCurveTo(s * r * 0.26, y + r * 0.55, s * r * 0.22, y + r * 0.66); c.strokeStyle = crease; c.lineWidth = 0.007; c.stroke();   // cheek fold
  }
  if (old && !helmed) for (const k of [0, 0.07]) { c.beginPath(); c.moveTo(-r * 0.32, top + r * (0.12 + k)); c.quadraticCurveTo(0, top + r * (0.06 + k), r * 0.32, top + r * (0.12 + k)); c.strokeStyle = crease; c.lineWidth = 0.007; c.stroke(); }   // a lined brow
  if (!rohan && /Chieftain/i.test(L.name)) {   // an old scar across the left cheek, with stitch marks
    line(c, [[-r * 0.58, y - r * 0.02], [-r * 0.2, y + r * 0.48]], mix(skin, '#ffffff', 0.25), 0.014, false);
    for (const t of [0.25, 0.5, 0.75]) { const x = -r * 0.58 + r * 0.38 * t, yy = y - r * 0.02 + r * 0.5 * t; line(c, [[x - r * 0.05, yy + r * 0.03], [x + r * 0.05, yy - r * 0.03]], crease, 0.006, false); }
  }
  if (L.hero || !rohan) {   // braids hanging from the beard, bound with rings
    const ring = rohan ? GOLD : BONE;
    for (const bx of rohan ? [0] : [-r * 0.32, r * 0.32]) {
      for (let k = 0; k < 4; k++) { ellipse(c, bx, y + r * (1.3 + k * 0.13), r * 0.07, r * 0.075); fill(c, lin(c, bx - r * 0.07, 0, bx + r * 0.07, 0, beardCol, 0.3, 0.35), 0.008); }
      line(c, [[bx - r * 0.08, y + r * 1.24], [bx + r * 0.08, y + r * 1.24]], ring, 0.02); circle(c, bx, y + r * 1.78, r * 0.05); fill(c, ring, 0.008);
    }
    for (let i = 0; i < 9; i++) { const x = -r * 0.5 + i * r * 0.125; line(c, [[x, y + r * 0.75], [x * 0.85, y + r * 1.2]], mix(beardCol, i % 2 ? '#ffffff' : '#000000', 0.2), 0.006, false); }   // hairs
  }
  if (helmed) {
    c.beginPath(); for (let i = 0; i <= 16; i++) { const t = i / 16, u = 1 - t, bx = (t - u) * r * 0.9, by = (u * u + t * t) * (top + r * 0.04) + 2 * u * t * (top - r * 0.25) + (i % 2 ? -0.008 : 0.008); c.lineTo(bx, by); }   // zigzag engraving on the brow band
    c.strokeStyle = mix(L.F.trim || STEEL_D, '#000000', 0.45); c.lineWidth = 0.006; c.stroke();
    for (const [x, yy, a] of [[-r * 0.4, y - r * 0.6, 0.4], [r * 0.25, y - r * 0.75, -0.3], [r * 0.5, y - r * 0.35, 0.9]]) line(c, [[x, yy], [x + Math.cos(a) * r * 0.15, yy + Math.sin(a) * r * 0.15]], 'rgba(40,40,48,0.5)', 0.007, false);   // dents and scratches
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.55, top + r * 0.16); c.quadraticCurveTo(s * r * 0.5, y + r * 0.5, s * r * 0.6, y + r * 0.72); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.008; c.stroke(); }   // cheek-guard edge
  }
}
function hand(c, L, x, y) {
  if (FINE) {   // the arm from the shoulder, sleeved like the body, with a leather bracer at the wrist
    const sx = Math.sign(x || 1) * 0.31, sy = 0.06, cloth = L.cloth || L.F.cloth;
    const sleeve = L.heavy ? L.F.metal : L.armour ? mix(cloth, L.F.metal, 0.35) : cloth;
    const ex = sx + (x - sx) * 0.45 + Math.sign(x || 1) * 0.06, ey = sy + (y - sy) * 0.45 + 0.05;   // the elbow, bent outwards
    line(c, [[sx, sy], [ex, ey], [x, y]], lin(c, sx - 0.1, sy - 0.1, x + 0.1, y + 0.1, sleeve, 0.3, 0.35), 0.15);
    line(c, [[ex + (x - ex) * 0.55, ey + (y - ey) * 0.55], [x, y]], LEATHER, 0.13, false);
  }
  circle(c, x, y, 0.11); fill(c, FINE ? shade(c, x, y, 0.11, L.skin) : L.skin, 0.05);
}

function shield(c, L, px) {
  const S = Object.assign({}, L.F.shield || DEFAULT_F.shield), shape = L.shield, s = shape === 'buckler' ? 0.28 : 0.44, x = -0.58, y = 0.0;
  if (L.shieldFill) S.fill = L.shieldFill;
  if (L.shieldEmblem) S.emblem = L.shieldEmblem;
  const detail = px > 9;
  c.save(); c.translate(x, y); c.rotate(-0.12);
  switch (shape) {
    case 'kite': c.beginPath(); c.moveTo(-s * 0.85, -s * 0.95); c.quadraticCurveTo(0, -s * 1.15, s * 0.85, -s * 0.95); c.lineTo(s * 0.85, -s * 0.1); c.quadraticCurveTo(s * 0.8, s * 0.9, 0, s * 1.25); c.quadraticCurveTo(-s * 0.8, s * 0.9, -s * 0.85, -s * 0.1); c.closePath(); fill(c, shade(c, 0, 0, s * 1.2, S.fill)); break;
    case 'tall': c.beginPath(); c.roundRect(-s * 0.72, -s * 1.1, s * 1.44, s * 2.25, s * 0.2); fill(c, shade(c, 0, 0, s * 1.3, S.fill)); if (detail) line(c, [[0, -s * 0.9], [0, s * 0.95]], S.rim, 0.05, false); break;
    case 'ragged': c.beginPath(); for (let i = 0; i < 14; i++) { const a = i * TAU / 14, r = s * (i % 3 === 0 ? 0.8 : i % 2 ? 1.05 : 0.95); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); fill(c, shade(c, 0, 0, s, S.fill)); if (detail) for (const a of [0.9, 2.5, 4.2]) line(c, [[Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3], [Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9]], IRON_D, 0.06, false); break;
    case 'leaf': c.beginPath(); c.moveTo(0, -s * 1.3); c.quadraticCurveTo(s * 1.1, -s * 0.1, 0, s * 1.3); c.quadraticCurveTo(-s * 1.1, -s * 0.1, 0, -s * 1.3); c.closePath(); fill(c, shade(c, 0, 0, s, S.fill)); if (detail) line(c, [[0, -s * 1.05], [0, s * 1.05]], S.rim, 0.05, false); break;
    case 'planks':
      circle(c, 0, 0, s); fill(c, shade(c, 0, 0, s, S.fill));
      if (detail) for (const dx of [-0.5, 0, 0.5]) line(c, [[dx * s, -Math.sqrt(1 - dx * dx) * s * 0.95], [dx * s, Math.sqrt(1 - dx * dx) * s * 0.95]], WOOD_D, 0.04, false);
      if (FINE) { circle(c, 0, 0, s * 0.93); c.strokeStyle = S.rim; c.lineWidth = 0.05; c.stroke(); for (const dx of [-0.75, -0.25, 0.25, 0.75]) line(c, [[dx * s, -s * 0.5], [dx * s + 0.01, s * 0.5]], 'rgba(0,0,0,0.18)', 0.015, false); }
      circle(c, 0, 0, s * 0.22); fill(c, shade(c, 0, 0, s * 0.22, IRON), 0.04); gleam(c, 0, 0, s * 0.22); break;
    case 'wicker': circle(c, 0, 0, s); fill(c, shade(c, 0, 0, s, S.fill)); if (detail) for (const k of [0.35, 0.7]) { circle(c, 0, 0, s * k); c.strokeStyle = S.rim; c.lineWidth = 0.05; c.stroke(); } break;
    default:
      circle(c, 0, 0, s); fill(c, shade(c, 0, 0, s, S.fill));
      if (FINE) { circle(c, 0, 0, s * 0.93); c.strokeStyle = lin(c, -s, -s, s, s, S.rim, 0.55, 0.45); c.lineWidth = 0.09; c.stroke(); }
      else { circle(c, 0, 0, s * 0.86); c.strokeStyle = S.rim; c.lineWidth = 0.06; c.stroke(); }
      if (!S.emblem || S.emblem === 'none' || !detail) { circle(c, 0, 0, s * 0.2); fill(c, FINE ? shade(c, 0, 0, s * 0.2, S.rim) : S.rim, 0.04); gleam(c, 0, 0, s * 0.2); }
  }
  if (detail && S.emblem && S.emblem !== 'none' && shape !== 'buckler') {
    const col = S.emblem === 'eye' ? RED : ['tree', 'hand', 'swan'].includes(S.emblem) ? WHITE : S.rim;
    if (FINE) {   // raised: a dark copy just below and right of it (not a canvas shadow, which leaves the shield)
      c.save(); c.shadowColor = 'transparent';
      emblem(c, S.emblem, s * 0.035, s * 0.045, s * 0.55, 'rgba(0,0,0,0.45)'); emblem(c, S.emblem, 0, 0, s * 0.55, col);
      c.restore();
    }
    else emblem(c, S.emblem, 0, 0, s * 0.5, col);
  }
  if (FINE && !['tall', 'kite', 'leaf'].includes(shape)) for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + 0.3; circle(c, Math.cos(a) * s * 0.93, Math.sin(a) * s * 0.93, s * 0.045); fill(c, shade(c, Math.cos(a) * s * 0.93, Math.sin(a) * s * 0.93, s * 0.045, '#f0dc9a'), 0.012); }   // rim rivets
  if (HI && !['tall', 'kite', 'leaf'].includes(shape)) {   // wood grain through the paint, and the scratches of use
    c.save(); circle(c, 0, 0, s * 0.86); c.clip();
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(-s, k * s * 0.2); c.bezierCurveTo(-s * 0.3, k * s * 0.2 + s * 0.06, s * 0.3, k * s * 0.2 - s * 0.06, s, k * s * 0.2); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.006; c.stroke(); }
    for (const [x, y, a, l] of [[-0.5, -0.3, 0.5, 0.3], [0.3, 0.4, -0.7, 0.25], [-0.2, 0.55, 0.2, 0.2], [0.45, -0.45, 1.1, 0.18]]) line(c, [[x * s, y * s], [(x + Math.cos(a) * l) * s, (y + Math.sin(a) * l) * s]], 'rgba(255,255,255,0.4)', 0.007, false);
    c.restore();
  }
  if (FINE) gleam(c, -s * 0.15, -s * 0.1, s * 0.9);
  c.restore();
}

/* Hand weapons, drawn pointing up from the grip at (0, 0). */
const WEAPONS = {
  sword(c) { poly(c, [[-0.07, -0.1], [0.07, -0.1], [0.05, -0.95], [0, -1.08], [-0.05, -0.95]]); fill(c, steel(c, -0.07, 0.07), 0.05); edge(c, [[0, -0.18], [0, -0.98]], 0.02); line(c, [[-0.22, -0.1], [0.22, -0.1]], FINE ? GOLD : STEEL_D, 0.08); line(c, [[0, -0.05], [0, 0.22]], WOOD_D, 0.09, false); if (FINE) for (let k = 0; k < 4; k++) line(c, [[-0.045, k * 0.06 - 0.02], [0.045, k * 0.06 + 0.01]], LEATHER, 0.02, false); circle(c, 0, 0.27, 0.07); fill(c, FINE ? shade(c, 0, 0.27, 0.07, GOLD) : STEEL_D, 0.04); },
  long(c) { poly(c, [[-0.08, -0.1], [0.08, -0.1], [0.06, -1.15], [0, -1.28], [-0.06, -1.15]]); fill(c, STEEL, 0.05); line(c, [[-0.26, -0.1], [0.26, -0.1]], STEEL_D, 0.08); line(c, [[0, -0.05], [0, 0.3]], WOOD_D, 0.09, false); circle(c, 0, 0.35, 0.08); fill(c, STEEL_D, 0.04); },
  elven(c) { c.beginPath(); c.moveTo(-0.07, -0.1); c.quadraticCurveTo(0.22, -0.6, 0.02, -1.12); c.quadraticCurveTo(-0.02, -0.6, 0.07, -0.1); c.closePath(); fill(c, STEEL, 0.05); line(c, [[-0.16, -0.1], [0.16, -0.1]], GOLD, 0.07); line(c, [[0, -0.05], [0, 0.26]], WOOD_D, 0.08, false); },
  scimitar(c) { c.beginPath(); c.moveTo(-0.08, -0.1); c.quadraticCurveTo(-0.1, -0.7, 0.3, -1.05); c.quadraticCurveTo(0.12, -0.6, 0.1, -0.1); c.closePath(); fill(c, STEEL, 0.05); line(c, [[-0.18, -0.1], [0.18, -0.1]], BRONZE, 0.08); line(c, [[0, -0.05], [0, 0.24]], WOOD_D, 0.09, false); },
  cleaver(c) { c.beginPath(); c.moveTo(-0.07, -0.1); c.lineTo(-0.07, -0.95); c.lineTo(0.3, -1.0); c.quadraticCurveTo(0.38, -0.5, 0.12, -0.1); c.closePath(); fill(c, '#9a9a94', 0.05); line(c, [[-0.2, -0.1], [0.2, -0.1]], IRON_D, 0.08); line(c, [[0, -0.05], [0, 0.24]], WOOD_D, 0.09, false); },
  axe(c) { line(c, [[0, 0.3], [0, -0.95]], wood(c, -0.05, 0.05), 0.09); poly(c, [[0.02, -0.98], [0.42, -1.08], [0.52, -0.7], [0.42, -0.45], [0.02, -0.62]]); fill(c, steel(c, 0.02, 0.52, FINE ? '#a9adb5' : STEEL), 0.05); edge(c, [[0.42, -1.04], [0.49, -0.7], [0.42, -0.49]], 0.035); },
  club(c) { c.beginPath(); c.moveTo(-0.07, 0.3); c.lineTo(0.07, 0.3); c.lineTo(0.18, -0.6); c.quadraticCurveTo(0.2, -1.0, 0, -1.02); c.quadraticCurveTo(-0.2, -1.0, -0.18, -0.6); c.closePath(); fill(c, WOOD, 0.05); for (const [x, y] of [[0.14, -0.8], [-0.14, -0.65], [0.12, -0.5]]) { circle(c, x, y, 0.04); fill(c, IRON_D, 0.02); } },
};
// Two-handed weapons lie across the chest, held in both hands; drawn pointing up from the lower hand at (0, 0).
const BIG = {
  greataxe(c) {
    line(c, [[0, 0.5], [0, -0.75]], wood(c, -0.05, 0.05), 0.1); c.beginPath(); c.moveTo(0.02, -0.5); c.quadraticCurveTo(0.6, -0.55, 0.55, -1.1); c.lineTo(0.02, -1.05); c.lineTo(-0.55, -1.1); c.quadraticCurveTo(-0.6, -0.55, -0.02, -0.5); c.closePath(); fill(c, steel(c, -0.55, 0.55), 0.05);
    if (FINE) { c.beginPath(); c.moveTo(0.5, -0.62); c.quadraticCurveTo(0.56, -0.85, 0.52, -1.05); c.moveTo(-0.5, -0.62); c.quadraticCurveTo(-0.56, -0.85, -0.52, -1.05); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.035; c.stroke(); circle(c, 0, -0.78, 0.07); fill(c, IRON_D, 0.03); }
  },
  greatsword(c) { poly(c, [[-0.1, -0.1], [0.1, -0.1], [0.07, -1.2], [0, -1.35], [-0.07, -1.2]]); fill(c, STEEL, 0.05); line(c, [[-0.32, -0.1], [0.32, -0.1]], STEEL_D, 0.09); line(c, [[0, -0.05], [0, 0.55]], WOOD_D, 0.1, false); circle(c, 0, 0.62, 0.09); fill(c, STEEL_D, 0.04); },
};
function spear(c, x0, y0, x1, y1, w, headLen) {
  line(c, [[x0, y0], [x1, y1]], wood(c, x1 - w, x1 + w), w);
  const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, px = -uy, py = ux;
  poly(c, [[x1 + ux * headLen, y1 + uy * headLen], [x1 + px * headLen * 0.28, y1 + py * headLen * 0.28], [x1 - ux * headLen * 0.15, y1 - uy * headLen * 0.15], [x1 - px * headLen * 0.28, y1 - py * headLen * 0.28]]);
  fill(c, steel(c, x1 - headLen * 0.28, x1 + headLen * 0.28), 0.05);
  edge(c, [[x1 + ux * headLen * 0.85, y1 + uy * headLen * 0.85], [x1, y1]], 0.02);
  if (FINE) for (let k = 1; k <= 3; k++) line(c, [[x1 - ux * k * 0.035 - px * w * 0.6, y1 - uy * k * 0.035 - py * w * 0.6], [x1 - ux * k * 0.035 + px * w * 0.6, y1 - uy * k * 0.035 + py * w * 0.6]], LEATHER, 0.02, false);   // binding below the head
}
function bow(c, L, px) {
  const x = -0.6, col = ['Orc', 'Goblin', 'Uruk-hai'].includes(L.race) ? WOOD_D : L.race === 'Elf' ? '#c9a85a' : WOOD;
  c.beginPath(); c.moveTo(x + 0.1, 0.95); c.quadraticCurveTo(x - 0.55, 0, x + 0.1, -1.0); c.strokeStyle = OUT; c.lineWidth = 0.19; c.lineCap = 'round'; c.stroke(); c.strokeStyle = wood(c, x - 0.3, x - 0.1, col); c.lineWidth = 0.11; c.stroke();
  if (FINE) { c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 0.025; c.stroke(); line(c, [[x - 0.2, 0.08], [x - 0.2, -0.12]], LEATHER, 0.13); }   // sheen and the grip
  line(c, [[x + 0.1, 0.95], [x + 0.1, -1.0]], BONE, 0.035, false);
  if (px > 9) { line(c, [[x + 0.1, -0.1], [x + 0.95, -0.1]], WOOD, 0.05); poly(c, [[x + 1.08, -0.1], [x + 0.9, -0.17], [x + 0.9, -0.03]]); fill(c, STEEL, 0.03); }   // an arrow on the string
  if (FINE) {   // a leather quiver on the right hip, arrows with grey-and-red fletching
    line(c, [[0.42, 0.5], [0.58, 0.9]], lin(c, 0.4, 0.5, 0.62, 0.9, LEATHER, 0.3, 0.35), 0.16);
    line(c, [[0.45, 0.6], [0.55, 0.85]], mix(LEATHER, '#000000', 0.35), 0.02, false);
    for (const [d, col] of [[-0.06, '#d8d4c8'], [0, '#a83a2e'], [0.06, '#d8d4c8']]) { line(c, [[0.42 + d, 0.5], [0.36 + d, 0.36]], WOOD_D, 0.025, false); poly(c, [[0.36 + d, 0.36], [0.33 + d, 0.43], [0.39 + d, 0.43]]); fill(c, col, 0.015); }
  } else for (const d of [-0.1, 0, 0.1]) line(c, [[0.45 + d, 0.6], [0.6 + d, 0.95]], BONE, 0.05);   // the quiver over the right hip
}
function crossbow(c) {
  const x = 0.55;
  line(c, [[x, 0.6], [x, -0.75]], WOOD, 0.14);
  c.beginPath(); c.moveTo(x - 0.55, -0.35); c.quadraticCurveTo(x, -0.7, x + 0.55, -0.35); c.strokeStyle = OUT; c.lineWidth = 0.2; c.lineCap = 'round'; c.stroke(); c.strokeStyle = STEEL; c.lineWidth = 0.12; c.stroke();
  line(c, [[x - 0.55, -0.35], [x, -0.05], [x + 0.55, -0.35]], BONE, 0.035, false);
  line(c, [[x, -0.05], [x, -0.72]], WOOD_D, 0.05, false); poly(c, [[x, -0.9], [x - 0.08, -0.7], [x + 0.08, -0.7]]); fill(c, STEEL, 0.03);
}
function banner(c, L, px) {
  const [bg, fg, em] = L.F.flag || DEFAULT_F.flag, x = L.shield ? -0.42 : -0.5;
  line(c, [[x, 0.95], [x, -1.2]], WOOD_D, 0.08);
  c.beginPath(); c.moveTo(x + 0.03, -1.17); c.lineTo(x + 1.1, -1.17); c.lineTo(x + 0.92, -0.9); c.lineTo(x + 1.1, -0.62); c.lineTo(x + 0.03, -0.62); c.closePath(); fill(c, bg, 0.05);
  if (px > 9) { line(c, [[x + 0.06, -1.1], [x + 0.06, -0.69]], fg, 0.04, false); emblem(c, em, x + 0.5, -0.9, 0.22, fg); }
  circle(c, x, -1.25, 0.07); fill(c, GOLD, 0.03);
}

/* ---------- Whole figures ---------- */
function infantry(c, L, px) {
  if (FINE) miniCloak(c, L); else cloak(c, L);
  if (L.bow === 'bow') bow(c, L, px);
  if (L.banner) banner(c, L, px);
  if (FINE) miniBody(c, L); else body(c, L);
  const polearm = L.spear || L.pike || L.thrown;
  if (L.spear || L.thrown) { spear(c, 0.52, 1.15, 0.56, -1.0, 0.09, 0.3); if (L.thrown) spear(c, 0.74, 0.95, 0.78, -0.7, 0.06, 0.22); }
  if (L.pike) { spear(c, 0.46, 1.3, 0.52, -1.12, 0.07, 0.2); line(c, [[0.41, 0.7], [0.55, 0.7]], IRON, 0.05, false); }
  if (L.twoHanded) {
    c.save(); c.translate(-0.25, 0.5); c.rotate(0.7); (BIG[L.weapon] || BIG.greataxe)(c); c.restore();
    hand(c, L, -0.25, 0.5); hand(c, L, 0.12, 0.06);
  } else if (!polearm && !L.bow && L.weapon && WEAPONS[L.weapon]) {
    c.save(); c.translate(0.56, 0.15); c.rotate(0.12); WEAPONS[L.weapon](c); c.restore(); hand(c, L, 0.56, 0.15);
    if (L.twoBlades && !L.shield) { c.save(); c.translate(-0.56, 0.15); c.rotate(-0.12); WEAPONS[L.weapon](c); c.restore(); hand(c, L, -0.56, 0.15); }
  } else if (polearm) hand(c, L, 0.54, 0.25);
  else if (L.bow === 'bow') hand(c, L, -0.5, 0.0);
  if (L.bow === 'crossbow') { crossbow(c); hand(c, L, 0.55, 0.3); }
  if (L.shield) shield(c, L, px);
  else if (L.banner) hand(c, L, -0.5, 0.2);
  else if (FINE && !L.bow && !L.twoHanded && !L.twoBlades) hand(c, L, -0.38, 0.4);   // the free left arm hangs by the side
  head(c, L, px);
}
function troll(c, L, px) {
  const heavy = L.heavy || L.armour, skin = L.skin, dark = mix(skin, '#000000', 0.3), detail = px > 9;
  // Hunched back and shoulders, with a spine ridge and a few warts.
  ellipse(c, 0, 0.2, 0.82, 0.66); fill(c, shade(c, 0, 0.2, 0.85, skin), 0.06);
  if (detail) { line(c, [[0, 0.8], [0, -0.1]], dark, 0.06, false); for (const [x, y] of [[-0.35, 0.45], [0.42, 0.55], [-0.52, 0.0], [0.3, 0.05]]) { circle(c, x, y, 0.05); fill(c, dark, 0); } }
  if (heavy) {   // iron plates on the shoulders and down the back
    for (const s of [-1, 1]) { ellipse(c, s * 0.5, 0.08, 0.3, 0.24, s * 0.4); fill(c, shade(c, s * 0.5, 0.08, 0.3, IRON), 0.05); }
    poly(c, [[-0.26, 0.28], [0.26, 0.28], [0.2, 0.82], [-0.2, 0.82]]); fill(c, shade(c, 0, 0.55, 0.3, IRON), 0.05);
  }
  // The left arm hangs forward, ending in a fist; the right swings the weapon.
  line(c, [[-0.6, 0.0], [-0.82, -0.72]], skin, 0.3); circle(c, -0.84, -0.8, 0.2); fill(c, shade(c, -0.84, -0.8, 0.2, skin), 0.05);
  line(c, [[0.6, 0.0], [0.84, -0.52]], skin, 0.3);
  const fx = 0.86, fy = -0.6;
  if (L.spear) spear(c, fx + 0.3, fy + 0.3, fx - 0.85, fy - 0.72, 0.13, 0.42);
  else if (L.weapon === 'long' || L.weapon === 'cleaver') { c.save(); c.translate(fx, fy); c.rotate(-0.8); c.scale(1.5, 1.5); WEAPONS[L.weapon](c); c.restore(); }
  else { c.save(); c.translate(fx, fy); c.rotate(-0.8); c.scale(1.5, 1.5); WEAPONS.club(c); c.restore(); }
  circle(c, fx, fy, 0.2); fill(c, shade(c, fx, fy, 0.2, skin), 0.05);
  // The head juts forward: a heavy brow, small eyes, a wide mouth with tusks.
  const hy = -0.42;
  ellipse(c, 0, hy, 0.42, 0.38); fill(c, shade(c, 0, hy, 0.42, skin));
  if (heavy) { c.beginPath(); c.arc(0, hy, 0.4, 0.1, Math.PI - 0.1); c.closePath(); fill(c, shade(c, 0, hy + 0.2, 0.4, IRON), 0.05); }   // an iron cap on the back of the skull
  if (detail) {
    for (const s of [-1, 1]) { circle(c, s * 0.15, hy - 0.08, 0.055); fill(c, '#f2d16b', 0.02); circle(c, s * 0.15, hy - 0.08, 0.025); fill(c, BLACK, 0); }
    line(c, [[-0.32, hy - 0.18], [-0.1, hy - 0.22], [0.1, hy - 0.22], [0.32, hy - 0.18]], dark, 0.08, false);   // brow
    line(c, [[-0.22, hy - 0.3], [0.22, hy - 0.3]], BLACK, 0.06, false);                                         // mouth
    for (const s of [-1, 1]) { poly(c, [[s * 0.2, hy - 0.26], [s * 0.24, hy - 0.46], [s * 0.12, hy - 0.3]]); fill(c, BONE, 0.03); }   // tusks
  }
}
function warg(c, L, px) {
  const fur = L.skin, dark = mix(fur, '#000000', 0.35), light = mix(fur, '#ffffff', 0.22);
  // A running wolf: tail, four stretched legs with paws, then the body.
  c.beginPath(); c.moveTo(0, 0.55); c.quadraticCurveTo(-0.3, 0.95, 0.1, 1.2); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 0.24; c.stroke(); c.strokeStyle = fur; c.lineWidth = 0.15; c.stroke();
  for (const [x0, y0, x1, y1] of [[-0.22, -0.3, -0.62, -0.85], [0.22, -0.3, 0.62, -0.85], [-0.22, 0.4, -0.6, 0.92], [0.22, 0.4, 0.6, 0.92]]) { line(c, [[x0, y0], [x1, y1]], fur, 0.17); circle(c, x1, y1, 0.09); fill(c, dark, 0.04); }
  ellipse(c, 0, 0.1, 0.44, 0.7); fill(c, shade(c, 0, 0.1, 0.6, fur));
  if (px > 9) line(c, [[0, 0.62], [0, -0.35]], light, 0.1, false);   // the lighter ridge of the back
  // Ears, then the head with the muzzle forward.
  for (const s of [-1, 1]) { poly(c, [[s * 0.1, -0.6], [s * 0.32, -0.95], [s * 0.3, -0.5]]); fill(c, fur, 0.05); }
  c.beginPath(); c.moveTo(-0.3, -0.5); c.quadraticCurveTo(-0.3, -1.0, -0.1, -1.1); c.lineTo(0.1, -1.1); c.quadraticCurveTo(0.3, -1.0, 0.3, -0.5); c.quadraticCurveTo(0, -0.35, -0.3, -0.5); c.closePath(); fill(c, shade(c, 0, -0.75, 0.4, fur));
  if (px > 9) {
    for (const s of [-1, 1]) { circle(c, s * 0.13, -0.7, 0.045); fill(c, '#f2d16b', 0.02); }
    circle(c, 0, -1.06, 0.07); fill(c, BLACK, 0.02);
    for (const s of [-1, 1]) line(c, [[s * 0.1, -1.0], [s * 0.13, -0.88]], BONE, 0.04, false);   // fangs
  }
}
function spider(c, L) {
  const col = L.skin;
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const y = -0.55 + i * 0.3, k = 0.55 + Math.abs(i - 1.5) * 0.25; line(c, [[s * 0.2, y], [s * k, y - 0.25], [s * 1.15, y + (i < 2 ? -0.35 : 0.4)]], col, 0.09); }
  ellipse(c, 0, 0.35, 0.48, 0.6); fill(c, shade(c, 0, 0.35, 0.55, col));
  circle(c, 0, -0.42, 0.3); fill(c, shade(c, 0, -0.42, 0.3, col));
  for (const [x, y] of [[-0.1, -0.6], [0.1, -0.6], [-0.2, -0.5], [0.2, -0.5]]) { circle(c, x, y, 0.045); fill(c, '#d03a2a', 0.02); }
  for (const s of [-1, 1]) line(c, [[s * 0.1, -0.68], [s * 0.18, -0.9]], col, 0.07);
}
function ent(c) {
  for (const a of [0.4, 1.6, 2.7, 3.9, 5.1]) { circle(c, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.48); fill(c, '#3f6a2a', 0.05); }
  circle(c, 0, 0, 0.55); fill(c, shade(c, 0, 0, 0.55, '#4f7d3a'), 0.05);
  for (const s of [-1, 1]) line(c, [[s * 0.3, 0.1], [s * 0.95, -0.5]], '#5a4a30', 0.18);
  circle(c, 0, -0.05, 0.3); fill(c, shade(c, 0, -0.05, 0.3, '#6a5a3a'));
  for (const s of [-1, 1]) { circle(c, s * 0.11, -0.12, 0.05); fill(c, '#b8d070', 0.02); }
}
function drake(c, L) {
  const col = L.skin;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.2, -0.1); c.quadraticCurveTo(s * 0.9, -0.9, s * 1.25, -0.3); c.quadraticCurveTo(s * 1.0, 0.1, s * 0.3, 0.45); c.closePath(); fill(c, mix(col, '#000000', 0.25), 0.05); }
  line(c, [[0, 0.5], [0.15, 1.25]], col, 0.16);
  ellipse(c, 0, 0.1, 0.32, 0.62); fill(c, shade(c, 0, 0.1, 0.5, col));
  c.beginPath(); c.moveTo(-0.22, -0.55); c.quadraticCurveTo(0, -1.15, 0.22, -0.55); c.closePath(); fill(c, shade(c, 0, -0.7, 0.3, col));
  for (const s of [-1, 1]) { circle(c, s * 0.09, -0.65, 0.04); fill(c, '#f2d16b', 0.02); }
}

// A horse seen from above, running up the base: body, neck and head, four legs, mane and tail.
function horse(c, px) {
  const coat = '#6b4a2e', dark = mix(coat, '#000000', 0.35), mane = '#2a1c12';
  for (const [x0, y0, x1, y1] of [[-0.25, -0.35, -0.55, -0.85], [0.25, -0.35, 0.55, -0.85], [-0.25, 0.45, -0.52, 0.95], [0.25, 0.45, 0.52, 0.95]]) { line(c, [[x0, y0], [x1, y1]], coat, 0.15); circle(c, x1, y1, 0.08); fill(c, dark, 0.03); }
  c.beginPath(); c.moveTo(0, 0.6); c.quadraticCurveTo(-0.25, 0.95, -0.05, 1.18); c.strokeStyle = OUT; c.lineWidth = 0.22; c.lineCap = 'round'; c.stroke(); c.strokeStyle = mane; c.lineWidth = 0.13; c.stroke();
  ellipse(c, 0, 0.12, 0.42, 0.72); fill(c, shade(c, 0, 0.12, 0.6, coat));
  line(c, [[0, -0.45], [0, -0.95]], coat, 0.26);
  ellipse(c, 0, -1.0, 0.17, 0.3); fill(c, shade(c, 0, -1.0, 0.25, coat));
  if (px > 9) { line(c, [[0, -0.4], [0, -0.85]], mane, 0.08, false); for (const s of [-1, 1]) { poly(c, [[s * 0.08, -1.15], [s * 0.16, -1.32], [s * 0.18, -1.1]]); fill(c, coat, 0.03); } }
}
// A Cavalry model: the mount, then the rider at two thirds of the size, sitting on its back. part: 'mount' or 'rider'
// draws only that layer (the board turns the mount to the way it moves and keeps the rider upright).
function mounted(c, L, px, part) {
  if (part !== 'rider') { if (L.mount === 'warg') warg(c, Object.assign({}, L, { skin: L.F.wargSkin || '#6a5a48' }), px); else horse(c, px); }
  if (part === 'mount') return;
  c.save(); c.translate(0, 0.08); c.scale(0.62, 0.62);
  infantry(c, Object.assign({}, L, { riding: true }), px * 0.62);
  c.restore();
}
// A Chariot seen from above: two horses in front, the car with its wheels and the driver (the model's own figure,
// small) behind them.
function chariot(c, L, px) {
  for (const x of [-0.32, 0.32]) { c.save(); c.translate(x, -0.45); c.scale(0.5, 0.5); horse(c, px * 0.5); c.restore(); }
  line(c, [[0, 0.05], [0, -0.55]], '#5a3d22', 0.08);
  for (const x of [-0.62, 0.62]) { c.beginPath(); c.roundRect(x - 0.1, 0.2, 0.2, 0.62, 0.06); fill(c, '#3b2a18'); }
  c.beginPath(); c.roundRect(-0.52, 0.12, 1.04, 0.78, 0.14); fill(c, shade(c, 0, 0.5, 0.8, '#8a6136'));
  c.save(); c.translate(0, 0.5); c.scale(0.42, 0.42); infantry(c, L, px * 0.42); c.restore();
}
// A War Beast seen from above (a Mûmak or the Great Beast): the great body, the head and tusks in front, the Howdah.
function warBeast(c, T, px) {
  const hide = /Mûmak/.test(T.n) ? '#7d7a76' : '#6b5440', dark = '#3f3a35';
  ellipse(c, 0, 0.15, 0.78, 0.92); fill(c, shade(c, 0, 0.1, 1, hide));
  for (const s of [-1, 1]) { ellipse(c, s * 0.42, -0.62, 0.3, 0.2); fill(c, shade(c, s * 0.42, -0.62, 0.3, hide)); }   // ears
  ellipse(c, 0, -0.62, 0.32, 0.3); fill(c, shade(c, 0, -0.62, 0.35, hide));   // head
  if (/Mûmak/.test(T.n)) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.12, -0.8); c.quadraticCurveTo(s * 0.35, -1.05, s * 0.18, -1.2); c.strokeStyle = OUT; c.lineWidth = 0.12; c.stroke(); c.strokeStyle = '#efe6cf'; c.lineWidth = 0.07; c.stroke(); }
  line(c, [[0, -0.85], [0, -1.12]], hide, 0.12);   // trunk or snout
  if (T.warBeast.howdah) { c.beginPath(); c.roundRect(-0.42, -0.2, 0.84, 0.8, 0.08); fill(c, shade(c, 0, 0.2, 0.6, '#8a5a2c')); if (px > 9) line(c, [[-0.42, 0.2], [0.42, 0.2]], dark, 0.05, false); }
}
// A fortress gate seen from above: two heavy timber leaves with iron bands.
function gate(c, px) {
  c.beginPath(); c.roundRect(-0.95, -0.45, 1.9, 0.9, 0.06); fill(c, shade(c, 0, 0, 1, '#6e4a26'));
  line(c, [[0, -0.45], [0, 0.45]], '#2c1d0e', 0.06, false);
  if (px > 6) for (const x of [-0.6, -0.25, 0.25, 0.6]) line(c, [[x, -0.42], [x, 0.42]], '#7d8287', 0.07, false);
}
// A Siege Engine seen from above: a timber frame on wheels, a throwing arm (catapult, trebuchet) or a bow and bolt.
function engine(c, T, px) {
  const wood = '#7a5632', dark = '#4b331c', iron = '#8a8f96';
  for (const [x, y] of [[-0.62, -0.55], [0.62, -0.55], [-0.62, 0.55], [0.62, 0.55]]) { c.beginPath(); c.roundRect(x - 0.12, y - 0.22, 0.24, 0.44, 0.06); fill(c, dark); }
  c.beginPath(); c.roundRect(-0.5, -0.75, 1, 1.5, 0.08); fill(c, shade(c, 0, 0, 1, wood));
  if (px > 9) for (const y of [-0.4, 0, 0.4]) line(c, [[-0.5, y], [0.5, y]], dark, 0.05, false);
  if (T.siege.arcing) {   // a throwing arm and its sling, pointing forward (up)
    line(c, [[0, 0.55], [0, -0.95]], wood, 0.18);
    circle(c, 0, -0.95, 0.2); fill(c, shade(c, 0, -0.95, 0.2, '#6b6b6b'));
    line(c, [[-0.45, 0.35], [0.45, 0.35]], iron, 0.1);
  } else {   // a great bow across the front and the bolt
    c.beginPath(); c.moveTo(-0.85, -0.25); c.quadraticCurveTo(0, -0.95, 0.85, -0.25); c.strokeStyle = OUT; c.lineWidth = 0.18; c.stroke(); c.strokeStyle = dark; c.lineWidth = 0.11; c.stroke();
    line(c, [[-0.85, -0.25], [0, 0.35], [0.85, -0.25]], '#d8d0b8', 0.03, false);
    line(c, [[0, 0.45], [0, -1.0]], iron, 0.08);
    poly(c, [[0, -1.12], [-0.1, -0.9], [0.1, -0.9]]); fill(c, iron, 0.03);
  }
}
/* Draws the figure for profile T into a 2D context whose unit square (-1..1) is the base field. px = pixels per unit. */
export function drawFigure(c, T, px, part) {
  const L = lookOf(T);
  FINE = L.fine; HI = FINE && px > 30;
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (L.ghost) { c.globalAlpha = 0.8; c.shadowColor = 'rgba(160,255,190,0.9)'; c.shadowBlur = px * 0.5; }
  if (L.mount) { mounted(c, L, px, part); c.restore(); return; }
  if (T.siege) { engine(c, T, px); c.restore(); return; }
  if (T.gate) { gate(c, px); c.restore(); return; }
  if (T.chariot) { chariot(c, L, px); c.restore(); return; }
  if (T.warBeast && !/Troll/.test(T.kw)) { warBeast(c, T, px); c.restore(); return; }
  switch (L.beast === 'warg' ? 'Warg' : L.race) {
    case 'Troll': troll(c, L, px); break;
    case 'Warg': warg(c, L, px); break;
    case 'Spider': spider(c, L); break;
    case 'Ent': ent(c); break;
    case 'Drake': drake(c, L); break;
    default: infantry(c, L, px);
  }
  c.restore();
}
