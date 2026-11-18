# Toepen PWA with shared backend — Design

**Date:** 2026-11-18
**Status:** Draft, awaiting review

## 1. Goal

Build a Progressive Web App (PWA) version of ToepScoreTracker with a small PHP backend, running alongside the existing Android app.

### Problems this solves

1. Publishing through the Play Store is a hassle; a PWA is updated by uploading files.
2. iPhone users cannot use the Android app.
3. The leaderboard differs per device, which makes statistics meaningless. Shared groups give one history.
4. Access is restricted: only accounts created by the admin can log in.

### Success criteria

- A logged-in user can play a full game on Android or iPhone (installed to home screen), including offline.
- Games in a synced group show up on the leaderboard of every member of that group.
- Existing Android history can be uploaded once and ends up in the right server group with correctly matched player names.
- The admin controls all accounts and group memberships; there is no self-registration.
- Everything runs on a netcup web hosting package as plain static files + plain `.php` files + MySQL 8.4, uploaded manually by the owner.

### Out of scope

- Ongoing two-way sync between the Android app and the server (Android only does a one-time upload).
- Self-registration, invite links, password-reset e-mails (admin resets passwords).
- Cross-group statistics (the same person in two groups is two separate players).
- Push notifications, background sync on iOS.

## 2. Users, groups and access

- **Accounts** are created, disabled and password-reset by an **admin**. A user can be admin (`is_admin`).
- **Login is required** to use the app at all, including local-only groups. A device stays logged in via a long-lived, revocable token.
- **Groups**
  - Any user can create a group. It starts **local-only**: players and games exist only on that device.
  - A local group has a **"Synchroniseren met server"** toggle. Turning it on creates a **sync request**; the group shows "Wacht op goedkeuring" and stays fully usable locally.
  - The admin approves a request as either **a new server group** (requester becomes its first member) or **linked to an existing server group** (requester is added as a member and the games are merged into it). The admin can also reject a request with a reason.
  - Only the admin adds or removes members of server groups. A user can be a member of multiple groups.
- **Group names are not identities.** Server groups have unique IDs; names need not be unique. In admin screens, and in a user's own list when two of their groups share a name, groups are shown with their creator: "Work (Tim)", "Work (Sanne)".
- **Admin merge of groups** is available as a fallback for duplicates that slip through: group X is merged into group Y (games, players and members move; X is removed).

### Deleting games

- A member can delete games **they recorded themselves**. The admin can delete any game, and also has "delete all games of a group" and "delete games shorter than 1 minute".
- All deletes are **soft deletes**. The admin has a **Prullenbak** (bin) to restore deleted games.
- Deleting requires a connection.

## 3. Players

- Each group has a **fixed player list** (names only, not accounts). During player setup the user taps who is playing and can add a new name.
- The list is **sorted by number of games played in that group**, descending; ties alphabetically.
- Names are **unique per group, case-insensitive** ("ravi" cannot be added when "Ravi" exists). First letter is capitalized on input (as in the Android app).
- When adding a name that is **similar** to an existing one (e.g. "Rav", "Ravi B" vs "Ravi"), the app asks "Bedoel je Ravi?" before creating it.
- The admin can **merge players** within a group; the old player keeps a pointer (`merged_into_player_id`) to the new one so later uploads using the old name land on the right player.
- Two different people with the same first name must use distinguishable names ("Tim W", "Tim K").

## 4. Game rules (ported from Android `GameViewModel`)

The PWA reproduces the current Android behaviour exactly:

- Each round starts at 1 point. **Klop** raises the round's points by 1.
- **Penalty**: player gets the round's points, capped at max penalty points.
- **Fold**: player gets round points − 1, capped at max.
- **Boer**: player's score −1 (minimum 0) and the player's boer count +1.
- **Undo** restores the previous score state within the current round; nothing to undo shows a message.
- **Next round** resets round points to 1 and clears the undo history.
- A player reaching max penalty points is **eliminated** (message shown).
- The game ends when ≤ 1 player remains; that player wins, or "Niemand" if none remain. The game is saved automatically.
- **End game early**: saved with no winner.
- Scores are shown as tally marks (`卌` per 5, `|` per remaining point). **Remove player** during player setup, **rematch** (Revanche) button, **share** results, **confirm penalty** setting — as in the Android app.
- Confetti on game over, elapsed-time display during the game.
- The game in progress is persisted after every action and survives the app being closed (important on iOS).

Device-level settings: confirm penalty, show rematch button. Group-level setting: default max penalty points.

## 5. Statistics

Per group, computed from non-deleted games:

