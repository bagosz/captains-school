// Version, release notes and known issues, shown in the mission menu ("What's new").
// Keep CHANGELOG.md in step with NOTES when a version is released (the newest first in both).
export const VERSION = '0.6.0-alpha.2';
export const STAGE = 'Alpha';
export const RELEASED = '2026-10-15';

export const NOTES = [
  {
    version: '0.6.0-alpha.2', date: '2026-10-15', title: 'Alpha 2: Magic',
    items: [
      'Chapter VI, Magic: 27 The White Rider (Casting), 28 The Shaman\'s Fury (Resisting) and the finale 29 The Breaking of the Staff (Staff of Power, Your Staff is Broken, Heroic Channelling).',
      'New mission 11 Spears of the Westfold: throwing spears on the Charge and Spear Mastery.',
      'New mission 19 The King\'s Guard: Bodyguard in a Broken army, against an Uruk-hai Shieldwall.',
      'Heroes: 24 Unbreakable (Heroic Defence against Heroic Strength), 25 The Challenge (Heroic Challenge), 26 The Hammerhand (Into the Fray).',
      'The Battle of Edoras from either side: play Rohan or the Hill Tribes.',
      'Missions from 11 on are numbered anew; completed missions stay ticked (they are saved by name).',
      'Curving rivers, terrain drawn in the token style, and a dice tray that stays in one place.',
    ],
  },
  {
    version: '0.5.0-alpha.1', date: '2026-10-15', title: 'Alpha 1: Heroes take the field',
    items: [
      'First alpha. Every chapter of the Rules Manual the game can play is in the rules engine; the campaign teaches the basics, terrain, cavalry, Courage and the first Heroic Actions.',
      'New mission 21 Through the Line: Haleth cuts through a line of Hill Tribesmen to win a Duel Roll against Wulf (Heroic Combat and Heroic Strike).',
      'Turned terrain: walls, hedges, doorways and houses stand at any angle, and the Battle of Edoras houses are turned as on the booklet maps.',
      'Cleaner table: no text labels on terrain (EXIT, ESCAPE and GATE zones keep theirs).',
      'Portrait detail on Rohan and Hill Tribes figures when you zoom in.',
      'Version number and these notes in the menu.',
    ],
  },
  {
    version: '0.4.0', date: '2026-10-14', title: 'The Battle of Edoras',
    items: [
      'The four Narrative Scenarios of the starter booklet as a side campaign E1 to E4, with the booklet\'s forces, 36″ mat, houses, markers and deployment zones.',
      'Missions 17 to 20: Stand Fast! (Terror and a Broken army), With Me! (Heroic Move), At the Double! (Heroic March), Loose! (Heroic Shoot and Heroic Accuracy).',
      'Rohan and Hill Tribes tokens drawn like painted minis seen from above: wargear, faces, cloaks and shields at a glance.',
      'Cavalry mounts turn to the way the model moves.',
    ],
  },
  {
    version: '0.3.0', date: '2026-10-14', title: 'New interface',
    items: [
      'Detail levels Guided, Standard and Full table; rule chips fold into "Rules in play".',
      'Reference column with Log, Rules, To Wound, Armies and Scenario tabs; the dice log grouped by turn and phase.',
      'Comparison card, status tokens, Engaged rings, Hero auras, a measuring tape and "look from here".',
      'Turn ladder and one Menu in the top bar; undo of moves until the first dice of the Move step.',
    ],
  },
  {
    version: '0.2.0', date: '2026-10-14', title: 'The whole rulebook in the engine',
    items: [
      'Special rules from the profiles, army rules and the rules of named Heroes and wargear.',
      'Magic (Casting, Resist, Channelling, the Magical Powers), Monsters (Rend, Barge, Hurl), water, night and Sentries.',
      'Siege Engines, sieges with walls, gates and Siege Ladders, Chariots, War Beasts and the One Ring.',
      'Matched play scenarios: Domination, Hold Ground, Destroy the Supplies, Reconnoitre and Fog of War; cavalry and Heroes in the army lists.',
      'Line of Sight in 3D, with the heights of models and terrain.',
    ],
  },
  {
    version: '0.1.0', date: '2026-10-13', title: 'Prototype',
    items: [
      'Missions 1 to 16: moving, shooting, fighting, formations, terrain, cavalry and Courage.',
      'Matched play battles from the 2024 army lists, with an army builder.',
    ],
  },
];

// Shown under the notes so players know what is not finished yet.
export const KNOWN_ISSUES = [
  'Monsters (Brutal Power Attacks) are in the engine but no mission teaches them yet; try them in matched play or the Heroes sandbox.',
  'A game in progress is not saved: closing the page ends it (completed missions are kept).',
  'Some rare rules are simplified or missing; the list is in docs/engine-gaps.md.',
  'A few matched play pairings can end without a result when neither army can reach the other.',
];
