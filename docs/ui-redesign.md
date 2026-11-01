# UI redesign: less text, nothing lost

Status: all steps (0 to 8) built 14.10.2026; see Order of work for what each step did. Research: five agents on how similar games do it (digital wargame
adaptations, tactics games, information-dense strategy games, digital board games, game UX writing), then three
critics (newcomer, tabletop veteran, feasibility in this code) reviewed the draft. This file is the revised result.

## Problem (measured in the game, 1600x900)

- About 600 to 620 words of text on screen at once (first fight in mission 4; the Heroes sandbox).
- The right column holds up to twice the screen height (1645 px of content in 819 px); up to 13 rule chips at once.
- The orders panel: a 30 to 80 word paragraph plus a monospace preview line; the same facts appear two or three times
  (dashed rings on the board, a red list in the panel, a count on the button).
- The To Wound chart is always open, even in missions with no wounding.
- Starting mission 4 fresh shows five "New rule" popups before the first move.
- Heroic Action declaration: a list of every Hero x action pair with explanations, at the start of every phase.
- Heroes' Might/Will/Fate sit in a monospace line under the mission card.
- Side finding: flow.js calls `teach(['heroic'])` but `js/data/lessons.js` has no `heroic` lesson, so nothing shows.

## Principle: what the table shows, on the board; why, one click away

Three layers, never more than two steps from the screen to any fact (NN/g: two disclosure levels, a label that
predicts what is behind it).

1. Always visible: state (on the board where possible), the current step in one sentence, one main button, the dice,
   and the numbers a table player counts before deciding (dice per side in a Combat, To Wound needed per target).
2. One click or hover, next to the thing: why a number is what it is (every modifier with its rule), rule terms,
   the full profile, log details.
3. Reference, one labelled button: the Rules drawer (rules and effects in play, To Wound chart, both armies with live
   state, scenario), the Rules Manual link.

### For both players

Every change must suit two players at once:
- the newcomer, who must not be overwhelmed: Guided shows the essentials for the step, the rest one click away;
- the tabletop veteran, who wants everything the real table shows: Full table shows it all at once, and on Guided
  nothing is gone, only folded (every fact keeps a path of at most two steps, see the table below).
A change that helps one and costs the other (hides table information, or adds text to every step) needs a detail level
or does not go in.

### Any screen size

The game is played from a phone to a 4K screen: the window may be resized at any time and the table zoomed (up to 8x)
and moved. Sizes in rem (the root font grows on large screens), canvas drawing through uiScale(); anything laid over
the board takes its place from `toScreen()` in board.js and re-places itself on the `boardview` event (zoom, pan,
resize). Check each step at 375 px, 1366x768, 1920x1080 and 2560x1440 or 4K, zoomed out and zoomed in.

Things a newcomer must see must not live only behind hover, keys or a closed drawer (Humankind, Civilization VII
complaints). Hover must have a click or tap path (touch has no hover). A preview must match the real roll exactly and say
what it cannot predict (Blood Bowl, Mordheim, XCOM: players stop trusting a number that leaves out a later roll).

## Components

**A. Top bar: turn ladder.** Priority, Move, Shoot, Fight, End; Fight shows its sub-steps (Heroic Actions, Pair Off,
Duels) as a small second row while it is on; Back Away and Strikes show as markers on the Combat, not ladder steps.
A click on a step opens its rule. Turn counter, Priority badge, one Menu button (Missions, Restart, Options).
Score pill per side: models left, casualties against the Break Point ("lost 11 of 24, Broken above 12"; a tooltip
says what counts: Siege Engines excluded, a War Beast counts two), Broken tag, VP in matched play. (MTG Arena's phase
ladder; the Break Point count is missing today.)

