# Changelog

All notable changes to Captain's School. Format after [Keep a Changelog](https://keepachangelog.com/), versions after
[Semantic Versioning](https://semver.org/) (0.x: anything may still change). The game shows the same notes in the menu
("What's new"), from `js/data/version.js`; keep both in step when releasing.

## How to release a version

1. Move the items under **Unreleased** to a new version heading with today's date.
2. Copy them to `NOTES` in `js/data/version.js` (player-facing wording, newest first) and set `VERSION` and `RELEASED`;
   update `KNOWN_ISSUES`. Set the same version in `package.json`.
3. Run the checks: `node tools/hero-check.mjs`, `node tools/los-check.mjs`, `node tools/geom-check.mjs`,
   `node tools/matched-check.mjs 2 150`, `node tools/glossary-check.mjs`, and `node tools/balance.mjs 500 <n>` for every
   changed mission (75% or more; not for E1–E4).
4. `npm run build` for the single-file copy in `dist/`, then commit with the message `Release <version>` and tag it:
   `git tag v<version>`.

## [Unreleased]

## [0.6.0-alpha.2] - 2026-10-15 - Alpha 2: Magic

### Added
- Chapter VI, Magic: 27 The White Rider (Casting), 28 The Shaman's Fury (Resisting) and the finale 29 The Breaking of the Staff (Staff of Power, Your Staff is Broken, Heroic Channelling).
- New mission 11 Spears of the Westfold: throwing spears on the Charge and Spear Mastery.
- New mission 19 The King's Guard: Bodyguard in a Broken army, against an Uruk-hai Shieldwall.
- Heroes: 24 Unbreakable (Heroic Defence against Heroic Strength), 25 The Challenge (Heroic Challenge), 26 The Hammerhand (Into the Fray).
- The Battle of Edoras from either side: play Rohan or the Hill Tribes.
- Missions from 11 on are numbered anew; completed missions stay ticked (they are saved by name).
- Curving rivers, terrain drawn in the token style, and a dice tray that stays in one place.

## [0.5.0-alpha.1] - 2026-10-15 - Alpha 1: Heroes take the field

First alpha: the game is playable from the first mission to the last, and every chapter of the Rules Manual the game
can play is in the rules engine. See `docs/alpha.md` for the readiness review.

### Added
- Mission 21 Through the Line: Heroic Combat and Heroic Strike (Haleth against Wulf); Duel Rolls won and lost are counted.
- Turned terrain pieces: walls, hedges, doorways, Elevated Positions and houses at any angle; the Battle of Edoras houses
  turned as on the booklet maps.
- Portrait detail on Rohan and Hill Tribes figures when zoomed in.
- Version number, release notes and known issues in the menu ("What's new").

### Changed
- No text labels on terrain pieces (EXIT, ESCAPE and GATE zones keep theirs).
- Rectangle tests in the engine use one shared geometry module.

## [0.4.0] - 2026-10-14 - The Battle of Edoras

### Added
- Side campaign E1–E4: the four Narrative Scenarios of the starter booklet with its forces, 36″ mat, houses, markers and
  deployment zones.
- Missions 17 Stand Fast! (Terror, Broken army), 18 With Me! (Heroic Move), 19 At the Double! (Heroic March),
  20 Loose! (Heroic Shoot, Heroic Accuracy).
- Rohan and Hill Tribes tokens drawn like painted minis from above; cavalry mounts face the way they move.

### Fixed
- Bases snap into contact more reliably; Control Zones on stairs.

## [0.3.0] - 2026-10-14 - New interface

### Added
- Detail levels (Guided, Standard, Full table), folding rule chips, reference column (Log, Rules, To Wound, Armies,
  Scenario), comparison card, status tokens, Engaged rings, Hero auras, measuring tape, "look from here", turn ladder,
  undo of moves, a dice tray in the side panel.

## [0.2.0] - 2026-10-14 - The whole rulebook in the engine

### Added
- Special rules from profiles, army rules, named Heroes and named wargear.
- Magic, Monsters (Brutal Power Attacks), water, night and Sentries, Last Stand.
- Siege Engines, sieges, Chariots, War Beasts, the One Ring.
- Matched play scenarios (Domination, Hold Ground, Destroy the Supplies, Reconnoitre, Fog of War); cavalry and Heroes in
  the army lists; Line of Sight in 3D.

### Fixed
- Audit before the missions: one spear Support per model, slain riders count for Break Points, and more
  (`docs/engine-gaps.md`).

## [0.1.0] - 2026-10-13 - Prototype

### Added
- Missions 1–16: moving, shooting, fighting, formations, terrain, cavalry and Courage.
- Matched play from the 2024 army lists with an army builder; generated sounds and music.
