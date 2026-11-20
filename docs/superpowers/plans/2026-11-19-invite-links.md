# Invite links and own passwords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin can create accounts without a password and share a one-time invite link; players set their own password via that link, admins can hand out reset links, and players can change their own password.

**Architecture:** A new `password_links` table (sha256 of a random code, purpose, 48 h expiry, used_at) with a small `PasswordLinks` PHP class; admin endpoints create links, two public endpoints look up and redeem them, and `POST /me/password` changes the own password. The PWA adds a public `#/welkom/:code` route, a share dialog in the admin users screen and a change-password block in Instellingen.

**Tech Stack:** PHP 8.4 + PDO/MySQL 8.4 + PHPUnit 11 (existing `api/`), Vite + Preact + TS + Vitest (existing `pwa/`).

**Spec:** `docs/superpowers/specs/2026-11-19-invite-links-design.md`

## Global Constraints

- Links are valid for **48 hours** after creation and work **once**; a new link for a user invalidates that user's older unused links.
- Only the sha256 hash of a link code is stored; the code is 32 random bytes (hex, 64 chars) and is returned only at creation.
- Link URL: `https://toepen.t-wezeman.nl/#/welkom/<code>` — built client-side as `${location.origin}/#/welkom/${code}`.
- Passwords: minimum 8 characters (`mb_strlen`), same rule as today.
- A reset link revokes all existing login tokens of the user when used; an invite link does not; own password change does not.
- Wrong current password on `POST /me/password` counts as a failed login for that username (existing 5 per 15 min limit, `Auth::isRateLimited` / `Auth::recordFailure`).
- All UI text Dutch, exact strings from the spec §2.
- Time in SQL via `UTC_TIMESTAMP()` (the DB session runs in UTC).
- No new Playwright e2e tests or browser checks (owner tests live). PHPUnit and Vitest as listed.
- Keep `npm test`, `npm run build` (in `pwa/`) and the PHPUnit suite green; the existing e2e seed reads all migrations, so the new migration must apply cleanly after `001_init.sql`.

## Review Focus

1. **Login with a user that has no password yet** (`password_hash` NULL): `password_verify` with null is a TypeError under strict types; must answer 401 `invalid_credentials`, not 500. Test: `test_login_refused_while_password_not_set` (Task 2).
2. **Redeeming the same link twice in quick succession** (double tap): the second must fail with `link_invalid`, never set the password twice. Test: `test_link_cannot_be_used_twice` (Task 2) — the redeem marks `used_at` with `WHERE used_at IS NULL` and checks the affected row count.
3. **Link for a user who was disabled after the link was made:** lookup and redeem refuse. Test: `test_disabled_user_link_rejected` (Task 2).
4. **Opening a welcome link while logged in as someone else:** the device must log out first so the new token isn't mixed with the old user's state. Covered by the Welcome screen's behaviour in Task 3 (calls `clearAuth()` before storing the new token); no automated UI test (owner tests live).
5. **Creating a user with an empty string as password** (form left blank): must be treated as "no password" and return a link, not a 422. Test: `test_create_user_with_empty_password_returns_link` (Task 1).

---

## File structure

```
api/migrations/002_password_links.sql       new table + users.password_hash NULL
api/src/PasswordLinks.php                   create(), find(), redeem() — link rules in one place
api/src/Handlers/AdminHandlers.php          createUser (optional password, link), passwordLink, listUsers invite_pending
api/src/Handlers/AuthHandlers.php           login null-hash guard, linkInfo, redeemLink, changePassword
api/src/App.php                             4 new routes
api/tests/PasswordLinkTest.php              all API tests for this feature
pwa/src/api/endpoints.ts                    new endpoint functions
pwa/src/router.ts                           'welkom' route, public
pwa/src/screens/Welcome.tsx                 new public screen
pwa/src/components/ShareLinkDialog.tsx      Delen / Kopiëren dialog
pwa/src/screens/admin/Users.tsx             optional password, link dialog, "Nieuwe link", "Uitnodiging open"
pwa/src/screens/Settings.tsx                "Wachtwoord wijzigen"
DEPLOY.md                                   run 002 migration on update
```

---

### Task 1: Migration, PasswordLinks and admin endpoints

