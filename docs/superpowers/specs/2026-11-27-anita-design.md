# Anita — first player out

Date: 2026-11-27 · Status: approved in conversation

## Intent

In every game, the first player to reach the penalty limit is that game's **Anita**. The group wants a per-player count, so they can see who tends to drop out first.

## Goals / non-goals

- Goal: record the Anita for every new game and show it in the game, the results and the Ranglijst.
- Non-goal: the Android app (`ToepScoreTracker/`). The user considers it abandonware, so it gets no changes.
- Non-goal: backfilling old games. Only final scores are stored and every loser ends on the limit, so the order can't be recovered. Old games have no Anita.
- Non-goal: seasons. These come in a separate brainstorm later, and Anita counts should then follow whatever season filter is chosen.

## Approaches

1. **Per-player flag `is_anita`** next to `boer_count` (chosen). It's small and matches how boer counts already flow from the engine through upload, the API, the DB and stats.
2. Store the full knockout order (`out_order` per player). It's more general (it could also give "second out"), but nobody asked for that, and it needs more validation.
3. Store a game-level `anita` name like `winner`. That needs another player FK and name matching. It's more plumbing than option 1 for the same information.

## Design

- **Engine (`pwa/src/game/engine.ts`)**: `GameState.anita: string | null`. It's set on the first knockout while it is still null. It's part of the undo snapshot, so undoing that knockout clears it. "Eindig spel" before any knockout means no Anita. `toUpload` sends `is_anita` per player.
- **In-game message**: for the first knockout, show `"<naam> heeft verloren en is de Anita!"`. Later knockouts keep `"<naam> heeft verloren!"`. The engine's `eliminated` event carries `anita: boolean`.
- **Types**: `GamePlayer.is_anita: boolean`.
- **API**:
  - Migration `api/migrations/004_anita.sql` adds `game_players.is_anita TINYINT(1) NOT NULL DEFAULT 0`. The user runs it in phpMyAdmin before uploading the code.
  - `Validate.php`: `is_anita` is optional and defaults to false, so cached outbox games and old sync requests stay valid. It must be a bool, at most one player may have it, and that player's `final_score` must equal the max.
  - `Repo/Groups.php` reads and writes the column.
- **Results screen**: an "Anita" tag next to that player.
- **Ranglijst**: an "Anita's" column next to "Boeren", counted in `stats.ts`.
- **Tests**: engine (set, undo, end early, only first), stats, API validation and round-trip.
- **Deploy**: DEPLOY.md note: run 004 first, then upload `api/` and the PWA build.

## Left to the builder

- The exact tag styling on the Results screen. It should follow existing styles.
- Column order on the Ranglijst. Put it right after "Boeren".
