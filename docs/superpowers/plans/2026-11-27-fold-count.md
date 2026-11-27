# Fold Count (Paskoning, part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count every "Pas" press per player per game, store it on the server and show it as "Gepast" on the Ranglijst.

**Architecture:** `fold_count` follows exactly the path of `boer_count`/`is_anita`: engine state → `toUpload` → `Validate` → `game_players` column → `GET /groups` → `stats.ts` → Ranglijst.

**Tech Stack:** PHP 8.4 + PDO/MySQL 8.4 + PHPUnit 11 (`api/`); Vite + Preact + TS + Vitest (`pwa/`).

**Spec:** `docs/superpowers/specs/2026-11-27-seasons-design.md` (section "Part 1: Fold counting")

## Global Constraints

- No changes under `ToepScoreTracker/`.
- `fold_count` is optional on upload, defaults to 0 and must be an int ≥ 0. Error message: `'ongeldig aantal keer gepast'`.
- Missing values count as 0 everywhere. This covers states resumed from before the update, queued outbox games, pending sync requests and IndexedDB-cached games.
- Migration `api/migrations/005_fold_count.sql`: `ALTER TABLE game_players ADD COLUMN fold_count INT NOT NULL DEFAULT 0 AFTER is_anita;`
- Ranglijst column header: `Gepast`, placed right after `Anita's`.
- No new Playwright e2e tests. Keep `npm test`, `npm run build` (in `pwa/`) and the full PHPUnit suite green.
- PHPUnit: `PATH=/c/Users/t.wezeman/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH docker compose exec -T php sh -c "cd api && vendor/bin/phpunit"`.

## Review Focus

1. Undo of a fold must also undo the count. → Task 1 test `undo restores fold counts`.
2. A fold in a 1-point round adds 0 points but still counts. → Task 1 test `fold in a 1-point round still counts`.
3. A game resumed from before the update has no `folds`, and must neither crash nor produce NaN. → Task 1 test `fold on a pre-update state without folds counts from zero`.
4. An old outbox game or sync payload without `fold_count` is accepted. → Task 2 test `test_missing_fold_count_defaults_zero`.
5. A cached game without `fold_count` gives 0 in stats, not NaN. → Task 3 test `missing fold_count counts as zero`.

---

### Task 1: Engine counts folds

**Files:** Modify `pwa/src/game/engine.ts`, `pwa/src/types.ts`; Test `pwa/tests/unit/engine.test.ts`

**Interfaces:**
- Produces: `GameState.folds: Record<string, number>`; `Snapshot.folds`; `GamePlayer.fold_count: number`; `toUpload` emits `fold_count: folds[name] ?? 0`.

- [ ] **Step 1: Write failing tests**
  - `fold counts per player`: two folds by A and one by B → `folds` is `{A: 2, B: 1, …0}`.
  - `fold in a 1-point round still counts`: score unchanged, `folds.A === 1`.
  - `penalty and boer do not count as folds`.
  - `undo restores fold counts`.
  - `fold on a pre-update state without folds counts from zero`: delete `folds` (cast through unknown), fold A → `folds.A === 1`, and other players read as 0 via toUpload.
  - Extend the `toUpload` test with `fold_count`.
- [ ] **Step 2:** `npx vitest run tests/unit/engine.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `newGame` zeroes `folds`. The penalty/fold/boer branch reads `const folds = s.folds ?? {}` and increments only on `fold`. Snapshots carry `folds`, and undo restores them through the existing spread. Add `fold_count: number` to `GamePlayer` and `fold_count: 0` to existing test fixtures that build `GamePlayer` literals.
- [ ] **Step 4:** `npx vitest run`, `npx tsc -b` → PASS.
- [ ] **Step 5: Commit** `feat(pwa): count folds per player`

### Task 2: API stores `fold_count`

**Files:** Create `api/migrations/005_fold_count.sql`; Modify `api/src/Validate.php` (docblock + player loop), `api/src/Repo/Groups.php` (SELECT + INSERT), `DEPLOY.md` (bullet under "Updaten" step 2), `api/tests/GroupsTest.php` (exact-shape assertion); Test `api/tests/GamesTest.php`

**Interfaces:**
- Produces: every `players[]` entry in game responses has `fold_count: int`.

- [ ] **Step 1: Write failing tests:**
  - `test_fold_count_round_trips` (Tim 3, Ravi 0).
  - `test_missing_fold_count_defaults_zero`.
  - Provider rows `'negative folds'` (-1) and `'folds not int'` ("2") in `test_validation_rejects`.
- [ ] **Step 2:** PHPUnit `--filter GamesTest` → FAIL.
- [ ] **Step 3: Implement** per the Global Constraints. Cast to `(int)` on read.
- [ ] **Step 4:** Full PHPUnit → PASS.
- [ ] **Step 5: Commit** `feat(api): store fold count per game player (migration 005)`

### Task 3: Stats and Ranglijst column

**Files:** Modify `pwa/src/stats/stats.ts`, `pwa/src/screens/Leaderboard.tsx`; Test `pwa/tests/unit/stats.test.ts`

**Interfaces:**
- Consumes: `GamePlayer.fold_count` (may be missing at runtime).
- Produces: `PlayerStats.folds: number`.

- [ ] **Step 1: Write failing tests:**
  - `counts folds per player` (sum across games).
  - `missing fold_count counts as zero`.
  - Update existing exact `toEqual` expectations with `folds`.
- [ ] **Step 2:** `npx vitest run tests/unit/stats.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `a.folds += p.fold_count ?? 0`. Add a `Gepast` `<th>`/`<td>` after `Anita's`.
- [ ] **Step 4:** `npx vitest run`, `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(pwa): show fold counts as Gepast on the Ranglijst`
