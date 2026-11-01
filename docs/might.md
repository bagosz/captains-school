# Mission 17: Might, Will and Fate. Design and implementation plan in the engine (13.10.2026)

Status: mission 17 implemented on 13.10.2026 according to point 3 (recorded in `curriculum.md`, chapter V); composition and balance changed
after simulations (Royal Guard instead of Warriors, 5 tribesmen, 12 turns). Sources: Rules Manual 2024, chapter Heroes (pages 76–88: Might pp. 76–78, Will p. 86, Fate p. 87;
copy: `rules_manual/heroes/`), Quick Reference Guide (page 4: summary of Might, Will, Fate, Thrown Rider table). Heroic actions
(Heroic Move, Shoot, Combat and specialist ones) are left for mission 18 onwards (`docs/hero-missions.md`, stage B).
Update 13.10.2026: the engine was rebuilt according to `docs/heroes-engine.md` (roll procedures in `dice.js`, a shared sequence
`sim.js`); the functions from point 3 below (`mightBidding`, `woundStart`, `fateSave`, `courageBoost`) replaced `duelSeq`,
`woundRoll`, `fateSeq` and `courageSeq`. The simplifications at the end of this file no longer apply.

## 1. Rules (what the manual says)

| Point | Content | Page |
|---|---|---|
| **Might: changing dice** | For 1 point a hero raises **one of his dice by 1**, never above 6, never down. The decision is made at the very end: after all re-rolls and modifiers. Only the hero's own rolls, never allies' or enemies'; does not apply to the roll that decides a tie. | 76–77 |
| **On what** | Duel Roll (after modifiers and re-rolls), To Hit, To Wound from his own strikes and shots (at 6+/4+ Might from the first die carries over to the second), In The Way, Jump, Climb, Leap, Thrown Rider, Courage, Intelligence tests, the Fate roll, Casting and Resist. Not: wounds inflicted indirectly (an enemy's fall, an enemy's thrown rider). | 77–78 |
| **Bidding** | When two heroes fight, the one who is **losing** adds Might first; then the other; alternately, until both pass or the dice reach 6. The hero's dice in a group combat are rolled separately, so that it is known which ones may be raised. | 77, examples 59–60 |
| **Will** | 1 point = +1 to a Courage test (can be combined with Might). Besides that Casting and Resist (chapter VI). | 86 |
| **Fate** | When a hero receives a wound, he may spend a Fate point and roll a D6: 4+ the wound does not go through. Points are spent one at a time, each resolved fully; Might can raise the Fate roll (the decision before the next point). Fate does not save from fleeing after a failed Courage test. | 87, examples 71–73 |

## 2. Mission 17: "A Captain's Might"

One main rule: **Might on the dice** (including bidding between heroes). Accompanying: **Fate** (a window at the hero's first wound)
and **Will** as +1 to a Courage test (the mission is small, so the Broken from mission 16 may occur and the captain will use Will; a card in the briefing,
without a separate lesson until it occurs).

Scenario (from `docs/hero-missions.md`, mission "A Captain's Might", adapted):
- Rohan against the Usurpers. Player: **Captain of Rohan** (F4 S4 D5 A2 W2, Might 2, Will 1, Fate 1) and 5 Warriors of Rohan with shields.
  Enemy: **Hill Tribes Chieftain** (F4 S4 D4 A2 W2, M 2 W 1 F 1) and 7 Hill Tribesmen. Board 24 × 18, a few rocks. Priority rolled.
- Goal: kill the chieftain by the end of turn 8; the captain must survive. A loss also when the player loses 5 models (a quarter of the strength: 6 models → threshold 1.5…
  for clarity: a loss at 4 warrior losses and the death of the captain).
- The catch: the captain has 2 Might. Spent on an ordinary tribesman, it will be missing in the duel with the chieftain, where both sides bid. The duel calculation
  F4 A2 against F4 A2: without Might 50% (a tie is decided by a roll-off, on which Might does not work); the captain wounds the chieftain (D4) on 4+, the chieftain the captain
  (D5) on 5+; two wounds to remove, Fate one at a time. Simulator: the Might policy "spend when it changes the result and the stake is a hero's wound or
  a strike against an enemy hero" should give about 75–85%; the policy "spend at once" clearly less.
- The course of learning: the captain's first lost Duel Roll that Might can reverse → Might window (click on a gold die in the tray); the captain's first
  wound → Fate window; the first duel with the chieftain → bidding (the enemy adds, the player answers).

## 3. How best to embed this in the engine

Design principle, as with banners and Barriers: **one shared layer in `combat.js`/`rules.js` without DOM**, which `flow.js`
(the game, with windows for the player), `tools/balance.mjs` and `tools/matched-check.mjs` (automatic policy) call the same way.

### 3.1 Data and model state
- Profiles already have `mwf: [M, W, F]` and `hero: true`. `setup.js: buildUnits` adds `u.might, u.will, u.fate` (current) and `u.mwf` (maxima).
  A thrown rider keeps the points (`dismount` copies them).
- Dice already carry an owner: `rollDuelDice` gives `{ n, v, mod, six, u }`, so the hero's dice can be distinguished without a new format.
  For To Wound (`rollWound`) and tests (`courageTest`, `itwStrike`, `rollShot`, terrain tests) the dice have to be returned as objects
  with `v` (already so in `rollWound`: `dice: [{ v, ok, mod }]`), so that Might can raise them after the fact.

### 3.2 Engine: one operation and one evaluation
- `mightUp(u, die)`: if `u.might > 0` and `die.v < 6`, then `die.v++`, `die.mt = (die.mt || 0) + 1`, `u.might--`. This is the only way to spend Might
  on a die. `willUp(u, test)` the same for Courage (+1 to the sum).
- `mightPlan(u, dice, goal)`: the cheapest set of raises to reach the goal (e.g. a die ≥ need for To Wound, the highest die ≥ the enemy's result
  for the Duel Roll taking FV into account: at equal FV you have to beat by 1 more). Returns a list `[die, +k]` or null when impossible.
  Used by: the player's window (hint "2 Might: 4 → 6 wins"), the AI and the simulator.
- `mightBidding(D, policy)`: bidding in the Duel Roll (p. 77). Loop: `lead = duelLead(D)`; the losing side with a hero in the combat asks
  its policy whether and which die to raise (`policy(side, D, plan)`); then the other side; ends when both pass or nothing can be done.
  For the player the policy is a window in the tray; for the AI and the simulator `aiMight`. The result of `settleDuel` is counted only after bidding (Might after
  banner re-rolls: the order in `resolveFight`: roll → banners → Might → settle).
- `fateRoll(u)`: D6, 4+ saves; after a failed roll the possibility of Might (3 → 4) and the next point. `woundPart`/`takeWound` get a hook:
  a wound on a hero with Fate goes through `tryFate(u, policy)` before it removes a Wound. Applies to strikes, shots and Falling Damage, does not apply to
  fleeing after Courage.
- `aiMight(u, ctx)` (in `ai.js`, no DOM): spends Might when (a) a plan exists and (b) the stake is worth a point: in the Duel Roll, when the hero
  is losing and would be hit (or when winning gives strikes against an enemy hero or against a model with 1 Wound), in To Wound when the target is a hero
  or the last wound, at Fate always (3 → 4), at Courage only when failure means the hero fleeing. The enemy and the simulator use the same
  function; "AI plays for you" too.

### 3.3 Game: decision windows (`flow.js`, `tray.js`, `panel.js`)
- **Might window in the Duel Roll** (the most important): after re-rolls, when the player has a hero with Might in the combat and `mightPlan` exists,
  mode `G.mode = 'might'`: the hero's dice in the tray get a gold outline (the mechanism `tray.pickFrom` and `onPick` from the banner; `main.js`
  extends the condition `G.mode === 'reroll'` with `'might'`), a click on a die = `mightUp` and a refresh of the result ("Now winning on Fight Value"),
  the main button "Keep the dice" finishes. After the player's move the enemy answers (`aiMight`), and so alternately. With Auto roll the window does not disappear:
  Might is the player's decision; only "AI plays for you" decides by itself.
