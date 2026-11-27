# Seasons, season titles and Paskoning

Date: 2026-11-27 · Status: draft for approval

## Intent and the why

The group wants the stats to have rhythm: a season that the admin starts and ends, with four titles at the end of each season. The titles appear festively on the group page, so there's something to play for and to tease each other about. The four titles are:

- **Kampioen**: most wins.
- **Anita**: most often first out.
- **Boer**: most boers.
- **Paskoning**: folded most often. This is a new stat.

The Ranglijst also needs to stay readable on a phone now that it has a lot of columns.

## Goals

1. **Fold counting** (part 1, shipped first). Every "Pas" press is counted per player per game, stored on the server and shown on the Ranglijst ("Gepast").
2. **Seasons** (part 2): the admin starts, renames, re-dates and deletes seasons per group. A game belongs to the season its start time falls in.
3. **Season titles** on the group page: a gold Kampioen banner with confetti inside it, plus rows for Anita, Boer and Paskoning. Earlier seasons are reachable through "Vorige seizoenen".
4. **Ranglijst redesign**: a season picker, a fixed short table with a third column chosen by buttons, and tap-to-unfold rows for the other stats.

## Non-goals

- The Android app (`ToepScoreTracker/`) is abandoned and gets no changes.
- Backfilling folds into old games. Only final scores were ever stored, so folds count only from the part-1 update on. The same holds for the Anita, from its 2026-11-27 update.
- Frozen or stored titles. Titles are always calculated from the games (see Approaches).
- Seasons spanning several groups. Seasons are per group.
- Notifications or pushes when a season ends.

## Anti-goals (would make it a failure even if it works)

- Titles that disagree with the Ranglijst for the same season.
- Confetti that covers the page or plays during a running season.
- A Ranglijst that needs horizontal scrolling again.

## Constraints

- **Stack:** PWA (`pwa/`, Preact + TS + Vitest, Dexie/IndexedDB cache) and PHP 8.4 API (`api/`, MySQL 8.4, PHPUnit). Hosting is netcup. Upload is manual, and migrations are run by hand in phpMyAdmin before uploading code (see DEPLOY.md).
- **Stats are computed on the phone** from the cached games of a group (`pwa/src/stats/stats.ts`). The API delivers groups via `GET /groups` (`Groups::toApi`) with an ETag over the whole body.
- **Backward compatibility:** new upload fields are optional and default to 0. Queued outbox games, pending sync requests and IndexedDB caches from before an update must keep working, and missing values count as 0 (same pattern as `boer_count` / `is_anita`).
- **Language:** all UI text is in Dutch.
- **Timestamps:** game times are ISO strings with an offset (`started_at`), and the server stores UTC. Season boundaries are compared as instants, never as local date strings.
- **Motion:** honour `prefers-reduced-motion`, which means no confetti.

## Approaches (decided)

1. **Seasons are start dates on the server, and the app calculates everything (chosen).** The server stores only the season boundaries per group. The phone assigns games to seasons by `started_at` and computes titles and the Ranglijst. A date correction re-sorts games automatically, and titles can never disagree with the Ranglijst. Trade-off, accepted: titles aren't frozen. An offline game from last season uploaded later can still change them.
2. Same, but titles frozen by the server at season end. Rejected: late games and date fixes would stop counting, and it needs a second copy of the stats logic in PHP.
3. Season id stamped on each game at upload. Rejected: date corrections don't move games, and late offline uploads land in the wrong season.

## Part 1: Fold counting

- **Engine (`pwa/src/game/engine.ts`):** `GameState.folds: Record<string, number>`, initialised to 0 per player. The `fold` action adds 1 to that player's count, including in a 1-point round where the fold adds 0 points. The count is part of the undo snapshot, so undo takes it back.
  - A state resumed from before the update has no `folds`. Treat a missing count as 0, the way the Anita helper treats a missing value.
- **Upload:** `toUpload` sends `fold_count` per player. `GamePlayer.fold_count: number` is added in `types.ts`.
- **API:**
  - Migration `api/migrations/005_fold_count.sql` adds `game_players.fold_count INT NOT NULL DEFAULT 0 AFTER is_anita`.
  - `Validate.php`: `fold_count` is optional, defaults to 0 and must be an int ≥ 0. The message follows the `boer_count` style: `'ongeldig aantal keer gepast'`.
  - `Repo/Groups.php` reads and writes the column. Add a DEPLOY.md bullet for 005.
