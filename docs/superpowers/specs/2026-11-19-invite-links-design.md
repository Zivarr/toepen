# Invite links and own passwords — design

Date: 2026-11-19. Builds on the Toepen PWA + API (`docs/superpowers/specs/2026-11-18-toepen-pwa-design.md`), branch `pwa-design`, live at https://toepen.t-wezeman.nl.

## 1. Goal

When the admin creates an account, the new player should hear about it and choose their own password, without the admin inventing and passing on a password. Players can also change their own password, and the admin can hand out a reset link when someone forgets theirs.

What the owner decided:
- Notification is an **invite link the admin shares** (WhatsApp etc.). No email: no email addresses stored, no mail setup.
- The **admin picks the username** (needed anyway to add the player to groups).
- **Reset via link** is in scope: the admin creates a fresh link for an existing user.
- **Change own password** in Instellingen is in scope.
- Links are valid for **48 hours** and work **once**.
- The owner tests the result live; no new end-to-end tests or browser checks are needed. Automated API tests for the link rules stay (see §7).

## 2. User flows

**Invite.** Beheer → Gebruikers → "Nieuwe gebruiker": username, admin yes/no, password **optional** ("Leeg laten om een uitnodigingslink te maken"). Without a password the user is created without one and a dialog shows the link with **Delen** (`navigator.share`) and **Kopiëren** (clipboard + toast "Gekopieerd"). Share text:

```
Je hebt een Toepen-account: <username>
Kies je wachtwoord via deze link (48 uur geldig):
<link>
```

With a password typed in, behaviour is as today (no link).

**Welcome page.** Link format `https://toepen.t-wezeman.nl/#/welkom/<code>`. The page needs no login. It shows "Welkom <username>" (invite) or "Nieuw wachtwoord voor <username>" (reset), two password fields (min 8 characters, must match), button "Wachtwoord opslaan". On success the player is logged in on that device and lands on `#/`. Invalid, expired or used link: "Deze link is verlopen of al gebruikt. Vraag de beheerder om een nieuwe." If someone is already logged in on that device, opening a link logs them out first (the link is for its own account).

**Reset.** Each user row in Beheer → Gebruikers gets "Nieuwe link" (replaces the current "Wachtwoord resetten" dialog as the main path; typing a password for someone stays available behind the existing reset dialog). Same share dialog, reset wording: "Kies een nieuw wachtwoord via deze link (48 uur geldig):".

**Change own password.** Instellingen → "Wachtwoord wijzigen": current password, new password, repeat. Wrong current password: "Huidig wachtwoord klopt niet". Success toast: "Wachtwoord gewijzigd". Other devices stay logged in (consistent with the admin password change; the admin can still use "Uitloggen op alle apparaten").

**Users list.** A user who has not used their invite yet shows "Uitnodiging open" instead of "Laatst gebruikt".

## 3. Rules

- A link works once and expires 48 hours after it was made.
- Creating a new link for a user invalidates that user's older unused links.
- A disabled user's link does not work.
- Setting a password through a **reset** link revokes all existing login tokens of that user (the forgotten-password case may involve a lost device). An invite link has no tokens to revoke.
- A user without a password cannot log in (login answers the normal "wrong username or password").
- Brute-forcing link codes is not feasible: 32 random bytes, so no extra rate limit on the link endpoints. Change-own-password counts wrong current passwords like failed logins (same 5 per 15 minutes limit, keyed on the username).

## 4. Data model (migration `002_password_links.sql`)

- `users.password_hash` becomes `VARCHAR(255) NULL` (NULL = no password set yet).
- New table `password_links`: `id`, `user_id` (FK users), `token_hash CHAR(64)` unique (sha256 of the code, like `auth_tokens`), `purpose ENUM('invite','reset')`, `expires_at DATETIME`, `used_at DATETIME NULL`, `created_at`. Index on `user_id`.
- Use plain `TINYINT` (no display width) in new DDL to avoid the MySQL 8 deprecation warning.

## 5. API changes (additions to the Plan 1 contract)

| Method + path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /admin/users` | admin | `{username, password?, is_admin}` | 201 `{user, link?: {code, expires_at}}`; `link` present when `password` omitted | 409 `username_taken`, 422 |
| `POST /admin/users/{id}/password-link` | admin | – | 201 `{link: {code, purpose, expires_at}}` (purpose `invite` if the user has no password, else `reset`) | 404 |
| `POST /password-links/lookup` | none | `{code}` | 200 `{username, purpose, expires_at}` | 404 `link_invalid` (unknown, used, expired or user disabled) |
| `POST /password-links/redeem` | none | `{code, password, device_name}` | 200 `{token, user}` (logged in) | 404 `link_invalid`, 422 (password < 8) |
| `POST /me/password` | user | `{current_password, new_password}` | 204 | 403 `wrong_password`, 429 `too_many_attempts`, 422 |
| `GET /admin/users` | admin | – | rows gain `invite_pending: bool` | – |

The link code is only returned at creation; the server stores just its hash. The code is part of the URL fragment (`#/welkom/<code>`) and the PWA sends it to the API only in request bodies, so it never appears in the web server's access log. Setting a password any other way (admin types one, own password change) spends the user's open links, and redeeming a link revokes the user's sessions whenever they already had a password.

## 6. PWA changes

- Router: new public route `welkom` (`#/welkom/:code`), excluded from the login guard.
- `api/endpoints.ts`: the new calls above.
- `screens/Welcome.tsx` (new), `screens/admin/Users.tsx` (optional password, share dialog, "Nieuwe link", "Uitnodiging open"), `screens/Settings.tsx` ("Wachtwoord wijzigen").
- Shared share-dialog component for the link (Delen / Kopiëren), reusing the existing share/clipboard approach from the game summary.
- All text in Dutch.

## 7. Testing

- PHPUnit (API): create user without password returns a link; link lookup and use; expired link (48 h) rejected; used link rejected; new link invalidates the old one; disabled user's link rejected; reset revokes tokens, invite does not; login refused while no password is set; change own password with right and wrong current password; rate limit on wrong current password.
- Vitest: router recognises `#/welkom/:code` and treats it as public; endpoint functions send the right requests.
- No new Playwright e2e and no scripted browser checks: the owner tests live after deploying.

## 8. Deployment

Run `api/migrations/002_password_links.sql` in phpMyAdmin, then the usual `node scripts/make-upload.mjs` and upload (sw.js and index.html last). DEPLOY.md gets a line for this migration under the update steps.

## 9. Out of scope

Email, self-registration, player-chosen usernames, password strength rules beyond 8 characters, logging out other devices on own password change.
