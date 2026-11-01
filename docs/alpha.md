# Alpha readiness review (15.10.2026)

Question: can Captain's School move from prototype to alpha? **Verdict: yes, as a closed alpha (0.5.0-alpha.1)**: the
game is playable from start to finish, the rules engine is complete for what the game can show, and the checks pass.
It is not a beta: one chapter of the curriculum is unwritten and a few systems players expect are missing.

Working definition used here: *alpha* = every core system is in and the game can be played end to end, content is not
complete and bugs are expected, testers are friends and the author. *Beta* = content complete, only polishing and
bug fixing left.

## Alpha criteria

| Criterion | State | Evidence |
|---|---|---|
| Core loop: menu, briefing, play, result, progress kept | done | missions 1–23, E1–E4, matched play, Heroes sandbox; completed missions kept in the browser |
| Rules engine covers every rule the game can play | done | `docs/engine-gaps.md`: priorities 1–3 done; only rare cases listed as open |
| Automated checks pass | done | hero-check 91/91 (100 sandbox battles, 0 errors), los-check 27/27, geom-check 76 423/76 423, glossary 0 clashes |
| Missions winnable by the player (75% rule) | done, 1 borderline | `balance.mjs 150 <n>` on 15.10.2026: missions 2–22 at 80–100% (1 has no dice); 21 Through the Line 73% (79% over 500 games at its commit, within the noise of 150) |
| Matched play runs without errors | done, 1 open | `matched-check 2 150`: one pairing (Arathorn's Stand vs Umbar) ends with no result after 40 turns |
| Interface finished for the current content | done | UI redesign steps 0–8 (`docs/ui-redesign.md`), Options, sound |
| Single-file build works | done | `npm run build` writes `dist/captains-school.html` |
| Version, release notes, known issues visible to players | done | menu: What's new; `CHANGELOG.md` |

## Known issues for the alpha (shown in the game)

- Magic and Monsters are in the engine, but no mission teaches them yet (curriculum chapter VI, optional Monsters).
- A game in progress is not saved when the page closes.
- Rare rules are simplified or missing (`docs/engine-gaps.md`, "Rules found missing or partial").
- Small differences between the game (`flow.js`) and the simulator (`sim.js`), so the balance numbers are close but not
  exact (`docs/engine-gaps.md`, "Differences between sim.js and flow.js").
- A matched play pairing can stall when neither army can reach the other.
- Token art only for Rohan and the Hill Tribes in the finished style; other armies use plainer tokens.

## Road to beta (0.9)

1. Finish chapter V (Heroes): mission 24 Unbreakable is in progress; then Heroic Challenge, Resolve and Heroic Tiers.
2. Chapter VI Magic: Casting and Resisting missions (Gandalf, an Uruk-hai Shaman); optional Monsters mission.
3. Save and resume a game in progress (the state is plain data in `G`; store it with the mission number).
4. Close the `sim.js` / `flow.js` differences, so the balance tool measures exactly the game the player plays.
5. Matched play: a turn limit or a draw rule for stalled games; 33% terrain cover.
6. Token art for Isengard, Mordor and Gondor in the finished style.
7. Outside playtest: two or three players new to the game play missions 1–10 without help; fix what they trip on.
8. Check on a 4K screen and a laptop, Chrome and Firefox; keyboard use of menus and dialogs.

Release 1.0 when every curriculum mission is done, the beta playtest has no blockers, and every mission is at 75% or more.