**B. Board first.** The mission card becomes a strip above the board: title, objective, counters. The tip is open on
turn 1 under Guided, then folds behind an info icon (its full text stays in the Scenario tab). The reference column
(step 2: the dice log and the rules in tabs, left of the board) can fold to a narrow rail of tab buttons, so the board
gets the width; open, it pushes the board narrower instead of covering it. On a phone the column becomes a sheet that
slides up over the board, so a rule chip does not send the player to the bottom of the page.
Needs: one grid template per breakpoint (1280, 900, mobile), columns.js (migrate the saved key), board fit() check at
375, 900, 1280 and 4K.

**C. Orders block.** Title (3 to 5 words); one sentence of at most about 15 words with rule terms as links; "Why?"
opens today's paragraph (open by default the first two times a step type appears); the main button (+ second button);
the dice tray. The choices that are clicked today in `#hPrev` (Combats, Heroic Actions, Shield, Start again) get their
own region. The monospace preview becomes an outcome-first forecast ("Charge: 4.2″", "Duel: 2 v 1 dice, you win
ties", "Wounds on 5+") with "Why?" listing every modifier and its rule. "Why?" needs engine functions that return
`{ value, parts[] }` from the same code path as the roll (Duel dice, To Hit, To Wound first; pure data, no DOM). Notes
the engine cannot yet itemise keep today's wording. Duplicates go (the red unpaired list; the button says "Done: 7
left"). Keep the ids `#hTitle`, `#hBody`, `#hPrev`, `#card`, `#log`, `#act`, `#lNext` (browser checks read them).
Example sentences:
- Pair Off: "Click a model with a dashed ring, then the enemy it fights. Two against one is best."
- Back Away: "Click a dot to Back Away 1″. A yellow dot makes a friend step aside."
- Strikes: "Click the enemy this Strike goes at. Tags show what each needs to wound."

**D. Heroic Actions.** One row per Hero: name, Might pips, short action buttons (tooltip explains each). Pass is the
main button; "Pass for the rest of this turn" beside it. Sentence: "Spend 1 Might to give a Hero a special action this
phase, or Pass." Write the missing `heroic` lesson.

**E. Comparison card, docked.** In the panel, not floating: the selected model and the hovered or targeted model side
by side, compact stat rows (in Move show MV, FV, A, D, since Charges are chosen in Move; Shoot: SV, bow range and S;
Fight: FV, A, S, D), Wound pips, mount Wounds, Might/Will/Fate pips, status names. A "Details" button (and key I,
long-press on touch) opens the full profile in the drawer: MV FV SV S D A W C I with current modifiers, wargear and
special rules with their text, magic powers, spells on it, Courage. (Total War unit card, Wildermyth's card that
turns into the attack forecast when a target is hovered; the critics found a floating card would clash with clicks,
right-click deselect and touch.) A card floating on the board can come later, once the board exports `toScreen()`.

**F. State on the models: rims and status tokens** (as in tabletop Necromunda, where small round tokens beside the
miniature say Pinned, Seriously Injured, Broken, and so on; XCOM cover shields; BattleTech paper doll).
- Rim: the ring of the base carries the one state that decides what the model may do now: ready to act (bright, in its
  side's colour, as today's bright bases), done for this phase (dimmed), Engaged in Combat (a second, contrasting ring),
  selected. Readable at any zoom, because it is the base itself.
- Status tokens: small round counters touching the base edge, one per state, each always at the same clock position
  so the eye learns where to look: Prone, Trapped, Broken army (Courage Test due), a spell on it, Heroic Action
  declared, thrown from the saddle. A glyph and a colour on each; the term (and its short text) on hover or tap; a
  legend in the Rules drawer.
- Pips: Wounds as pips on the rim for models with more than one; Might, Will and Fate as three short rows of pips under
  a Hero; mount Wounds beside the rider's.
- Size: tokens grow with the base on screen, with a floor from uiScale() so they stay legible; when the base is too
  small on screen (a big table zoomed out, a phone), the tokens fold into one "+n" badge and the card lists them;
  zooming in brings them back. Drawn on the canvas (tokens.js), so they follow zoom and pan for free.
- Detail: Guided shows the tokens that change what the player can do (Engaged, Prone, Trapped, Broken, spell); Full
  table adds the bookkeeping ones (has shot, moved, the enemy's declared Heroic Actions).

**G. Board overlays.**
- Combat labels say "2 v 1 dice" and "Trapped if it loses", not only the number and odds.
- Strike candidates all tagged at once with what each needs to wound; Back Away dots get a glyph, not colour only.
- Free measuring tape (the rules allow measuring any distance at any time, base edge to base edge): hold M or a ruler
  button, drag between two points or models. Missing today.
- "Look from here": Line of Sight from any model, with what is In The Way.
- Auras on hover of a Hero or banner: banner range, Stand Fast (6″ or 12″ with Line of Sight), shouts, spell areas,
  objective control radii; the models covered light up. Missing today.
- Control Zones stay drawn in the Move step under Guided (and always in mission 1); key Z toggles them otherwise.
- Refusals ("Not allowed") stay in the panel with their rule chip until the next action; a tag at the cursor is extra.
- Distinct keys: Z zones, M measure, L log, I details, ? Rules drawer; Esc closes one layer (stopPropagation).

**H. Dice log.** One icon-led line per event, side colour, grouped by turn and phase, older turns folded; click a line
to see each die, modifiers, re-rolls, Might and Fate spent, rule links, and to flash the models; filters All, Rolls,
Mine; automatic steps logged with their reason (Trapped, Support, Courage). Whole-battle roll history on the end
screen. Needs a log store first: today `log()` builds DOM nodes from free text (about 130 calls in flow.js, capped at
180 nodes). Add records with side, kind, unit ids, dice, modifiers, re-rolls and auto-reason; render from them.
(Mordheim and Blood Bowl players use the log to check luck against the rules; BGA guidelines: log automatic steps.)

**I. Reference column** (built in step 2 as tabs in the left column, `js/ui/reference.js`, instead of a drawer over the
panel: a drawer would have covered the orders and the main button). The "Rules in play" button and the chips stay
beside the orders; a chip opens its entry in the Rules tab. A dot on the Log tab counts entries that came in while
another tab was open. Tabs:
- In play: rules grouped by phase, current phase first; untaught rules greyed "taught in mission N" (completeness
  stays visible); an Effects section: spells in play (caster, target, duration), Heroic Actions declared by both
  sides, Heroic Challenges.
- To Wound: the chart with the current row and column lit; it docks beside the forecast while aiming, and opens from
  any "Why?" (today `hlChart` lights it only for shots). Not shown at all before the mission that teaches wounding.
- Armies: every model of both sides with live state (Wounds, mount Wounds, Might/Will/Fate, status) and a list of the
  slain, fled and escaped. (Warhammer 40,000 app "Command Bunker".)
- Scenario: objective, live VP rows, end condition, scenario rules.
- Search over the glossary.

**J. Rule terms as links.** One glossary (`js/data/rules-text.js` RULES) feeds orders, log, chips and cards. Each
entry gains a one or two line short text and aliases ("Charge" vs "Charging"), checked against `docs/rules/` with
Grep. Hover shows the short text and the Rules Manual link; click opens the drawer entry. One level only, no nested
tooltips (the critics counted four to five steps with nesting). A delegated tooltip that survives the hint re-render.

**K. Detail level** (Options): Guided (missions default), Standard, Full table (every modifier line shown, chart
docked, all overlays). A string pref `detail` (`showsAtLeast(level)` in state.js). Show odds stays a separate switch:
percentages are not table information, and a veteran on Full table may well not want them. The Heroes sandbox
defaults to Guided, with Auto Pair Off and Auto Back Away on until missions 4 and 8 are done. Bump `SAVE_PREFIX` in
build-single.js when the saved options change shape.

**L. "New rule" popups.** One popup at a time. A player who starts later in the list gets one recap card ("You
skipped missions 1 to 3: Moving, Control Zones, Difficult Terrain") with "Show" links instead of five popups in a
row. Lessons keep their event triggers in flow.js (`teach()`, the flow pauses there); never open a popup from hover
or over a dice roll. Rewrite the 47 lessons to what / do this / where to click + diagram, "More" for the rest, in
batches by mission; fix wording that says "the panel on the right".

**M. Undo** of a move until the first dice of the phase (Into the Breach, BGA undo policy). Separate work in flow.js.

## Where each tabletop fact lives

| At the table | Layer 1 (always) | Layer 2 (click/hover) | Layer 3 (drawer) |
|---|---|---|---|
| Phase, turn, Priority | ladder, badge | step rule | In play |
| Objective, VP, Break Point | strip, score pill | pill tooltip | Scenario |
| Profile MV..I, mount | comparison card (phase stats) | Details | Armies |
| Wounds, Might/Will/Fate | pips on tokens and card | card | Armies (live) |
| Status (Engaged, Prone, Trapped, Courage, spell) | glyph | term | Armies, Effects |
| Wargear, special rules, magic powers | | Details | Armies, In play |
| Spells and Heroic Actions in play | glyph on model | term | Effects |
| Distances, Control Zones, ranges, auras | overlays on selection | measuring tape, hover Hero/banner | |
| Line of Sight, In The Way | lines while aiming | look from here | |
| Combats, dice per side, Trapped | Combat labels | Why? | |
| Roll needed (To Hit, To Wound, Duel) | forecast line | Why? (modifiers) | To Wound chart |
| Every dice result, re-roll | tray, one log line | log line expanded | end-screen history |
| Rules text | term in sentence | short text | entry, Rules Manual link |
| Opponent's army | tokens | card | Armies |

## Order of work

0. Foundations (done 14.10.2026):
   - detail pref (K): `prefs.detail`, `showsAtLeast()`, three radio buttons in Options; first use: the To Wound chart
     (hidden until the player meets To Wound rolls, folded on Guided, open on Standard, always open on Full table);
   - log store (H data): every log() call also keeps a record in `G.record` (`logRecords()` in panel.js) with the
     models it names (found by their names in the text), the acting side, roll or event; calls may pass units, side,
     kind, auto and mods;
   - glossary (J data): `ruleShort(k)`, `ruleAliases(k)`, `ruleFor(term)` in rules-text.js, own short texts (`s`) for
     the 20 entries whose first sentence was too long; `node tools/glossary-check.mjs` checks lengths and clashes;
   - `toScreen(x, y)` and the `boardview` event in board.js;
   - engine explainers: `duelModParts`, `attacksParts`, `woundBonusParts` (combat.js) and `hitParts` (rules.js) list
     every part with its reason; the old functions are now their sums, so the shown parts and the rolls always agree
     (seeded runs of balance, hero-check and matched-check gave identical results before and after).
   Fixed on the way: six lessons the game asked for did not exist (heroic, heroicChallenge, standFast, intelligence,
   magic, sharpshooter), and lessons of rules no mission teaches yet never showed in the Heroes sandbox or matched
   play; a duplicate glossary entry (sharpshooter); the sandbox status used W for both Wounds and Will; the single-file
   build failed on `import * as`.
1. Quick wins (done 14.10.2026):
   - To Wound chart by detail level (in step 0); the `heroic` lesson (in step 0);
   - Guided folds the rule chips into a "Rules in play" button with their number (remembered in the browser; pulses
     once when a rule turns up for the first time in a game; Standard and Full table keep them open); touch screens
     get chips 2.25rem high;
   - recap card: two or more lessons from missions the player has not played, met at once, become one card ("Rules
     from earlier missions", a line each opening to How it works); mission 4 started fresh now shows 2 cards, not 5;
   - Combat labels: "Combat 1 · 2 v 1 dice" (yours first, counted as the Duel Roll throws them: combat.js duelDice)
     and "enemy Trapped" / "yours Trapped";
   - Heroic Actions: a second button, "Pass for the rest of the turn" (G.passTurn), logged;
   - the rule card no longer says "you have not met this rule" in the sandbox and matched play.
2. I reference column (done 14.10.2026): tabs Log, Rules, To Wound, Armies, Scenario beside the board.
   - Rules: "In play now" (the chips' rules), "Effects on the table" (spells with caster, target and duration; Heroic
     Actions declared by both sides; Heroic Challenges; Broken armies), "All rules" (every glossary entry: title and
     short text, open for the full text, the step-by-step popup and the Rules Manual links; rules not taught yet greyed
     with the mission that teaches them), and a search over titles, aliases and texts.
   - To Wound: the chart, its cells lit as before (hlChart); the tab shows once To Wound is taught (always on Full table).
   - Armies: both sides; models on the table and lost against the Break Point (once Broken armies are taught); each
     model's Wounds, Might/Will/Fate and states (panel.js: `statusOf`, the one list the model card uses too); the
     models removed (slain, fled, escaped). Pointing at a row shows the model's card and lights it on the table; a
     click keeps the card.
   - Scenario: the briefing, the mission's rules with their short texts, and in matched play the Victory Points if the
     battle ended now.
   - The rule card and the To Wound chart left the side panel.
   - Open on a phone: the column is far down the page; a chip jumps there (no smooth scroll, which was cut short).
     Step 6 turns it into a sheet.
3. E comparison card and F tokens and pips (done 14.10.2026):
   - Comparison card (`js/ui/compare.js`) in place of the profile card: the selected (or last clicked) model and the
     one under the pointer or aimed at, side by side; Move MV FV A D, Shoot SV range S D, Fight FV A S D, all of them
     with one model; pips for Wounds, mount Wounds, Might, Will and Fate; the states. Two enemies get one line from
     their profiles: who wins a tied Duel Roll and what each needs on the To Wound chart (Shoot: To Hit and To Wound
     of each shooter). Actions (Cast, the Ring, push a ladder, Dismount) stay on the card; "Details" (key I) opens the
     full profiles below it (open by default on Full table; the choice is remembered).
   - The states moved to `js/ui/status.js` (`statusOf`, now with a token kind per state; Trapped added while a Strike
     is chosen) with `TOKENS`: Heroic Action at 12 o'clock, Prone or thrown 1:30, Trapped 3, Magical Power 9, Courage
     Test due 10:30; on Full table also Moved 4:30, Has shot 7:30 and the enemy's Heroic Actions. Drawn after every
     base, so no token hides under a neighbour; they replace the Prone, Heroic Action and thrown tags. Pointing at a
     token shows its term, what it says about this model and the rule's short text.
   - Rim: an orange ring for Engaged in Combat; bright and faded bases as before; mount Wounds as brown pips beside
     the rider's gold ones; Might/Will/Fate as three short rows of pips under each Hero.
   - Size: a token is 0.3 of the base radius, at least 4.5 board-text units; on a base under 7.5 units two or more
     tokens fold into a "+n" badge (pointing at it lists them).
   - Legend: "On the models" in the Rules tab, its icons drawn by the same code as on the table.
4. J term links, then C orders mode by mode, and D (done 14.10.2026):
   - `js/ui/terms.js`: the first use of each glossary term (as the rulebook writes it, capitalised) in the orders, the
     forecast and the card is a link; pointing (or focus) shows the short text with "Open in Rules" and the Rules
     Manual link, a click or Enter opens the entry in the Rules tab. Delegated listeners; one level, no nesting.
     `ruleTerms()` in rules-text.js lists the terms longest first.
   - Orders: title, one sentence (`say`), "Why?" opening the old paragraph (open the first two times a kind of step
     appears, counted in the browser; always open on Full table); the forecast outcome first ("Hits on 3+ · clear line ·
     wounds on 5+", "Duel: 2 v 1 dice, you win ties") with "Why?" listing every part from the engine explainers
     (hitParts, attacksParts, duelModParts, woundBonusParts) with rule links; choices (Combats to pick, Heroes, Start
     again, choice questions) in their own region `#hChoices`. The red "not in a Combat yet" list went: the button says
     "Done: 3 models left". The forecast uses the body font, not monospace.
   - D: Declare Heroic Actions is one row per Hero: name, Might pips, short action buttons (tooltip: what it does and
     the Might it costs); Pass and Pass for the rest of the turn below. Sentence: "Spend 1 Might to give a Hero a
     special action this phase, or Pass."
5. H log rendered from the store (done 14.10.2026): `js/ui/logview.js` draws the Log tab from `G.record`: one line
   per event (a die with the highest result for a roll, a dot for an event, the side's colour on the left, "auto" for
   45 automatic steps marked in flow.js and input.js: Trapped, Knocked to the Ground, Broken army, Stand Up, forced Charges, nobody
   can move or shoot…), grouped by turn and phase, newest first, earlier turns folded (drawn when opened). A click opens
   the line: whole text, dice, modifiers, rule chips, and its models pulse on the table (board.js: `G.logFlash`).
   Filters All, Rolls, Mine (remembered). The end screens (missions and matched play) have "Every roll of the
   battle": dice, average, 6s and 1s for each side, then every roll by turn. The old 180-node cap is gone.
6. A and B layout (done 14.10.2026):
   - Top bar: the phase ladder (a click or Enter on a phase opens its rule), in the Fight phase a second row Heroic
     Actions, Pair Off, Duels with the current step lit; turn counter; Priority badge; a score pill per side (models
     left, "lost 2 of 12, Broken at 7" once Broken armies are taught, Broken, VP in matched play; the tooltip says how
     losses count); one Menu button (Missions, Restart, Options; arrow keys, Esc).
   - Mission strip above the board: eyebrow and title on one line, objective and counters two lines each (a click
     shows all, the tooltip has them too), the tip open in turn 1 under Guided and then behind the Tip button; the
     Scenario tab now starts with the objective, briefing and tip.
   - Reference column: a fold button (« / ») turns it into a rail of vertical tab buttons and the board takes the
     width (remembered); a tab click or a rule chip opens it again, a click on the open tab folds it. 900 to 1280: board
     and panel side by side, the tabs below the board (folding leaves the tab row). Phones: the tabs are a sheet fixed
     to the bottom of the screen; a tab or a rule chip slides it up to 72% of the height, the button or the open tab
     closes it. `columns.js` takes two columns into account and moved its saved widths to a new key once.
   Checked at 1600x900, 1366x768, 1100x800 and 375x812 (no sideways scroll; the board 606x444 at 1366).
7. G overlays (measuring tape, look from here, auras), L lesson rewrite (done 14.10.2026):
   - `js/ui/overlays.js` with buttons beside the zoom and keys: Measure (M) drags a tape from a model or point to
     another, base edge to base edge (`gap`, so height counts as in the rules), with inch ticks and the length; Look (V)
     shows from a clicked model a line to every enemy it can see (green clear, yellow dashed with something In The Way,
     a red cross when hidden whole; pointing at an enemy names what is In The Way or what hides it; rules.js hiddenBy
     and inTheWay, the same code as a shot); Zones (Z) shows or hides the enemy Control Zones (shown by default in the
     player's Move step and where a mission always shows them). While a tool is on, board clicks go to it and the orders
     say how to put it away; Esc closes the tool first (one layer). L opens the Log tab, ? the Rules tab, I Details.
   - Pointing at a Hero shows its auras: shouts 6″ (once Heroic Actions are in play) and Stand Fast (once it is in
     play; 6″ or 12″ from named.js standFastRange), with the friends it reaches lit (Stand Fast: only those that see it).
     Banner ranges were drawn already.
   - Strike targets carry "wounds on 5+ (+1)" on their tags; Make Way dots carry a ⇄ glyph, not colour only.
   - Lessons: what (lead), Right now, Do this (the click steps, or the first "how to use it" line), the diagram; How it
     works and How to use it behind "More" (open on Full table). The six lines that pointed at "the panel on the right"
     now name the orders and the model card. The lesson texts themselves were not rewritten one by one.
8. M undo (done 14.10.2026): `js/game/undo.js`. Each player move in the Move step (a move, a Charge, a Jump, Leap
   or Climb) first saves every model's state; "Undo the last move" in the orders (U or Ctrl+Z) puts it back, drops
   the log lines made since and slides the models back. Possible while nothing has been thrown in this Move step;
   the first dice (a Climb Test, a Courage Test before a Charge, a Sentry…) end it, as does the end of the step.

9. Follow-ups (14.10.2026): the dice tray is docked at the bottom of the panel (sticky, its Throw row keeps its room),
   the model card lists wargear, the M/W/F pips move round the base to a clear spot (tokens.js mwfPlace), the Fight
   steps row and the mission status keep their room (no jump at the End phase), the column handles always show a grip.
   Auras now include Magical Power ranges (pointing at a caster) and an Objective Marker's scoring distance (pointing
   at it). Enemy Heroic Action tokens show from Standard. Lessons: leads average 20 words and every lesson has a
   Do this line; the 19 without click steps are rules with nothing to click (To Wound, Trapped, Courage…).

10. Second follow-up (14.10.2026): `[hidden]{display:none!important}` had beaten the reserved rows, so the top bar
   still changed height after the Fight phase and the board was resized (blank for a moment); the reserved rows now use
   !important and fit() draws at once after a resize. The dice tray has one height (tray.js draws smaller to fit). The
   Rules in play chips left the panel: the Rules tab lists them and counts rules new after turn 1. The mission strip is
   two one-line rows (title with objective, counters); a click or Tip opens the Scenario tab, which has the tip. After
   the result, Fight on plays the battle out (flow.js keepFighting, G.freeplay: only the end of an army ends it).

Each step: `npm run build` (the single file needs exact anchors in index.html), check in the browser pane by ids.

## Sources (collected by the research agents)

- Progressive disclosure, two levels: https://www.nngroup.com/articles/progressive-disclosure/
- BGA interface guidelines (log automatic steps, highlight legal options, short tooltips): https://en.doc.boardgamearena.com/BGA_Studio_Guidelines and undo policy https://en.doc.boardgamearena.com/BGA_Undo_policy
- Fire Emblem combat forecast and its simplified option: https://www.fireemblemwiki.org/wiki/Combat_forecast
- Wildermyth combat UI (hover card becomes the attack forecast): https://wildermyth.com/wiki/Combat_UI
- Forged of Blood UI rework (forecast next to the action; testers attacked at 0%): https://www.gamebanshee.com/k8rd6
- Warhammer 40,000 app Command Bunker: https://www.warhammer-community.com/2024/01/30/the-warhammer-40000-app-gets-even-better-with-two-key-changes-for-all-users/
- MTG Arena phase ladder: https://mtgazone.com/playing-a-match/
- Root digital (legal actions list): https://meadowparty.com/blog/2020/10/30/root-app/
- Fell Desert (odds as dice faces instead of percent): https://chadius.itch.io/fell-desert/devlog/957210/version-00040-chance-to-hit-update
- Old World (tooltip to encyclopedia): https://mohawkgames.com/2021/10/06/old-world-update-73/
- Victoria 3 UX dev diary (tooltips, pinning): https://www.paradoxinteractive.com/games/victoria-3/news/dev-diary-74-ux-improvements
- Field of Glory II (preview shows known factors, log shows all): https://forum.slitherine.com/viewtopic.php?p=842086
- Marvel Snap onboarding (reveal one thing at a time): https://www.deconstructoroffun.com/blog/2023/5/23/marvel-snap-the-definitive-deconstruction
- Hearthstone new player experience: https://hearthstone.wiki.gg/wiki/New_player_experience
- Gloomhaven digital early access (fast automation hid the rules): https://www.destructoid.com/gloomhaven-on-early-access-is-a-new-way-for-veterans-to-play-but-beginners-beware/
- Text size guidance: https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md
