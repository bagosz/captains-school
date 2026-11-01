# Curriculum: all missions

Status: plan. Done: missions 1–7 (chapter I), missions 8–10 (all of chapter II), missions 12–13 (terrain), missions 14–15 (all of chapter IV)
mission 16 (Broken and Courage) and mission 17 (Might, Will and Fate); the rest are waiting to be implemented. The engine already has everything for Heroes
(Heroic Actions, Might on every roll, Stand Fast; `docs/heroes-engine.md`), to be tried in the `?sandbox` sandbox. Next in the queue: mission 18, Stand Fast
and Terror with a Hero (`docs/courage.md`, point 4), then Heroic Actions (`docs/hero-missions.md`, stage B).
Rules source: Rules Manual 2024 and its copy at https://prancingponypub.ru/mesbg2024/rules_manual/.
Profiles: the 2024 army lists (Rohan, Gondor, The Hill Tribes, Isengard, Mordor).

## Design rules

- Each mission has **one main new rule** and at most **one or two accompanying rules** that fit naturally with it.
  Never everything at once.
- **Each mission uses only rules already learned.** The rest are switched off by scenario rules:
  - `noShoot`: nobody shoots,
  - `noCharge`: the player does not Charge,
  - fixed Priority: `priority: 'good'` or `'evil'`, no roll.
- What the scenario does not switch off (e.g. Make Way), the app does for the player. Such a rule gets a dashed chip in the log, "taught by mission N".
  The "Rules in play" list shows only rules already learned.
  Which mission teaches a given rule follows from the `rules` fields (cards in the briefing) and `also` fields (rules introduced without a card) in `js/data/missions.js`.
- The **"New rule" window** appears the moment a rule enters play for the first time in the whole game
  (e.g. Duel Roll before the first roll, Trapped when a model cannot Back Away for the first time). It explains how the rule works
  and how to use it, shows a simple drawing and a "Right now" line with numbers from the board. Once shown, the window does not return
  in later missions (saved in the browser). The text is in `js/data/lessons.js`; a new rule in a later mission needs
  an entry there and a `teach([...])` call at the place where the rule first takes effect.
- The mission can be won only once the player uses the new rule, but the missions are set up so that the player **usually wins**.
  The simulator (`node tools/balance.mjs`) plays each mission with a sensible strategy; we aim for at least 75% wins.
- The order follows dependencies: Prone before cavalry, obstacle height before Barriers, Will before magic.

## Chapter I: Basics (done)

