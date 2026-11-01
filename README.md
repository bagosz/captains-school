# Captain's School: learn to play Middle-earth Strategy Battle Game (MESBG 2024)

**A free browser game that teaches the rules of the current edition of Middle-earth Strategy Battle Game (MESBG,
the 2024 Rules Manual with the latest FAQ and errata), one rule per mission.** Move, Control Zones, Charges, shooting and
In The Way, Duel Rolls, To Wound, Backing Away and Trapped, spears and Supporting, Courage, Heroes with Might, Will and Fate,
Heroic Actions, cavalry, Monsters and Magic: each mission teaches one rule on a real battlefield against the computer, with
the dice, the odds and the rule text right beside the board.

- **Play in the browser:** https://bagosz.github.io/captains-school/
- **Download (one HTML file, works offline, open it by double-click):**
  https://github.com/bagosz/captains-school/releases/latest/download/captains-school.html
- All versions and release notes: https://github.com/bagosz/captains-school/releases

Who it is for: new players learning MESBG before their first game, players coming back from an older edition who want
the 2024 changes, and anyone who wants to check how a rule plays out (Who wins a Duel Roll? When does a model Back Away?
What is In The Way?). Units are real 2024 profiles (MV FV SV S D A W C I, Might/Will/Fate) from Rohan, Gondor, the Hill
Tribes, Isengard and Mordor; the Battle of Edoras starter scenarios are in too, and Matched Play battles use every 2024
army list the game can play, with points and special rules.

In-game rule links point to the fan copy of the Rules Manual at https://prancingponypub.ru/mesbg2024/rules_manual/.
Unofficial fan project, alpha (version 0.6.0-alpha.2): see the disclaimer at the end. Bugs and rule questions: open an issue.

Also known as: MESBG rules trainer, MESBG tutorial, Middle-earth SBG rules practice, Lord of the Rings wargame rules,
learn to play Middle-earth Strategy Battle Game.

Custom token art (for example photos of your own painted miniatures) goes in `assets/tokens/`; see the README there.

Music and sound effects are generated in the browser (no audio files). Switch them off in Options (the button at the top).

## Versions

