# Engine before missions: what is missing compared with the rulebook (13.10.2026)

Agreed with the user: first we finish the engine (`js/engine/`) so that it has all the rules of the Rules Manual 2024
(with FAQ and errata, `docs/rules/`) that the game can play; only then the missions that teach them. Every rule: engine without DOM,
the same order in the game (`flow.js`) and in `sim.js`, a test in `tools/` (like `hero-check.mjs`), an FAQ check (`latest_faq.md`).
A rule that a mission does not teach yet is switched off in that mission (like Heroic Actions: the `rules`/`also` keys).

Goal (user's decision of 13.10.2026): a full matched play simulation, so we do **all** items, including War Beasts,
chariots, siege engines, sieges and the One Ring; we go in order from priority 1. In addition, the matched
play army lists must get Heroes (today `import-armies.mjs` takes only Warriors).

Special rules from profiles: `js/engine/special.js` (`rule(u, 'Terror')`, keywords, the `SPECIALS` list). `G.specials`
are the rules in play: null = all (matched play, sandbox, tools), in a mission only the ones taught (`knows`); the key is the name
in camelCase, the same in `missions.js` (`rules`/`also`) and in `rules-text.js`.

The chapter in brackets is a file in `docs/rules/`.

## Already there

Priority, movement, Control Zones, Charges, difficult terrain, obstacles, Jump/Leap/Climb, falls, Prone, Line of Sight, shooting
(In The Way, cover, shooting into combat), To Wound, Pairing Off, Duel Roll with re-rolls, Back Away, Make Way, Trapped, multiple
models in combat, Barriers, spears and pikes, banners, Shielding, two-handed weapons, cavalry (Charge, Thrown Rider, shooting at
cavalry, orphaned mount), Courage and Broken, Stand Fast, Heroes (Might, Will, Fate, all Heroic Actions
except Channelling, challenges, tiers). Matched play: To the Death!.
Courage on every activation of a Broken army: models that are standing still in their activation phase activate at its end
(Heroes first, for Stand Fast; `rules.js: idleActivations`). Terror (also Terror (X)), Fearful, Fearless, multiple
Courage tests in a turn (`u.passed`; test on a Charge: `sim.js: chargeNerve`, `flow.js: chargeNerveAct`).
Weapons: choice of hand or two-handed weapon in every fight (hand-and-a-half, Berserker Blade; a shield loses +1 with two hands;
in a mission only after it has been taught, key `weaponChoice`), Elven weapon (roll-off 3+ / 1–4), master-forged, lance and war spear
(+1 To Wound after a Charge), model without a weapon. Ranged weapons: several weapons per model (`u.missiles`, the best one for the target), sling
(two shots), blowpipe (Poisoned: re-roll 1 To Wound), throwing weapon (after a full move; throw on a Charge from 1″,
`sim.js: throwFirst`, `flow.js: throwOnCharge`), whip. No shooting: Prone, after a Jump/Leap/Climb attempt.
Wargear: horn (+1 Courage within 24″, Stand Fast +3″ once per game, Dominant (2) from the importer), drum (X) (free Heroic
March, At the Double 12″ for a keyword), Elven cloak (−1 to hit, Stalk Unseen), light armour (+1 D against
shooting). Voluntary dismount (button on the model card). Elevated Positions like a Barrier (key
`elevated`), Doorways (`building` + `door`), ladders (`ladder`), terrain that cannot be climbed (`plateau` with `sheer`).

## Basics (priority 1): done

Also Intelligence Test (`dice.js: intelligenceSeq`, `sim.js: intelligence`, `flow.js: intelligenceAct`; a Hero adds
Might, not Will; a passed test for the same rule passes the following ones in the turn) and the Berserker Blade sweep (`combat.js:
sweepTargets`; read as instead of the normal Strikes, because the text does not say "as well": to be checked if an FAQ appears).
Moved further: passengers and embarking (narrative, together with advanced_rules in priority 3), Dominant (X) for
objectives and escapes (together with the matched play scenarios), Heroes in army lists (a separate matched play item).

## Missing: special rules from profiles (priority 2)

All from `special_rules.md`, today only shown on the card: among others Hatred, Bodyguard, Shieldwall, Spear Mastery (army
rule), Woodland Creature, Mountain Dweller, Dominant, Burly, Expert Shot, Poisoned Attacks, Mighty Blow, Monstrous Charge,
Throw Stones, Fly, Swift Movement, Master of Battle, Leader, Sworn Protector, General Hunter, Survival Instinct, Set Ablaze,
Large Target, Will of Evil, Resistant to Magic. In addition, the special rules of Heroes from army lists (e.g. The Usurper King).

### Plan (14.10.2026)

Usage in the target armies (BattleScribe data, models per catalogue: Kingdom of Rohan, Army of Edoras, Minas Tirith,
Usurpers of Edoras, Muster of Isengard, Army of the White Hand, Legions of Mordor, Minas Morgul): Hatred 24, Horse Lord 17,
Expert Rider 16, Leader 16, Terror 13, Harbinger of Evil 12, Will of Evil 12, Sworn Protector 10, Woodland Creature 10,
Fearless 6, Sharpshooter 6, Ancient Enemies 6, General Hunter 5, Stalk Unseen 4, Mighty Blow 3, Burly 3, Mountain
Dweller 3, Shieldwall 3, Bane of Kings 3, Master of Battle 2, Expert Shot 2, Poisoned Attacks 2, Unyielding Combat
Stance 2, Bodyguard 1; army rules: Spear Mastery, Phalanx, Glory Seekers and more. Most of them are on Heroes, so the
matched play Heroes item moves into this priority (step 4).

Every step: the rule in `special.js` (key in `SPECIALS`, `rules-text.js` entry), the hook in the engine, the same in `flow.js`
and `sim.js`, a check in `tools/hero-check.mjs` (or a new `tools/special-check.mjs` with seeded dice), FAQ grep
(FAQ mentions: Burly, Harbinger, Monstrous Charge 3, Mountain Dweller 2, Shieldwall 2, Survival Instinct 3, Swift Movement,
Sworn Protector, Woodland Creature 2), then `node tools/matched-check.mjs 2 150` and a commit.

1. **Done (14.10.2026).** **To Wound and Strikes** (`combat.js: woundBonus`, `harm`, `rules.js: rollWound`), one hook point for all:
   Hatred (X), Backstabbers (vs Trapped), Ancient Enemies (X) and Poisoned Attacks (re-roll 1s; Poisoned already exists
   for the blowpipe: generalise), Bane of Kings and Venom (re-roll failed; Venom's extra Wound at the end of the Combat),
   Mighty Blow (2 Wounds), Bane Weapons (Xbane: D3 Wounds), Blades of the Dead (D = 10 − C). Fate is rolled per Wound.
   Made: `special.js: rules, against`; `combat.js: woundBonus (Hatred, Backstabbers), woundReroll, bladesD, strikeWounds,
   strikeWorth, venomMark, venomEnd`; `dice.js: roll1` (opt.reroll 'ones'/'fails', opt.d); shooting re-rolls in
   `rules.js: shotSeq`; checks in `hero-check.mjs`. Readings to revisit if an FAQ appears: Fate prevents a whole Mighty
   Blow/Bane Strike (one Fate roll, then all its Wounds, the extra ones without Fate); Venom's victim is chosen by the
   computer for both sides (the most valuable one); the computer's odds with Might ignore re-rolls; shot odds
   (`shotChance`) do not count Bane of Kings or Poisoned Attacks yet.
2. **Done (14.10.2026).** **Courage** (`rules.js: courageTest`, `fearless`): Sworn Protector (X) and Bodyguard (auto-pass while the Hero lives;
   Bodyguard picks the General or the highest tier Hero of the faction at deployment), Harbinger of Evil (X) (−1 within
   range, not cumulative, holders immune), Survival Instinct (test after each unprevented Wound, flee on a fail;
   exception to multiple tests), Timid (mount).
   Made: `special.js: autoPass, assignGuards (setup.js: buildUnits), harbingerNear, timid`; `rules.js: courageTest`
   (T.harb), `heroes.js: autoCourage`, `combat.js: hurtSeq` (Survival Instinct, r 'slain' with u.fled), `chargeBonus`
   (Timid); checks in `hero-check.mjs`. Readings: Bodyguard takes the highest tier Hero of its Faction keyword (the
   second keyword of the profile) until the General exists (priority 3); Survival Instinct tests after the first Wound
   of a Strike only (the extra Wounds of Mighty Blow come without Fate and without a test); Sworn Protector (X) matches a
   model whose name starts with X.
3. **Done (14.10.2026).** **Defence and prone**: Shieldwall (+1 D with 2+ shield-bearing Shieldwall models in base contact, before Back Away,
   not Prone or Cavalry; the FAQ answers first), Burly (no −1 Duel Roll for two-handed; Heavy Object later with
   carrying items), Unyielding Combat Stance (4+ to stay up, `combat.js: knockDown`, Thrown Rider as a 6).
   Made: `rules.js: shieldwallOn` (also against shooting, in `shotArmour`), `combat.js: shieldwallSnap` (u.swall, after
   the Duel Roll), `defOf`, `staysUp`, `knockDown` (down.kept), `thrownRiderSeq` (keep), falls (`sim.js: fall`,
   `flow.js: fallDamage`); Burly in `duelMod`. Checks in `hero-check.mjs`.
4. **Done (14.10.2026), infantry only.** **Heroes in matched play** (`import-armies.mjs`: Hero profiles, Might/Will/Fate, tiers, Leader (X) as the Warband
   limit; points), then the Hero rules: Mighty Hero (free Might each turn), General Hunter (Might back on slaying the
   General: needs the General, from priority 3 Warbands; until then the army's highest tier Hero), Master of Battle (X+)
   (`heroes.js: declare`, copy a Heroic Action within 6″), Horse Lord (6+ save for the mount, Fate for the mount),
   Expert Rider (re-roll Jump and Thrown Rider, shield with a bow mounted). Named Hero rules (The Usurper King,
   The Hammerhand, ...) one by one, the target armies first; a rule the engine cannot play yet stays card-only and is
   listed in `docs/matched-play.md`.
   Made: importer `importModel` (Heroes from each Warband: Hero profile, tier from the Warband category, Followers),
   `matched.js: armyStats` (Warband limits, a Hero once), `randomArmy` (a Hero first), `ui/army.js`; the General
   (`special.js: assignGenerals`); `heroes.js: mightyHero, hunterSlain, masterOfBattle` (declare free), Horse Lord in
   `combat.js: hurtSeq`, Expert Rider from the rule. Left: mounted and Independent Heroes, named Hero rules (card only),
   the Expert Rider shield-with-bow bonus, General/Hero Victory Points (scenario text missing in `docs/rules/`).
5. **Done (14.10.2026).** **Movement and terrain** (`rules.js: moveCost`, `terrain.js: rollFall/planCross`): Woodland Creature and Mountain
   Dweller (terrain needs a `wood`/`rocky` type; Mountain Dweller re-rolls Jump/Leap/Climb), Cave Dweller (+1 to those
   tests), Swift Movement (no Difficult Terrain except water, Obstacles without tests), Spectral Walk.
   Made: brush is woodland, `rocky: true` brush is scree (matched play makes a third of it rocky; `board.js` draws it
   grey); `rules.js: freeIn` (moveCost), `terrain.js: crossTestSeq` (X.auto), `dice.js: d6Test` opt.mod. Readings: Swift
   Movement passes Obstacles (walls, hedges) without a test but not gaps or cliffs; Mountain Dweller re-rolls only a
   failed test; the computer always uses the re-roll.
6. **Done (14.10.2026).** **Shooting** (`rules.js: shotsAllowed`, `inTheWay`, `stalks`): Expert Shot (two shots, same weapon), Sharpshooter (choose
   rider or mount, no In The Way roll for the part), Fell Sight (Charge without Line of Sight, ignore Stalk Unseen),
   Large Target (In The Way only for Monster/Siege Engine/War Beast), Throw Stones (shot if it did not move).
   Made: `rules.js: shotsAllowed` (Expert Shot), `inTheWay` (Large Target), `shotInfoWith`/`chargeSpot` (Fell Sight),
   `readyStones` + `setup.js: stonesOf` (Throw Stones as u.bow during the Shoot phase only), Sharpshooter in
   `setup.js: freshTurn`. Left: Large Target when the target is Engaged (the text is cut in `docs/rules/`), Fell Sight
   for Charges against Stalk Unseen (Charges do not check Stalk Unseen yet).
7. **Done (14.10.2026) for the target armies.** **Army special rules** of the target armies (Spear Mastery, Phalanx, Glory Seekers, ...): the importer already puts
   them in each model's `rules` (Spear Mastery is read for throwing spears); play them like profile rules with a key
   each, and check the importer's `BLOCKED_RULES` for models left out because of a rule the engine now plays.
   Made: `special.js: armyRule, ARMY_RULES_PLAYED` (the builder marks each army rule played or card only), Glory
   Seekers, Phalanx (pike and shield; not the double Make Way), and the army rules Home of the Horse Lords, Forth
   Eorlingas! (`combat.js: forthEorlingas`, used at once), Protect the King, Whipped into a frenzy, Barbarous Killers,
   There will be no dawn for Men, Isengard Unleashed, Bring the City to its Knees. `BLOCKED_RULES` is still only Fly.
   **Named Heroes and the rest of the target armies' rules (14.10.2026):** `engine/named.js`, one function per hook
   (Fight Value, Attacks, To Wound, Courage, banners, Stand Fast, Wounds on a 6, free Heroic Actions, Priority,
   Dominant, Victory Points), called from heroes.js, combat.js, special.js, magic.js, scenarios.js, sim.js and flow.js;
   checks in `hero-check.mjs` ("Named Heroes"). `ARMY_RULES_PLAYED` is now per army id (the builder showed Army of
   Dale's different Protect the King as played). The importer fixes rule-name typos (Isengard Unleased, which had
   switched Isengard Unleashed off, Reolute Fighter) and drops Denethor's broken '0.0' rule. Dominant (X) is played
   (objectives, escaping). Played now: Army of Edoras: Arise, Riders of Rohan!, Defender of Edoras, The Warrior Poet
   (Háma spends Will when two or more Rohan models near him fight), Daughter of Rohan, Mutual Respect, Master Archer;
   Kingdom of Rohan: The Price of Grief, "I shall kill you if you touch him!", Doorward of Meduseld, Théoden's 12″
   Stand Fast and Gríma rule, Reckless Charge; Minas Tirith: all three army rules (Denethor's Priority claim is used
   the first turn the armies are within 18″), An Unlikely Friendship, A Chance for Faramir, Wizard's Pupil,
   Protectors of the White Tree, In Defence of the King, Line of Command, Captain of the Citadel Guard; Usurpers of
   Edoras: Dunlending Heritage, Claim the Throne, Dunlending Commander, Edoras Shall Fall, The Usurper King, the
   Mûmak's Awesome Presence and Sigils of Defiance (the beast only, not its crew); Muster of Isengard: Voice of
   Curunir, Saruman's Deceit, Oblivious to Pain; Wolves of Isengard: Leader of the Pack, Savage Charge, Fury of the
   Pack. Must Charge (Price of Grief, Reckless Charge, Faramir under Denethor) binds only the computer. Rules with a
   choice (Denethor's Priority claim, The Warrior Poet, "Forth Eorlingas!") ask the player for their own side
   (flow.js: askRule) unless "AI plays for me" is on; the computer decides for its side.
   **Left (card only):** Orders from Edoras, Lord of Harrowdale, Merry, For Théoden!, Stalwart Fighter, Pinpoint
   Accuracy, Faithful Servant, Boldest of the Bold, Broken Mind, Resolute Fighter, Defend the White City, Son of
   Gondor (no text in the data), Warg Scouts, Ambush; Legions of Mordor's named Heroes (about 30 rules); the
   list-building rules (Additional Rules, Traitor of Rohan) are not checked by the builder. In missions these rules
   stay off until a mission teaches them (`special.js: SPECIALS`, missions.js: knows).
8. **Kept for priority 3**, because the chapter they need is missing (Resistant to Magic and Will of Evil: done with magic, see below): Invisible (the One Ring), Monstrous Charge, Fly (monsters, flying), Set Ablaze (fire, water), Dominant (X) (scenarios). Their
   texts stay on the card.

## Missing: large chapters (priority 3)

| Scope | Chapter |
|---|---|
| Magic: Casting, Resist, durations, list of powers, Heroic Channelling, the Resist die from Heroic Resolve | magic, heroes |
| Monsters: Brutal Power Attacks (Rend, Barge, Hurl) | monsters |
| Water and swimming (Swim Test), carrying items, passengers, sentries, fighting at night | advanced_rules |
| Hero Mounts, Last Stand (General), Warbands and the General in matched play | heroes, matched_play |
| War Beasts, chariots, siege engines, sieges, the One Ring | war_beasts, chariots, siege_engines, sieges, weapons_and_wargear |
| Matched play scenarios other than To the Death! | matched_play |

### Plan (14.10.2026)

In the order of the table; magic first, because the target armies have casters (Ringwraiths, the Mouth of Sauron, the
Orc and Uruk-hai Shamans; Radagast on the Good side).

1. **Magic, core: done (14.10.2026).** `js/engine/magic.js`: Casting Test (Will dice, the best one, Might on it), Resist
   Test (Will dice, natural 6 gives the Will back to a Hero, free dice from Heroic Resolve, Resistant to Magic and Fortify
   Spirit; one target Resists for a power on several), the three durations (`G.spells`; Temporary ends in the End phase,
   Exhaustion at 0 Will, all when the caster falls), Heroic Channelling, Will of Evil (End phase, last point not for
   Casting). The importer reads each Hero's powers (`T.powers`, `POWER_TEXT`). Powers played: Aura of Command, Aura of
   Dismay, Banishment, Black Dart, Bladewrath, Blessing of the Valar, Blinding Light, Chill Soul, Curse, Drain Courage,
   Enchant Blades, Enrage Beast, Flameburst, Fog of Disarray, Foil Magic, Fortify Spirit, Fury (X), Instil Fear, Nature's
   Wrath, Panic Steed, Protection of the Valar, Renew, Sorcerous Blast, Strengthen Will, Terrifying Aura, Transfix,
   Wither, Wrath of Bruinen (no water features yet: always Strength 2), Your Staff is Broken. In the game: the model
   card of the player's caster has a button per power while it may Cast (before it Activates, or while it is the model
   moving); target, rider or mount, and Will Points are picked in the panel; the player's Heroes are asked how much Will
   to Resist with. The computer Casts before it moves (`magic.js: aiCast`). Key `magic` in `G.specials` (on in
   matched play and the sandbox). Tests: `hero-check.mjs` (Magic), `matched-check.mjs` counts the Casts.
   Not yet: Blinding Light's "impassable terrain between", Enrage Beast ending early when the caster falls.
2. **Magic, the rest: done (14.10.2026).** Compel (`magic.js: compelOptions`: a Charge into a friend of the caster or a
   move towards, away or to the side; the player picks from a list), Call Winds (blown straight away, stops at models
   and terrain it cannot cross), Tremor (a line towards the model picked; its D3 is rolled before the Resist Test, so the
   targets are known), Writhing Vines (a Vine Marker towards the nearest enemy, drawn on the table; `rules.js: slowedAt`),
   Collapse Rocks (a target touching rocks, a building, raised ground or scree), Paralyse (no Activation, no Duel Roll
   dice or Fight Value, stays Prone, recovery rolls at the end of the End phase). All 35 powers are played.
   Wizards with a Staff of Power, Narya, Glamdring and the like: the importer still leaves them out (wargear; with step 5,
   Independent Heroes).
3. **Monsters: done (14.10.2026).** `js/engine/monsters.js`: the free Strike at each supporter of a model a Monster slays,
   Brutal Power Attacks after a won Duel Roll (Rend before every Strike; Hurl nominated before Backing Away, with its
   Intelligence Test, target and hits; Barge: 3″ Back Away or Prone, then D3+3″ and a new Charge, Paired Off again), once
   per turn, not while Prone (FAQ), not Barge/Hurl in a Heroic Combat; Monstrous Charge (+1 Attack, not on top of the
   Cavalry Extra Attack; the weaker losers Prone); Cavalry get Extra Attack against a Monster with the Infantry keyword.
   Fly (`rules.js: flyMove`): over models, terrain and Control Zones, no landing in a wood, on rocks or in a Control Zone
   without a Charge; the importer no longer leaves out models with Fly (Great Eagles, War Bats). Keys `monsters`,
   `monstrousCharge`, `fly`. Not yet: a Monster's own Brutal Power Attacks (Bludgeon, Gaping Maw, Crushing Strength:
   card only), the In The Way 1–4 for a ridden Monster, choosing not to Fly (4″ Move).
4. **Advanced rules: done (14.10.2026)**, except carrying objects (with the scenarios, step 7) and passengers (with
   Hero Mounts, step 5). Water (`terrain.js`): a water piece is `shallow` (Difficult Terrain except for Cavalry,
   Monsters and War Beasts), `deep` (a Swim Test to enter it, `planCross` kind 'swim', and at the start of each
   Activation in it; no shooting from it; Swim Test modifiers) or, with neither, an impassable river as in the missions;
   Wrath of Bruinen is Strength 8 in water. Night (`G.m.night`, `rules.js: tooDark, darkBonus`): 12″ sight for
   shooting and Magical Powers, +1 To Wound in the dark, Cave Dweller and Blinding Light. Sentries (`advanced.js`, a
   unit's `sentry: true`; the missions' `ai: 'sentry'` is only the computer standing still): the Sentry Chart before
   the side's other models, no shooting or Casting until the alarm, the alarm in the End phase. Not yet: a model knocked
   Prone in Deep Water testing again at −1, a Paralysed model in water.
5. **Hero Mounts and Cavalry in the army lists, Last Stand: done (14.10.2026).** The importer reads mounts
   (`import-armies.mjs: mountIn`, a Warrior-type profile with Unit Type Mount, linked as a profile or an infoGroup with
   the mount's rules): mounted Warriors (Riders of Rohan, Warg Riders, Knights...) and the mounts Heroes and Warriors buy
   (shared "Horse", "Armoured Horse", "Warg" upgrades linked into the Wargear group, named mounts such as Firefoot). Each
   mounted profile gets T.mount, a profile on foot (T.foot) and, for a mount with Attacks, a loose mount profile
   (`setup.js: typeOf` finds both in the army lists). Expert Rider re-rolls a Swim Test. Last Stand (`heroes.js:
   autoCourage`). Staff of Power (`magic.js: staffTurn`: a hand-and-a-half weapon and a free Will Point each turn), so
   Saruman and other wizards with a staff come in; special rules an option buys go on the profile. Not yet: passengers,
   Fell Beasts, a mount an army list makes compulsory (offered as optional), Independent Heroes as Followers.
5b. **Named wargear: done (14.10.2026)** (`import-armies.mjs: GEAR_AS`): Sword, Unarmed, Master-forged weapons,
   Easterling Halberd (pike or two-handed), Mattock (two-handed), Elven hand-and-a-half, Wood Elf Spear, Troll Spear and
   Elven Glaive (spears), Glamdring and Sting (+1 Strength), Hadhafang (+1 To Wound against Spirits), Andúril (4+ at
   worst), Narya/Nenya (re-roll a failed Fate Roll), Mithril Coat (Mithril Armour, re-roll a Fate 1), Ring of Barahir (a
   6 shrugs off a Magical Power), Flaming Brand (Terror (Cavalry), Terror (Beast)), Horn of Gondor (a war horn), the
   unique banners (banners). Gandalf, Aragorn, Boromir and Gamling are in the army lists now. Only the extra abilities of
   these items beyond that (Mattock's knock-down, Elven Glaive's +1 Attack, Wood Elf Spear's Shielding, Troll Spear's
   double Wound, the banners' and the Horn's extras) are card text. Still left out: the One Ring, Leader (X), Crown of
   Morgul and other unique items (importer's list).
6. War Beasts, chariots, siege engines, sieges, the One Ring.
   6a. **Siege Engines: done (14.10.2026)** (`engine/siege.js`, importer: `importSiege`). Every engine in the army lists
   (catapults, trebuchets, ballistas, siege bows, the Bolt Thrower) with its Siege Veteran (Minor Hero, 1/1/1) and crew,
   deployed at the back with the crew in base contact (`matched.js: deploy`). No Activation, Control Zone, Engagement,
   Prone or Break Point count; not a target for Charges, shouts or Magical Powers. Fires in the Shoot phase with enough
   unengaged crew (Large 2, Small 1; untrained crew 6+), the worst Shoot Value among them; range, the 45° Arc of Sight
   (turned at fire time for −1 To Hit by 3/2 models, never a Static engine), Arcing (a friend's Line of Sight) or Direct
   Shot; a Good engine never fires into a Combat or with friends under its Area Effect. Scatter Table (6″, Accurate
   3″; the other player picks), Battlefield vs Siege Targets, a wounded actual target slain (one Fate Roll), Defence or
   Wounds 10+ lose half their Wounds, both parts of Cavalry rolled; Area Effect, Wall-breaker, Flaming Ammunition,
   Piercing Shot (flung over models, crashes), Troll Loader, Rapid Fire and Swift Reload; the Siege Veteran's Might on
   To Hit, Scatter and To Wound. An enemy in base contact that only Moved disables it in the End phase.
   Left out: moving an engine (Move phase; crew move it, half Move), the crew's 6″ leash for the player's crew (the
   computer's crew hold), Severed Heads, In The Way Tests for a Direct Shot, the Mordor Siege Troll sometimes finds no
   spot in base contact at deployment.
   6b. **Chariots: done (14.10.2026)** (`engine/beasts.js`, importer: `chariotIn`, `impactIn`). The Khandish King and
   the Iron Hills Captain may ride their Chariots (the Hero lends Fight Value, Strength, Courage and Intelligence where
   better and adds its Attacks; Might and Fate work for the Chariot; destroyed, the Hero is Knocked Flying on foot with
   its own Wounds). Chariot Charge: a pivot up to 45° and again after each full 4″, up to the Move Value in a straight
   line (halved in Difficult Terrain, a 1 on a D6 costs a Wound), Impact Hits on every model run into (rider and mount
   of Cavalry), on through slain models, stopping and Charging at one that stands; crashes into Obstacles (3 Strength 6
   hits each way); may only turn instead. +1 Attack after Charging; a win after Charging knocks the beaten Infantry and
   Cavalry Prone. Immovable Object: never Prone, Hurled, Barged or Trapped, never Backs Away (the winners touching it do).
   Passes Broken army tests. The player picks the target (or the computer's heading) from a list.
   Left out: the Khandish Charioteer and the Iron Hills Chariot as Warriors (not in the imported lists), the Iron Hills
   Chariot's Rapid-Fire Crossbow (a plain crossbow), Dwarven Crew, Radagast's Sleigh, a Chariot against a Chariot (the
   smaller Backs Away: here the loser does), Shooting while Engaged.
   6c. **War Beasts: done (14.10.2026)** (`engine/beasts.js`, importer: `importWarBeast`). The War Mûmak of Harad
   (Haradrim Commander or Mahûd Beastmaster Chieftain; Gnarled Hide, Tusk Weapons, Foul Temperament), the Royal War
   Mûmak with the Mûmak War Leader, the Great Beast of Gorgoroth (its Howdah's Orc archers shoot as many arrows as it
   has Wounds, however far it Moved; Plenty of Orcs) and the Troll Brute (Orc Commander, or Bofur in the Erebor lists).
   Trample: any heading, the full Move in a straight line, unimpeded by Difficult Terrain, water and Obstacles up to 2″,
   Impact Hits on every model it runs into (Troll Brute 2 × Strength 10, Mûmak 3 × 9, Royal 4 × 9, Great Beast 3 × 6),
   two War Beasts meeting: 3 Strength 8 hits each way. Charged by models of no greater combined Strength, it Tramples them
   first. The beast and its Commander are two models for the Break Point; each Wound: a Courage Test on the Commander's
   Courage (Will spent to pass, Foul Temperament −1), a failure Stampedes it at the start of its next Activation (the
   other side picks the heading; off the table it is lost with its riders); nobody riding it: a test as it Activates.
   Slain, its Commander falls (Falling Damage) and lies Prone beside it. Immune to Compel, Paralyse and Transfix; never
   Moved by a power. Irresistible Force and Immovable Object as for Chariots. Deployed in the front rank.
   Left out: shooting at the Commander or the Howdah (the Howdah's Wounds never drop), the Commander's Heroic Moves and
   Marches for the beast, passengers in the Howdah (the Mûmak's twelve Haradrim), Rocks, Rappelling Lines, Sigils of
   Defiance, the player picking the heading of an enemy beast's Stampede (the computer does).
   6d. **The One Ring and Invisible: done (14.10.2026)** (`engine/advanced.js`, `rules.js: invisible`). Frodo and Bilbo,
   Master Burglar carry it in the army lists (the hierarchy decides when two could). Put on during the Activation (not
   Engaged; a mount bolts, the rider is thrown; the player's button on the card), Sauron's Will at the start of each
   Activation wearing it (3+, Might; a failure and the other side Moves it, passing Terror; Bilbo's It Has Not Yet Awoken
   skips it), taking it off with a Courage Test, My Precious in matched play. Invisible: no shots, Magical Powers or
   Line of Sight at it, no Control Zone and ignoring the enemy's, moving through models and models through it (not
   ending on one), an Intelligence Test −1 per full inch to Charge it, no Stand Fast or shouts for others, the Fight
   Value of enemies halved when it fights alone; drawn faded.
   Left out: Supporting rules around an Invisible model; the player Moving an enemy Ringbearer that failed Sauron's Will
   (the computer does), special rules that target (only shots and powers check it).
   6e. **Sieges: done in part (14.10.2026)** (`engine/fortress.js`, `matched.js: makeSiege`, the army builder's Scenario
   choice). The Grand Siege: a wall the width of the table 12″ from the defender's edge (3″ high, sheer: no Climbing, but
   Swift Movement), stairs behind it, the gate in the middle (a model of its own, Defence 10, 3 Wounds: never Engaged,
   not counted, the defenders pass through it; shots of Strength 5 or more only; at the end of the Fight phase every
   attacker touching it that did not fight Strikes it, no Duel Roll, two To Wound rolls a Strike; a Siege Target for
   engines). The attacker has 25% more points and a Siege Ladder per 100 points, carried by two Warriors each (half Move
   alone), raised at the wall; models go up it paying its height, Charge a defender at its top (one per ladder, rules.js:
   chargeLadder), fall on a 1–3 when they lose there (and the others on the ladder roll too), step onto the battlements
   when they win and slay. Defenders at the battlements push ladders down (4+, ±1 per friend beside / enemy on it,
   Monsters ±3; the player's button on the card). Objectives: 12 attackers on or within the walls in an End phase (half
   the attacker's army when that is fewer), or the attacker down to a quarter. The computer carries ladders to the wall,
   climbs them or batters the gate, and mans the battlements where the ladders are.
   Left out: Battering Rams, Siege Towers, the defender's equipment (barricades, Rallying Point, rocks, boiling oil),
   slipping on stairs, Ride Out and Breach the Gates, doors other than the gate, buying the equipment in the builder.
7. **Matched play scenarios: done (14.10.2026)** (`engine/scenarios.js`, `matched.js: makeMatch`, the builder's Scenario
   choice). The six scenarios of the Rules Manual: To the Death!, Domination (five Objective Markers, 1–3 VP for more
   models within 3″), Hold Ground (the centre, 4/8/12 VP within 6″; Warbands arrive by Maelstrom of Battle; the battle
   may end on a 1–2 once an army is Broken), Destroy the Supplies (three markers a side, destroyed in the End phase by a
   model in base contact that did nothing but Move), Reconnoitre (Warbands arrive from their own edge, 4+ with +1 for each
   failed roll, all in on turn 4; escaping off the enemy edge) and Fog of War (secret picks: a Hero to keep, one to hunt,
   a terrain piece to hold; the player picks before turn 1). General and Hero Victory Points are scored in every
   scenario. Models move over Objective Markers but never end a move on one. The AI heads for the scenario's goal
   (`scenarioGoal`). Tested: `hero-check` (Scenarios), every scenario played computer against computer.
   Left out: Dominant (X) and Light/Heavy Objects in general (no scenario here uses them), Warband-by-Warband
   deployment, the player choosing the edge point where a Warband arrives (the computer picks it), passengers.
   Weak spot: the AI seldom escapes in Reconnoitre.

## Line of Sight with heights: done (14.10.2026)

Found by `tools/los-check.mjs`: Line of Sight ignored raised ground, so archers shot through cliffs and fortress walls
(both sides; the computer picked such targets too). Now sight is three-dimensional (`rules.js: hiddenBy, inTheWay,
coverIgnored`): lines from the viewer's head (0.9 × its true height on its level; Prone half, Cavalry at least 2″) to
points across the target's base and up its height. Models hide up to the top of their heads, rocks and buildings up to
their height, raised ground where the line dips below it, cover (woods, scree, walls, hedges, the battlements of a
fortress wall) only for In The Way. A model on a hill sees over men; a 0.5″ wall halfway between hides nothing, close
in front of the target it is In The Way. Hedges are cover now. Range from higher ground is measured to the closest part
of the target (`shotGap`, p. 40). The kinds of terrain, their heights and rules: `js/engine/terrain-types.js`
(the terrain library). Not in yet: Set Ablaze (fire; only the Balrog has it in the army lists).

## Audit before the missions (14.10.2026)

Question: is the engine finished, so that teaching missions and other missions can be built on it? Method: a local
script matched all 458 rule headings of `docs/rules/` against the code (249 clear hits); five agents read the ~190
sections without a hit, compared `sim.js` with `flow.js` step by step, and checked the 58 FAQ and errata entries on the
Rules Manual and the Matched Play Guide. Tests at the time: `hero-check` 86/86, `los-check` 22/22, every mission at
78–97% wins, `matched-check` 172 battles with no error (one battle without a result after 40 turns, not seen again in
100 replays of the same pairing). A test mission with a Hero, a caster, a Monster, Deep and Shallow Water and night
played 180 games without an error. Answer: the core of the game is there; five bugs had to be fixed first (below).

### Fixed (14.10.2026)

1. Spears: a model gains Support from only one spear-armed model (errata, p. 104); a pike behind a supporting pike is
   the second Support (`combat.js: assignSupport`). Before, every spear touching a fighter added a dice.
2. Cavalry and Break Points: a slain rider is a casualty even if its mount stays; a Separated Mount is no model for
   the count (`rules.js: modelCount`).
3. No Cavalry Charge bonuses against a model defending a Barrier (`combat.js: chargeBonus`, cavalry/#fighting-across-barriers).
4. The computer Jumps, Leaps and Climbs: `ai.js: crossPlan` (when it lands at least 1″ closer than walking round;
   archers only when they cannot walk closer), `sim.js: crossMove`, `flow.js: aiMove` through `doCross`; a model
   hanging on a cliff climbs on. Before, only the player could cross.
5. `flow.js`: the player's Warbands arrive (Hold Ground, Reconnoitre) and idle models Activate even when no model of
   the player can move; a Supporting model is marked (`u.supported`) for Destroy the Supplies, as in `sim.js`.

Tests: `hero-check` (Audit fixes).

### For building missions

- `flow.js` has its own turn loop (it does not call `sim.js`); the tools test only `sim.js`. Every new mission needs
  a playtest in the browser.
- `setup.js: buildUnits` takes `t` keys from `units.js` only; a profile from the army lists needs `T: typeOf(t)`
  (or change `buildUnits` to `typeOf`).
- `Invisible` (the profile rule, not the Ring) and `Stalk Unseen` are asked for by `rule()` but are not in `SPECIALS`,
  so no mission can switch them on.
- No rule card in `rules-text.js` yet for 33 keys of `SPECIALS` (`weaponChoice`, `elevated`, `dominant`,
  `obliviousToPain`, `sigilsOfDefiance`, `awesomePresence` and the named Heroes' rules): write the card with the
  mission that teaches the rule.
- No mission teaches a key of `SPECIALS` yet, so Terror, Fearless, magic and the like are all off in missions 1–17.
- Barriers (fight_phase/#barriers, p. 55): a Barrier is defendable when it is at least half the height of the
  attacker and the defender can see over it. `rules.js: canDefend` compares it with the defender's own height, so a
  man defends a waist-high wall even against a troll, whose half height it does not reach (found 14.10.2026 in the UI step-0 review; the glossary
  short text says it the rulebook's way, the long text `barriers.x` still the engine's way).

### Differences between `sim.js` and `flow.js` still open

- Multiple Strikes: `flow.js` rolls all Strikes of an enemy (and of the player before 'pickstrike') at one target; `sim.js`
  strikes one at a time and picks a new target after a kill (both legal; `balance.mjs` slightly favours the enemy).
- A model falling off a Siege Ladder is not Prone in `flow.js` (`fallDamage` never sets it).
- Extra Wounds (Mighty Blow, Bane, siege multi-wounds) bypass the War Beast hooks in `flow.js` (no Stampede test, no
  Commander fall).
- No slayer credit in `flow.js` for Rend, Hurl, Venom and gate Strikes (Heroic Challenge, General Hunter, named rules).
- The enemy whose throw slays its Charge target only walks in `flow.js`; `sim.js` may Charge another enemy.
- Charging an Invisible model after a failed test: `sim.js` sets `frozen`, `flow.js` does not; the rulebook lets it
  Charge another target (p. 127).
- Small order differences: End phase (alarm, Supplies, My Precious), Warrior Poet and Forth Eorlingas, Swim Test and
  Courage for a Heroic Move, the Combat order re-sorted after each Combat (`sim.js` only).
- The app decides for the player: the arrival point of reinforcing Warbands, the heading of an enemy War Beast's
  Stampede, Moving an enemy Ringbearer that failed Sauron's Will (the log says "you Move").

### Rules found missing or partial (not listed above in this file)

Teaching missions may need: Lie Down (only Stand Up and Crawl exist); a Jump over a Prone model; a Leap over a river;
an Obstacle taller than the model is impassable instead of a Climb; a Charge that touches two enemies on purpose; a
plain move into contact with a Prone enemy is not a Charge; must-Charge rules (Reckless Charge, The Price of Grief, an
accepted Heroic Challenge) are not forced on the player; banners cannot be passed on (FAQ p. 108, p. 118);
Monstrous Charge does not knock down after Barge or Hurl (FAQ p. 128); Barge: no Make Way for the losers (errata p. 90).
Matched play and rare cases: Unique wargear and characters with two profiles; Cavalry going up Siege Ladders; a Rider
Knocked Flying loses its mount without the mount's Courage Test, and Sorcerous Blast skips other Cavalry; a dismounted
model keeps all its wargear (FAQ p. 69); the importer drops the rules of directly linked mounts (Pony: Timid; Fell
Beast: Fly, Terror, Large Target...); Cavalry Charge bonus against a Chariot or War Beast; Hero Mounts sharing Might,
Will and Fate; the timing of special rules (Priority player first, alternating); Spectral Walk Cavalry keeps the
Charge bonus in Difficult Terrain (FAQ p. 129); army rules giving Woodland Creature or Mountain Dweller to the mount
(FAQ p. 131); a Ringbearer Moved under Sauron's Will is still tethered by a Heroic Move (FAQ p. 111); a Vine Marker may
be placed under models (FAQ p. 157); arriving Warbands may Charge (they may not, nor Chariot Charge or Trample); a
Chariot Hero may declare Heroic Combat and cannot Dismount; War Beasts Trample through woods they may not enter and stop
at low hills; powers cannot target a War Beast's Commander or Howdah; kills by a War Beast are not credited to its
Commander; Siege Engines never arrive in Hold Ground and Reconnoitre (they should start deployed) and the 6″ edge limit
is not checked; damage powers cannot target a Siege Engine, and disabling ignores a power cast on the model that turn;
no spear Support against a gate; deployment ranks can overflow the zone; matched terrain covers about 10% (rule: 33%);
the Captain cannot spend Might on the arrival roll and a Warband that does not fit is not delayed; the General does not
get Dominant (3) and the player cannot choose among tied Heroes; no limit on Siege Engines per Hero; Back Away and
Make Way can end on an Objective Marker.