- **Stats/Ranglijst:** `PlayerStats.folds`, with a missing value counting as 0. A "Gepast" column is added to the current table after "Anita's". Part 2 replaces the table.

## Part 2: Seasons

### Data model

- **Season 1 is implicit.** It runs from the beginning of time (so all history counts) until the first explicit season starts. Its optional custom name is `game_groups.first_season_name VARCHAR(40) NULL`.
- **Table `seasons`:**
  - Columns: `id INT UNSIGNED PK AUTO_INCREMENT`, `group_id INT UNSIGNED NOT NULL FK game_groups(id)`, `name VARCHAR(40) NULL`, `starts_at DATETIME NOT NULL` (UTC).
  - It has `UNIQUE (group_id, starts_at)`.
  - Each row is the start of season 2, 3, …, ordered by `starts_at`. A season ends when the next one starts. The last season is the running one.
- **Migration:** `api/migrations/006_seasons.sql`.
- **Numbering** is positional: Season 1 is implicit, and the rows are 2…n in `starts_at` order. A season with a null name displays as `Seizoen <n>`. Deleting a season renumbers the later ones. That's acceptable, because numbers are only a display default.
- **Membership:** a game is in season k when `starts_at(k) ≤ started_at < starts_at(k+1)`. Season 1 has no lower bound and the last season has no upper bound.

### API