- **Leaderboard per player:** wins, games played, win percentage, total boer count. Sorted by wins (as now).
- **Game time (group):** average, shortest and longest game, and total playing time. Tapping shortest/longest opens that game.
- **Game time (player):** average length of games the player took part in, total time at the table.
- **Games ended early** are excluded from shortest/longest/average, but counted in total playing time.
- **Results list:** all games, newest first, with players, scores, winner and duration.

## 6. Architecture

### Hosting

`https://toepen.t-wezeman.nl` on netcup with Let's Encrypt HTTPS (required for a PWA). The PWA is served from the root, the API from `/api/`. Same origin, so no CORS for the PWA. The Android app calls the API by absolute URL.

### Technology

- **Frontend:** Vite + TypeScript + Preact, Dexie (IndexedDB), vite-plugin-pwa (service worker + manifest). Dutch UI text, same wording as the Android app.
- **Backend:** plain PHP 8.4 (confirmed: 8.4.27), PDO, MySQL 8.4 (confirmed: 8.4.13). No framework, no Composer on the server.
- **Local development:** Docker Desktop on the developer's PC with PHP 8.4 + MySQL 8.4 containers (same major version as production) (`docker-compose.yml`), used for running and testing the API. Nothing Docker-related is deployed.

### Repo layout

```
Toepen/
├─ ToepScoreTracker/   existing Android app (+ upload feature)
├─ pwa/                Vite + TS + Preact
├─ api/                plain PHP 8
├─ docker-compose.yml  local dev only
└─ DEPLOY.md           manual upload instructions
```

### Frontend units (`pwa/src/`)

| Unit | Responsibility | Depends on |
|---|---|---|
| `game/engine.ts` | Pure game state + actions (section 4) | nothing |
| `stats/stats.ts` | Pure leaderboard + time statistics (section 5) | nothing |
| `players/match.ts` | Case-insensitive matching and similar-name detection | nothing |
| `storage/db.ts` | Dexie schema: local groups, synced-group cache, outbox, game in progress, token | Dexie |
| `api/client.ts` | `fetch` wrapper: token header, JSON errors, 401 handling | — |
| `sync/outbox.ts` | Upload queued games; triggers on app open, foreground, `online` event, after saving a game | client, db |
| `sync/refresh.ts` | Fetch groups with ETag, update cache | client, db |
| `screens/*` | Inloggen, Groepen, Spelers kiezen, Spel, Resultaten, Klassement, Instellingen; admin: Gebruikers, Groepen & leden, Verzoeken, Prullenbak | the above |

### Backend units (`api/`)

- `index.php` — single entry point, router.
- `lib/db.php` (PDO), `lib/auth.php` (tokens, password hashing, login rate limiting), `lib/response.php` (JSON responses/errors).
- Handlers: `auth.php`, `groups.php`, `players.php`, `games.php`, `sync_requests.php`, `admin.php`.
- `config.php` — DB credentials, created once on the server by the owner, never committed (`config.example.php` is). Blocked from web access via `.htaccess`, or placed outside the web root if the package allows.
- `migrations/NNN_*.sql` — numbered schema migrations, run manually in phpMyAdmin.
- `install.php` — creates the first admin account; refuses to run once any user exists.

### Main endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/login`, `POST /api/logout` | Log in (returns token), revoke own token |
| `GET /api/groups` | My groups with players and games (ETag / 304 support) |
| `POST /api/games` | Upload a game; same UUID again is a no-op |
| `DELETE /api/games/{id}` | Soft delete (own game, or any for admin) |
| `POST /api/players` | Add a player to a group |
| `PATCH /api/groups/{id}` | Change group settings (max penalty points) |
| `POST /api/sync-requests`, `GET /api/sync-requests/mine` | Create request (PWA and Android), check status |
| `/api/admin/users` | Create, disable, reset password, revoke tokens |
| `/api/admin/groups` | Members add/remove, merge groups |
| `/api/admin/players/merge` | Merge players in a group |
| `/api/admin/sync-requests` | List, approve as new, approve linked (with player mapping), reject |
| `/api/admin/games` | Bin: list deleted, restore; delete all / delete short games |
| `/api/admin/export` | Export everything as JSON |

All errors are JSON: `{ "error": "code", "message": "Dutch text" }`. Details go to the PHP error log.

## 7. Data model (server)

