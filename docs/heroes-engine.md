# Heroes in the engine: Might, Will, Fate and Heroic Actions (13.10.2026)

Status: the engine is ready for missions with Heroes (stages A, B and C from `docs/hero-missions.md`, plus Stand Fast from `docs/courage.md`).
No mission teaches Heroic Actions or Stand Fast yet, so missions 1–17 play as before; everything can be tried
in the sandbox: http://localhost:8765/?sandbox (outside the mission list). Source: Rules Manual 2024, PDF pages in brackets.

## 1. Why mission 17 had simplifications

The note "Might does not work yet on To Hit, In The Way and terrain tests; the percentages in the panel do not count Might" came from mission 17.
The mission teaches Might in the Duel Roll: its Heroes (Captain of Rohan, Hill Tribes Chieftain) have no bows, the mission has `noShoot`
and no obstacles, so only what that mission uses was done (Duel Roll, To Wound of a Strike, Fate, Courage with Will). The percentages
in the panel were computed by `duelOdds` from the dice distributions alone, without Might bidding. On top of that every roll had three separate copies of the order
of steps: in the game (`flow.js`), in the simulator (`balance.mjs`) and in `matched-check.mjs`, which began to drift apart.

Now Might works on every roll that the rulebook allows (p. 78), the percentages count Might, and the order of steps is
written once, in the engine.

## 2. One order for the game and the simulator

- `js/engine/dice.js`: roll procedures as generators. Each one stops at every die (`dice`, `reroll`, `raise`)
  and at every decision (`might`, `fate`, `courage`). The game drives them with the tray and buttons (`flow.js: play()`), the tools
  with the `run()` function with computer decisions (`ai.js: aiAnswer`). Thanks to this the game and the simulator go through the same steps in the same
  order.
- `js/engine/heroes.js`: Heroic Actions, the declaration step, D6 order, effects, challenges, Stand Fast.
- `js/engine/sim.js`: a whole turn without drawing, with the sides' "brains" (a mission strategy or the computer). It is used by
  `tools/balance.mjs`, `tools/matched-check.mjs` and the new `tools/hero-check.mjs`; `flow.js` has the same sequence with clicks.

## 3. Order of phases

