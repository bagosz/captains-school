# Matched play: the "To the Death!" battle

Status: Warriors and infantry Heroes (14.10.2026). No mounted Heroes, no Independent Heroes, no General or Hero Victory Points yet.

## What is in the game

- At the end of the mission list there is an entry **To the Death!**. It opens the army wizard: an army list for each side, a points
  limit (100, 150, 200, 300), models with wargear options (− / + buttons), randomising and clearing armies.
- The player can play **Good or Evil**. The computer always commands the other side (Good against Evil).
- The wizard counts points and enforces the limit on bows and throwing weapons: one third of the Warriors each (rounded up),
  as in the Matched Play 2024 rules. Warbands: an army needs a Hero; all Heroes together lead at most their Followers
  (Legend 18, Valour 15, Fortitude 12, Minor 6); a Hero only once. The General is the Hero with the highest Heroic Tier
  (`special.js: assignGenerals`). The last armies are remembered in the browser.
- The briefing describes the scenario and the victory points. Then the deployment: the enemy stands at the far edge, the player can rearrange
  their models in their zone (click a model, click a place). The "Start the battle" button begins turn 1.
- The battle runs with all the rules from the missions (Pairing Off, fight order, Strikes, Back Away, Make Way, spears, pikes,
  banners, Shielding and two-handed weapons from mission 10, Barriers from mission 13). Priority is rolled every turn.
- A Broken army (losses over the Break Point at the start of the turn) takes Courage tests on every activation; a failure means fleeing
  (mission 16). Earlier, Broken only gave victory points.
- A Control Zone ends at walls, hedges, rocks and water. A hedge (1″) can be defended: a model next to it has a zone
  reaching to the other side, and an enemy charges it across the hedge (mission 13). A low wall (0.5″) is too low to defend.
- At the end a victory points table for both sides, "Play again" (the same armies, a new table), "Change armies".

## Scenario: To the Death! (Rules Manual, scenario 2), after adaptation

- End: at the end of the turn in which either army has 25% of its starting number of models or fewer. An army wiped out to zero loses
  immediately (Sudden Death), regardless of points.
- Points: enemy army Broken 3 (5 if yours is not Broken); enemy without a banner 2 (also when it never had one);
  your banner on the table 1 (2 if you have more of them than the enemy); enemy reduced to 25% 3.
- Broken: losses greater than half of the starting number of models (the Break Point from the army rules, if the list has a different one).
- Not scored yet: points for the General and for killed Heroes (the scenario text is not in `docs/rules/`). So the game counts at most 12
  points, not 20. Warbands are not tied to one Hero: the Warriors are counted against all Heroes together.
- Simplifications: a Broken army does not take Courage tests; both armies deploy in full (no further Warbands);
  the deployment zones are shallower than in the rulebook, because the table is smaller.

## Table

- 36″ × 30″ with 6″ zones up to 150 points, 48″ × 36″ with 7″ zones above.
- Random but symmetrical terrain (rotated by 180°), only in the strip between the zones: rocks, undergrowth, low walls, hedges
  (the Jump test from mission 12) and low 0.5″ hills (entered with a normal move, but only models on the same level fight).
  At most two pairs of hedges and two pairs of hills: the AI does not jump or climb, so it goes around hedges.
- Automatic deployment in ranks: fighters in front, spears and pikes right behind them, then banners and shooters.

## Army data

- Source: BattleScribe data for MESBG 2024, https://github.com/Hukoseft/middle-earth-v2-War-of-the-Rohirrim
  (profiles, points, options, special rules of models and armies; updated after the FAQ).
- `tools/import-armies.mjs` generates `js/data/army-lists.js`. The file is generated, do not edit it by hand.
  Refreshing: clone the repo, run the importer, then `node tools/matched-check.mjs 2 150`.
- Warriors of an army list: those that the data show in the Warband of some Hero of that list. Skipped: models only for the Warband
  of a war beast (Haradrim in a Mûmak howdah), legacy (the "Allow Legacies" option), cavalry, swarms, models with Fly.
- Heroes: the infantry Hero that leads each Warband (`hero`: Heroic Tier from the Warband's primary category, `lead`: Followers),
  with Might/Will/Fate and Heroic Actions; mount options are left out (Horse), Independent Heroes are not imported yet.
  Some rule values stay "(X)" in the data (Leader (X), Master of Battle (X+): read as 6+).
- Wargear supported: hand weapon (also claws etc.), armour, shield, light shield, spear, pike, banner, two-handed
  weapon, bows (range and Strength from the weapons table), crossbow. With a note on the card: hand-and-a-half weapon (fights as a hand weapon), light armour,
  Elven weapon (the better roll-off is not simulated), a throwing weapon in the base equipment (does not throw). Throwing spears with the
  Spear Mastery rule fight as a spear. Options with other equipment (horn, sling, mount, drum, halberd...) are skipped.
- Data fixes in the importer: Defence counted from the equipment (armour +1, heavy +2, shield +1), because some shield modifiers
  in the data are wrong or missing (e.g. Warrior of Minas Tirith, Rohirrim Traitor); model names taken from the entry, not from the profile
  (the "Special Rules" and "Isengard" profiles); typos "Isengard Toll", "Gablin-Town".

## Sides and engine

- Internally the `good` side is always the player and `evil` is the computer. `G.align` says which one is Good and which is Evil.
  Only these depend on it: the roll-off on a tie (4–6 Good, 1–3 Evil) and the ban on Good shooting into combat and next to friends.
- AI: spears and pikes step in behind a fighting friend (Support), the banner goes right behind the line and does not charge, the crossbow moves
  a full move when it has no target. The enemy moves in this order: fighters, spears, banners, shooters.

## What next

1. Heroes: done for infantry. Still: mounted Heroes, Independent Heroes, Warband by Warband, points for the General and Heroes.
2. Broken with Courage tests (the mission from chapter V) and then also in matched play.
3. Cavalry (chapter IV) will unlock riders and options with a horse.
4. Throwing weapons and spear throwing on a Charge; the war horn together with Courage tests.
5. More scenarios from the rulebook (Domination, Hold Ground, Reconnoitre...) and deploying Warband by Warband.
