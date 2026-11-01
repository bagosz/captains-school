# Chapter V, mission 16: Broken and Courage tests (design, 13.10.2026)

Status: mission 16 implemented on 13.10.2026 according to point 3 (recorded in `curriculum.md`); after balancing the enemy is 12 Mordor Orcs with shields,
goal 9 of 12 (details in `curriculum.md`). The first mission of chapter V, still without heroes:
Stand Fast and Terror are taught by mission 18 (Stand Fast!, with Háma; `docs/curriculum.md`). Both are in the engine
(`docs/heroes-engine.md`, special.js: chargeTests) and switched on by the mission keys `standFast` and `terror`.
Rules source: Rules Manual 2024, chapter Courage and Intelligence (manual pages 60–61; copy:
`rules_manual/courage_and_intelligence/`).

## 1. Rules (what the manual says)

| Rule | Content | Page |
|---|---|---|
| **Courage Test** | 2D6, a result equal to or higher than the model's Courage is a passed test (C 7+: 58%, C 8+: 42%, C 6+: 72%, C 5+: 83%). | 60 (44) |
| **When** | Broken Army, orphaned mount (already in the game since mission 15), Terror (a charge on a model with this rule; failure: the model does not move in that phase). A test passed for one reason exempts from further tests for the same reason until the end of the turn. | 60 (44, 45) |
| **Break Point** | Half of the army's starting number of models (13 models: 6.5). The starting models count, even if the army grows. Cavalry counts as a casualty when the rider dies. | 61 (46) |
| **Broken Army** | If at the **start of a turn** the army's losses are greater than the Break Point, the army is Broken until the end of the game. From then on each model of that army first takes a Courage Test when **activated**: passed it stays, failed it **flees and is removed as a casualty**. Models Engaged in Combat (and those that cannot activate) do not test, because they do not activate. | 61 (46) |
| **Stand Fast** | Heroes only, mission 17. | 61 (47) |

Activation is a model's move in the Move phase (an activated model may move, charge or stand). A model the player does not activate
does not test; in the game we assume that the player activates a model when selecting it to move, and the AI activates every model that wants to move.
Models that stand still do not test: this is a loophole, but consistent with the letter of the rule and important tactically (see the lesson).

## 2. Mission 16: "The Line Wavers" (Broken Army)

One main rule: **Broken Army and the Courage Test** (2D6 ≥ C at every activation after the army breaks). Accompanying: Break Point
(counting losses; the same counter later feeds matched play, where Broken today gives only victory points).

A tactical lesson that is not in other games: after breaking the enemy, **do not fight him, step back**. An Engaged model does not test, so
an orc stuck to your warrior stays; an orc that has to come up to you tests and flees in 58% of cases (C 8+). The other way round, when your
army is Broken: keep the models in combat or stand still, because only an activated model tests (C 7+: 42% chance of fleeing).

Scenario:
- Gondor against Mordor, Osgiliath. Player: 12 Warriors of Minas Tirith (8 with shields D6, 4 with spears: the formation from mission 8).
  Enemy: 20 Mordor Orc Warriors (12 with shields D5, 8 with spears), Priority rolled. Break Point: player 6, orcs 10.
- Board 30 × 22: ruins (rocks) forming two narrow passages, so that the player can fight several orcs at a time and break them
  (as in mission 8), and after they break fall back behind the ruins out of charge range.
- Goal: by the end of turn 10 the orcs must lose at least 15 of 20 (killed and fled together; that is, "reduced to 25%", the threshold for the end of the battle
  in To the Death!), and the player must not lose 9 or more (his own quarter). An immediate loss when the player falls to 3 models.
- Course: turns 1–4 fighting in the passages (three to four orcs die per turn in the spear formation), around turn 5 the orcs have 11 losses
  and are Broken from the start of turn 6; from then on every orc that wants to approach or charge tests on 8+: 58% flee.
  A player who steps back 1–2″ (out of contact) forces all the orcs to test; a player who keeps standing in melee fights the orcs
  that do not test. Simulator: the "step back after the break" strategy should give 85% or more, the "keep fighting" strategy clearly less.
- Threat: the player can himself become Broken after 7 losses (C 7+, 42% chance of fleeing at every activation). A lesson window at the first
  player test: do not move models you do not have to.

## 3. What has to be built

1. **Engine** (`rules.js` or a new `morale.js`): `breakPoint(side)` from the number of starting models of the mission (`G.start[side]`, already counted
   in matched play as `start`), `casualties(side)` (killed + fled, cavalry by the rider), `isBroken(side)` determined **at the start of
   the turn** (`G.broken[side]`, once set it stays), `courageTest(u)` → `{ dice, total, need, ok }` (2D6 ≥ u.T.c). A model that fails
   the Broken test: `u.fled = true` (counted as killed in `alive`: `!u.dead && !u.gone && !u.fled`; `gone` already exists for the fleeing models
   of mission 2, so `gone` with a reason can be used).
2. **Flow** (`flow.js`): a step at the start of the turn: the message "The orcs are Broken" (log, lesson `broken`). In the Move phase: when the player
   selects a model to move in a Broken army and the model is not Engaged, first a 2D6 roll in the tray (`courage`); failure removes the model
   (animation of fleeing to the edge, log "flees the battlefield"). A passed test holds until the end of the turn (the model may move in several steps).
   AI (`aiMove`): the same before each planned move; a model that does not want to move (no plan) does not test.
   The Shoot phase is not an activation: shooters do not test.
3. **UI**: the panel shows the Break Point and the losses of both sides in the mission status ("Orcs: 11 of 20 lost, Broken"); the profile card highlights C;
   the move preview of a selected model in a Broken army warns "Courage Test first (7+: 58%)". Chip and cards `courage`, `broken`.
   Tray: a row "Courage Test 8+" with two dice and the total.
4. **Enemy AI**: after breaking, the orcs still try to charge (the rule removes them by itself); optionally the AI falls back when it is Broken and the player
   is not (that would be "smart", but takes away the lesson; we keep the simple AI).
5. **Simulator**: the "The Line Wavers" strategy: formation in the passage as in Spear Wall; after the enemy breaks, non-Engaged models fall back
   by 1″ out of contact (so that the orcs have to activate), Engaged ones keep fighting. `WAVER=fight`: fight to the end. Courage tests in
   `play()` before the move of each model of a Broken army (player's and enemy's).
6. **Matched play** (`matched.js`, `matched-check.mjs`): the same tests after breaking; To the Death! already counts Broken towards points.
   Mind the time: a test at every activation is one roll, no cost.
7. **Lessons**: `broken` (at the first break of any army: the threshold, who tests, who does not) and `courage` (at the first test:
   2D6, percentages, what to do), with a "Right now" line giving the number of losses to the threshold.

Simplifications: no Stand Fast (heroes), no test modifiers (Will, horns, banners in 2024 do not give +1 to Courage);
a model that is not activated does not test (as in the manual, without "wait, but he is standing in combat" – in combat he does not test either).

## 4. Mission 17 (sketch): "Stand Fast!" with the first hero

- Captain of Rohan (Might 2, Will 1, Fate 1) with warriors; the army starts just above the Break threshold. The hero passes the test and calls
  Stand Fast: warriors within 6″ with line of sight pass automatically. Will +1 to the test. Terror (Mordor Troll from mission 5): a test before the charge.
- This is the first mission with a hero, so Might on the dice and Fate come in with it (design `hero-missions.md`, mission "A Captain's
  Might"), or the other way round: first Might and Fate (16), then Stand Fast and Terror (17). To be decided when planning mission 17.