| Phase | Steps | Page |
|---|---|---|
| Priority | Broken check, Priority roll | 24, 61 |
| Move | Declare Heroic Actions → Heroic Move (D6, when both sides have one) → activations of the side with Priority → activations of the other side. Model activation: a Courage test of a Broken army (or Heroic Resolve / Stand Fast), shout (With Me, At the Double), move. A Hero who passed calls Stand Fast. At the end of the phase the +3″ and the ban on Charging after a march disappear. | 26, 61, 79–84 |
| Shoot | Declare → Take Aim → Heroic Shoot (D6, when both sides have one; Loose) → shooting by the side with Priority → the other | 40, 82, 84 |
| Fight | Pairing Off (side with Priority) → Declare → Heroic Combat (D6, when both sides have one; after a success move/Charge and Pairing Off again) → the remaining fights in the order chosen by the side with Priority | 48, 80, 82 |
| Combat | Heroic Strike D3 (the Hero's first fight in the phase) → Shielding (Priority first) → Duel Roll → Back Away → Strikes → casualties | 50, 86, 111 |

FAQ (`docs/rules/latest_faq.md`): a model covered by With Me that gives up its activation still takes the Courage test of a Broken army;
a move after a successful Heroic Combat may include Jump, Leap, Climb and dismounting.

Declarations (p. 79): the player **without** Priority starts, then they alternate; one action or a pass; it ends when both sides pass
one after another; a side that has passed may still declare when the opponent announces something. A side with no possible actions
passes without being asked. D6 order (p. 80): the player with Priority rolls, 1–3 Evil chooses the first Hero, 4+ Good, then they alternate.
An action that is impossible when its turn comes (a Hero charged before his Heroic Move) is lost together with the Might point.

## 4. Order in rolls

| Roll | Order | Page |
|---|---|---|
| Duel Roll | dice → modifiers → re-rolls (the loser first, then whoever is losing at that point) → Might (bidding: the losing Hero first, in turn) → result (highest die, FV, roll-off without Might) | 50, 77 |
| Shot | To Hit (+Might) → In The Way one by one from the nearest obstacle (re-roll from Heroic Accuracy/Take Aim, then Might) → the special In The Way of shooting into combat → the special In The Way for rider/mount (Sharpshooter: no test) → To Wound (+Might) → the target's Fate | 42–45, 71, 77–78, 84, 130 |
| To Wound | 6+/x: first the 6 (+Might), then the second die, Might from the first passes to the second; Heroic Defence: only a natural 6, Might does not help | 45, 78, 86 |
| Tests | Jump, Leap, Climb, Thrown Rider (Expert Rider re-rolls 1), In The Way over a wall on a Strike: roll → re-roll → Might | 33–35, 70, 78 |
| Fate | one point at a time: roll → Might (before the next point) | 88 |
| Courage | 2D6 → Will and Might one point at a time | 60, 87 |

Might works only on the Hero's own rolls, not on wounds caused indirectly (a fall, Knocked Flying) and not on a roll-off.

## 5. Heroic Actions in the engine

| Action | What it does in the game | Page |
|---|---|---|
| Heroic Move | activation before everyone; With Me: friends within 6″ activate right after him and finish within 6″ of him | 81 |
| Heroic March | +3″ (+5″ cavalry) for the Move phase, no Charge; At the Double for friends within 6″ | 83 |
| Heroic Resolve | Courage tests of a Broken army passed without a roll, Stand Fast even after an enemy Charge | 84 |
| Heroic Shoot | a shot before everyone; Loose: friends within 6″ shoot together with him, whoever does not shoot does not shoot later | 82 |
| Heroic Accuracy | Sharpshooter and a re-roll of failed In The Way; Take Aim for friends within 6″ | 84 |
| Heroic Combat | the Hero's fight first; a win and all enemies killed: move or Charge, new Pairing Off | 82 |
| Heroic Strike | +D3 FV (max 10) from the first fight in the phase | 86 |
| Heroic Strength | double S on Strikes (max 10) | 86 |
| Heroic Defence | a wound only on a natural 6 (a mount without protection) | 86 |
| Heroic Challenge | a target within 6″ of the same tier or higher; accepting/refusing; +1 A and +1 To Wound; a Charge on himself; Might for the kill | 85 |
| Stand Fast | a Hero passed the Broken test: Warriors within 6″ with line of sight pass without a roll | 61 |

Profiles with actions and tiers: Captain of Rohan (March, Fortitude), Hill Tribes Chieftain (March, Fortitude), Wulf (Challenge,
Strength, Strike, Valour), new ones: Haleth, Prince of Rohan (Challenge, Resolve, Strike, Valour), Háma, Prince of Rohan (Accuracy,
Defence, Valour, bow, Sharpshooter), General Targg (Defence, March, Fortitude). Data from BattleScribe 2024; Wulf's tier from the Usurpers
of Edoras list (prancingponypub), because in the BattleScribe data it is empty.

## 6. Interpretations (where the rulebook is silent)

- Might bidding on a tie with equal FV (a roll-off will follow): the side without Priority bids first. A side that raises
  a die to a tie keeps the floor until it wins or passes (at the table you say "2 Might: 4 → 6" in one go).
- D6 order also for opposing Heroic Shoot (p. 80 mentions Move and Combat, but Shoot also changes the order of the phase).
- Take Aim called right after the declaration step (before the first shot in the phase).
- With Me and At the Double: every stretch of movement must end within 6″ of the Hero (the rulebook requires this at the end of the activation).
- The D3 from Heroic Strike is rolled at the start of the fight, before declaring Shielding (both things happen "at the start of the fight").
- An Independent Hero is the lowest tier for a challenge.
- Heroic Defence protects against every To Wound roll in the Fight phase, including a fall from an edge.
- After a successful Heroic Combat the new Pairing Off covers all fights not yet resolved.
- The enemy shows its Pairing Off before the declarations, and the order of the remaining fights only after Heroic Combat.

## 7. How a mission enables Heroes

- Heroic Actions: rule keys `heroicMove`, `heroicMarch`, `heroicResolve`, `heroicShoot`, `heroicAccuracy`, `heroicCombat`,
  `heroicStrike`, `heroicStrength`, `heroicDefence`, `heroicChallenge` in the `rules` field (the card in the briefing) or in a mission's `also`.
  The game puts into `G.heroics` the ones taught by the missions so far; matched play and the sandbox have all of them.
  A `heroic` card (the declaration step) will be useful in the first mission with actions.
- Stand Fast: key `standFast` (mission 18 of the plan).
- `tools/balance.mjs` takes the same keys from `knows()`. Mission strategies (`STRATEGY`) move models through `S.applyMove`;
  declarations, shouts and Heroic Move/Combat moves are done for the player by the computer, unless the strategy supplies its own `answer`, `shout`,
  `heroicMove`.
- Lessons (`js/data/lessons.js`) for Heroic Actions have to be added together with the missions; the rule cards (`rules-text.js`) already exist.

## 8. Tools

- `node tools/hero-check.mjs 300`: 17 order checks on set dice (declarations, D6, Duel Roll with a re-roll
  and the bidding from example 59, 6+/4+ with Might, Heroic Defence, Fate from example 73, Strength, Challenge, Strike, a shot
  with Accuracy, Sharpshooter, Courage with Will and Might, Stand Fast, Heroic Move before activations, Heroic Combat first) and battles
  in the sandbox, computer against computer.
- `node tools/balance.mjs 500` and `node tools/matched-check.mjs 2 150` as before, on the shared `sim.js` sequence.

## 9. What is still missing

- Magic: Heroic Channelling, Casting and Resist (including the Resist die from Heroic Resolve).
- Intelligence tests (no rule in the game requires them), Hero Mounts with shared M/W/F, Last Stand (General), Targg's Master of
  Battle and other special rules of Heroes (shown on the card, not simulated).
- Matched play still without Heroes (the importer blocks the word Hero): Warbands, the General and points for Heroes are a separate stage.
- The computer declares actions by simple rules (`ai.js: heroicValue`); to be tuned together with the missions.