**Files:**
- Create: `api/migrations/002_password_links.sql`, `api/src/PasswordLinks.php`, `api/tests/PasswordLinkTest.php`
- Modify: `api/src/Handlers/AdminHandlers.php` (`createUser`, `userShape`/`listUsers`, new `passwordLink`), `api/src/App.php`, `api/src/bootstrap.php` (require the new class if classes are required there)

**Interfaces:**
- Produces:

```php
final class PasswordLinks {
    public const TTL_HOURS = 48;
    /** Invalidates the user's unused links, creates a new one. Returns ['code'=>hex64, 'purpose'=>..., 'expires_at'=>ISO8601 with offset]. */
    public static function create(PDO $pdo, int $userId, string $purpose): array;   // purpose 'invite'|'reset'
    /** Valid link (unused, not expired, user not disabled) joined with the user, or null. Returns ['link_id','user_id','username','purpose','expires_at']. */
    public static function find(PDO $pdo, string $code): ?array;
    /** Atomically marks used (UPDATE … WHERE id=? AND used_at IS NULL), returns false if already used. */
    public static function markUsed(PDO $pdo, int $linkId): bool;
}
```

- `POST /admin/users` body `{username, password?, is_admin}`: `password` missing, null or `''` → user created with `password_hash` NULL and response 201 `{user, link:{code, purpose:'invite', expires_at}}`. Non-empty password < 8 → 422 as today.
- `POST /admin/users/{id}/password-link` → 201 `{link:{code, purpose, expires_at}}`; purpose `invite` when `password_hash` IS NULL else `reset`; 404 unknown user.
- `GET /admin/users` rows gain `invite_pending: bool` (= `password_hash` IS NULL).

Migration: `ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;` and `CREATE TABLE password_links (id INT UNSIGNED AUTO_INCREMENT PK, user_id INT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL, purpose ENUM('invite','reset') NOT NULL, expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_password_links_hash (token_hash), KEY idx_password_links_user (user_id), CONSTRAINT fk_password_links_user FOREIGN KEY (user_id) REFERENCES users (id))` with the same ENGINE/charset/collation as 001. Check `api/src/Handlers/AdminHandlers.php` user deletion/merge code paths and the export: `export` must not include `password_links.token_hash` (it already omits hashes — keep it that way).

- [ ] **Step 1: Write failing tests** in `api/tests/PasswordLinkTest.php` (use `TestCase::makeUser`, `call`):

```php
test_create_user_without_password_returns_invite_link     // 201, link.code is 64 hex chars, purpose 'invite', expires_at ~48h ahead (±2 min), users.password_hash IS NULL
test_create_user_with_empty_password_returns_link          // password '' behaves like missing
test_create_user_with_password_has_no_link                 // response has no 'link' key; login works
test_password_link_for_user_without_password_is_invite
test_password_link_for_user_with_password_is_reset
test_new_link_invalidates_older_unused_link                // PasswordLinks::find(old code) === null after second create
test_only_hash_is_stored                                   // password_links.token_hash = hash('sha256', code), code not in table
test_list_users_shows_invite_pending
test_password_link_requires_admin                          // member → 403 admin_only
test_password_link_unknown_user_404
```

- [ ] **Step 2:** Run `docker compose exec -T php sh -c "cd api && vendor/bin/phpunit --filter PasswordLinkTest"` (Docker bin on PATH, see repo notes). Expected: FAIL (route/class missing).
- [ ] **Step 3:** Implement. Code: `bin2hex(random_bytes(32))`. Expiry: `UTC_TIMESTAMP() + INTERVAL 48 HOUR`, formatted on output like other timestamps in the API (ISO 8601 with offset). Invalidating older links = `UPDATE password_links SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL` before insert, in one transaction.
- [ ] **Step 4:** Run the filter again, then the full PHPUnit suite. Expected: all PASS (existing 123 + new).
- [ ] **Step 5:** Commit `feat(api): invite and reset links for admin-created users`.

---

### Task 2: Public link endpoints, own password change, login guard

**Files:**
- Modify: `api/src/Handlers/AuthHandlers.php`, `api/src/App.php`, `api/tests/PasswordLinkTest.php`

