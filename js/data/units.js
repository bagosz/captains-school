// Unit profiles from the 2024 army lists (MV FV SV S D A W C I, plus Might/Will/Fate for Heroes).
// mv = Move Value in inches, f = Fight Value, sh = Shoot Value (4 means 4+), s = Strength, d = Defence used in play,
// a = Attacks, w = Wounds, c / i = Courage / Intelligence (2D6 target numbers, 7 means 7+), base = base size in mm.
// pd = the printed Defence when an optional shield is added (+1 Defence); the card shows both.
// spear / pike: can Support a fighting friend; banner: re-roll in nearby Combats (see engine/combat.js).
// twoHanded: always fights with a two-handed weapon. A gear entry starting with "Shield" or "Light shield" allows Shielding.
// Special rules are listed so you can learn them, but the trainer does not simulate them yet.
// Heroes: hero, mwf = [Might, Will, Fate], heroic = the specialised Heroic Actions on the profile (every Hero also has
// Heroic Move, Shoot and Combat; see engine/heroes.js), tier = the Heroic Tier in its army list (Legend, Valour,
// Fortitude, Minor, Independent). sharpshooter: the Sharpshooter special rule (it chooses rider or mount, p. 130).
// mount: a Cavalry model's steed (its own profile; the model moves with the mount's Move and fights with the better FV, S
// and A of the two); foot: the profile the rider fights with once it has lost its mount; expertRider: re-rolls a 1 on a
// Thrown Rider Test. A 40 mm base is 1.57″ across.
export const TYPES = {
  /* ---------- Good: Rohan ---------- */
  warriorOfRohan: {
    n: 'Warrior of Rohan', kw: 'Man · Rohan · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 7, i: 6,
    gear: ['Armour', 'Hand weapon', 'Shield (option)'], rules: ['Spear Mastery'],
  },
  warriorOfRohanBow: {
    n: 'Warrior of Rohan', full: 'Warrior of Rohan with bow', kw: 'Man · Rohan · Warrior, Infantry', base: 25, icon: 'archer',
    mv: 6, f: 3, sh: 4, s: 3, d: 4, a: 1, w: 1, c: 7, i: 6,
    gear: ['Armour', 'Hand weapon', 'Bow (option)'], rules: ['Spear Mastery'], bow: { n: 'Bow', rng: 24, s: 2 },
  },
  // Spear Mastery: the throwing spears also fight as a spear (Support), unless thrown this turn.
  warriorOfRohanSpears: {
    n: 'Warrior of Rohan', full: 'Warrior of Rohan with shield and throwing spears', kw: 'Man · Rohan · Warrior, Infantry', base: 25, icon: 'spearman',
    mv: 6, f: 3, sh: 4, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 7, i: 6, spear: true,
    gear: ['Armour', 'Hand weapon', 'Shield', 'Throwing spears'], rules: ['Spear Mastery'], thrown: { n: 'Throwing Spear', rng: 8, s: 3, thrown: true },
  },
  rohanRoyalGuard: {
    n: 'Rohan Royal Guard', kw: 'Man · Rohan · Warrior, Infantry, Elite', base: 25, icon: 'veteran',
    mv: 6, f: 4, sh: 4, s: 3, d: 6, a: 1, w: 1, c: 7, i: 6,
    gear: ['Heavy armour', 'Hand weapon', 'Shield'], rules: ['Bodyguard', 'Expert Rider', 'Arise, Riders of Rohan!', 'Spear Mastery'],
  },
  captainOfRohan: {
    n: 'Captain of Rohan', kw: 'Man · Rohan · Hero, Infantry', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 4, sh: 4, s: 4, d: 5, a: 2, w: 2, c: 6, i: 6, mwf: [2, 1, 1], heroic: ['march'], tier: 'Fortitude',
    gear: ['Armour', 'Hand weapon'], rules: ['Expert Rider', 'Horse Lord'],
  },
  // Army of Edoras: Haleth and Háma, the sons of Helm Hammerhand (War of the Rohirrim profiles).
  halethPrince: {
    n: 'Haleth', full: 'Haleth, Prince of Rohan', kw: 'Man · Rohan · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 6, sh: 4, s: 4, d: 6, a: 3, w: 3, c: 4, i: 5, mwf: [3, 2, 1], heroic: ['challenge', 'resolve', 'strike'], tier: 'Valour',
    gear: ['Heavy armour', 'Hand weapon'], rules: ['Defender of Edoras', 'Expert Rider', 'Horse Lord'],
  },
  helmHammerhand: {
    n: 'Helm Hammerhand', full: 'Helm Hammerhand, King of Rohan', kw: 'Man · Rohan · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 6, sh: 4, s: 5, d: 7, a: 3, w: 3, c: 4, i: 5, mwf: [3, 3, 3], heroic: ['challenge', 'strength', 'strike'], tier: 'Legend',
    gear: ['Heavy armour', 'Hand weapon', 'Two-handed weapon'], rules: ['Into the Fray', 'Burly', 'The Hammerhand', 'Horn of the Hammerhand', 'Expert Rider', 'Horse Lord', 'Leader'],
  },
  // Théoden on foot as the BattleScribe data has him (Théoden, King of Rohan); his named rules stay on the card.
  theoden: {
    n: 'Théoden', full: 'Théoden, King of Rohan', kw: 'Man · Rohan · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 5, sh: 4, s: 4, d: 5, a: 2, w: 2, c: 5, i: 5, mwf: [3, 3, 1], heroic: ['challenge', 'march', 'strike'], tier: 'Legend',
    gear: ['Armour', 'Hand weapon'], rules: ['Expert Rider', 'Horse Lord', 'Leader (Rohan Royal Guard)', '"Forth, and Fear no Darkness"', '"The will of Men is easily corrupted"'],
  },
  hamaPrince: {
    n: 'Háma', full: 'Háma, Prince of Rohan', kw: 'Man · Rohan · Hero, Infantry, Unique', base: 25, icon: 'archer', hero: true,
    mv: 6, f: 5, sh: 3, s: 4, d: 6, a: 2, w: 2, c: 6, i: 5, mwf: [2, 3, 2], heroic: ['accuracy', 'defence'], tier: 'Valour', sharpshooter: true,
    gear: ['Heavy armour', 'Hand weapon', 'Bow'], rules: ['The Warrior Poet', 'Expert Rider', 'Horse Lord', 'Sharpshooter'], bow: { n: 'Bow', rng: 24, s: 2 },
  },

  /* ---------- Good: Rohan cavalry ---------- */
  riderOfRohan: {
    n: 'Rider of Rohan', kw: 'Man · Rohan · Warrior, Cavalry', base: 40, icon: 'rider', ht: 1.8, foot: 'riderOfRohanOnFoot', expertRider: true,
    mv: 6, f: 3, sh: 4, s: 3, d: 5, a: 1, w: 1, c: 7, i: 6,
    mount: { n: 'Horse', mv: 10, f: 2, sh: 6, s: 3, d: 4, a: 0, w: 1, c: 7, i: 7 },
    gear: ['Armour', 'Hand weapon', 'Shield', 'Bow', 'Horse'], rules: ['Expert Rider', 'Arise, Riders of Rohan!', 'Spear Mastery'], bow: { n: 'Bow', rng: 24, s: 2 },
    note: 'Cavalry: it moves 10″ (the horse\'s Move) and Difficult Terrain costs it ×4. Charging infantry it gets +1 Attack and knocks the losers Prone. An enemy may strike the horse (Defence 4) instead of the rider; a rider that loses its horse fights on, on foot, and drops the bow. Expert Rider: it re-rolls a 1 on a Thrown Rider Test, and keeps the shield\'s Defence while mounted with a bow.',
  },
  riderOfRohanOnFoot: {
    n: 'Rider of Rohan', full: 'Rider of Rohan on foot', kw: 'Man · Rohan · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 5, a: 1, w: 1, c: 7, i: 6,
    gear: ['Armour', 'Hand weapon', 'Shield'], rules: ['Spear Mastery'],
  },

  /* ---------- Good: Gondor ---------- */
  warriorOfMinasTirith: {
    n: 'Warrior of Minas Tirith', kw: 'Man · Gondor · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 4, sh: 4, s: 3, d: 6, pd: 5, a: 1, w: 1, c: 7, i: 7,
    gear: ['Heavy armour', 'Hand weapon', 'Shield (option)'], rules: ['Shieldwall'],
  },
  // 2024: a Warrior of Minas Tirith takes exactly one option, and the spear only comes as "Shield and Spear".
  warriorOfMinasTirithSpear: {
    n: 'Warrior of Minas Tirith', full: 'Warrior of Minas Tirith with spear', kw: 'Man · Gondor · Warrior, Infantry', base: 25, icon: 'spearman',
    mv: 6, f: 4, sh: 4, s: 3, d: 6, pd: 5, a: 1, w: 1, c: 7, i: 7, spear: true,
    gear: ['Heavy armour', 'Hand weapon', 'Shield and spear (option)'], rules: ['Shieldwall'],
  },
  // 2024: the banner is an option of its own, so a banner bearer has no shield.
  warriorOfMinasTirithBanner: {
    n: 'Warrior of Minas Tirith', full: 'Warrior of Minas Tirith with banner', kw: 'Man · Gondor · Warrior, Infantry', base: 25, icon: 'banner',
    mv: 6, f: 4, sh: 4, s: 3, d: 5, a: 1, w: 1, c: 7, i: 7, banner: true,
    gear: ['Heavy armour', 'Hand weapon', 'Banner (option)'], rules: ['Shieldwall'],
  },
  // From the Good Legacy list of 2024: the only Gondor infantry with a pike.
  manAtArmsOfDolAmroth: {
    n: 'Man-at-Arms of Dol Amroth', kw: 'Man · Gondor, Dol Amroth · Warrior, Infantry', base: 25, icon: 'pikeman',
    mv: 6, f: 4, sh: 4, s: 3, d: 5, a: 1, w: 1, c: 7, i: 7, pike: true,
    gear: ['Heavy armour', 'Hand weapon', 'Pike'], rules: ['Pride of Dol Amroth'],
  },
  rangerOfGondor: {
    n: 'Ranger of Gondor', kw: 'Man · Gondor · Warrior, Infantry', base: 25, icon: 'scout',
    mv: 6, f: 4, sh: 3, s: 3, d: 4, a: 1, w: 1, c: 7, i: 6,
    gear: ['Armour', 'Hand weapon', 'Bow'], rules: ['Woodland Creature'], bow: { n: 'Bow', rng: 24, s: 2 },
  },

  /* ---------- Good: Wizards ---------- */
  // Gandalf the White as the BattleScribe data has him, with two of his nine powers (mission 27 teaches Casting with
  // them) and no Staff of Power, Narya or Glamdring.
  gandalfWhite: {
    n: 'Gandalf the White', kw: 'Wizard · Fellowship · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 6, sh: 4, s: 4, d: 6, a: 3, w: 3, c: 3, i: 3, mwf: [3, 6, 3], heroic: ['channelling', 'defence', 'resolve', 'strike'], tier: 'Legend',
    gear: ['Hand weapon'], rules: [], powers: [{ n: 'Sorcerous Blast', cast: 5, rng: 12 }, { n: 'Transfix', cast: 3, rng: 12 }],
  },
  // The same with his Staff of Power and three of his powers (mission 29: Your Staff is Broken against Saruman).
  gandalfWhiteStaff: {
    n: 'Gandalf the White', kw: 'Wizard · Fellowship · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 6, sh: 4, s: 4, d: 6, a: 3, w: 3, c: 3, i: 3, mwf: [3, 6, 3], heroic: ['channelling', 'defence', 'resolve', 'strike'], tier: 'Legend',
    gear: ['Staff of Power'], rules: [],
    powers: [{ n: 'Your Staff is Broken', cast: 5, rng: 12 }, { n: 'Sorcerous Blast', cast: 5, rng: 12 }, { n: 'Transfix', cast: 3, rng: 12 }],
  },

  /* ---------- Evil: Usurpers of Edoras (Dunland) ---------- */
  hillTribesman: {
    n: 'Hill Tribesman', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'orc',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8,
    gear: ['Hand weapon'], rules: ['Hatred (Rohan)'],
  },
  hillTribesmanBow: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with bow', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'archer',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8,
    gear: ['Hand weapon', 'Bow (option)'], rules: ['Hatred (Rohan)'], bow: { n: 'Bow', rng: 24, s: 2 },
  },
  // The other options of the Battle of Edoras box. A flaming brand: Terror (Cavalry) and Terror (Beast); in the box's
  // scenarios it also counts as 2 models near an Objective Marker (missions with brandDominant; named.js: dominance).
  hillTribesmanShield: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with light shield', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8,
    gear: ['Hand weapon', 'Light shield'], rules: ['Hatred (Rohan)'],
  },
  hillTribesmanBrand: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with flaming brand', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8,
    gear: ['Hand weapon', 'Flaming brand'], rules: ['Hatred (Rohan)', 'Terror (Cavalry)', 'Terror (Beast)'],
  },
  hillTribesmanBrandShield: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with light shield and flaming brand', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8,
    gear: ['Hand weapon', 'Light shield', 'Flaming brand'], rules: ['Hatred (Rohan)', 'Terror (Cavalry)', 'Terror (Beast)'],
  },
  hillTribesmanSpear: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with spear', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'spearman',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8, spear: true,
    gear: ['Hand weapon', 'Spear'], rules: ['Hatred (Rohan)'],
  },
  hillTribesmanTwoHanded: {
    n: 'Hill Tribesman', full: 'Hill Tribesman with two-handed weapon', kw: 'Man · Dunland · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 3, a: 1, w: 1, c: 7, i: 8, twoHanded: true,
    gear: ['Hand weapon', 'Two-handed weapon'], rules: ['Hatred (Rohan)'],
  },
  hillTribesChieftain: {
    n: 'Hill Tribes Chieftain', kw: 'Man · Dunland · Hero, Infantry', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 4, sh: 4, s: 4, d: 4, a: 2, w: 2, c: 6, i: 7, mwf: [2, 1, 1], heroic: ['march'], tier: 'Fortitude',
    gear: ['Hand weapon'], rules: ['Hatred (Rohan)'],
  },
  generalTargg: {
    n: 'General Targg', kw: 'Man · Dunland · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 5, sh: 4, s: 4, d: 5, a: 2, w: 2, c: 6, i: 4, mwf: [2, 2, 2], heroic: ['defence', 'march'], tier: 'Fortitude',
    gear: ['Armour', 'Hand weapon'], rules: ['Dunlending Commander', 'Hatred (Rohan)', 'Master of Battle (4+)'],
  },
  wulf: {
    n: 'Wulf', kw: 'Man · Dunland · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 6, sh: 3, s: 4, d: 5, a: 3, w: 3, c: 5, i: 5, mwf: [3, 3, 2], heroic: ['challenge', 'strength', 'strike'], tier: 'Valour',
    gear: ['Armour', 'Hand weapon'], rules: ['General Hunter', 'Hatred (Rohan)', 'The Usurper King'],
  },
  freca: {
    n: 'Freca', full: 'Freca, Lord of the Westmarch', kw: 'Man · Dunland · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 5, sh: 4, s: 4, d: 6, a: 2, w: 2, c: 6, i: 6, mwf: [3, 2, 0], heroic: ['challenge', 'strength'], tier: 'Valour',
    gear: ['Heavy armour', 'Hand weapon'], rules: ['Hatred (Rohan)', 'Dunlending Heritage', 'Claim the Throne'],
  },
  rohirrimTraitor: {
    n: 'Rohirrim Traitor', kw: 'Man · Rohan · Warrior, Infantry', base: 25, icon: 'warrior',
    mv: 6, f: 3, sh: 4, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 7, i: 6,
    gear: ['Armour', 'Hand weapon', 'Shield (option)'], rules: ['Hatred (Rohan)', 'Spear Mastery'],
  },

  /* ---------- Evil: Isengard ---------- */
  // Saruman as the BattleScribe data has him, with two of his eight powers (mission 29); Voice of Curunir and Saruman's
  // Deceit stay on the card.
  saruman: {
    n: 'Saruman', kw: 'Wizard · Isengard · Hero, Infantry, Unique', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 5, sh: 4, s: 4, d: 5, a: 1, w: 3, c: 3, i: 3, mwf: [3, 6, 3], heroic: ['channelling', 'defence'], tier: 'Legend',
    gear: ['Staff of Power'], rules: ['Voice of Curunir', 'Saruman\'s Deceit'],
    powers: [{ n: 'Transfix', cast: 3, rng: 18 }, { n: 'Sorcerous Blast', cast: 5, rng: 12 }],
  },
  urukHaiShaman: {
    n: 'Uruk-hai Shaman', kw: 'Uruk-hai · Isengard · Hero, Infantry', base: 25, icon: 'captain', hero: true,
    mv: 6, f: 4, sh: 4, s: 4, d: 4, a: 1, w: 2, c: 6, i: 6, mwf: [1, 3, 1], heroic: ['channelling'], tier: 'Minor',
    gear: ['Spear', 'Hand weapon'], rules: [], spear: true,
    powers: [{ n: 'Fury (Isengard Uruk-hai)', cast: 3, rng: 0 }, { n: 'Bladewrath', cast: 4, rng: 6 }, { n: 'Transfix', cast: 5, rng: 12 }],
  },
  urukHaiWarrior: {
    n: 'Uruk-hai Warrior', kw: 'Uruk-hai · Isengard · Warrior, Infantry', base: 25, icon: 'armoured',
    mv: 6, f: 4, sh: 4, s: 4, d: 6, pd: 5, a: 1, w: 1, c: 7, i: 7,
    gear: ['Heavy armour', 'Hand weapon', 'Shield (option)'], rules: ['Shieldwall'],
  },
  urukHaiCrossbow: {
    n: 'Uruk-hai Warrior', full: 'Uruk-hai Warrior with crossbow', kw: 'Uruk-hai · Isengard · Warrior, Infantry', base: 25, icon: 'crossbowman',
    mv: 6, f: 4, sh: 4, s: 4, d: 5, a: 1, w: 1, c: 7, i: 7,
    gear: ['Heavy armour', 'Hand weapon', 'Crossbow (option)'], rules: ['Shieldwall'], bow: { n: 'Crossbow', rng: 24, s: 4, still: true },
  },
  isengardOrcShield: {
    n: 'Isengard Orc Warrior', full: 'Isengard Orc Warrior with shield', kw: 'Orc · Isengard · Warrior, Infantry', base: 25, icon: 'orc',
    mv: 6, f: 3, sh: 5, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 8, i: 8,
    gear: ['Armour', 'Hand weapon', 'Shield (option)'], rules: [],
  },
  // It carries a hand weapon too, so on the table it could choose; here it always swings the two-handed weapon.
  isengardOrcTwoHanded: {
    n: 'Isengard Orc Warrior', full: 'Isengard Orc Warrior with two-handed weapon', kw: 'Orc · Isengard · Warrior, Infantry', base: 25, icon: 'orc',
    mv: 6, f: 3, sh: 5, s: 3, d: 4, a: 1, w: 1, c: 8, i: 8, twoHanded: true,
    note: 'Two-handed weapon: −1 on each of its Duel Roll dice (a natural 6 stays a 6), +1 on its To Wound rolls. It always fights with it.',
    gear: ['Armour', 'Hand weapon', 'Two-handed weapon (option)'], rules: [],
  },

  // 2024: a Warg Rider must take one option; here it carries the shield (Defence 4 on the profile, 5 with it).
  isengardWargRider: {
    n: 'Warg Rider', kw: 'Orc · Isengard · Warrior, Cavalry', base: 40, icon: 'wargrider', ht: 1.7, foot: 'isengardWargRiderOnFoot',
    mv: 6, f: 3, sh: 5, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 8, i: 8,
    mount: { n: 'Warg', mv: 10, f: 3, sh: 6, s: 4, d: 4, a: 1, w: 1, c: 8, i: 8, loose: 'warg' },
    gear: ['Armour', 'Hand weapon', 'Shield (option)', 'Warg'], rules: [],
    note: 'Cavalry on a Warg: it fights with the Warg\'s Strength 4 and moves 10″. A Warg that loses its rider stays and fights on if it passes a Courage Test (2D6, 8+).',
  },
  isengardWargRiderOnFoot: {
    n: 'Warg Rider', full: 'Warg Rider on foot', kw: 'Orc · Isengard · Warrior, Infantry', base: 25, icon: 'orc',
    mv: 6, f: 3, sh: 5, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 8, i: 8,
    gear: ['Armour', 'Hand weapon', 'Shield (option)'], rules: [],
  },
  warg: {
    n: 'Warg', kw: 'Warg · Isengard · Mount', base: 40, icon: 'warg', ht: 1.2, mountModel: true,
    mv: 10, f: 3, sh: 6, s: 4, d: 4, a: 1, w: 1, c: 8, i: 8,
    gear: ['Fangs'], rules: [], note: 'A Warg that lost its rider: it stays and fights on its own.',
  },

  /* ---------- Evil: Mordor ---------- */
  mordorOrc: {
    n: 'Mordor Orc Warrior', kw: 'Orc · Mordor · Warrior, Infantry', base: 25, icon: 'orc',
    mv: 6, f: 3, sh: 5, s: 3, d: 5, pd: 4, a: 1, w: 1, c: 8, i: 8,
    gear: ['Armour', 'Hand weapon', 'Shield (option)'], rules: [],
  },
  mordorOrcSpear: {
    n: 'Mordor Orc Warrior', full: 'Mordor Orc Warrior with spear', kw: 'Orc · Mordor · Warrior, Infantry', base: 25, icon: 'spearman',
    mv: 6, f: 3, sh: 5, s: 3, d: 4, a: 1, w: 1, c: 8, i: 8, spear: true,
    gear: ['Armour', 'Hand weapon', 'Spear (option)'], rules: [],
  },
  mordorOrcBow: {
    n: 'Mordor Orc Warrior', full: 'Mordor Orc Warrior with Orc bow', kw: 'Orc · Mordor · Warrior, Infantry', base: 25, icon: 'archer',
    mv: 6, f: 3, sh: 5, s: 3, d: 4, a: 1, w: 1, c: 8, i: 8,
    gear: ['Armour', 'Hand weapon', 'Orc bow (option)'], rules: [], bow: { n: 'Orc bow', rng: 18, s: 2 },
  },
  mordorTroll: {
    n: 'Mordor Troll', kw: 'Troll · Mordor · Warrior, Infantry, Monster', base: 60, icon: 'troll', monster: true,
    mv: 6, f: 7, sh: 5, s: 7, d: 7, a: 3, w: 4, c: 6, i: 8,
    gear: ['Armour', 'Hand-and-a-half weapon'], rules: ['Dominant (3)', 'Terror', 'Throw Stones (range 12″, Strength 8)'],
  },
};

// Base radius in inches: 25 mm bases are treated as 1″ across, larger bases are converted from millimetres.
export const baseRadius = T => (T.base === 25 ? 0.5 : T.base / 50.8);