- **users**: id, username (unique), password_hash, is_admin, created_at, disabled_at
- **auth_tokens**: id, user_id, token_hash, device_name, created_at, last_used_at, revoked_at
- **groups**: id, name, created_by, max_penalty_points, created_at
- **group_members**: group_id, user_id, added_by, added_at
- **players**: id, group_id, name, merged_into_player_id (nullable), created_at — unique (group_id, name) with a case-insensitive collation
- **games**: id (UUID from the client), group_id, recorded_by, started_at (device time), received_at (server time), duration_ms, max_penalty_points, ended_early, winner_player_id (nullable), deleted_at, deleted_by
- **game_players**: game_id, player_id, seat, final_score, boer_count
- **sync_requests**: id, requested_by, source (`pwa` | `android`), group_name, payload (JSON: players + games), status (`pending` | `approved` | `rejected`), resolved_group_id, resolved_by, resolved_at, reject_reason, created_at

Text columns use `utf8mb4` with a case-insensitive collation. Login attempts are tracked for rate limiting (table or columns, decided in the plan).

### Local model (PWA, IndexedDB)

- Local-only groups: own players and games.
- Synced groups: cached copy of server data (so the leaderboard works offline).
- Outbox: finished games waiting for upload, each with status (`pending` | `failed` + reason).
- Game in progress.
- Auth token, device settings.

## 8. Data flows

1. **Login** stores the token. A 401 anywhere returns to the login screen; local data and the outbox are kept.
2. **App start** renders from IndexedDB immediately, then refreshes `GET /api/groups` in the background (ETag → 304 when unchanged). Full history per refresh is acceptable at this scale.
3. **Finishing a game in a synced group**: game is added to the local cache and to the outbox; outbox posts `POST /api/games`.
   - Success or duplicate → removed from outbox.
   - Network error / 5xx → kept, retried on next trigger.
   - 403 / 404 / validation error → marked "Kan niet uploaden" with reason and an export option; not retried automatically.
   The UI shows how many games are waiting.
4. **Players in uploads are referenced by name.** The server resolves each name case-insensitively within the group, follows `merged_into_player_id`, and creates the player if missing. This makes offline additions by different members converge.
5. **PWA sync request**: sends group name, players and all games. On approval the client receives the server group ID, uploads all local games (already-imported UUIDs are no-ops, so games played while waiting are included), and converts the local group into a synced group. On rejection the group stays local and the reason is shown. Request status is checked on app open.
6. **Android upload** (Settings → "Uploaden naar server"): login dialog, then `POST /api/sync-requests` with source `android`. Android games get a **deterministic UUID** derived from profile, timestamp, players and scores, so repeated uploads never duplicate games. The Android timestamp (`dd-MM-yy HH:mm:ss`) is converted to ISO 8601 on the device. After success the profile is marked "geüpload".
7. **Admin approval**: per player name in the request the admin sees an automatic exact match, a similar-name suggestion, or "nieuw", and can override each. Approval runs in one database transaction.
8. **Conflicts**: games are immutable after saving (only soft delete), so the only last-write-wins data is group settings.
9. **App updates**: the service worker shows "Nieuwe versie beschikbaar – vernieuwen"; it never reloads during a game.

## 9. Android changes

Minimal, one Play Store release:

- Settings: "Uploaden naar server" button per profile, with a login dialog (server URL is built in).
- Uses `HttpURLConnection` and `org.json`; no new dependencies.
- Builds the sync request payload from the profile's Room database (deterministic UUIDs, ISO dates, per-player scores and boer counts).
- Marks the profile as uploaded in SharedPreferences.

## 10. Testing

- **Vitest unit tests**: game engine (behaviour identical to the Kotlin logic, including "Niemand", end early), statistics (incl. time stats and the ended-early rule, player list ordering), name matching, outbox against a fake API (success, duplicate, offline, refused).
- **PHPUnit integration tests** against MySQL 8.4 in Docker: authorisation (member / admin / outsider), idempotent game upload, name resolution incl. merged players, soft delete + restore, approve as new / linked / reject, merge players and groups, install script lock-out.
- **Playwright end-to-end** in WebKit with iPhone emulation: login, play a game, leaderboard, offline game uploaded later.
- **Android unit tests**: deterministic UUID, date conversion, payload builder.
- **Manual iPhone checklist**: add to home screen, offline game, close mid-game and resume, update while a game is in progress.

## 11. Deployment

- `npm run build` (plus a copy step) produces an `upload/` folder containing the PWA files and `api/`.
- The owner uploads `upload/` manually (FileZilla, WinSCP or Plesk file manager). There is no automated deployment.
- `DEPLOY.md` documents: what goes where, creating `config.php` once on the server (never overwritten by uploads, as it is not in `upload/`), which migration SQL to run in phpMyAdmin per release, running `install.php` once, enabling Let's Encrypt.
- Optional staging subdomain with its own database.
- Backups: Plesk database backups plus the admin JSON export.

## 12. Environment

- None. Confirmed: PHP 8.4.27, MySQL 8.4.13, domain `toepen.t-wezeman.nl`.