**Interfaces:**
- Consumes: `PasswordLinks::find`, `PasswordLinks::markUsed`, `Auth::issueToken`, `Auth::isRateLimited`, `Auth::recordFailure`.
- Produces (routes, auth `none` unless stated):
  - `GET /password-links/{code}` → 200 `{username, purpose, expires_at}`; 404 `link_invalid` message "Deze link is verlopen of al gebruikt. Vraag de beheerder om een nieuwe."
  - `POST /password-links/{code}` body `{password, device_name}` → 200 `{token, user}`; 404 `link_invalid`; 422 password < 8 (checked **before** marking the link used). In one transaction: `markUsed` (false → 404), set `password_hash`, if purpose `reset` revoke all the user's tokens (`UPDATE auth_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL`), then issue a new token.
  - `POST /me/password` (auth `user`) body `{current_password, new_password}` → 204; 429 `too_many_attempts` if rate-limited; 403 `wrong_password` "Huidig wachtwoord klopt niet." (and `Auth::recordFailure`); 422 new < 8. Does not revoke tokens.
  - Login: a user with `password_hash` NULL gets 401 `invalid_credentials` (guard before `password_verify`).

- [ ] **Step 1: Write failing tests** (append to `PasswordLinkTest.php`):

```php
test_link_info_returns_username_and_purpose
test_redeem_invite_sets_password_and_logs_in               // 200 token works on GET /me; login with new password works
test_link_cannot_be_used_twice                             // second POST → 404 link_invalid
test_expired_link_rejected                                 // UPDATE expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE → GET and POST 404
test_disabled_user_link_rejected
test_short_password_keeps_link_usable                      // POST 'kort' → 422; then valid POST → 200
test_reset_revokes_existing_tokens                         // old token → 401 after redeem; new token works
test_invite_redeem_has_no_tokens_to_revoke_and_succeeds
test_login_refused_while_password_not_set                  // 401 invalid_credentials, not 500
test_change_own_password                                   // 204; old password fails login, new works; existing token still valid
test_change_own_password_wrong_current_is_403_and_counts   // 403 wrong_password; login_attempts row added
test_change_own_password_rate_limited                      // after 5 failures → 429
```

- [ ] **Step 2:** Run the filter. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the filter, then the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): redeem password links and change own password`.

---

### Task 3: PWA endpoints, welcome route and screen

**Files:**
- Create: `pwa/src/screens/Welcome.tsx`
- Modify: `pwa/src/api/endpoints.ts`, `pwa/src/router.ts`, `pwa/src/app.tsx` (route + public guard), `pwa/tests/unit/router.test.ts`, `pwa/tests/unit/client.test.ts` (or a new `endpoints.test.ts`)

**Interfaces:**
- Consumes: Task 1–2 routes; `repo.setToken/setUser/clearAuth`, `runSyncCycle`, `startTriggers`, `deviceName`.
- Produces:

```ts
// endpoints.ts
interface LinkInfo { username: string; purpose: 'invite' | 'reset'; expires_at: string }
interface PasswordLink { code: string; purpose: 'invite' | 'reset'; expires_at: string }
linkInfo(code: string): Promise<LinkInfo>;                                   // GET /password-links/{code}
redeemLink(code: string, password: string): Promise<{ token: string; user: User }>;   // device_name = deviceName(navigator.userAgent)
changePassword(currentPassword: string, newPassword: string): Promise<void>;  // POST /me/password
admin.createUser(username, password: string | null, isAdmin): Promise<{ user: AdminUser; link?: PasswordLink }>;  // send password only when non-empty
admin.passwordLink(userId: number): Promise<PasswordLink>;
// AdminUser gains invite_pending: boolean
// router.ts: route 'welkom' for '#/welkom/:code'; export const PUBLIC_ROUTES = ['login', 'welkom']
```

The 401 hook must not fire for the two public link calls (same exemption as `POST /login`): a 404 from a dead link must never log anyone out.

Welcome screen (`#/welkom/:code`): on mount `linkInfo(code)`; loading state; error 404 → "Deze link is verlopen of al gebruikt. Vraag de beheerder om een nieuwe." with a link "Naar inloggen"; NetworkError → "Geen verbinding met de server". Valid: title "Welkom <username>" (invite) or "Nieuw wachtwoord voor <username>" (reset); fields "Wachtwoord" and "Herhaal wachtwoord" (min 8, must match: "Wachtwoorden komen niet overeen", "Minimaal 8 tekens"); button "Wachtwoord opslaan". Submit: `clearAuth()` first, then `redeemLink`, `setToken`, `setUser`, `startTriggers()`, `void runSyncCycle()`, `navigate('#/')`.