- **To Wound and In The Way of a hero**: after the roll, when it failed and can be finished off: two buttons ("Spend 1 Might: 4 → 5, wound" / "Keep"),
  like Shielding (`waitAuto` with `second`). At 6+/4+ raising the first die carries over to the second (the rule), so the plan counts both.
- **Fate**: when the player's hero receives a wound: "Spend 1 Fate (4+)" / "Take the wound"; after a roll of 3 with Might in reserve: "Spend 1 Might: 3 → 4".
  The rolls in the tray as separate rows.
- **Courage**: the test in the tray already has two dice; after a failed hero test: "Spend 1 Will (+1)" / "Spend 1 Might (+1)" / "Flee".
- **Panel**: the hero's card with points as tokens (full and spent), `#hBody` hints "Captain of Rohan: 2 Might left; a 4 → 5 would
  win this Duel Roll". On the board above the hero's token small M/W/F pips (the token already has a gold outline for `hero`).
- **Log**: "Captain of Rohan spends 1 Might: 4 → 5, and wins on Fight Value.", "The Chieftain answers with Might: 5 → 6.", "Fate: 5, the
  Wound is prevented." Chips and cards `might`, `will`, `fate`; lessons `might` (a click on a die, order: the last word, bidding),
  `fate` (4+, one at a time, Might on the roll), `will` (at the hero's first Courage test).
- **Odds in the panel**: `duelOdds` does not count Might (documentation: percentages without Might); the panel adds "+ Might 2".

### 3.4 Simulator and matched play
- `balance.mjs: fight()`: after `rollDuel` call `mightBidding(D, aiMight)`; strikes through the shared `hit()` with Might on the hero's To Wound
  and the victim's Fate; the mission strategy "A Captain's Might" (the captain saves Might for the chieftain: policy `MIGHT=spend` for comparison).
- Matched play: the importer blocks the Hero keyword (`BLOCKED_KW`); unlocking heroes is a stage after missions 17–18 (Warbands, General,
  points for heroes in `matched.js`).

### 3.5 Order of work
1. Model M/W/F state, pips on the token and card (without rules: half a day).
2. `mightUp`, `mightPlan`, `mightBidding`, `aiMight`; simulator with bidding (check that missions 1–16 do not change: they have no heroes
   except the troll, who is not a Hero).
3. Might window in the Duel Roll in the game (tray, mode `might`, lesson).
4. Might on To Wound and In The Way (game and simulator).
5. Fate with Might on the roll (game and simulator), Will and Might in the Courage test.
6. Mission 17, balance, cards, lessons, documentation.

Simplifications for mission 17: Might only on the listed own rolls; no heroic actions; terrain tests with Might only when some mission
with a hero uses them (technically it is the same `mightPlan` on one die).