| # | Mission | New rules | Uses rules already learned | Scenario | Simulator wins (1500 games, 12.10.2026) |
|---|---|---|---|---|---|
| 1 | The Scout | movement, Difficult Terrain, Control Zones (+ model profiles without a card) | — | Priority always the player; no shooting and no Charge | no dice |
| 2 | Hail of Arrows | movement and shooting, To Hit, In The Way (+ To Wound roll without a card) | movement | Priority always the player; no Charge | 82% |
| 3 | Armour Matters | the To Wound table, shooting from behind cover (a model touching the low wall shoots without an In The Way test; the same when it shoots from behind a friend's shoulder who touches the wall) | shooting, In The Way | Priority always the player; the river makes a Charge impossible | 97% |
| 4 | First Clash | Charge, Duel Roll, Pairing Off (+ ties, Back Away, roll-off, Strikes and fight order without a card) | movement, Control Zones, To Wound | Priority always the player, so the player splits the fights and chooses their order | 78–80% |
| 5 | Troll in the Ravine | fights of several models, Trapped | Duel Roll, Back Away, Strikes, Pairing Off | the troll stands in a dead end of the ravine with rocks behind it and does not move | 86% (with 9 warriors it was 74–77%) |
| 6 | Brawl at the Ford | fight order in practice (decided by who is Trapped), choosing the Strike target | Pairing Off, fights of several models, Trapped | Priority always the player | 84% |
| 7 | Battle for Edoras (finale) | **Priority roll and choice**, shooting into combat (Evil) | everything above; the enemy splits the fights when it has Priority | roll every turn | 85% |

Changes from the first version, all made so that the player usually wins:
- mission 2: 36″ table, 7 archers and a Ranger, smaller bushes;
- mission 3: 6 shooters; instead of two clumps of bushes, one low wall behind the whole line (every enemy shot has to pass it),
  one Uruk-hai crossbowman instead of two. A player who shoots at random targets wins 85–91% of games in the simulation.
- mission 4: 4 player models, 10 turns; Pairing Off moved here from mission 6, because it is the basis of every fight;
  the player creates every fight themselves (also 1 on 1) and from this mission chooses the fight order themselves when they have Priority;
  when the enemy has Priority, the game stops and shows its split and order;
- mission 5: troll with 2 of 4 Wounds, 10 warriors (the tenth added on 12.10.2026, when the simulator showed 74–77%), 10 turns; the troll does not Charge, it only holds the end of the ravine,
  so a lost fight leaves it Trapped (in the simulation in 84% of lost fights); the warriors start 2″ closer;
- mission 7: 10 player models against 9, 12 turns.

## Chapter II: Fighting in formation (warriors only)

**8. Spear Wall** (done, simulator: 92%; without spear support the same mission gives 44%)
- Main rule: Spear and Supporting (Rules Manual 2024, pp. 104–105). A supporter adds one die with its own FV and one Strike,
  and is not part of the fight, so it cannot be hit and does not Back Away. Details from the manual that the game takes into account:
  only a model that is not itself Engaged and did not shoot this turn can support; the supported model has a base of the same
  size or smaller; one spear supports one fight per phase; its Strike can hit any enemy in that fight.
  When a spear touches friends in several fights, the app chooses the fight in which its side has the worst chances.
  The supporter's FV counts in a tie (manual: "this die uses the supporter's FV").
- Accompanying: Back Away decisions. The player clicks where their loser Backs Away, and decides on **Make Way**: one
  ally that is not Engaged moves by at most 1″. The manual (p. 52) allows Make Way even when
  the Back Away would be possible without it, to keep the formation: the spear Backs Away together with the fighter and keeps supporting them.
  Backing Away and Make Way cannot pass through obstacles (pp. 51–52).
- 4 Warriors of Minas Tirith with shields and 4 with "Shield and Spear" (the only spear option in the 2024 list, so D6)
  in a pass 6″ wide, against 10 Hill Tribesmen. The enemy has Priority every turn (it attacks), goal: 8 of 10 killed in 8 turns.

**9. Pike Square** (done, simulator: 91%; without the third rank of pikes 24%, without the banner 80%)

Rules checked in the Rules Manual 2024 (PDF pages):
- Main rule: **Pike** (p. 105). A pike supports exactly like a spear. In addition, a model with a pike can support **another model
  with a pike that is itself supporting** a fighting friend: the fighter gets two supports, and the formation has three ranks.
  Only pike through pike: a pike standing behind a spear does not add a second die. One pike supports one fight per phase.
- The risk of a deep formation is part of the same rule: only one model does Make Way (p. 52), so when the fighter
  loses, and two pikes stand behind it one after another, there is usually nowhere to Back Away and it is Trapped. The manual says so
  explicitly at the pike. The engine already computes this: in a tight 3 × 3 block the fighter at the front is Trapped, with gaps of 0.5″
  between the columns a pike from the second rank can do Make Way diagonally (checked with `backAwayOptions`).
- The pike is two-handed: −1 to Duel Roll if the model also has a shield or a ranged weapon (p. 105), and the shield then does not give
  +1 Defence (p. 111). The profiles in this mission have no shield with the pike, so the penalty does not apply; the rule card only mentions it.
  (The pike also gives +1 To Wound against the mount of a charging cavalry model: that belongs to chapter IV.)
- Accompanying: **Banner** (p. 109). Range 3″ from the bearer. A fight uses the banner when a friendly model in it
  (fighter or supporter) is in range and has Line of Sight to the banner. Then one friendly model in that fight
  re-rolls one of its Duel Roll dice; several banners still give one re-roll per fight. A die the model is currently winning
  may not be re-rolled in order to lose. The re-roll comes after modifiers and also receives them, and the second result stays (p. 50).
  When both sides can re-roll, the one who is currently losing decides first, then they alternate (p. 50).
  **The banner bearer has −1 to their own Duel Rolls** (p. 109), so it is better to keep them behind the formation.
  The banner does not work when the bearer is Prone. When a warrior bearer dies, they can hand the banner to a friend in contact
  who is not Engaged and has the banner in their profile options (that model then discards the rest of its wargear).

Scenario (chosen variant A: the player commands the pikes; the enemy is Mordor orcs, no banner):
- Gondor against Mordor, Pelennor. Player: 3 Warriors of Minas Tirith with shields (D6) in the first rank,
  6 Men-at-Arms of Dol Amroth with pikes in the second and third (MV 6 FV 4 SV 4+ S 3 D 5; 2024 profile from the Good Legacy list,
  the only Gondor infantry with a pike), Banner Bearer: Warrior of Minas Tirith with a banner (D 5, no shield: the banner
  is a separate option). Enemy: 14 Mordor Orc Warriors with shields (MV 6 FV 3 SV 5+ S 3 D 5).
- Board 24 × 18: a causeway 3.2″ wide between deep water. Exactly three columns fit with no gaps,
  so a losing fighter in three ranks is Trapped. This risk cannot be avoided by positioning; it can be
  reduced by winning more often, and that is what the banner is for. The first rank stands at the mouth of the causeway, on the open bank,
  so the orcs can attack the outermost fighters two at a time (in the first version the causeway started in front of the formation:
  fights were only 1 on 1, Trapped almost never happened, and the game was slow).
- Start: the first and second rank stand on the causeway (shield, pike behind it, as in mission 8). The third rank and the banner stand
  at the back, behind the water. The player's first task: to bring up each pike so that it touches the pike of the second rank,
  not the fighter. The move preview says what the pike will do ("A pike behind a pike: it Supports the fighter in front…",
  and behind a spear: "Only a pike can Support through a pike").
- Priority: roll every turn, as from mission 7. Goal: kill 10 of 14 orcs by the end of turn 8.
- The estimate from the design held up: a fighter with two pikes against two orcs is 3 dice with FV 4 against 2 with FV 3,
  winning about 72% of fights (about 79% with the banner re-roll), then 3 Strikes on 5+. Losing in three ranks
  means Trapped: two orcs roll twice each on 6+, and the fighter dies in about 52% of such fights.
- Orcs crowded at the mouth of the causeway also block their own retreat: a losing orc is sometimes Trapped, although one orc can Make Way for it.

Variant B, postponed: Uruk-hai with pikes against Rohan. Rohan has no model with a pike in 2024,
so the player would fight against pikes, not with them. The lesson would be about breaking a block: winning against the front Uruk-hai gives Trapped
(two pikes stand behind it), and a Charge from the side against a supporting pike takes away its support. Needs an AI that arranges support.

What was built in the engine:
1. Profiles in `units.js`: Man-at-Arms of Dol Amroth (`pike`) and Warrior of Minas Tirith with a banner (`banner`), icons in `tokens.js`.
2. Pike support in `combat.js`: `canSupport` accepts a spear or a pike; `assignSupport` in a second pass adds to the fight
   a pike that does not touch the fighter but touches a pike already supporting that fight (`c.via` says behind which one).
   Only one such level.
3. Modifiers to single dice in the Duel Roll (also used in mission 10): `rollDuelDice` gives dice with the model
   and a modifier (`duelMod`: −1 for the banner bearer and for a pike with a shield or a bow), the result clamped to 1–6 (p. 18).
   `duelOdds` computes the distribution of each die separately; without modifiers and banners it gives exactly the same as before.
4. Banner: `bannerFor(c, side)` (range 3″ from base to base, Line of Sight as for a Charge), re-roll after
   modifiers, the losing side first, then the other side (`rollDuel` for the simulator, step by step in `flow.js`).
   `duelOdds` computes the chance with re-rolls exactly (checked by a simulation of 200 thousand rolls).
5. Dice tray: the player clicks one of their dice (gold outline) to re-roll it, or "Keep the dice". A re-rolled die
   has a ↻ mark, a die with a modifier has a −1 mark. The same window will later serve for Might (`docs/hero-missions.md`, stage A).
6. Board and panel: a 3″ circle around the banner, a support line pike → pike → fighter, "banner re-roll"
   and the warning "Trapped if you lose" in the fight list, a hint at the re-roll with the number needed to win.
7. Lessons and the `pike` and `banner` cards; both appear at the first move in mission 9.
8. Simulator: the "Pike Square" strategy in `tools/balance.mjs`.

Simplifications: the banner re-roll goes only to the side that is losing (not on a tie before the roll-off);
a banner bearer who dies does not pass the banner on (in this mission they stand behind the formation and do not get into a fight).

**10. Axe and Shield** (done, simulator: 83% when the player Shields; without Shielding 64%)

Rules checked in the Rules Manual 2024 (PDF pages) and in the BSData data (Hukoseft repository, wargear texts):
- Main rule: **Shielding** (p. 111). A model with a shield (also a light shield, which gives no Defence) may at the start of
  a fight, before the Duel Roll, declare Shielding. It then doubles its Attacks for that fight, but if it wins, it makes no Strikes
  (the losers still Back Away or are Trapped). It also does not use the special rules of its weapon.
  In a fight of several models all Shield or none; if one cannot (e.g. has no shield), nobody can.
  A model in Shielding cannot be supported (a spear or a pike adds no die). Cavalry cannot Shield.
  It is an Active ability: when both sides have abilities at the same moment, the player with Priority decides first (p. 124).
- Accompanying: **two-handed weapon** (p. 104). −1 to Duel Roll dice, but no penalty on a natural 6. +1 to the To Wound roll
  on Strikes (with 6/4 to both rolls). A model fighting with a two-handed weapon does not use a shield in that fight, and a shield
  does not give +1 Defence to a model carrying a two-handed weapon (p. 111). Whoever also has an ordinary weapon chooses before the Duel Roll (p. 50);
  whoever has only a two-handed one must use it. In 2024 there is no general rule "a natural 1 always misses" (p. 18 only says
  that the result stays between 1 and 6), so +1 turns 5+ into 4+, and 6+ into 5+.

Numbers for one fight (exact; our model with a shield against Isengard orcs with two-handed weapons, FV 3, S 3, D 4):

| Our model | Orcs | Fights: wins / dies / kills | Shields: wins / dies |
|---|---|---|---|
| Rohan Royal Guard (FV 4, D 6) | 1 | 69% / 10% / 0.23 orc | 82% / 6% |
| Rohan Royal Guard | 2 | 53% / 26% (38% when Trapped) / 0.18 | 70% / 17% (24%) |
| Rohan Royal Guard | 3 | 44% / 40% (51%) / 0.15 | 62% / 27% (35%) |
| Warrior of Rohan (FV 3, D 5) | 1 | 61% / 19% / 0.20 | 75% / 12% |
| Warrior of Rohan | 2 | 45% / 41% (52%) / 0.15 | 61% / 29% (37%) |
| Warrior of Rohan | 3 | 35% / 57% (64%) / 0.12 | 51% / 43% (48%) |

- Shielding raises the chance of winning a duel by 14–17 points and lowers the risk of death by 25–40%,
  but it removes all blows. In a 1-on-1 fight it pays to fight; when there are more opponents or losing means
  Trapped, it pays to Shield. That is meant to be the lesson.
- The enemy's two-handed weapon works both ways: −1 makes the orcs win duels less often, and +1 makes a won
  duel hurt more (a Royal Guard dies to an orc on 5+ instead of 6+, a Warrior of Rohan on 4+ instead of 5+).
- A spear from behind gives as many dice as Shielding, and Strikes on top. That is why a model in Shielding cannot be supported:
  with a spear behind it, Shielding would never pay.

Scenario (chosen: Rohan against Isengard orcs, the goal is survival, a two-handed weapon only for the enemy):
- Rohan against Isengard, Westfold. Player: 3 Rohan Royal Guard (FV 4, D 6, shield)
  and 4 Warriors of Rohan with shields (FV 3, D 5). Enemy: 12 Isengard Orc Warriors with two-handed weapons (FV 3, S 3, D 4),
  which they always fight with (scenario rule; they also have an ordinary weapon, so at the table they could choose).
- Why these sides: Rohan has no Shieldwall rule (Warriors of Minas Tirith have it, the game does not compute it, and the name is easily confused
  with Shielding). Isengard orcs have no special rules. Hill Tribesmen have Hatred (Rohan), that is +1 To Wound against
  Rohan, which the game does not compute, so with two-handed weapons they would give a false picture.
- Board: a stone farmstead wall across the whole table with a gate 2.2″ wide. Two Royal Guard stand in the gate, the rest wait
  in the yard and step into the place of a fallen one. The orcs can attack only from the front, usually one or two per defender.
- Priority: roll every turn. Goal: hold the gate until the end of turn 7 (then Erkenbrand's riders arrive) and lose
  at most one of the 7 models.
- Result in the simulator (1000 games): Shielding before every fight 83%, never 64%, Shielding only where it pays
  "in models" (counting also killed orcs) 55–59%.
- The conclusion the mission carries: when you only have to hold a position, blows give nothing, so Shielding before every fight is
  best. When you have to kill, Shielding wins nothing. That is what the hint, the rule card and the mission summary say.
  The design criterion that "always Shield" should come out worse than a mixed strategy was dropped together with choosing the goal "survival".

The road to this layout (simulator, different Shielding strategies):
- First version: 7 defenders under a barn wall, 14 orcs, 8 turns, keep 4: 1–5% wins. Every loss is Trapped,
  and 7 fights per turn kill on average about one defender per turn.
- Without the wall, with fewer orcs and a shorter time: 15–36%. The orcs surround the outermost models, and losses are still too many.
- The gate limits fights to one or two per turn. With the goal "keep 4" you always win (92–99%), so Shielding changes
  nothing. The threshold "lose at most one" makes every loss count, and 7 turns instead of 8 gives the player some slack.

What was built in the engine:
1. `units.js`: Isengard Orc Warrior with a two-handed weapon (`twoHanded`, with a `note` field on the card). The engine reads the shield
   from the wargear: an entry starting with "Shield" or "Light shield" (`hasShield` in `combat.js`).
2. `combat.js`: the two-handed weapon as −1 to dice except a natural 6 (`six` in the dice and in `dieDist`), +1 To Wound
   (`woundBonus`, `rollWound(need, bonus)` and `pNeed(n, bonus)` in `rules.js`, with 6/x for both rolls, result not above 6).
3. Shielding: `canShield(c, side)` (everyone with a shield, nobody with a two-handed weapon or from cavalry), `shield: { good, evil }`
   in `rollDuelDice`, `duelOdds`, `combatOdds`, `combatValue` and `rollDuel` (doubled Attacks, no support, no Strikes
   for the winner). `shieldPays` compares both decisions in models and decides for the enemy.
4. `flow.js`: before the fight roll a second button "Shield, then roll", when all the player's models in that fight have shields.
   The side with Priority declares first. The enemy Shields only from mission 10 (earlier, e.g. Rohirrim Traitors in mission 7,
   the rule had not been learned). In the log and the tray: "Shielding: Attacks doubled", "won while Shielding, no Strikes",
   dice with −1 ("not on a 6") and the To Wound roll with "+1 for the two-handed weapon".
5. `panel.js`: both decisions in the panel (dice, and with Show odds the chance to win) and the Shielding button, which disappears
   when the next fight does not allow Shielding.
6. Lessons and the `shielding` and `twohanded` cards; both windows appear before the first fight with the orcs.
7. Simulator: the "Axe and Shield" strategy (the reserve occupies the gate, Shielding before every fight; `SHIELD=never`
   and `SHIELD=value` for comparison).

Simplifications: the choice of weapon (ordinary or two-handed) is not simulated, a model with a two-handed weapon always uses it;
a hand-and-a-half weapon works as an ordinary weapon. The enemy AI Shields only when it pays according to `shieldPays`.

**11. Spears of the Westfold** (done, 15.10.2026; simulator: 78%, 63% without throwing on the Charge)
- Main: throwing weapons (`weapons_and_wargear/#throwing-weapons`, p. 107): a throw in the Shoot phase even after a full
  Move, or once per turn as the model Charges (it stops 1″ away, throws with no −1 for moving, then finishes the Charge;
  if the target falls, it may Charge another). Accompanying: Spear Mastery (the Rohan army rule on the Warriors of Rohan
  profile): the throwing spears fight as a spear (Support), but not in a turn they were thrown in the Move or Shoot phase.
- 8 Warriors of Rohan with shields and throwing spears (two ranks) against 10 Hill Tribesmen (F3 S3 D3), 24 × 18,
  8 turns. Goal: slay 7 of the 10, keep at least 3 Warriors.
- Engine: Spear Mastery is now a special rule in play only once taught (`special.js: SPECIALS`), and a model whose spear
  comes from it (throwing spears) does not Support after a throw this turn (`combat.js: canSupport`, `u.threw`); before,
  such a model always Supported.
- Why so: at most half the Warriors Charge in a turn and throw first, the rest Support. Against Defence 3 a thrown spear
  wounds on a 4+, so throwing in the Shoot phase with everyone (and losing those Supports) did about as well as
  keeping the spears (78% against 80% at 500 games, 73% against 68% at 200); the tip calls it a choice. First
  draft (slay 8 in 6 turns, keep 5) gave 58–62%; the losses were the Warriors' own casualties.
- Built: the mission, lesson cards `throwing` and `spearMastery` (Move phase, when the player has such models), rule
  text `spearMastery`. Balance strategy: half the Warriors Charge and throw, the rest Support, everyone throws in the
  Shoot phase. `THROW=never` (no throw on the Charge), `SHOOT=free` (only models that Support nobody throw),
  `FRONT=all` (everyone Charges). The tool passes a strategy's `throwAt` to the simulator now.
- In the browser ("AI plays for you") the tribesmen Charged first, so that run had no throw on the Charge; the throw
  panel itself is the one from E3.

## Chapter III: Terrain

**12. Over Hedge and Cliff** (done, simulator: 90%; running straight past the sentries and starting the climb
with leftover movement 46%)

At the user's request this mission teaches all the rules of movement over terrain at once, against the "one new rule" principle.
So that the player does not get everything at once, the route leads over the obstacles one by one, and each rule has its own
"New rule" window at first use. The former mission 13 ("The Cliff": Climb, Leap, falls, Prone) was merged into this mission.

Rules (Rules Manual 2024, pp. 32–37):
- **Heights** (p. 32): an obstacle up to half the model's height is crossed without a test (you cannot stand on it),
  from half to full height it requires a Jump Test, taller a Climb Test. Raised terrain likewise: a step up to half
  the height is entered with normal movement, and a descent no deeper than the model's height is free (Descending, p. 36).
  Back Away and Make Way do not cross obstacles and make no tests. Height with the base: a man about 1.2″,
  a monster on a 60 mm base about 2.5″ (an approximation; the army data does not give height).
- **Jump** (p. 33): on a 1 the model stays and its activation ends; on 2–5 it lands on the other side and its move ends, and if it landed
  in an enemy Control Zone, it must Charge it by the shortest route (if Move is enough); on a 6 it lands and keeps moving.
  The horizontal distance counts against Move.
- **Leap** (p. 34): a gap no wider than two model heights, Move must be enough to reach the other side. On a 1: a fall to the bottom
  halfway across, Falling Damage, Prone, end of activation; 2–5 and 6 as for a Jump.
- **Climb** (p. 35): higher than the model. Each inch vertically counts double (Difficult Terrain). On a 1: a fall, Prone
  at the foot (with Falling Damage, if from a height greater than the model's height); on 2–5: it climbs as long as Move lasts or to the top,
  and ends its move (with the same mandatory Charge); on a 6: as 2–5, but it may keep going. A model that ran out of movement
  hangs halfway and tests again next turn. Climbing down a cliff deeper than the model's height works the same way.
- **Falling and Falling Damage** (p. 36): Prone at the bottom, end of activation; for a fall deeper than the model's height one hit
  with Strength 3 and one more for each full inch above the height. A loser in a fight at the edge, with no other place
  to Back Away, backs over the edge: first the winner's blows, then the fall (p. 51).
- **Prone** (pp. 37, 52): no Control Zone, half height for Line of Sight; movement is crawling up to 1″ or standing up for half
  Move and then moving normally (also a Charge); no Charge, Jump or Climb while lying down. In a fight: the winner deals no blows
  (may stand up), the loser is always Trapped.

Scenario:
- Rohan against Isengard, Westfold. Player: 5 Rohan Royal Guard (messengers; F4 and D6, because with Warriors of Rohan
  one guard with a two-handed axe could wipe out all five, and the playtest showed that the player does fight after all). Enemy: 4 Isengard
  orcs with two-handed weapons as sentries (standing still): in the hedge gap, at the top of the stairs, at the end of
  the footbridge and at the edge of the gap.
- Board 30 × 20: a low wall (0.5″, no test), a hedge (1″, jump) with a gap, a cliff 1.8″ (climb) with stairs
  of 0.6″ steps on the side (no test, but guarded), a ridge cut by a gap 2″ wide (leap) with a footbridge
  (guarded), then a descent of 1″ (free) to the EXIT zone. Scrub on the ridge.
- Priority always the player, no shooting. Goal: 3 of 5 messengers in the EXIT zone by the end of turn 8.
- The ideal run is 6 turns: turn 1 the wall and the hedge, turn 2 to the cliff, turn 3 the climb, turn 4 to the gap
  and the leap, turns 5–6 to the exit. Each 1 costs a turn, a failed leap usually eliminates the messenger
  (a 1.8″ fall is one hit with Strength 3, and getting out of the gap means standing up and climbing).
- Simulator (500 games): messengers on lanes away from the sentries, tests with the last inches, climbing from the start
  of the move: 90%. Running straight from the start positions (through the sentries' zones) and climbing with leftover movement: 46%.

What was built:
- `js/engine/terrain.js` (new): terrain levels (`plateau` with height `z`; a gap is the space between plateaus),
  `wall` and `hedge` obstacles with height `ht`, model height, `barrierOn` (what blocks the straight path), `planCross`
  (approach + test + cost), `applyCross` (the roll result), `forcedCharge`, `fallHits` and `rollFall`.
- `geometry.js`: models on different levels do not touch, and the height difference is added to the distance
  (a Control Zone does not reach the top of a cliff).
- `rules.js`: normal movement and Charge do not cross barriers (the message says which test is needed), a model does not stand
  on two levels at once, Prone has no Control Zone and half height for Line of Sight, standing up before a Charge,
  Back Away with a free descent or over the edge (fall), a lying loser is Trapped.
- `combat.js`: a lying winner deals no blows, losers' falls after the blows (`backAwayAll` returns `falls`),
  a lying model does not support with a spear.
- `flow.js`: `doCross` (standing up, approach, the roll in the tray, the result, the mandatory Charge), `fallDamage`, the enemy standing up.
  `input.js`: a click behind an obstacle is a test, a lying model crawls (up to 1″) or stands up and moves. `panel.js`: a preview of the test
  with the cost and the table of results, the Prone and climbing state. `board.js`: plateaus with cliffs and shadow, the footbridge,
  the hedge, the test preview, the Prone and "climbing" labels.
- Lessons and cards: `obstacles`, `jump`, `leap`, `climb`, `falling`, `prone` (links to the Move Phase in the copy of the manual).
- Simulator: the messengers strategy; `MSG=naive` for comparison. Matched play (`tools/matched-check.mjs`) passes unchanged.

Simplifications: model height and the heights are approximations; obstacles taller than the model (climbing over a wall) do not exist,
they are impassable; the enemy AI does not jump or climb, and "AI plays for you" does not make terrain tests; a model hanging
on a cliff cannot fight or be charged; there are no ladders or ropes.

**13. Hold the Wall** (done, 12.10.2026; simulator: 94% with Shielding, 90% without; a player who throws themselves at everything as in
an ordinary battle: 79% with Shielding, 52% without)

Rules (Rules Manual 2024, Fight Phase: Defended Positions, p. 55; Move Phase: Control Zones):
- **A Control Zone ends at an obstacle and at impassable terrain** (Move Phase). The engine did not have this before:
  now the zone is cut off by walls, hedges, rocks and water (the segment from the model to the point may not cross them).
  It also applies to mission 12 and matched play.
- **Barriers**: a model touching with its base a wall or hedge of a height of at least half its own height (and not taller
  than it) defends it. Its Control Zone reaches across the obstacle, and an enemy may not cross it in that zone: it must Charge.
  Only one model can Charge it across the obstacle: it stands at the wall opposite the defender, as close as it can, and counts
  as base contact. The Duel Roll is ordinary. Strikes before Back Away, nobody is Trapped. The defender strikes normally;
  each of the attacker's Strikes must first pass In The Way (4+). A defeated defender who survived stays; the attacker Backs Away.
  A killed defender: the attacker moves into its place at once. A Prone model does not defend.
- Accompanying: **Attacked from Both Sides**. A defender charged also on its own side of the wall loses its protection: an ordinary fight
  (Back Away before blows, Trapped possible, no In The Way), and the attacker from behind the wall may cross after killing the defender.
  Conversely: an attacker charged on its own side by an ally of the defender fights an ordinary fight and may not cross.
- A reminder: Shielding (works across the wall too).

Scenario:
- Rohan against the Usurpers, Eastfold. Player: 10 Rohan Royal Guard (F4, D6): eight at the wall, two in reserve.
  Enemy: 18 Hill Tribesmen (F3, S3, D3). A 0.8″ wall across the whole 24 × 18 board (a jump for a man, so it can be defended).
  Priority rolled every turn. Goal: lose at most 3 of the 10 models by the end of turn 8.
- The first version had a 2.2″ gate with two guards and the condition "no tribesman behind the wall at the end": the simulator gave
  32–47%, because a losing gate guard backed away 1″ and the tribesmen poured through the gap; a loss also occurred when a defender
  died in turn 8. Without the gate and with a simple losses condition the mission came out at 90% and higher.
- The duel across the wall: a Royal Guard wins 58% (75% with Shielding); a tribesman who wins hits across the wall 50% of the time,
  and wounds D6 on a 6, so one fight costs the defender their life 3.5% of the time (2.1% with Shielding). Only a tribesman who got
  over the wall after killing a defender is dangerous: from behind he removes protection from the neighbours, and a losing defender has the wall behind them, so they are
  Trapped. Hence the reserve and the advice in the mission description: Charge the intruder at once with several models.

What was built:
- `rules.js`: `touching` and `linked` (contact across the wall: the charging model has `u.over = { T, t }`, the link lasts while both touch the wall),
  `defends`, `canDefend`, `wallSide`, `zoneCutters` and `zoneBlocked` (cutting the Control Zone), path sampling in
  `validateMove` at obstacles, `chargeOver` in `chargeSpot` (the spot at the wall opposite the defender, only one
  attacker), messages in `chargeFail`. `anyBarriers` takes into account every obstacle taller than 0.5″ (before, only
  hedges, so a 0.8″ wall did not block normal movement).
- `combat.js`: `barrierOf(c)` (fight mode: barrier, bothSides, flanked), `itwStrike`, `mayCross`, `crossBarrier`,
  `barrierBackAway`; `harm` counts half of the attacker's blows and no Trapped; `trappedIfLose` returns an empty list across the wall.
- `flow.js`: `resolveOverBarrier` (blows, In The Way in the tray, Back Away, crossing), `crossOver`, the link in `doMove`,
  the `barriers` and `bothsides` lessons. `terrain.js`: the forced Charge after a jump respects cut zones.
- UI: cut zones drawn as a polygon (`board.js`), the label "defends the wall" above a defending enemy, a Charge preview
  across the wall, a fight list with the fight mode (`panel.js`), chips and the `barriers` and `bothsides` cards, a move to the wall says "defending it".
- Simulator: the "Hold the Wall" strategy (posts at the wall, the reserve Charges intruders together with neighbours; `SHIELD=never|value`,
  `HOLD=naive`), fights across the wall in `tools/balance.mjs` and `tools/matched-check.mjs`.

Simplifications: the attacker always crosses the wall after killing the defender (manual: "may"); protection disappears only when the second
attacker is in the same fight after Pairing Off; "more than twice the size of the Barrier" is checked only on a Charge
across the wall; the enemy AI does not jump over the wall outside the zones. The obstacle height is measured against the defender (both are men).

## Chapter IV: Cavalry

The design is in `docs/cavalry.md` (12.10.2026): the 2024 cavalry rules with page numbers, the Riders of Rohan and Warg Riders profiles,
the scenario of mission 14 with the calculation, the list of engine work in order, a sketch of mission 15.

**14. The Éored Rides** (done, 13.10.2026; simulator: 97%, a player Charging anywhere: 99%)
- Main: Cavalry Charge (Extra Attack and Knock to the Ground, blows against Prone models with two dice).
- Accompanying: the Cavalry card (two profiles, movement 10″, scrub ×4, no Climb, blows against the rider or the mount, the horse flees
  without its rider, the warg stays after a Courage test 2D6); Thrown Rider without a card (`also`), a window at the first killed horse.
- 8 Riders of Rohan against 12 Hill Tribesmen (F3 S3 D3) placed every 5–6″ on a 36 × 24 plain with three clumps of scrub
  and a low wall; no shooting; the player's Priority in turn 1, then a roll. Goal: 8 of 12 in 6 turns, at most 3 riders lost
  (a rider on foot is still alive). The first version had 16 Isengard orcs with shields (D5) standing close together: the simulator gave
  80%, but in the playtest the riders after the Charge got stuck in the fight and the rest of the orcs swarmed them (two losses). With the tribesmen placed
  apart, a defeated enemy rarely dies at once and the riders are free next turn; for the simulator the mission is easy, but the lesson is about the
  Charge itself.
- Engine: a profile with `mount` (`setup.js: mountUp`, the model fights with the higher FV, S and A), `u.charged` on a Charge, `chargeBonus`,
  `knockDown`, blows with `part` (rider or mount; the AI chooses the easier target, on a tie the mount), `thrownRider`,
  `knockedFlying` (a 1 on the jump from the saddle, a fall), `dismount` (a 25 mm model in the same place, still Engaged through `u.held`),
  `separateMount` (the horse flees, the warg: Courage 2D6 ≥ 8 and stays as its own model), scrub ×4 in `moveCost`, `u.stunned`
  (a thrown rider does not move, shoot or strike until the end of the turn). The player chooses the target of a blow with the buttons "Strike the rider"
  and "Strike the horse". Figures: a horse with a rider (`figures.js: horse, mounted`), a warg with a rider, a separate warg.
- Simplifications: no voluntary dismounting, no thrown weapons or lances, no shooting at cavalry (mission 15), the attacker always
  strikes the chosen part in turn (with several blows a choice for each), Arise, Riders of Rohan! needs a General (chapter V).
  A thrown rider in a fight counts as Engaged with the same enemies while standing within the outline of the former base (0.45″).

**15. Wolves of Isengard** (done, 13.10.2026; after the playtest: simulator 100%, a player Charging one by one and not shooting 87%)
- Main: cavalry against cavalry (no Extra Attack and Knock to the Ground when enemy cavalry is in the fight) and shooting
  at cavalry (after a hit a roll: 1–3 hits the mount, 4+ the rider; a wound on the mount is a Thrown Rider). Accompanying, without a
  card: an orphaned warg (Courage 2D6 ≥ 8) stays as its own model and keeps fighting; it counts as a Mount, not infantry.
- 8 Riders of Rohan with bows (24″, S 2; Expert Rider keeps the shield) against 5 Isengard Warg Riders with shields (warg S 4)
  and 4 Hill Tribesmen on foot (Dunlendings in Saruman's service) on a 36 × 24 board with rocks and scrub; shooting enabled,
  Priority rolled. Goal: kill or unseat 4 of the 9 raiders by the end of turn 8 (a warg rider counts after the rider's death
  or when he is left on foot; a loose warg does not), at most 3 Riders lost.
- Why so: the first version (7 Warg Riders, kill 5 in 7 turns) gave 20%: a Rider wounds a rider or a warg only on 5+,
  and a bow shot with S 2 on 5+/6. The second (4 of 7 unseated, 8 turns) gave 85%, but the player lost it: the wargs (S 4 against the horse on 4+)
  win even fights. Four Dunlendings (D 3) give the riders easy Charges with the bonus and show the contrast with the wargs,
  and the threshold of 4 of 9 leaves room for bad luck.
- Engine: `rollShot` with a `cav` step (the part hit), `shotInfo` with the average chance of both parts (`needM`), `doShoot` wounds a part
  through `woundPart` and calls Thrown Rider outside combat; a loose warg has `mountModel` (no Charge bonus against it, it does not go
  Prone). Simulator: the "Wolves of Isengard" strategy (shoot from outside range 10.5″, Charge only in company; riders
  on foot fight only infantry), `WOLVES=naive`.
- Lessons and cards: `shootcav` (shooting at cavalry), `loosemount` (an orphaned warg, `of: 'cavalry'`); the shot preview
  shows both To Wound rolls; the fight list says "no Cavalry Charge bonus: enemy cavalry in the Combat".

## Chapter V: Heroes

**16. The Line Wavers** (done, 13.10.2026; simulator: 87%, a player fighting to the end instead of withdrawing: 85%)
- Main: Broken Army and the Courage Test without Heroes (`docs/courage.md`). The Break Point is half the starting number; it is checked
  at the start of the turn, and once set it stays. Every model of a Broken army, when activated, rolls 2D6 against Courage, failure means fleeing
  (removed as a casualty). An Engaged model does not activate, so it does not test; a model that is not activated does not either.
- 12 Warriors of Minas Tirith (8 with shields, 4 with spears) in two 3″ breaches of the ruins of Osgiliath against 12 Mordor orcs
  with shields (C 8+). Goal: 9 of 12 orcs killed or fled by the end of turn 10, losses fewer than 9 of 12.
- Why so: 20 orcs (including 8 with spears) gave 24–30%, because S 3 wounds D 5 only on 5+ and the orcs died one per turn,
  never reaching the break threshold; 12 orcs with spears 78%; 12 shield-bearers only 87%. The lesson about withdrawing after the break
  gives only 2 points in the simulator, because the retreat strategy is simple; for the player what matters is that they see the tests and the fleeing.
- Engine: `G.start` (the starting state of the sides) and `G.broken` (from mission 16 and in matched play), `checkBroken` at the start of the turn,
  `courageTest`, `needsCourage`, `flee`; in the game the test in the tray when choosing the model to move (`courageAct`) and before the move of each
  AI model; in the simulator and matched-check the test in `applyMove`. Matched play: a broken army really flees (before, Broken gave
  only points). Lessons and cards `broken` and `courage`, the mission status counts the losses of both sides against the thresholds.
- Simplifications: no Stand Fast (mission 17), no test modifiers; the Shoot phase is not an activation.

**17. A Captain's Might** (done, 13.10.2026; simulator: 81%, without the player spending Might: 76%; design in `docs/might.md`)
- Main: Might on dice (the last step after re-rolls and modifiers, +1 to your own die, never above 6, not on a roll-off;
  bidding between Heroes: the loser first). Accompanying: Fate (4+, one point at a time, Might can raise the roll)
  and Will (+1 to a Courage test, together with Might).
- Captain of Rohan (F4 S4 D5 A2 W2, M2 W1 F1) with 6 Rohan Royal Guard against a Hill Tribes Chieftain (F4 S4 D4 A2 W2, M2 W1 F1)
  with 5 Hill Tribesmen, 24 × 18, 12 turns. Goal: kill the chieftain; the captain must survive, at most 4 guards lost.
- Why so: 5 Warriors of Rohan and 7 tribesmen (8 turns) gave 33–41%: the D5 warriors died to the tribesmen, and the captain alone against the chieftain
  lost the bidding (the chieftain spends Might when he fights a Hero). Royal Guard (D6), 5 tribesmen, 12 turns and a captain Charging the
  chieftain only in the company of a guard: 78–81%. The rocks in the middle of the board were removed, because the chieftain and the captain could get stuck behind them.
- Engine (rebuilt on 13.10.2026, `docs/heroes-engine.md`): rolls as procedures in `dice.js` (`d6Test`, `woundRoll`,
  `fateSeq`, `courageSeq`), the Duel Roll with re-rolls and bidding in `combat.js: duelSeq`, blows `strikeSeq`, wounds with Fate `hurtSeq`;
  the computer's decisions `ai.js: aiAnswer` (including `aiMightDuel`, `aiMightWound`). In the game: the Might window in the Duel Roll (click a gold die
  in the tray, one point per click, "Keep the dice"; the enemy responds), buttons at the Hero's To Wound, at Fate and at the Courage test;
  the tray shows a raised die with the tag ★+1. The game and the simulator (`sim.js`) go through the same steps.
- Simplifications of mission 17: no Heroic Actions and no Stand Fast (taught by the next missions). Might already works on all
  rolls from p. 78 (To Hit, In The Way, terrain tests and Thrown Rider too), and the percentages in the panel count Might; mission 17 does not
  need them, because its Heroes do not shoot or jump.

The design is in `docs/hero-missions.md`; its missions 7–15 shift to 16 and beyond (mission 12 took over all of terrain, so chapters III and IV got shorter by one mission). Change from the design:
the mission about courage splits into two, because it taught four rules at once.
- Broken and Courage tests (without Heroes): mission 16.
- Stand Fast and Terror (with a Hero): mission 18.

**18. Stand Fast!** (done, 14.10.2026; simulator: 84%, without activating the Hero first: 47%)
- Main: Stand Fast (p. 61, `courage_and_intelligence/#stand-fast-47`). A Hero of a Broken army who passes its Courage Test calls
  Stand Fast; a Warrior that Activates later within 6″ of it and in its sight passes without rolling. An Engaged Hero does not
  Activate, so it calls none. Accompanying: Terror (p. 131, `special_rules/#terror`): a model that wants to Charge a Terror model
  tests at the start of its Move; failed, it does not move at all. The FAQ has nothing on either rule for this case.
- Háma (C 6+, M2 W3 F2) with 6 Warriors of Rohan with shields and 6 with spears holds a ford (a stream of terrain kind `water`,
  too deep to enter, with a 6″ gap) against a Mordor Troll (Terror) and 4 Mordor Orcs (2 with spears), 24 × 20, 5 turns.
  `start: { good: 27, evil: 5 }`: 14 of Háma's men have fallen before the game, so the army is Broken from turn 1; the enemy breaks
  above 2 losses.
- Goal: hold to the end of turn 5 with at least 4 of the 12 Warriors on the field; Háma must not fall or flee. Slaying the Troll wins at once.
- Why so: the first design (Captain of Rohan, 8 Warriors, Troll + 8 orcs, army breaking after two more losses, enemies to be kept
  off your bank) gave 4–25%: the Troll kills about one man a turn, and models in a fight take no test, so Stand Fast hardly
  mattered. Broken from turn 1, every free model tests every turn, and Stand Fast decides it (Captain of Rohan: 66% against 33%);
  the Captain's one Will Point ran out and he fled (without his loss condition: 79% instead of 65%), so Háma (3 Will) leads instead.
- Engine: nothing new. Lesson card `terror` (lessons.js), shown with the first Terror test (flow.js: chargeNerveAct); the courage
  card no longer says a model left standing takes no test (every model that can Activate does, p. 60). Balance strategy in
  `tools/balance.mjs` (Háma Activates first and stays 2.5″ behind four shields at the ford, spears Support, nobody Charges the
  Troll alone; `SF=naive` skips Háma first). The balance tool's DEBUG line counts fled models.
- Simplifications: no Heroic Resolve (it comes with the Heroic Actions of Move), no war horns or banners.
- Then (design missions 8–15 in `docs/hero-missions.md`): 20 Heroic Move (*With Me*), 21 Heroic March, 22 Heroic Shoot and Accuracy,
  23 Heroic Combat and Strike, 24 Heroic Defence against Strength, 25 Heroic Challenge, 26 the Hammerhand finale.
- New missions go in `MISSIONS` before the Battle of Edoras block: rules are known by array order (`knows`), so E1–E4 meet
  everything the main campaign taught. After each new main mission run `node tools/balance.mjs 300 E1 E2 E3 E4` too.

**19. The King's Guard** (done, 15.10.2026; simulator: 77%, 17% with Bodyguard switched off, 77% with Shieldwall off)
- Main: Bodyguard (`special_rules/#bodyguard`): while the guarded Hero (the General, else the highest tier with the
  Faction keyword) lives and is on the battlefield, its Bodyguards pass every Courage Test. Accompanying: Shieldwall
  (`special_rules/#shieldwall`, p. 129) on the enemy: +1 Defence for a model with a shield touching two friends with it.
- Théoden (`theoden`, BattleScribe profile on foot: F5 S4 D5 A2 W2 C5, M3 W3 F1; his named rules stay on the card), 8
  Rohan Royal Guard and 4 Warriors of Rohan with throwing spears against 6 Uruk-hai Warriors standing shield to shield
  (`hold`), 24 × 20, 9 turns. `start: { good: 27 }`: 14 have fallen, so the army is Broken from turn 1. Goal: slay 3 of
  the 6 Uruk-hai; Théoden must not fall.
- Why so: the Guard fight beyond the 6″ of Théoden's Stand Fast, so only Bodyguard keeps them from fleeing (the Warriors
  near the King pass on his Stand Fast). First drafts: 6 Guard and 4 Warriors against 7 Uruk-hai, slay 5 in 6 turns,
  gave 39% with the King fighting too, and 3–10% with the King kept back: the Guard lost even fights and the Warriors far
  from the King fled. Shieldwall changes the result little here (the wall falls apart as the Uruk-hai Back Away), so it
  is the accompanying rule and the tip says so; attacking the ends first gave 69% against 66% in a draft.
- Built: the profile, the mission, lesson cards `bodyguard` and `shieldwall` (Move phase, when a model has the rule).
  Balance strategy: Théoden Activates first and stays back; the spearmen Support, everyone else Charges the Uruk-hai
  without the Shieldwall bonus first, then ones a friend fights. `OFF=bodyguard`, `OFF=shieldwall` (any special.js key:
  the rule switched off), `ENDS=never`.
- Shieldwall is now taught, so it is in play in every later mission with Uruk-hai (21, 27–29): they still give 79–100%.

**20. With Me!** (done, 14.10.2026; simulator: 80%, without Heroic Actions: 10%, declaring in turns 1 and 2: about 30%)
- Main: Heroic Actions in general (p. 61–62, `heroes/#heroic-actions-61-62`: the declaration step at the start of the phase,
  the side without Priority first, 1 Might each, at most one per Hero per phase) shown on one of them: Heroic Move (p. 63,
  `heroes/#heroic-move-move-phase-63`): the Hero Activates before everyone else whatever the Priority, and with *With Me* the friends
  within 6″ when it shouts Activate right after it and must finish within 6″ of it (or forgo their Activation). Accompanying: when both
  sides declare one, the side with Priority rolls a D6, 1–3 Evil goes first, 4+ Good (p. 62). FAQ: a model that forgoes its Activation
  in a With Me still takes its Broken army Courage Test (the engine does so; 7 and 6 models break above 3 losses).
- Scenario rule: an ambush, the Evil side has Priority in turns 1–3 (`priority: { 1: 'evil', 2: 'evil', 3: 'evil' }`); turn 4 is rolled.
- Captain of Rohan (M2 W1 F1) with 6 Warriors of Rohan (4 with shields, 2 with spears) against a Hill Tribes Chieftain (M2 W1 F1)
  with 5 Hill Tribesmen, 24 × 20, 4 turns. The Snowbourn (terrain kind `water`, too deep to enter) runs across the board at 8–10″
  with a ford 6″ wide in the middle; both bands start in the south corners, about 8″ from it, so nobody reaches it in turn 1.
- Goal: at the end of turn 4, more of your models than of theirs inside the ford (`area`: 6″ × 4″, drawn dashed on the board;
  Engaged models count). Not an Objective Marker: those come in E2.
- Why so: with both bands 6″ from the ford, the first mover took it in turn 1 whatever you did (16–44%). From 8″ the race is
  decided in turn 2: the Heroic Move then wins it; declared in turn 1 it costs the point that turn 2 needs (and probably makes the
  Chieftain, now in reach, answer with his own: ai.js answers a Heroic Move when threatened; not measured). 6 tribesmen: 66%, 5: 80%.
- Built: `m.area` (a scoring area, board.js draws it dashed with a label), the mission's `aiGoal` (both sides walk into the ford
  and stay), the lesson card `heroicMove` (lessons.js), shown with `heroic` in the first Declare step of a Move phase (flow.js:
  declareStep). Balance (`tools/balance.mjs`): the computer's plan for the player plus a `declare` answer (Heroic Move in the turns
  `DECL` lists, default 2,3; `HEROIC=never`); a strategy may now answer the player's declarations (`plan.declare`).
- E3 (Torch the City) no longer lists `heroic` and `heroicMove` (taught here); its lesson is "Heroic Combat · burning Storehouses".
  E1 and E2 got `heroics: []` (a mission's own list of Heroic Actions, flow.js and balance.mjs): with Heroic Moves E2 fell to 72%.
  After this mission: E1 76%, E2 76% (500 games), E3 78%, E4 83% (300 games).
- Simplifications: only Heroic Move is on; Heroic March (the Captain's own) waits for mission 21. The tribesmen's Hatred stays off (E1).

**21. At the Double!** (done, 14.10.2026; simulator: 100% marching in turns 1–2, 71% marching in turns 3–4, 0% without a March)
- Main: Heroic March (p. 65, `heroes/#heroic-march-move-phase-65`): +3″ Move for the Move phase (+5″ cavalry), but no Charge
  at all; with the shout At the Double (`heroes/#at-the-double`) the friends within 6″ of the Hero when it Activates get the same
  +3″ and no Charge, and must finish within 6″ of it (a model that cannot, forgoes its Activation). Unlike a Heroic Move, the Hero
  Activates in the usual Priority order. Accompanying: a marching Hero that is Charged before it Activates loses the March and the
  Might Point (p. 65), so against an enemy in reach that has Priority a Heroic Move (mission 20) is the better buy. One Heroic
  Action per Hero per phase: never both. FAQ: nothing on March beyond the One Ring and Whips of the Masters (not in this game).
- Changed from the first plan (a race against the Chieftain's band coming from the side, too like mission 20): an escape.
  Five Uruk-hai of Isengard (F4 D6: a straight fight is lost) pursue a Captain of Rohan (M2 W1 F1, March) and 6 Warriors of Rohan
  with shields from the west; the gate of Edoras is a zone at x ≥ 34 (`exitX: 34`, label GATE). 36 × 20, 4 turns, `noShoot`,
  Good has Priority in turn 1, then rolled. Mission 20 is the reverse: there you stop and fight for a place.
- Goal: the Captain and at least 4 Warriors through the gate by the end of turn 4 (`need: 5`); the Captain must not fall.
  A model that reaches the gate unengaged leaves the board as escaped (`u.escaped`, not a casualty), so it is safe.
- The arithmetic: the column starts 22–26″ from the gate, so 4 turns of 6″ fall short and a March is required. The pursuers
  have the same Move, so they only catch the rear when they get Priority after the column went first (two moves in a row);
  that is when a Heroic Move (go first) beats a March, whose Captain would lose it to a Charge.
- Why so: the Warriors start in a line at x 9.5 (in a block the middle one was boxed in and left behind), the Captain 1.5″ ahead,
  the Uruk-hai's front rank at x 5.5. The result jumps at that distance: 0.25″ closer and an early March is no longer enough
  (about 70%, the Uruk-hai win Priority twice in turns 2–4 and the Captain has only 2 Might); 0.5″ further and they never reach
  anyone (then a late March wins too). With 6 Uruk-hai and a tighter block: 53–73%. Rohan cannot break here (`breakAt: { good: 1 }`):
  models through the gate leave the board, which counts towards the Break Point, and Courage is not this mission's lesson;
  the army pill and the Armies tab no longer show a Break Point an army cannot reach.
- Built: the mission, the lesson card `heroicMarch` (shown in the first Declare step of a Move phase with the other Heroic
  Action cards), the status line (through the gate, Captain's Might, nearest Uruk-hai). Balance strategy in `tools/balance.mjs`:
  the computer's plan walks the column to the gate; a Heroic Move when the Uruk-hai have Priority and one could reach any of the
  column, otherwise a March in turns 1–2 or when the rear would miss the gate (`DECL` sets the March turns); `HEROIC=never`, `MOVE=never`, `DECL=3,4` as control runs.
  `DEBUG_POS=1` with `DEBUG` adds the player's positions to the trace; the trace shows each turn's Priority.
- Simplifications: Heroic Resolve, Shoot and Combat stay off; no cavalry (the +5″ is mentioned on the card only).

**22. Loose!** (done, 14.10.2026; simulator: 78% with both Heroes declaring in turns 1–2, 76% Take Aim only, 60% Loose only, 55% without)
- Main: Heroic Shoot (p. 63–64, `heroes/#heroic-shoot-shoot-phase`): the Hero shoots before every other model whatever the Priority,
  needs no Missile Weapon of its own, not while Engaged; with Loose the friends within 6″ shoot at the same time, and one that does
  not shoot then cannot later in the phase. Accompanying: Heroic Accuracy (p. 67, `heroes/#heroic-accuracy-shoot-phase-67`): Sharpshooter
  and re-rolls of failed In The Way Tests until the End phase; Take Aim gives friends within 6″ the re-rolls. One Heroic Action per
  Hero per phase, but two Heroes can each declare one. FAQ: nothing on either (only Whips of the Masters, not in this game).
- Háma (M2, Accuracy, Sharpshooter) and a Captain of Rohan (M2, no bow) with 12 Warriors of Rohan with bows in two ranks (the rear
  rank touches the front one and shoots over its shoulder) against 4 Hill Tribesmen archers standing in undergrowth and touching a
  hedge on the far bank of a stream (`water`, `noCharge`). 24 × 18, 6 turns, the Evil side has Priority every turn (`priority: 'evil'`).
- Goal: a race, checked after each volley: 3 tribesmen shot down (`need`) before 4 of your Warriors (`maxLost`), by the end of turn 6;
  Háma must not fall. Neither side breaks (`breakAt` 1).
- Why so: Háma alone with 6 archers against 7 tribesmen in plain undergrowth gave 6–11% whatever he declared (a shot into cover gets
  through 1 time in 12). Two covers (hedge + undergrowth: two In The Way Tests) make Take Aim worth more than double (1/24 → 3/32 per
  shot). A plain kill count left Heroic Shoot worthless (the archers barely died, so shooting first saved nobody); the race to 4 lost
  Warriors gives it about 5–10 points. The rest is the number of archers: 10 in one line 57%, 12 in two ranks 78%.
- Built: the mission, lesson cards `heroicShoot` and `heroicAccuracy` (shown in the first Declare step of a Shoot phase), the status
  line (shot down, Warriors lost, both Heroes' Might). Balance strategy in `tools/balance.mjs`: nobody moves, the Heroes declare per
  `CAP` and `HAMA` (one letter a turn: S Heroic Shoot, A Heroic Accuracy, - none; default SS and AA); `HEROIC=never`.
- Simplifications: no cavalry targets (the Sharpshooter part of Accuracy is on the card only); Háma's Heroic Defence stays off.

**23. Through the Line** (done, 15.10.2026; simulator: 79% with Heroic Combat on a lone tribesman and Heroic Strike against Wulf,
71% Heroic Combat in turn 1 only, 56% without Heroic Actions)
- Main: Heroic Combat (p. 64, `heroes/#heroic-combat-fight-phase-64`): the Hero's Combat is fought before every other; if its
  side wins and every enemy in it is slain, the Hero and the friends from that Combat may Move again (only Move or Charge),
  a Charge fights again in the usual order, and the side with Priority Pairs Off again. Accompanying: Heroic Strike (p. 69,
  `heroes/#heroic-strike-fight-phase`): +D3 Fight Value for the phase (to 10), rolled at the start of the Hero's first Combat.
  One Heroic Action per Hero per phase (p. 61), so Haleth picks one each Fight phase. FAQ: Heroic Combat movers may Jump, Climb
  and so on (not used here).
- Haleth (F6, M3 W3 F1) alone against a line of 5 Hill Tribesmen (`ai: 'hold'`, 3.9″ apart, so 0.9″ between their Control
  Zones: no gap to slip through) and Wulf (F6, M3 W3 F2, `hold`) 5″ behind it. 18 × 18, 3 turns, `noShoot`, nobody breaks.
- Goal: win a Duel Roll against Wulf by the end of turn 3 (`u.duelsLost`, counted by `combat.js: noteDuel` after every Duel Roll,
  in the game and the simulator); Haleth must not fall.
- Why so: first planned against General Targg (design mission 11 in `docs/hero-missions.md`), but Fight Value counts only for
  tied Duel Rolls (p. 30–31, `fight_phase/#duel-roll-30-31`), and Haleth's F6 already beats Targg's F5 and the tribesmen's F3: Heroic Strike changed nothing and
  only cost Might (12% Strike every turn against 33% without any). Wulf has F6 like Haleth, so a tie goes to a roll-off and a
  Heroic Strike wins it. Slaying or wounding Wulf (W3, F2, M3) was a coin toss either way (14–50%), and the Heroic Actions made it
  worse (the Might went to them instead of Fate); winning one Duel Roll is the thing both rules act on. With Warriors of Rohan
  beside Haleth they blocked his sight of Wulf after the Heroic Combat, so he goes alone (as in the design).
- Built: the mission, lesson cards `heroicCombat` and `heroicStrike` (shown in the first Declare step of a Fight phase), the
  status line (Wulf beaten or not, both Heroes' Might). Balance strategy in `tools/balance.mjs`: Haleth Charges Wulf when he can,
  otherwise the tribesman nearest Wulf; Heroic Combat when he fights one tribesman alone, otherwise Heroic Strike; whoever can
  Charge Wulf moves first after a Heroic Combat; `PLAN` (one letter a turn: C, S, -) and `HEROIC=never`. The balance brain passes
  a strategy's `heroicMove` on to the simulator.
- Simplifications: Wulf's Heroic Challenge and Heroic Strength stay off (missions 24–25), Hatred stays off (E1), no Master of Battle.

**24. Unbreakable** (done, 15.10.2026; simulator: 79% answering Freca's Heroic Strength with Heroic Defence and keeping Might off
the dice, 67% when Háma also spends Might on dice, 52% without Heroic Actions, 51% declaring Heroic Defence blind in turns 1–2)
- Main: Heroic Defence (p. 69, `heroes/#heroic-defence-fight-phase`): for the rest of the Fight phase the Hero is wounded only on a
  natural 6, whatever the Strength, modifiers or Might (6+/4+ and the like: both natural 6s); not its mount. Accompanying: Heroic
  Strength (p. 69, `heroes/#heroic-strength-fight-phase`), used by the enemy: double Strength (to 10) for Strikes until the End phase.
  The declaring order (p. 62: the side without Priority first, in turn, a side that passed may declare later) lets the player answer
  one with the other. FAQ: nothing on either.
- Háma (D6, M2 W3 F2, starts with 1 Wound of 2) alone in a 3.5″ pass between two rocks against Freca, Lord of the Westmarch
  (F5 S4 D6 A2 W2, M3 W2 F0, Heroic Strength; new in `units.js`, from the BattleScribe data) and 3 Hill Tribesmen. 18 × 18, 4 turns,
  `noShoot`, nobody breaks.
- Goal: Háma alive at the end of turn 4 and no enemy on the road behind the rocks (`area`, label ROAD); slaying Freca wins at once.
  The losses in the simulator are all Háma slain: his Control Zone fills the pass.
- Why so: S4 against D6 is 5+, Freca's Heroic Strength makes it 3+, a tribesman's S3 needs a 6 anyway, so Heroic Defence matters
  only against Freca's Strength turns. With Háma at full Wounds and 4 tribesmen the Heroic Actions changed 9 points (82% against 73%):
  the computer's Háma spent his two Might on Duel Rolls and had none left for a Heroic Defence. One Wound left and Might kept for
  Defence opens the gap (79% against 52%) and teaches the design's point: save the point for the worst moment. 3 turns: 86% against
  66%, too little for keeping Might; a 4″ pass 76%, a 3″ pass 82% but only 60% → 82%.
- Built: the mission, the Freca profile, lesson cards `heroicDefence` and `heroicStrength` (shown in the first Declare step of a Fight
  phase). Balance strategy in `tools/balance.mjs`: Háma stays put, answers a Heroic Strength of Freca in his Combat with a Heroic
  Defence, and spends no Might on dice (a strategy's `keepMight`; `MIGHT=dice` lets him); `PLAN` (D or - a turn) and `HEROIC=never`.
- Simplifications: Freca's Heroic Challenge, Hatred, Dunlending Heritage and Claim the Throne stay off.

**25. The Challenge** (done, 15.10.2026; simulator: 89% challenging Freca, 74% without Heroic Actions, 58% with Heroic Strike
instead of the challenge)
- Main: Heroic Challenge (p. 68–69, `heroes/#heroic-challenge-fight-phase-68-69`): declared in the Fight phase against an enemy
  Hero within 6″ of the same Heroic Tier or higher (no base contact needed); engaged with its target the challenger has +1 Attack
  (Duel Roll and Strikes) and +1 To Wound, and slaying it gives back a Might Point. The target accepts (same bonuses, both must
  Charge each other when they can) or declines (only the challenger gets them, and it may not challenge back). FAQ: only the
  Survival Instinct case (not in this game).
- Haleth (F6 A3, M3 W2 F1) with 4 Warriors of Rohan against Freca (F5 A2 D6 W2, M3, no Fate) and 4 Hill Tribesmen, 24 × 18,
  4 turns, `noShoot`, nobody breaks. Goal: slay Freca by the end of turn 4; Haleth must not fall.
- Why so: first built as the design's Haleth against Wulf (Wulf `hold` behind his men, 5 turns): 17–32% whatever Haleth did.
  Wulf is a little stronger than Haleth (ai.js `power`), so he challenges or accepts, gets the same bonuses, and Heroic Strength
  makes him wound Haleth on a 3+: the challenge changed nothing (28% against 31%). Freca is of the same tier (Valour) but weaker,
  so the computer declines and the bonuses are Haleth's alone: 4 Attacks, and Defence 6 wounded on a 4+ instead of a 5+.
  3 turns: 71% against 55%; 5 turns: 95% against 83%.
- Engine: a `hold` model (ai.js `aiPlanMove`) now makes the Charge an accepted Heroic Challenge forces, and a forced Charge may go
  into the opponent's fight ("if possible", p. 68; before, only at an unengaged opponent). The lesson card `heroicChallenge` is
  tied to its own rule (it had `of: 'heroic'`, which would have shown it from mission 20 on) and shows in the first Declare step
  of a Fight phase too.
- Built: the mission, the status line (both Heroes' Wounds and Might, who challenged and the answer). Balance strategy in
  `tools/balance.mjs`: Haleth Charges or walks at Freca, the Warriors Charge the tribesmen, Haleth challenges Freca when he can;
  `CH=never` (Heroic Strike against Freca instead) and `HEROIC=never`.
- Simplifications: Hatred stays off (E1). Accepting or declining is taught by the card only: no Hero of the computer's here is
  strong enough to challenge Haleth.

**26. The Hammerhand** (done, 15.10.2026; simulator: 85% with Helm's free Heroic Combat whenever he fights one enemy, 75% without
it, 77% without any Heroic Actions of the player)
- Main: Into the Fray, Helm Hammerhand's own rule (War of the Rohirrim, p. 38, from the BattleScribe data): a Heroic Combat in every
  Fight phase without Might (still his one Heroic Action of the phase); once he has slain an enemy, he must Charge whenever he Moves
  and can. Accompanying: Burly (Helm's two-handed weapon without the −1 on the Duel Roll). Every Heroic Action taught before is in
  play for both sides.
- Helm Hammerhand, King of Rohan (F6 S5 D7 A3 W3, C4+ I5+, M3 W3 F3, Legend; Challenge, Strength, Strike; new in `units.js`),
  Haleth, Háma and 6 Warriors of Rohan against Wulf, Freca, General Targg, 8 Hill Tribesmen and 4 Rohirrim Traitors, 24 × 24,
  7 turns, `noShoot`, Break Points as usual. Goal: slay Wulf by the end of turn 7; Helm must not fall.
- Why so: 6 turns gave 76% against 65% without the free Heroic Combat; every loss is on time (Wulf not reached), so 7 turns.
  Helm cannot challenge Wulf (a lower tier than Legend); Haleth can.
- Engine: `named.js` `freeHeroic` (Into the Fray, once per turn through `giftTurn`), `slain` sets `u.frayed`, `frayBound` joins
  `mustChargeAny` for the computer and `input.js: frayWhy` refuses the player's plain move while a Charge is possible (named rules
  bound only the computer before). `input.js: duelWhy` now also forces the Charge into the challenge opponent's fight, as ai.js
  does since mission 25. The declaration log says "free, by its own rule" for such actions instead of "1 Might Point". Special rule
  key `intoTheFray`, rule text in `rules-text.js` (its link points to Heroic Combat: the fan copy has no Helm profile).
- Built: the mission, the lesson card `intoTheFray` (first Declare step of a Fight phase), the status line (Wounds and Might of
  Wulf and Helm, "must Charge"). Balance strategy in `tools/balance.mjs`: everyone Charges the enemy nearest Wulf (Helm and Haleth
  first, Wulf when in reach), Helm's free Heroic Combat in a fight against one enemy, Haleth challenges Wulf, Háma answers Freca's
  Heroic Strength with Heroic Defence; `FRAY=never`, `HEROIC=never`.
- Simplifications: Helm always fights with his two-handed weapon (no weapon choice); Horn of the Hammerhand, Leader, Hatred,
  Dunlending Heritage, Claim the Throne, Master of Battle and Dunlending Commander stay off. The Into the Fray block was not
  played through in the browser, only loaded.

## Chapter VI: Magic (requires Will from chapter V)

The magic engine (`js/engine/magic.js`) was done before these missions (`docs/engine-gaps.md`, Magic); they only add
the profiles, the missions, the lesson cards and the balance strategies.

**27. The White Rider** (done, 15.10.2026; simulator: 80–86%, 15–41% without Casting, 18% with the computer's own Casting choices)
- Main: Casting a Magical Power (p. 81, `magic/#making-a-casting-roll-81`): Will Points chosen before rolling, one D6 each,
  any dice at the Casting Value Casts it, the Will is spent either way. Accompanying: Transfix (Temporary) and Sorcerous
  Blast (Instant), and the durations.
- Gandalf the White (BattleScribe profile: F6 S4 D6 A3 W3, M3 W6 F3; only Transfix 3+ and Sorcerous Blast 5+, no Staff of
  Power, Narya or Glamdring) and one Warrior of Rohan against 7 Uruk-hai Warriors running for the south edge, 30 × 24,
  4 turns, `noShoot`. Goal: no more than 2 Uruk-hai reach the road (within 2″ of the south edge; they leave the battle
  there) by the end of turn 4, or all slain; Gandalf must not fall.
- Why so: a kill race (Gandalf and 6 Warriors against 10 Uruk-hai) gave 56–64% with or without magic: S3 Warriors hardly
  wound D6 Uruk-hai, and a Blast in a fight knocks the caster's friends Prone too. In a race for an edge a Transfix costs a
  runner a whole turn, so it decides the game: the Uruk-hai need four turns, one lost turn stops a runner. A second Warrior
  gives 91% against 65%; with one, 80% against 41%. The Staff of Power's free Will Point changed little.
- Built: `gandalfWhite` in `units.js`, the mission (status line, `aiGoal` for the runners), rule texts `sorcerousBlast`
  and `transfix`; the `magic` card leaves Resisting to the next mission. Balance strategy: one Cast a turn, two dice
  while Gandalf has more Will than turns left; Transfix the unengaged runner nearest the road that nobody is near, Blast
  one that would reach the road next turn. `CAST=never`, `CAST=computer`, `BLAST=never` (77%: Transfix does the work).
- In the game: clicking a model on the board picks it in a choice among models (a power's target); before, the click
  moved or Charged the selected caster while the panel was asking.

**28. The Shaman's Fury** (done, 15.10.2026; simulator: 80%, without Resist Tests 81%)
- Main: the Resist Test (p. 81, `magic/#resisting-a-magical-power-81`): the target's Will Points chosen before rolling, a
  dice equal to or above the best Casting dice resists, a Hero gets back the Will of a natural 6; powers on the caster or
  its friends cannot be Resisted. Accompanying: Fury (Exhaustion) and Bladewrath.
- Haleth (M3 W2 F1, Heroic Resolve) with 6 Warriors of Rohan against an Uruk-hai Shaman (BattleScribe profile: F4 S4 D4
  A1 W2, M1 W3 F1; Fury (Isengard Uruk-hai) 3+, Bladewrath 4+, Transfix 5+; `hold`) with 2 Uruk-hai beside him and 2 in
  front, 24 × 18, 6 turns. Goal: slay the Shaman; Haleth must not fall.
- Why so: Háma (W3) was planned, but the computer's archer logic never Charges with him (he has a bow), so the balance
  tool could not play him; Haleth has no bow. The computer's Shaman spends its 3 Will in one Transfix (three dice for
  the 5+), so there is one Resist Test a game: the lesson is that decision (the panel shows the chance per dice), not a
  big swing in the result. 4 turns gave 52% against 41% without Resisting, 5 turns 69% against 58%, 6 turns 80% against 77–81%.
- Engine: the computer no longer Transfixes a model that has already moved this turn and is not in a fight (`magic.js:
  castValue`); it used to waste the Shaman's Will on Haleth after his move.
- Built: `urukHaiShaman` in `units.js`, the mission, lesson card and rule text `resist` (taught at the player's first
  Resist Test), rule texts `fury` and `bladewrath`. Balance strategy: Haleth Charges or walks at the Shaman, the rest is
  the computer; he Resists a Transfix with all his Will when it would stop his Charge at the Shaman or his fight, else
  with one dice. `RESIST=never`, `RESIST=computer`. `CASTS=1` prints the Casts of a run.
- Not played through in the browser: the Resist panel itself (it was built with the magic engine); the card and the
  mission were loaded.

**29. The Breaking of the Staff** (finale, done, 15.10.2026; simulator: 82–86%, 61% without Heroic Channelling, 77%
without Resist Tests, 0% without Your Staff is Broken)
- Main: the Staff of Power (p. 107, `weapons_and_wargear/#staff-of-power`): a free Will Point at the start of each turn,
  lost if not spent that turn. Accompanying: Your Staff is Broken (Instant, `magic/#your-staff-is-broken`) and Heroic
  Channelling (`heroes/#heroic-channelling-move-phase`): the next Casting Test counts as a 6, so only a 6 Resists it.
- Gandalf the White (`gandalfWhiteStaff`: the BattleScribe profile with his Staff of Power, Your Staff is Broken 5+,
  Sorcerous Blast 5+, Transfix 3+) alone against Saruman (`saruman`: BattleScribe profile F5 S4 D5 A1 W3, M3 W6 F3,
  Staff of Power; only Transfix 3+ 18″ and Sorcerous Blast 5+; Voice of Curunir and Saruman's Deceit stay on the
  card) with two Uruk-hai guards, all three `hold`; 24 × 36, 6 turns, 31″ apart. Goal: break Saruman's staff (or slay
  him); Gandalf must not fall. The player Casts (Your Staff is Broken) and Resists (Saruman's Transfix at 18″ and
  Sorcerous Blast) from one Will pool.
- Why so: a first draft with 4 Warriors of Rohan and 4 Uruk-hai charging them gave 48% with or without magic choices:
  the Uruk-hai engaged Gandalf or their Control Zones stopped him 0.5″ outside 12″, and his Might went on Duel Rolls.
  Alone, the walk takes three turns, so a Transfix costs a turn. Saruman raises a Resist dice of 5 to a 6 with Might,
  so even a Channelled Cast is Resisted about half the time: his 3 Might decide how many tries Gandalf needs.
- Engine: Your Staff is Broken counts as a serious power for the computer's Resist (`harm: 3`, two dice against a 5
  or 6), and the computer now Casts it (`magic.js: castValue`; before, it had no value, so "AI plays for you" never
  Cast it).
- Built: the two profiles, the mission, lesson cards `staffOfPower` (at the first Cast) and `heroicChannelling` (first
  Declare step of a Move phase), rule texts `staffOfPower` and `yourStaffIsBroken`. Balance strategy: Gandalf walks to
  9″ of Saruman and Casts Your Staff is Broken as soon as he is in range, Channelled when this move brings him in range
  (one Will Point), else three dice; he keeps his Might for Channelling and Resists a Transfix with two dice against a
  5 or 6. `CAST=never`, `CHANNEL=never`, `RESIST=never`/`computer`.
- Played in the browser with "AI plays for you": the Channelling declaration, the Casts and Saruman's Resist with Might
  work; the player's own Cast and Resist panels are the ones from missions 27 and 28.

## Chapter VII: The Battle of Edoras (done, missions E1–E4)

A side campaign with its own numbers (E1–E4; `series: 'E'` in missions.js, `missionNo`), so the main campaign can grow
without renumbering it. The balance tool takes the same numbers: `node tools/balance.mjs 300 E2`.

The four Narrative Scenarios of the starter box's booklet (`docs/edoras/`), in its order. Narrative Play: Good has
Priority in turn 1 and there are no Broken armies (`narrative: true`). They follow the booklet as written (models,
wargear, the 36″ × 36″ mat, houses, markers and deployment zones measured from its maps; the houses it shows turned 45°
turned as on its maps, angles measured from them). Narrative scenarios are not balanced for the player: the 75% rule does
not apply to them. Checked against the booklet on 15.10.2026 (models per side, houses' places and angles within about 1″
and a few degrees of the maps, deployment wholly inside each zone, nothing on a house or a marker).

Either side: the briefing's "Play as" picks Rohan or the Hill Tribes. `flipSide(m)` turns the table 180°, swaps the
sides and sets `align`, so the player is always the side 'good' on the table; check() answers for Rohan by alignment
(`GOOD()`, `EVIL()`) and flipSide turns the answer round; `m.evil` holds the Hill Tribes' briefing texts. The
scenario rules (narrative.js) and the missions' aiGoal ask by alignment. `SIDE=evil node tools/balance.mjs 20 E1 E2 E3 E4`
plays them from the Hill Tribes' side to check they run through (no balance target).

| # | Scenario (booklet page) | New rule | Engine | Good | Evil |
|---|---|---|---|---|---|
| E1 | The First Assault (p. 7) | Hatred; throwing spears only as spears (no shooting) | `SPEARS_ONLY` profile | 12 | 12 |
| E2 | The Gates Fall (p. 9) | Objective Markers (3″, flaming brand counts 2), Sharpshooter, the Heroes' own rules | `objectives`, `brandDominant` (named.js: dominance), `aiGoal` | Háma + 12 | Targg + 16 |
| E3 | Torch the City (p. 11) | burning Storehouses; only Heroic Move, Shoot, Combat (`heroics`) | narrative.js (`fire`, `store` pieces), terrain kind `house` | Haleth + 12 | Targg + 24 |
| E4 | Last Stand of the Princes (p. 13) | Hordes (Reinforcements, no Charge), Victory Points, Háma's escape (draw) | narrative.js (`hordes`), scenarios.js: escapes (`escapeAny`) | Haleth, Háma + 24 | Wulf, Targg + 24 |

A mission's `aiGoal(u)` steers the computer (and AI plays for you, and the balance tool's `byAI` player) towards its
objective (scenarios.js: scenarioGoal). The specialised Heroic Actions (Challenge, Strike, Strength, …) stay switched off,
as the booklet asks; a later mission or matched play turns them on.

## Optional

- Monsters: Brutal Power Attacks (Rend, Barge, Hurl) with an Isengard Troll.
- Not needed to learn the basics: siege engines, sieges, chariots, War Beasts, the One Ring.

## What is still missing (state 15.10.2026) and what to do next

Every chapter of the plan is built (missions 1–29, E1–E4). Rules no mission teaches yet:

| Group | Rules | State | Place in the plan |
|---|---|---|---|
| Monsters | Brutal Power Attacks (Rend, Barge, Hurl), Monstrous Charge, the troll's rock throw | in the engine | optional mission (see Optional) |
| Cavalry (the rest) | dismounting, lances and war spear, pike against a Charge | partly in the engine | matched play |
| Army rules | Hatred (taught in E1 only), Expert Rider (always applied to Riders, no card in a mission), Woodland Creature and the rest | in the engine | matched play; Expert Rider could be a rule card in mission 14 or 15 |
| Out of scope | sieges and engines, chariots, War Beasts, the Ring, scenarios other than To the Death! | in the engine (most) | not planned |

Special Strikes (Feint, Piercing Strike, Whirl, Bash, Stab) are not in the 2024 Rules Manual (the older table here listed them).

## What the app still does for the player

- The Back Away and Make Way direction until mission 8 (from mission 8 the player decides, for the enemy always the app).
  The manual (p. 51) says only: 1″ in a straight line, "not necessarily straight away from the enemy", and with several winners the model chooses
  which one it backs away from. The drawing for example 33 shows backing straight back; there is no angle limit anywhere.
  The app allows up to 60° from the straight-back direction. That is an interpretation: a wider angle (e.g. 90°) would give Trapped less often
  at the river and rocks, so a change would need a new balance for missions 5 and 6.
- When a spear or a pike touches friends in several fights, the app chooses which fight it supports (the one in which its side has the
  worst chances). At the table the player decides.
- Special rules from profiles (e.g. Hatred, Shieldwall) are shown but do not work.