Release notes are in `CHANGELOG.md` and in the game menu (What's new, from `js/data/version.js`); how to release a
version is at the top of the changelog. The alpha readiness review and the road to beta: `docs/alpha.md`.

## Options

The Options button at the top (also linked from the mission list and the dice tray) opens one dialog for every switch; the choices are kept in the browser:

- Detail: Guided (the default: panels you do not need yet stay folded or hidden), Standard (panels open once a mission has taught what they show), or Full table (every panel open from the start, as at the table). So far it decides the To Wound tab (hidden until a mission has taught To Wound rolls, always there on Full table) and the rule chips (on Guided they fold into one "Rules in play" button with their number, which pulses once when a new rule turns up). The plan for the rest is `docs/ui-redesign.md`.
- Table: Show odds (chances in percent) and the archer's ruler: while you move a model with a bow, lines of fire run from the spot you point at to every enemy in range (green: a clear shot, with diamonds on what is In The Way; red: in range but no shot), a pill sums them up, and the panel lists each target with its To Hit roll, or says why the model could not shoot from there at all (moved more than half its Move, a crossbow after a move).
- Dice: One by one, Rolling animation, and Auto roll: no Roll button at all, every roll is thrown as soon as it is due, and a banner re-roll picks the best dice by itself; the order of Combats, Shielding and Strikes are still the player's.
- Let the app decide: Auto Pair Off (the app splits the fights and picks their order when the player has Priority), Auto Back Away (the app picks where the player's losers Back Away, and whether a friend Makes Way), Auto Make Way (the player picks among free spots; when only a Make Way would make room the app does it), and AI plays for you (the computer takes every decision for the player's side, with the same planner the enemy uses; a tag in the top bar hands the game back). Switching one on while the game waits for that step takes effect at once.
- Sound: Music and Sounds.

## Run locally

Requires Node.js 18 or newer. No packages to install.

```
npm start
```

Then open http://localhost:8765. Use another port with `PORT=9000 npm start` (PowerShell: `$env:PORT=9000; npm start`).

## Files

The code is split so the rules never touch drawing. A different renderer (for example 3D) can replace `js/ui/board.js` and `js/ui/tokens.js` while the engine stays as it is.

| Path | What it is |
|---|---|
| `index.html` | Page markup: top bar, board canvas, reference column (tabs), side panel, menu and dialogs |
| `css/style.css` | All styles, light and dark theme tokens |
| `js/main.js` | Entry point: wires the modules together and runs the render loop |
| `js/state.js` | Shared game state (`G`), the abort counter and `sleep` |
| `js/util.js` | Small helpers: formatting, dice, seeded random, rounded rectangles |
| `js/data/units.js` | Unit profiles (Move, Fight, Strength, Defence, Attacks, Wounds, weapons) |
| `js/data/rules-text.js` | Rule summaries for chips and cards, with Rules Manual links |
| `js/data/lessons.js` | "New rule" popups: how each rule works, how to use it, where to click in the game, a small diagram and a line about the table right now |
| `js/data/missions.js` | The missions: chapter, map, units, objective, win check, debrief; and the heroes sandbox (`SANDBOX`, not in the mission list) |
| `js/data/army-lists.js` | Matched play armies: every 2024 army list with the Warriors the game can play, their profiles, points, options and special rules. Generated by `tools/import-armies.mjs`, do not edit by hand |
| `js/engine/geometry.js` | Distances and shapes in inches |
| `js/engine/rules.js` | Rules engine: moving, Control Zones, charging, Line of Sight, shooting step by step (`shotSeq`) and its odds (and the archer's ruler: shots from a planned spot), To Wound chart, Back Away spots and Make Way |
| `js/engine/combat.js` | Fights: Pairing Off, Supporting with spears, Duel Roll odds and dice, the Duel Roll's re-rolls and Might bidding (`duelSeq`), Backing Away, Trapped, Strikes, Wounds after Fate |
| `js/engine/dice.js` | Rolling procedures shared by the game and the tools: a D6 test, To Wound, Fate, Courage, each step by step in the order of the 2024 rules (re-rolls, then Might last), with odds that count Might |
| `js/engine/magic.js` | Magic: Casting and Resist Tests, Heroic Channelling, the durations of powers in play (G.spells), what each Magical Power does, Will of Evil, the computer's Casts and Resists |
| `js/engine/monsters.js` | Monsters: Monstrous Charge, Brutal Power Attacks (Rend, Barge, Hurl, Hurl's Throw), free Strikes at a slain model's supporters |
| `js/engine/advanced.js` | Advanced rules: Sentries (the Sentry Chart, the alarm) |
| `js/engine/narrative.js` | Narrative Scenario rules (Battle of Edoras booklet): Storehouses set alight and put out, slain models coming back as Reinforcements (Hordes); escaping off any edge is in scenarios.js |
| `js/engine/beasts.js` | Chariots and War Beasts: the Chariot Charge and Trample in a straight line, Impact Hits, Immovable Object, knocking the beaten Prone, a War Beast's Commander and Stampede; the computer's headings |
| `js/engine/fortress.js` | Sieges: the Grand Siege's fortress, gates, Siege Ladders (raising, fighting up and pushing them down), the computer's siege goals |
| `js/engine/scenarios.js` | Matched play scenarios: Objective Markers, Supply Markers, Reinforcements, escaping, the Victory Points of each scenario, the computer's scenario goals |
| `js/engine/siege.js` | Siege Engines: crew, range, Arc of Sight, To Hit, the Scatter Table, To Wound and the engines' rules, disabling one; the computer's shots |
| `js/engine/heroes.js` | Heroes: the Heroic Actions, the Declare Heroic Actions step, the D6 for the order of opposing Heroic Moves, Shoots and Combats, shouts (With Me, At the Double, Loose, Take Aim), Heroic Challenges, Stand Fast |
| `js/engine/sim.js` | The whole turn sequence without drawing, with a "brain" deciding for each side (a mission strategy or the computer): the balance tool, matched-check and hero-check play with it |
| `js/engine/terrain.js` | Terrain heights: raised ground, cliffs and gaps, Obstacles; Jump, Leap and Climb Tests, falls and Falling Damage |
| `js/engine/terrain-types.js` | The terrain library: every kind of terrain piece with its rulebook category, height, effect on moving and on Line of Sight, rule links and the code that carries it out |
| `js/engine/setup.js` | Builds a mission's models (shared by the game and the balance tool) |
| `js/engine/matched.js` | Matched play: army points and bow limits, random armies, the table (terrain, deployment zones, ranks) and the To the Death! scoring |
| `js/engine/ai.js` | Enemy decisions (charge, approach, guard a post, pick shots; spears and pikes step in behind fighting friends, banners follow the line); the same planner plays the player's side with AI plays for you |
| `js/game/flow.js` | Turn sequence, actions (move, shoot, fight) and the enemy turn; plays the engine's rolling procedures with the dice tray and the player's buttons (`play()`) |
| `js/ui/board.js` | Battlefield canvas: mat, terrain, overlays, effects; the camera for zooming in (up to 8x) and moving the view |
| `js/ui/tokens.js` | Token art: bevelled bases in the side's colour, with the unit's figure or a custom image inside; the Engaged ring, Wound and mount pips, Might/Will/Fate pips under Heroes, and the status tokens beside the base (a "+n" badge when the base is small on screen) |
| `js/ui/status.js` | The one list of model states (`statusOf`) and the status tokens (`TOKENS`: clock position, colour, rule, detail level; `tokensOf`) |
| `js/ui/compare.js` | The comparison card in the panel: the selected model and the one under the pointer side by side, with the numbers of the phase, pips and states |
| `js/ui/figures.js` | The figures on the tokens: a miniature seen from above, drawn from the profile. The race and faction (keywords) pick the body, head, helmet and colours; the wargear picks what it holds (shield, sword or axe, spear, pike, bow, crossbow, banner, two-handed weapon); trolls, wargs, spiders and Ents have shapes of their own |
| `js/ui/tray.js` | Dice tray with rolling dice; with One by one (the default, in Options) the player throws their own dice one at a time |
| `js/ui/panel.js` | Side panel: orders, rule chips, model card (comparison card, Details with the full profile, key I); the dice log and its records; the mission card (left of the board, at the bottom) |
| `js/ui/reference.js` | The reference column beside the board, in tabs: Log, Rules (in play now, effects on the table such as spells and Heroic Actions, every rule with a search; a rule chip opens its entry here), To Wound chart, Armies (both sides with Wounds, Might/Will/Fate, states, losses against the Break Point, the models removed; pointing at a row shows the model), Scenario (briefing, the mission's rules, Victory Points in matched play) |
| `js/ui/columns.js` | Drag handles between the columns: resize the left column and the side panel, widths remembered in the browser |
| `js/ui/input.js` | Mouse and touch on the board; zoom with the mouse wheel, a pinch, the zoom buttons or + − 0, move the view by dragging the table (or the middle button, or the arrow keys) |
| `js/ui/menu.js` | Mission list, briefings, results, saved progress |
| `js/ui/options.js` | The Options dialog: odds, the archer's ruler, dice, the steps the app may play for the player (or the whole side), sound |
| `js/ui/army.js` | Matched play: army builder, battle briefing, Victory Points at the end |
| `js/ui/lessons.js` | Shows a "New rule" popup the first time a rule comes into play, and remembers which were seen; the first time a new control is needed (Shield, a banner re-roll, Pairing Off on the table…) it pulses for a few seconds |
| `js/ui/audio.js` | Music and sound effects, synthesised with the Web Audio API (no audio files): a cavalry battle score in 12/8 that gallops harder in the Fight phase, a horn call and fiddle lament for menus, dice, bows, blades, horns |
| `dev/tokens.html` | Token sheet for working on token art, every unit type at the sizes the board uses: http://localhost:8765/dev/tokens.html (add `?grid&r=64&q=rohan` for a big grid of one faction) |
| `dev/sounds.html` | Sound sheet: plays every sound effect and both pieces of music, with a level meter: http://localhost:8765/dev/sounds.html |
| `server.js` | Zero-dependency static server for localhost |
| `tools/build-single.js` | Packs the game into one HTML file: `npm run build` writes `dist/captains-school.html` |
| `tools/los-check.mjs` | Line of Sight check: shots through every kind of terrain, on raised ground and at a fortress wall, for the player and the computer |
| `tools/geom-check.mjs` | Geometry check for turned terrain pieces (`a`): no angle gives the old results bit for bit, a piece turned 90° plays like one with w and h swapped (moving, Control Zones, Line of Sight, charging, defending), walls and doors at 45° |
| `tools/balance.mjs` | Balance check: plays each mission hundreds of times with a sensible strategy and prints the win rate |
| `tools/import-armies.mjs` | Builds `js/data/army-lists.js` from the BattleScribe data of the 2024 army lists (see Matched play) |
| `tools/matched-check.mjs` | Matched play check: every army list fights random battles, the computer on both sides; reports errors and battle length |
| `tools/hero-check.mjs` | Hero check: the order of the hero rules step by step with loaded dice (Declare Heroic Actions, the order D6, Duel Roll re-rolls and Might bidding, To Wound, Fate, shooting with Heroic Accuracy, Courage, Stand Fast), then sandbox battles with the computer on both sides: `node tools/hero-check.mjs 300` |
| `docs/rules/` | The Rules Manual 2024 text with the FAQ and errata (fan copy, one file per chapter, `all.md` for grep) and the official FAQ PDF as text; refreshed by `py -3.13 tools/fetch-rules.py [FAQ.pdf]` |
| `docs/edoras/` | The Battle of Edoras starter booklet (scanned PDF) as Markdown: one file per section (four scenarios, profiles, gameplay summary), `all.md` for grep, page pictures of the maps in `img/`; made by `py -3.13 tools/convert-edoras.py [PDF]`. Copyrighted: in `.gitignore`, never pushed |
| `docs/engine-gaps.md` | What the rules engine still lacks against the Rules Manual, in order of priority |
| `docs/heroes-engine.md` | Heroes in the engine: the order of every phase and roll, each Heroic Action, interpretations, how a mission switches them on |
| `tools/glossary-check.mjs` | Glossary check: the short texts of rule terms (`ruleShort`) stay under 30 words and no two entries claim the same term |
| `docs/curriculum.md` | Plan of all missions, chapter by chapter |
| `docs/ui-redesign.md` | UI plan: less text on screen, nothing from the table lost; research on similar games, detail levels, order of work |
| `docs/matched-play.md` | Matched play: what it does, how the 2024 rules were adapted, what comes next |

The game uses ES modules, so open it through the server, not by double-clicking `index.html`.

## Share with friends

`npm run build` writes `dist/captains-school.html`: the whole game in one file that opens by double-click, no server or Node needed.
Send that file, or upload it to any static host (for example Netlify Drop or GitHub Pages) for a link.
Rebuild it after every change. Custom token art from `assets/tokens/` is not included in the single file.

The build strips all comments and indentation, embeds each module as its own module (an import map of data: URLs),
checks that every module still parses, and stops if the file would contain a local path or a name from the
`BANNED` list in the build script. The shared file saves options, lessons seen and progress under its own
prefix (`SAVE_PREFIX`), apart from the localhost copy; raise its number to start everyone who opened an earlier
file from the default options, with every rule popup shown again.
Check the built file over HTTP with the `single-file-check` preview (http://localhost:8766/dist/captains-school.html).

## Missions

All missions use real 2024 profiles, in the spirit of the Battle for Edoras starter: Rohan and Gondor against the Usurpers of Edoras, with Isengard and Mordor guests.

Chapter I, Basics. Each mission adds one or two rules to the ones before and uses nothing it has not taught:

1. The Scout: moving, Difficult Terrain, Control Zones (Ranger of Gondor past Hill Tribesmen sentries; no shooting or fighting yet)
2. Hail of Arrows: moving and shooting, Roll To Hit, In The Way (Warriors of Rohan with bows and a Ranger of Gondor)
3. Armour Matters: the To Wound chart and shooting from behind cover, in a firefight across a river (Hill Tribesmen archers at Defence 3, an Uruk-hai crossbowman at Defence 5; your archers touch a low wall)
4. First Clash: charging, Duel Roll, Pairing Off (Rohan Royal Guard FV 4 against Hill Tribesmen FV 3; ties and Backing Away come up as popups)
5. Troll in the Ravine: multiple combats and Trapped (ten Warriors of Minas Tirith against a wounded Mordor Troll that holds the dead end of a ravine, rocks at its back)
6. Brawl at the Ford: order of Combats, choosing Strikes (Rohan against Hill Tribesmen pinned against a river)
7. Battle for Edoras: rolling for Priority, the finale (Rohan Royal Guard and warriors against Hill Tribesmen and Rohirrim Traitors)

Chapter II, Fighting in formation:

8. Spear Wall: spears and Supporting, choosing where your models Back Away, Make Way (four Warriors of Minas Tirith with shields and four with spears hold a 6″ pass against ten Hill Tribesmen, who have Priority)
9. Pike Square: pikes Supporting two ranks deep, banners (three Warriors of Minas Tirith with shields, six Men-at-Arms of Dol Amroth with pikes and a banner hold a 3.2″ causeway against fourteen Mordor Orcs; a file three deep is Trapped when its fighter loses, and the banner's re-roll is clicked in the dice tray)
10. Axe and Shield: Shielding, with two-handed weapons on the enemy side (three Rohan Royal Guard and four Warriors of Rohan hold a farmyard gate against twelve Isengard Orcs with two-handed weapons; before each fight you may declare Shielding with the second button, and you must hold until the end of turn 7 losing at most one model)

Chapter III, Terrain:

11. Over Hedge and Cliff: every rule of moving over terrain, one obstacle after another on the way (five Warriors of Rohan carry a warning past Isengard Orc sentries: a low wall, a hedge to Jump, a 1.8″ cliff to Climb, a 2″ gully to Leap, falls with Falling Damage, Prone models; 3 of the 5 must reach the exit by the end of turn 8)

In missions 1 to 6 Priority is fixed by a scenario rule; the Priority roll is the lesson of mission 7. Later missions may fix it again as a scenario rule (mission 8 does; mission 9 rolls).

The first time a rule comes into play in the whole game, the game pauses and a "New rule" popup explains how it works and
how to use it (for example Duel Roll before the first fight, Trapped the first time a model cannot Back Away). Seen popups
are remembered in the browser and skipped in later missions; the mission list has a link to show them again, and every
rule card has a "How it works, step by step" button that opens the popup on demand.
When two or more rules from missions you have not played come into play at once (starting with mission 4, or in the
Heroes sandbox and matched play), they share one card, "Rules from earlier missions": a line each, which opens to how
the rule works; the rules of the mission itself keep their full popups.
Popups for rules you play by clicking (Pairing Off, order of Combats, Back Away and Make Way, choosing Strikes, Shielding,
banner re-rolls, Priority, moving, charging, shooting, spears and pikes) end with "Where to click": numbered steps with the
buttons drawn as they look in the game. When the popup closes, the control it means pulses for a few seconds (only the
first time; "Show these popups again" brings the pulses back too). The banner re-roll has its own popup, "Banner re-roll",
shown the first time your side loses a Duel Roll within a banner's reach (the Banners popup comes earlier, in the Move phase);
on a rule card it follows the Banners popup.

The Battle of Edoras (missions E1 to E4, a side campaign with its own numbers) plays the four Narrative Scenarios of the starter box's booklet (docs/edoras/),
with Narrative Play's own rules (Good has Priority in turn 1, no Broken armies). Each brings its scenario rule. They follow the booklet as written: the same models and wargear, the 3′×3′ mat (36″),
the houses, markers and deployment zones of its maps. They are narrative scenarios, so they are not balanced for the
player (the balance tool's 75% does not apply to them):

E1. The First Assault: Hatred (6 Warriors of Rohan with shield, 6 with throwing spears used only as spears, against 12 Hill Tribesmen)
E2. The Gates Fall: Objective Markers, a flaming brand counting as 2 models (Háma, 4 shields, 8 bows against Targg and 16 tribesmen)
E3. Torch the City: Heroic Move, Shoot and Combat only, burning Storehouses: Evil sets them alight on 6 (+1 brand), Good puts them out on 5+ (Haleth and 12 against Targg and 24, 8 of them bows)
E4. Last Stand of the Princes: Hordes (slain tribesmen come back on 4+ from any edge, as Reinforcements that may not Charge), Victory Points, Háma escaping off any edge for a draw (both princes and 24 against Wulf, Targg and 24)

The briefing of each of them has "Play as: Rohan / Hill Tribes" (kept in the browser). Playing the Hill Tribes turns the
whole table 180° and hands the player the Evil side (`missions.js: flipSide`, `G.align`); the computer then plays Rohan:
it puts fires out, holds the markers, and in Last Stand of the Princes runs Háma for an edge when it is behind.

The Rohan Houses of the box are a terrain kind of their own (`terrain-types.js: house`: a building with a thatched roof);
a Storehouse (`store: true`) can burn in a mission with `fire: true`.

Mission 17 brings the first Heroes (Might, Will and Fate). The full plan (terrain, cavalry, Heroes, magic) is in docs/curriculum.md;
the Hero chapter is designed in docs/hero-missions.md.

### Heroes sandbox

http://localhost:8765/?sandbox opens a practice field outside the mission list: Haleth, Háma and a Captain of Rohan with
Warriors of Rohan against Wulf, General Targg and a Hill Tribes Chieftain with Hill Tribesmen, with every rule taught so far,
every Heroic Action and Stand Fast. At the start of the Move, Shoot and Fight phases the panel lists the Heroic Actions your
Heroes could declare (the side without Priority goes first, then the sides take turns until both pass); a D6 decides whose
Heroic Move, Shoot or Combat goes first when both sides have one; Might can raise every roll the rules allow (To Hit, In The
Way, To Wound, Jump, Leap, Climb and Thrown Rider Tests, the Duel Roll, Fate and Courage). No mission teaches Heroic Actions
yet, so in the missions they stay off (docs/heroes-engine.md says how a mission switches them on).

## Matched play

The mission list ends with **To the Death!**: build two armies and fight a battle against the computer, as Good or as Evil.
Pick an army list for each side (any of the 79 lists of 2024 that have Warriors the game can play), a points limit
(100, 150, 200 or 300) and the models with their wargear options. The builder counts points and checks the bow limit and
the throwing weapon limit (one in three Warriors each). Then the enemy deploys along the far edge, you arrange your models
in your deployment zone, and the battle runs with every rule the missions teach. Priority is rolled every turn. The table gets random terrain,
the same for both sides: rocks, brush, low walls, hedges (a Jump Test; the computer goes round them) and low hills.

The scenario is To the Death! from the Rules Manual, adapted: the battle ends at the end of a turn in which an army is down
to a quarter of its models, and Victory Points come from Breaking the enemy army (losing more than half its models; some
army lists have another Break Point), banners, and cutting the enemy down to a quarter. A wiped-out army loses outright.
Simplified for now: Warriors only (no Heroes, so no Warbands, General or Hero Victory Points), no Courage Tests for Broken
armies, both armies deploy in one go, and options with wargear the engine does not play yet (war horns, slings, mounts,
throwing weapons other than Spear Mastery spears) are left out. Special rules are listed on the profile card, with their
text, but not simulated.

The army data comes from the community-maintained BattleScribe files for the 2024 rules,
https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim (profiles, points, options, special rules, army rules).
To refresh it after a new FAQ:

```
git clone --depth 1 https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim <folder>
node tools/import-armies.mjs <folder>
node tools/matched-check.mjs 2 150
```

The importer works Defence out from the wargear (armour, heavy armour, shield) because some shield modifiers in the data
are missing or test the wrong option, and it fixes a few misnamed profiles.

## Balance

Missions are tuned so that a player who uses the mission's rule usually wins. `node tools/balance.mjs` plays every
mission with a sensible strategy, through the same turn sequence and rolling procedures as the game (js/engine/sim.js), (300 games each by default; `node tools/balance.mjs 500 4 7` runs 500 games of missions 4 and 7)
and flags any mission under 75%. Current results with 800 to 2000 games: Hail of Arrows 81%, Armour Matters 97%, First Clash 77%,
Troll in the Ravine 85% (ten warriors; with nine it was 74 to 77%), Brawl at the Ford 82%, Battle for Edoras 84%, Spear Wall 93% (44% if the spears
never Support), Pike Square 91% (24% if the third rank of pikes never comes up, 80% without the banner), Over Hedge and Cliff 90% (46% running straight past the guards and starting climbs late),
Axe and Shield 83% when every
fight at the gate is Shielded (64% with no Shielding: `SHIELD=never node tools/balance.mjs 1000 10`).
The Scout has no dice and is not simulated.

Profiles come from the 2024 profile pages (https://prancingponypub.ru/mesbg2024/forces_of_good/ and forces_of_evil/);
the army lists (good_army_list/ and evil_army_list/) say which models fight together.
They are Games Workshop material, so keep this project for personal use. Special rules on the profiles are shown but not simulated yet.

## Known simplifications

- Heroes: no magic (Casting, Resisting, Heroic Channelling), no Intelligence Tests, no Hero Mounts, Generals or Warbands, and
  the special rules on Hero profiles are not simulated. When the dice are level with equal Fight Values, the side without
  Priority may bid Might first; Take Aim is shouted right after the Declare Heroic Actions step; a model reached by With Me
  or At the Double must end every leg of its move within 6″ of the Hero. More in docs/heroes-engine.md.
- Heights are estimates (a man about 1.2″ tall with its base, a monster on a 60 mm base about 2.5″). There are no
  ladders, ropes or Obstacles taller than a model (those would take a Climb Test over them). The enemy never Jumps,
  Leaps or Climbs, and AI plays for you does not take those tests either. A model hanging partway up a cliff cannot fight.
- A model with a two-handed weapon always fights with it (choosing the hand weapon instead is not simulated), and a
  hand-and-a-half weapon fights as a hand weapon. Enemy models declare Shielding only from mission 10 on, when it pays.
- A spear or pike that touches friends in several Combats Supports the one its side needs most; the app picks it.
- A banner re-roll is offered only to the side that is losing the Duel Roll, not when the dice are level before a roll-off.
  A slain banner bearer does not pass its banner to a friend.
- From mission 4 on you split the fights (Pairing Off) and pick the order of the Combats whenever you have Priority (unless Auto Pair Off is on in Options).
  Before mission 6 the app picks where Strikes go for you (the best choice for your side); from mission 6 on you do that too.
- A move or Charge goes in a straight line; a Charge may turn once to get round friends when no straight path is free.
  Charges follow the 2024 Control Zone rules: the charger must Charge the first enemy whose zone it enters.
- Percentages (chance to win a fight, to wound with a shot) are hidden unless Show odds is ticked in Options.
- Models Back Away at most 60° off straight back (the rules give no limit, only "not necessarily directly away").
  Until mission 8 the app picks the direction and makes a friend Make Way whenever that saves a model from being Trapped;
  from mission 8 on you choose both for your own models (Options can hand either back to the app). The app always chooses for the enemy.
- A model looks from the centre of its base at the whole target base (from above, a wedge). Anything that hides part
  of the target is In The Way, even if the line between the centres misses it. Rocks and models block Line of Sight
  (for shooting and Charging) only when together they hide the whole target; what hides part of it is In The Way.
  Bases stand in for height: a model only hides targets no bigger than itself and the viewer (a man can't hide the
  troll, and the troll sees over men), and a friend the viewer could shoot over the shoulder of hides nothing.
  A shooter touching a rock ignores it.
  A shooter firing over the shoulder of a friend in base contact also ignores a wall that friend touches (walls are the
  only Barriers here; brush is area terrain).
- Low walls are Obstacles under half a man's height: models step over them freely but can't end a move on top,
  and Backing Away or Make Way can't cross them.
  A move (or a deployment) that ends within 0.35″ of a low wall, or on top of it, stops in base contact with it, so the
  model can shoot over it; the shot preview says when a shooter stands near a wall without touching it.

## License and disclaimer

The code is released under the MIT License (see `LICENSE`).

Captain's School is an unofficial, non-commercial fan project. It is not affiliated with, endorsed or sponsored by Games Workshop,
Middle-earth Enterprises, Warner Bros. or the Tolkien Estate. Middle-earth, The Lord of the Rings, The Hobbit and the names of
characters, places and things in them are trademarks of Middle-earth Enterprises; Middle-earth Strategy Battle Game and Games
Workshop are trademarks of Games Workshop Ltd. The game contains no official artwork and no copy of the Rules Manual: rules
are explained in its own words and link to the published rules. Army profiles come from the community BattleScribe data
(see Matched play). If you are a rights holder and want something changed or removed, please open an issue.