- [ ] **Step 1: Write failing tests:** router `parseRoute('#/welkom/abc123')` → `{name:'welkom', params:{code:'abc123'}}`, `PUBLIC_ROUTES` contains `'welkom'`; endpoints: `redeemLink` POSTs `/api/password-links/abc` with `{password, device_name}`; a 404 from `linkInfo` does not call the unauthorized handler; `admin.createUser('kees', '', false)` sends no `password` field.
- [ ] **Step 2:** `npm test` in `pwa/`. Expected: FAIL.
- [ ] **Step 3:** Implement endpoints, route, app guard (no token + public route → render it; no token + other route → login), Welcome screen.
- [ ] **Step 4:** `npm test` and `npm run build`. Expected: PASS / build OK.
- [ ] **Step 5:** Commit `feat(pwa): welcome page for invite and reset links`.

---

### Task 4: Admin users screen, change own password, deploy note

**Files:**
- Create: `pwa/src/components/ShareLinkDialog.tsx`
- Modify: `pwa/src/screens/admin/Users.tsx`, `pwa/src/screens/Settings.tsx`, `DEPLOY.md`

**Interfaces:**
- Consumes: `admin.createUser`, `admin.passwordLink`, `changePassword`, `AdminUser.invite_pending`, existing `Dialog`, `Toast`, clipboard/share approach from `GameSummary.tsx`.
- Produces: `ShareLinkDialog({ username, link, onClose })` — shows the URL `${location.origin}/#/welkom/${link.code}`, the expiry ("Geldig tot dd-MM-yyyy HH:mm"), buttons "Delen" (`navigator.share({ text })`, AbortError ignored, fallback to copy) and "Kopiëren" (clipboard + toast "Gekopieerd"). Share text exactly:

```
invite:
Je hebt een Toepen-account: <username>
Kies je wachtwoord via deze link (48 uur geldig):
<link>

reset:
Nieuw wachtwoord voor je Toepen-account: <username>
Kies een nieuw wachtwoord via deze link (48 uur geldig):
<link>
```

Export the pure `shareLinkText(username, purpose, url): string` and test it (Vitest, both purposes).

Users screen: create form password field optional with hint "Leeg laten om een uitnodigingslink te maken"; when the response has `link` → open `ShareLinkDialog`. Each user row: button "Nieuwe link" → `admin.passwordLink(id)` → `ShareLinkDialog`. Rows with `invite_pending` show "Uitnodiging open" instead of the last-used text. The existing password-reset dialog stays.

Settings: block "Wachtwoord wijzigen" with fields "Huidig wachtwoord", "Nieuw wachtwoord", "Herhaal nieuw wachtwoord" and button "Wijzigen". Client checks: min 8 ("Minimaal 8 tekens"), match ("Wachtwoorden komen niet overeen"). 403 → "Huidig wachtwoord klopt niet"; 429 → "Te vaak geprobeerd. Probeer het over 15 minuten opnieuw."; NetworkError → "Geen verbinding met de server"; success → toast "Wachtwoord gewijzigd", fields cleared.

DEPLOY.md, update steps: "Voer `api/migrations/002_password_links.sql` eenmalig uit in phpMyAdmin (alleen bij de eerste update na deze versie)."

- [ ] **Step 1: Write failing test** `shareLinkText` for invite and reset (exact strings above).
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement dialog, Users and Settings changes, DEPLOY.md.
- [ ] **Step 4:** `npm test`, `npm run build`, and `node scripts/make-upload.mjs` (check `upload/api/migrations/002_password_links.sql` exists and `upload/api/config.php` does not). Expected: all OK.
- [ ] **Step 5:** Commit `feat(pwa): share invite links, new link per user, change own password`.