- **`Groups::toApi`** adds `first_season_name: string|null` and `seasons: [{id, name, starts_at}]` (ISO with offset, ascending). They're part of `GET /groups`, so the ETag changes when seasons change.
- **Admin-only endpoints** (following the `App.php` route conventions; exact paths are the builder's call):
  - **Start a season:** body `{name?: string, starts_at?: ISO}`. `starts_at` defaults to now. It must be later than the group's latest season start and not in the future, so backdating is allowed. Response 201 with the group.
  - **Edit a season:** `{name?, starts_at?}`. A new `starts_at` must stay strictly between the previous and next season's starts (season 1 has no lower bound) and not in the future. An empty or null name resets to the default.
  - **Delete a season:** its games fall into the previous season. Any season row may be deleted.
  - **Rename season 1:** sets `first_season_name`.
- **Validation:** names are trimmed, 1–40 characters, or null. Dates must be ISO with an offset. Errors are 422 with Dutch messages in the existing style.
- **Group merge** (`AdminHandlers::mergeGroups`): the target keeps its seasons, and the source group's season rows are deleted with it. Ruling: merges are rare, and the target's history defines the seasons.

### PWA data

- **`CachedGroup`** gains `seasons: { id: number; name: string | null; startsAt: string }[]` and `firstSeasonName: string | null`. `refresh()` fills them.
  - Groups cached before the update have no such fields. Treat them as `[]` / `null` until the next refresh, so everything is season 1.
- **Local groups** (not yet approved by the admin) have no seasons, so everything is season 1. It's still shown with leaders.
- **New module `pwa/src/stats/seasons.ts`:**
  - `seasonsOf(group)` returns an ordered list `{number, name, start: number|null, end: number|null}` that includes the implicit season 1.
  - `gamesIn(season, games)` filters by instant.
  - `titles(games)` returns the four titles.
  - `leaderboard`/`timeStats` from `stats.ts` are reused on the filtered games.

### Title rules (`titles(games)`)

- **Kampioen:** the player(s) with the most wins. A tie on wins goes to the higher win percentage (wins/played). If still tied, they share the title. No wins in the season means no Kampioen.
- **Anita / Boer / Paskoning:** most Anita's, most boers or most folds. Ties share the title. A maximum of 0 means that title is empty and not shown as a row.
- **Display:** shared names are joined with " & ", for example "Tim & Kees". The count is shown as "12 gewonnen" for the Kampioen and "5×" for the others.
- Ended-early games count like the Ranglijst counts them today: `played` includes them, and their winner is null.

### Admin UI (`pwa/src/screens/admin/AdminGroups.tsx`)

- **Button:** each group gets a "Seizoenen" button, which opens a dialog.
- **The dialog:**
  - Lists all seasons (including season 1) with name, start date and "loopt nog" on the last one.
  - Each row has Hernoemen, Startdatum wijzigen (`datetime-local`, interpreted in the phone's local time) and Verwijderen. Season 1 has only Hernoemen.
  - A "Nieuw seizoen starten" button asks for confirmation ("Seizoen N afsluiten en seizoen N+1 starten?") with an optional name field.
- **Online only:** the admin actions need a connection. On failure, show a toast, as in other admin actions.

### Group page (`pwa/src/screens/GroupHome.tsx`)

- **Placement:** a titles block between the group name and the buttons, in the style of approved mockup B.
- **The gold Kampioen banner:**
  - Trophy icon, a small label, the winner's name large, and their win count below.
  - With no Kampioen, it shows "Nog geen kampioen" in the same banner, without confetti.
- **The other titles:** three dark rows below the banner, "💀 Anita", "🃏 Boer" and "👑 Paskoning", each with name(s) and count. An empty title's row is hidden.
- **Which season is shown:**
  - **Just-ended state:** the latest ended season, when the running season has no games yet. The label is `KAMPIOEN <SEIZOEN NAAM>` plus an "AFGELOPEN" pill with the date range. Below it: `<naam> · loopt sinds <datum>`. Confetti falls **inside the banner only** (clipped, behind the text) for about 3 seconds on every page open, then stops. Not under reduced motion.
  - **Otherwise:** the running season's current leaders, with a "LOOPT NOG" pill and "loopt sinds <datum>", and no confetti.
  - The just-ended state switches off by itself once the first game of the new season exists.
- **"Vorige seizoenen ›" link:** shown when at least one season has ended. It opens a new screen (route under `#/g/<key>/…`) listing ended seasons newest first, each with its date range and four titles in a compact (non-animated) form.

### Ranglijst (`pwa/src/screens/Leaderboard.tsx`)

- **Season picker:** at the top, it lists all seasons plus "Alles" and defaults to the running season. It isn't remembered: every visit starts at the running season.
- **Stat buttons:**
  - A row of buttons: Gewonnen, %, Boeren, Anita's, Gepast, Duur. Exactly one is active, and "Gewonnen" is the default on every visit.
  - Tapping the active button again returns to Gewonnen.
- **Table:**
  - Columns: rank, Naam, Gew., Gesp., and a third stat column.
  - The third column shows the chosen stat. With Gewonnen chosen, it shows win %.
  - The list sorts by the chosen stat, descending. Ties break by wins, then by name. The rank number follows the sort.
  - "Duur" is average game duration, longest first (my call).
- **Unfolding rows:** tapping a row unfolds that player's other stats (win %, Boeren, Anita's, Gepast, Gem. duur) in a two-column grid. Tapping again folds it.
- **Time stats** (the existing shortest/longest/average block) follow the season picker.

## Clarifications (from the builder check)

- **`started_at`:** it is always present. `Validate::gameUpload` requires it with an offset, and server rows are `NOT NULL`. No fallback is needed. Parse it with `Date.parse` and compare instants.
- **`played`:** it counts every player listed in a game, including ended-early games and players who were already out. That's the existing `leaderboard()` definition, and titles must reuse it so they never disagree with the Ranglijst.
- **Anita count:** this is the number of games where the player has `is_anita === true`, with no extra rules. Missing is false.
- **Partial history** *(my call)*: folds and the Anita only exist from their updates, so season 1 compares players over uneven history. That's shown as-is, with no warning.
- **Just-ended state:** it stays until the first game of the new season, with no time limit, as discussed with the owner.
  - *(my call)* If the admin backdates a new season so it already contains games, the just-ended state is skipped and the running season shows directly.
  - *(my call)* If the ended season has no games, there's no just-ended state either, and the running season shows directly.
- **"Vorige seizoenen"** *(my call)*: ended seasons with zero games are hidden from the list.
- **Group page** never uses "Alles". It always shows one season.
- **"%" sort** *(my call)*: there's no minimum number of games. Ties break by wins, then by name. It's a fun view, and the official ranking is Gewonnen.
- **"Not in the future"** *(my call)*: compare to the server clock with 5 minutes of tolerance.
- **Phone caching:** none. Stats and titles are always computed fresh from cached games and seasons, and the ETag on `GET /groups` is the only invalidation.
- **Approval of a local group:** until the next refresh delivers seasons, it's all season 1. That's fine.
- **Merge:** moved games keep their `started_at` and fall into the target's seasons. This is intended.

## Builder decisions (left open)

- Exact admin endpoint paths and handler placement.
- Confetti implementation (CSS keyframes vs canvas), piece count and colors. Keep it light and clipped to the banner.
- Styling details, within the existing tokens in `styles.css` and the mockups.
- The route name for "Vorige seizoenen".
- How part 2 is split into plan tasks.
