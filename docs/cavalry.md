# Chapter IV: Cavalry. Design of mission 14 (and sketch of mission 15)

Status: missions 14 and 15 implemented on 13.10.2026 according to points 3 and 4 (recorded in `curriculum.md`, chapter IV). After
playtesting, mission 14 went back to 12 sparsely placed Hill Tribesmen; mission 15 counts riders killed or knocked out of the saddle (4 of 7 in 8 turns).
To do later: cavalry in matched play (point 4.5), dismounting, throwing weapons, lances.
Rules source: Rules Manual 2024, Cavalry chapter (manual pages 67–71; copy: `rules_manual/cavalry/`),
Weapons and Wargear (lance, throwing weapons), Special Rules (Expert Rider). Profiles: 2024 army lists (Rohan, Isengard).

## 1. Cavalry rules in 2024 (what the manual says)

| Rule | Content | Page |
|---|---|---|
| **Two parts** | A cavalry model is a rider and a mount, each with its own profile. The model moves using the mount's Move. In combat it uses the **higher** of the two values of FV, S and A (even mixing them: the rider's FV, the mount's S). Line of Sight is always from the rider. | 67–68 |
| **Movement** | As infantry, but without Climb Tests, and cannot lie down or crawl. Obstacle height is compared with the whole model (rider's head to hooves). Difficult Terrain costs **×4** (1″ in undergrowth is 4″ of movement), and in Difficult Terrain cavalry **gets no Charge bonuses** and no lance bonus. Jump and Leap as infantry, but a result of 1 is also Knocked Flying (like a 1 on the Thrown Rider table). Dropping down further than the model's height: the mount takes a S3 hit plus one for each additional inch. | 68 |
| **Cavalry Charge** | A model that charged gets **Extra Attack** (+1 A) and **Knock to the Ground** in that combat (if it wins the Duel Roll, all infantry in that combat are placed Prone after Backing Away; not monsters and not models with S 6+). Conditions: it charged only infantry and fights only infantry, is not in combat with cavalry, a chariot or a War Beast, is not standing in Difficult Terrain, is not Transfixed. The bonuses remain even if more infantry charged it afterwards. Strikes against Prone models are rolled with two dice (example 55: Théoden). No bonuses through a Barrier. | 70–71 |
| **Strikes against cavalry** | The winner chooses whether to strike the rider or the mount; may split the strikes and resolve them one by one. No In The Way tests. Rider killed: the mount becomes a Separated Mount. Mount killed: the rider makes a **Thrown Rider Test** after all strikes have been resolved. | 71 |
| **Thrown Rider Table** | D6. **1** Knocked Flying: S3 hit; if he survives he is Prone and does not act until the end of the turn (in combat he is struck as Prone). **2–5** Rises From the Dust: stands up, does not act until the end of the turn. **6** Leaps into Action: acts normally. The rider is placed within the footprint of the old base, nearest to its centre; if he was in combat, he still counts as Engaged with the same enemies. | 70 |
| **Separated Mount** | A mount without a rider immediately takes a Courage test (2D6 ≥ C). Passed: it stays as its own model. Failed: it flees (removed). **A Horse (A 0) always flees.** A Warg (C 8+) stays in 42% of cases and keeps fighting (FV 3, S 4). A rider who has been thrown does not remount. | 69 |
| **Dismounting** | The rider may dismount at any moment of the move (no roll), stands up next to the mount, and the rest of the move is made on foot (minus what he has already ridden). A horse without a rider does not move further. A Rider of Rohan with a bow and shield must discard one of them after dismounting. | 69–70 |
| **Shooting at cavalry** | You always aim at the rider; after a hit, a special In The Way test: 1–3 hits the part that was not aimed at (the mount), 4+ the target. | 70 |
| **Courage** | Only the rider tests. | 69 |
| **Expert Rider** (Rohan) | Re-roll the dice in Jump, Swim and Thrown Rider Tests; a rider with a bow and shield keeps +1 D for the shield while he is mounted. | Special Rules |
| **Lance** / war spear | +1 To Wound on strikes in the turn of the charge (not in Difficult Terrain). Rohan and Isengard have no lances; the war spear belongs to Gondor (Knights of Dol Amroth). | Wargear |
| **Throwing weapons** | Thrown in the Shoot phase after a full move or during a charge: the model stops 1″ from the target, shoots without the −1 for moving, then finishes the charge (if the target is alive). Riders have them for 2 points. | Wargear |

Mounts: Horse (40 mm) Mv 10″ FV 2 SV 6+ S 3 D 4 A 0 W 1 C 7+; Armoured Horse D 5; Warg (40 mm) Mv 10″ FV 3 S 4 D 4 A 1 W 1 C 8+.

2024 profiles:
- **Rider of Rohan** (14 pts, 40 mm): rider Mv 6″ FV 3 SV 4+ S 3 D 5 A 1 W 1 C 7+ I 6+; Armour, Hand Weapon, Shield, Bow, Horse.
  Options: throwing spears (2), banner (25). Expert Rider, Arise Riders of Rohan! (+1 FV in the turn of the charge near the General: only with heroes),
  Spear Mastery. D 5 already includes the shield; thanks to Expert Rider the shield counts despite the bow while he is riding.
- **Rohan Royal Guard** with a horse (16 pts): FV 4 D 6, Bodyguard. An elite version for the mission, in case Riders turn out too weak.
- **Warg Rider** (Isengard, 11 pts, 40 mm): rider Mv 6″ FV 3 SV 5+ S 3 D 4 A 1 W 1 C 8+ I 8+; Armour, Hand Weapon, Warg.
  Must take one option: shield (1), orc bow (1), throwing spear (1), shield and throwing spear (2). In combat he uses the warg's S 4.
  (The manual copy gives 25 mm for him; the warg is on a 40 mm base.)

## 2. Mission 14: "The Éored Rides" (Cavalry Charge)

One main rule: **Cavalry Charge** (Extra Attack and Knock to the Ground, strikes against Prone models with two dice).
Accompanying rules, without which the mission cannot be played, but each with its own "New rule" window at the moment of use:
- **cavalry movement**: 10″, undergrowth ×4 and no Charge bonuses in undergrowth (a card in the briefing, because the player has to know this before moving);
- **strikes against the rider or the mount and the Thrown Rider Test** (introduced without a card, `also`): the enemy strikes the horse, because it is easier to wound,
  and a horse without a rider flees; the rider lands on foot. This is the first lesson that the horse is the weak point.

Scenario:
- Rohan against the Usurpers, Westfold. Player: 8 Riders of Rohan (shields; bows unused: `noShoot`). Enemy: 16 Hill Tribesmen
  (FV 3 S 3 D 3) scattered on open plain, with two clumps of undergrowth (Difficult Terrain) and a low wall, near which
  a few tribesmen stand (no bonuses through the wall if they defend it: a reminder from mission 13). The enemy uses the ordinary AI: it charges when it can.
- Board 36 × 24 (cavalry needs room for a 10″ run-up). The Riders start on one edge, the tribesmen from 14″ upwards.
- Priority: player's turn 1 (ambush), then rolled. When the enemy has Priority, the infantry charge the riders first and there are no Charge bonuses:
  then it is better to ride away (10″ lets you leave the zone and return) than to stand still.
- Goal: kill 10 of the 16 tribesmen by the end of turn 6 and lose at most 3 riders (a rider on foot still counts as alive).
- The calculation for one Rider charge on a tribesman: 2 dice against 1 at equal FV, win about 66%; then two strikes of two dice
  on 4+ (D 3): the first strike kills in 75%, so one tribesman dies in about 60% of charges, and a charge on two standing next to each other at once
  usually gives two corpses. A loss (34%): the tribesman strikes the horse (D 4, 5+: 33%), so the horse dies in about 11% of fights; then the Thrown Rider
  Test (with the Expert Rider re-roll) and the rider stays on foot with D 5. In a turn without a charge (when charged) the Rider fights with 1 die
  like infantry. The simulator should show: a player charging across open ground about 85%, a player charging through undergrowth or
  standing still clearly less. We will choose the numbers of tribesmen and turns after the first run of `tools/balance.mjs`.

The course of learning in the mission: turn 1 a charge from 10″ (Cavalry Charge window before the first Duel Roll: +1 die, Prone, two dice per strike),
the first loss with a killed horse (Thrown Rider window), the first move through undergrowth (window on ×4 and the loss of bonuses).

## 3. What has to be built (order of work)

1. **Data**: cavalry profiles in `js/data/units.js`: `riderOfRohan` (rider + `mount: { n: 'Horse', mv: 10, f: 2, s: 3, d: 4, a: 0, w: 1, c: 7 }`,
   `base: 40`, `cavalry: true`, `foot: 'warriorOfRohan'`-like profile after dismounting with a shield), `isengardWargRider` (warg F 3 S 4 A 1 C 8+),
   model height about 1.8″ (`ht`), base radius of 40 mm = 0.79″ (`baseRadius` already computes it). Icons in `js/ui/tokens.js`: a rider
   on a horse (and a warg without a rider separately); the 40 mm base is already drawn according to `r`.
2. **Model in the game** (`setup.js`, `rules.js`): `u.mount` with its own W and D; `u.mv` from the mount; combat values `fv(u)`, `str(u)`, `att(u)`
   as the maximum of rider and mount (the engine today uses `u.f`, `u.s`, `u.a` directly: simplest is to set them when building the model and
   recompute them after dismounting). `u.charged` set by `doMove`/`applyMove` on a charge, cleared in `freshTurn`.
3. **Movement**: in `moveCost` undergrowth ×4 for cavalry; `planCross` without Climb for cavalry; Jump/Leap with a result of 1 is Knocked Flying;
   a drop deeper than the height: S3 hits on the horse (mission 14 does not use this, but `terrain.js` should be consistent).
4. **Combat** (`combat.js`): `chargeBonus(c, u)` checks the conditions (charged, only infantry on both sides of the combat, not in undergrowth);
   `attacks()` adds Extra Attack to the dice and strikes; after the win and Back Away `knockDown(losers)` lays the infantry down (not S 6+ and monsters);
   strikes against Prone models with two dice: today a double roll gives only `trapped`, so `rollStrikes` and `strikeChance` get
   a shared condition `trapped || t.prone`. `duelOdds`, `harm` and `combatValue` count the bonus (AI and percentages in the panel).
5. **Strikes against cavalry**: the target of a strike is a pair (model, part). `rollStrikes` against the mount uses `mount.d` and `mount.w`;
   `bestStrikeTarget` chooses the part (AI: higher chance of a kill, a D 4 horse before a D 5 rider); the player chooses in the panel as with
   `pickstrike` (two buttons "rider" / "mount" or a click on half of the token). After all strikes: killed horse → `thrownRider(u)`
   (D6 in the tray, re-roll with Expert Rider, S3 on a 1, Prone, a "cannot act this turn" marker until the end of the turn), the model is replaced with
   a 25 mm infantryman in the same place (`nearestFree`), keeping Engaged (a link as with Barriers: a `u.over`-like list
   of enemies). Killed rider → the horse flees (A 0), the model disappears; warg: Courage test 2D6 ≥ 8 in one roll, stays as a "Warg" model.
6. **AI** (`ai.js`): cavalry chooses charges only against infantry outside undergrowth and avoids standing in a Control Zone when it cannot charge;
   AI infantry strikes the horse; `aiMoveOrder`: cavalry before infantry. The mission strategy in `tools/balance.mjs`: charge in pairs
   at single tribesmen from open ground, in the enemy turn stay more than 6″ from the infantry (10″ of movement lets you jump away).
7. **UI**: profile card with two lines (rider, mount); in the charge preview "Cavalry Charge: 2 dice, Knock to the Ground"
   or the reason for no bonus (undergrowth, cavalry in the combat); a list of combats with the bonus; "on foot" label after dismounting; tray: Thrown Rider.
   Cards and lessons: `cavalry` (movement), `cavalrycharge`, `thrownrider`.
8. **Simulator and matched play**: `balance.mjs` and `matched-check.mjs` with shared functions from `combat.js` (as with Barriers);
   the importer can unlock the Cavalry keyword for Riders of Rohan and Warg Riders only after mission 15 (shooting at cavalry).

Simplifications for mission 14 (to be described in the briefing and in `curriculum.md`): no voluntary dismounting, no throwing weapons, no shooting
(Riders' bows unused), no lances; the horse always flees, the warg does not appear; Arise, Riders of Rohan! needs a General (chapter V).

## 4. Mission 15: "Wolves of Isengard" (design, 13.10.2026)

One main rule: **cavalry against cavalry and shooting at cavalry**, i.e. the second half of the Cavalry chapter.
From mission 14 the player already knows the charge, strikes against the rider or the mount, and Thrown Rider; now there is added:
- **No bonuses against cavalry** (p. 70, example 56): Extra Attack and Knock to the Ground apply only when there is nothing but infantry
  on the enemy side of the combat. A Warg Rider who joins a fight with a Rider takes the bonus away. This already works in the engine
  (`chargeBonus` checks all enemies in the combat), so the mission teaches tactics: whom to charge first and how not to get caught.
- **Shooting at cavalry** (p. 70, example 54): you aim at the rider; after a hit and the ordinary In The Way tests the shooter rolls a
  special test: 1–3 the shot hits the other part (the mount), 4+ the target. A wound on the mount: Thrown Rider as in combat.
  Riders of Rohan have bows in their profile (24″, S 2) and thanks to Expert Rider keep +1 D for the shield; mounted they shoot after moving
  up to half their Move, i.e. 5″, with −1 to hit like everyone.
- **Orphaned warg** (p. 69): a warg without a rider takes a Courage test (2D6 ≥ 8, 42%) and stays as a separate model
  (FV 3, S 4, D 4, A 1, 10″), which keeps fighting and charging. The engine already does this (`separateMount`, `spawnUnit`); the mission shows
  it for the first time, because in mission 14 the horses fled.

Profiles: Rider of Rohan as in mission 14 (F3 S3 D5 A1, horse F2 S3 D4 A0), with a bow. Isengard Warg Rider (F3 SV 5+ S3 D5 with a shield A1,
warg F3 S4 D4 A1 C 8+): in combat he uses the warg's S 4. A duel of Rider against Warg Rider 1 on 1: FV equal, one die each, 50%;
the Rider wounds the warg or the rider on 5+, the Warg Rider wounds the horse on 4+ (S 4 against D 4) and the rider on 5+, so the AI strikes the horse.
On equal terms the wargs win. Hence the lesson: shoot before it comes to melee (8 bows, hit on 4+, and after moving 5+;
S 2 wounds a warg on 5+, a rider on 6), charge two on one and do not stand within 10″ of the wargs when you do not have Priority.

Scenario:
- Rohan against Isengard, Westfold. Player: 8 Riders of Rohan with bows. Enemy: 7 Warg Riders (and optionally 4 Isengard orcs
  on foot, to show that the bonus against infantry remains; decision after the first balance). Board 36 × 24, a few clumps of undergrowth
  and rocks (cover from arrows, Difficult Terrain ×4 for both sides). Shooting enabled, Priority rolled every turn.
- Goal: kill 5 of the 7 warg riders (an orphaned warg does not count as a rider, but if it stays, you have to watch out for it) by the end of
  turn 7 and lose at most 3 Riders (a rider on foot still counts).
- The calculation: turns 1–2 shooting (8 shots per turn: about 1 wound against D 4/D 5 with −1 for moving), turns 3–6 charges two on one
  (4 dice against 1 → about 90% win, 2 strikes on 5+ → about 56% to kill the enemy or knock the rider off the warg).
  Wargs charging the Riders first (when they have Priority) without bonuses win 50% and kill the horse on 4+ → a thrown Rider.
  Simulator: the "Wolves" strategy: shoot when the enemy is farther than 10″, otherwise charge in pairs; we expect 75–85%,
  and a player who charges alone one at a time should do clearly worse.

What has to be built (less than in mission 14):
1. **Data**: `riderOfRohan` gets `bow: { n: 'Bow', rng: 24, s: 2 }` (gear "Bow" instead of "Bow (not used here)"; mission 14 has
   `noShoot`, so nothing changes in it); the infantry profile after dismounting without a bow (discards the bow, keeps the shield, p. 70).
   Rider icon with a bow (`figures.js`: the bow on the rider's back is already drawn by `infantry` with `L.bow`).
2. **Shooting** (`rules.js: rollShot`, `shotInfo`): after a hit and In The Way, when the target is cavalry, a step `{ k: 'cav', v, part }`:
   1–3 mount, 4+ rider; the To Wound roll according to the Defence of the part hit (`t.mount.d`); `shotInfo.p` computes the average of both.
   In `flow.js: doShoot` a wound on the mount through `woundPart`, killed mount → `thrownRiders`-like handling outside combat
   (the same Thrown Rider Test, no Engaged link). Tray: row "Rider or mount? 4+ rider". Killed rider → `mountLeft`.
   Shooting from the saddle: `shooterReason` already counts half the Move from `u.mv` (10″ → 5″).
3. **AI** (`ai.js`): the Warg Rider charges Riders despite the lack of a bonus (today the −3 penalty only lowers the choice); an orphaned warg like any model.
   The simulator strategy "Wolves of Isengard": shoot the nearest warg when no enemy is within charge range; charge
   in pairs; after dismounting fight on foot. `WOLVES=naive`: charge singly without shooting.
4. **Panel and lessons**: card and window `shootcav` (shooting at cavalry: 4+ test, which part) and `loosemount` (orphaned
   warg; `of: 'cavalry'`). The shot preview shows both chances (rider / mount). List of combats: "no Cavalry Charge: enemy cavalry
   in the Combat". Debrief about having to take the wargs down with arrows and in pairs.
5. **Matched play** (after mission 15): the importer unlocks the Cavalry keyword for Riders of Rohan, Rohan Royal Guard with a horse
   and Warg Riders (options: shield, orc bow; throwing weapons still skipped). `matched.js`: deployment zones for 40 mm bases,
   the bow limit counts riders' bows.

Simplifications: no voluntary dismounting, no throwing weapons and lances (Rohan has none), a warg without a rider gets no special
rules; a shot at cavalry in combat (Evil shoots into melee) uses the ordinary rule from mission 7, and then the part test.
