# Toepen Android upload (Plan 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One last Android release with a Settings button "Uploaden naar server" that sends a profile's history to the server as a sync request.

**Architecture:** A pure Kotlin payload builder turns Room `Game` rows into the Plan 1 sync-request JSON (pre-validated so the server never rejects the whole request). A `ServerUploader` orchestrates login → create request → logout through an `UploadApi` interface; `HttpUploadApi` implements it with `HttpURLConnection`. The Settings screen adds the button and a login dialog.

**Tech Stack:** Kotlin 2.1, existing Room/coroutines, `HttpURLConnection` + `org.json` (platform), JUnit 4; `org.json:json` as **test-only** dependency (Android's stub jar does not implement it in JVM tests).

**Spec:** `docs/superpowers/specs/2026-11-18-toepen-pwa-design.md` (§8.6, §9)
**Depends on:** Plan 1 API contract (`POST /login`, `POST /sync-requests`, `POST /logout`, GameUpload validation rules).

## Global Constraints

- No new runtime dependencies.
- Server URL: release `https://toepen.t-wezeman.nl/api`; debug `http://10.0.2.2:8080/api` (Docker on the dev PC, emulator). Cleartext allowed **only** in the debug build for `10.0.2.2`.
- The token is not stored: login, upload, logout in one go.
- Android `timestamp` format is `dd-MM-yy HH:mm:ss` in device local time.
- Winner mapping: `winnerName == ""` → `ended_early: true, winner: null`; `"Niemand"` → `ended_early: false, winner: null`; otherwise the name.
- Version bump: `versionCode = 3`, `versionName = "1.2"`.
- Dutch UI strings in `res/values/strings.xml`.

## Review Focus

1. **One bad old game making the server reject the whole request** (422 on the request): every game must be checked against the Plan 1 validation rules on the device and skipped with a count, never sent. Test: `invalid games are skipped and counted` (Task 1).
2. **Old games without `finalScores`/`boerCounts`** (rows from before those columns existed) must still upload: missing scores and boer counts become 0, scores above max are capped. Test: `missing scores and boer counts become zero` (Task 1).
3. **Uploading the same profile twice** must give the same game IDs so the server deduplicates. Test: `uuid is stable for the same game and differs per profile` (Task 1).
4. **Winner name case differs from the player list** (e.g. "ravi" vs "Ravi" from before the v5 migration): match case-insensitively and send the player-list spelling. Test: `winner matched case-insensitively` (Task 1).
5. **Logout must happen even when the upload fails**, so no stray tokens remain. Test: `logout is called when create request fails` (Task 2).

---

### Task 1: Sync payload builder

**Files:**
- Create: `ToepScoreTracker/app/src/main/java/com/example/toepscoretracker/upload/SyncPayload.kt`
- Test: `ToepScoreTracker/app/src/test/java/com/example/toepscoretracker/SyncPayloadTest.kt`
- Modify: `ToepScoreTracker/gradle/libs.versions.toml` (`orgjson = "20240303"`, library `org-json`), `ToepScoreTracker/app/build.gradle.kts` (`testImplementation(libs.org.json)`)

**Interfaces:**
- Produces:

```kotlin
data class PayloadResult(val json: JSONObject, val included: Int, val skipped: Int)
fun gameUuid(profile: String, game: Game): String
    // UUID.nameUUIDFromBytes("$profile|${game.timestamp}|${game.playerNames.joinToString("|")}|${game.finalScores.joinToString("|")}|${game.duration}".toByteArray(UTF_8)).toString()
fun toIsoTimestamp(timestamp: String, zone: TimeZone): String?    // null if unparseable; output e.g. "2026-11-18T21:04:05+01:00"
fun buildSyncPayload(profile: String, games: List<Game>, zone: TimeZone = TimeZone.getDefault()): PayloadResult
    // json = {"source":"android","group_name":profile,"games":[GameUpload…]}
```

A game is **skipped** when: timestamp unparseable; fewer than 2 or more than 8 players; a name blank or > 40 chars; duplicate names case-insensitively; `maxPenaltyPoints` outside 1–100; winner (after mapping) not in the player list case-insensitively. Scores: missing index → 0, capped to `maxPenaltyPoints`, negative → 0. Boer: missing index → 0.

- [ ] **Step 1: Write failing tests**:

```kotlin
@Test fun `iso timestamp uses local offset`()                 // "18-11-26 21:04:05", Europe/Amsterdam → "2026-11-18T21:04:05+01:00"
@Test fun `unparseable timestamp returns null`()              // "2026-11-18 21:04"
@Test fun `uuid is stable for the same game and differs per profile`()
@Test fun `empty winner becomes ended early`()
@Test fun `Niemand becomes no winner not ended early`()
@Test fun `winner matched case-insensitively`()               // winnerName "ravi", players ["Ravi","Kees"] → winner "Ravi"
@Test fun `missing scores and boer counts become zero`()      // finalScores = emptyList()
@Test fun `scores above max are capped`()
@Test fun `invalid games are skipped and counted`()           // 1 valid, 1 with 9 players, 1 bad timestamp → included 1, skipped 2
@Test fun `payload has source group name and seat order`()
```

- [ ] **Step 2:** Run `./gradlew testDebugUnitTest --tests "com.example.toepscoretracker.SyncPayloadTest"` from `ToepScoreTracker/`. Expected: FAIL (unresolved references).
- [ ] **Step 3:** Implement. Dates use `SimpleDateFormat` (minSdk 24 has no `java.time` without desugaring, and desugaring would be a new dependency): parse with `"dd-MM-yy HH:mm:ss"`, `isLenient = false`, `timeZone = zone`; format with `"yyyy-MM-dd'T'HH:mm:ssXXX"` in the same zone. The `zone` parameter is therefore `java.util.TimeZone` (default `TimeZone.getDefault()`), not `ZoneId`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(android): sync payload builder for server upload`.

---

### Task 2: Upload API client and orchestration

**Files:**
- Create: `ToepScoreTracker/app/src/main/java/com/example/toepscoretracker/upload/UploadApi.kt`, `.../upload/HttpUploadApi.kt`, `.../upload/ServerUploader.kt`
- Test: `ToepScoreTracker/app/src/test/java/com/example/toepscoretracker/ServerUploaderTest.kt`
- Modify: `app/src/main/AndroidManifest.xml` (`INTERNET` permission), `app/build.gradle.kts` (`buildFeatures { buildConfig = true }`, `buildConfigField("String", "API_BASE_URL", …)` per build type), create `app/src/debug/res/xml/network_security_config.xml` (cleartext for `10.0.2.2` only) and `app/src/debug/AndroidManifest.xml` referencing it

**Interfaces:**
- Consumes: `buildSyncPayload`.
- Produces:

```kotlin
class ApiException(val status: Int, val code: String, message: String) : Exception(message)
interface UploadApi {
    fun login(username: String, password: String, deviceName: String): String   // token; throws ApiException / IOException
    fun createSyncRequest(token: String, payload: JSONObject): Int              // request id
    fun logout(token: String)
}
class HttpUploadApi(private val baseUrl: String = BuildConfig.API_BASE_URL) : UploadApi
    // sends both "Authorization: Bearer" and "X-Auth-Token"; 15 s connect/read timeouts; parses {error,message}
sealed class UploadResult {
    data class Success(val requestId: Int, val included: Int, val skipped: Int) : UploadResult()
    object WrongCredentials : UploadResult()     // 401 on login
    object TooManyAttempts : UploadResult()      // 429
    object NoGames : UploadResult()              // included == 0; nothing sent, no login
    data class Failed(val message: String) : UploadResult()   // IOException or other ApiException
}
class ServerUploader(private val api: UploadApi) {
    fun upload(profile: String, games: List<Game>, username: String, password: String): UploadResult   // blocking; call on Dispatchers.IO
}
```

- [ ] **Step 1: Write failing tests** with a fake `UploadApi`:

```kotlin
@Test fun `success returns request id and counts and logs out`()
@Test fun `wrong credentials maps to WrongCredentials and sends nothing`()
@Test fun `429 maps to TooManyAttempts`()
@Test fun `no valid games returns NoGames without login`()
@Test fun `logout is called when create request fails`()
@Test fun `network error maps to Failed with Dutch message`()   // "Geen verbinding met de server"
```

- [ ] **Step 2:** Run `./gradlew testDebugUnitTest --tests "com.example.toepscoretracker.ServerUploaderTest"`. Expected: FAIL.
- [ ] **Step 3:** Implement `ServerUploader` and `HttpUploadApi`. **Step 4:** Run, PASS.
- [ ] **Step 5:** Commit `feat(android): server upload client`.

---

### Task 3: Settings button, login dialog and release bump

**Files:**
- Modify: `ToepScoreTracker/app/src/main/res/layout/activity_settings.xml` (new `btnUploadServer` + `tvUploadStatus` after `btnRestore`), `.../SettingsActivity.kt`, `.../viewmodel/SettingsViewModel.kt` (add `suspend fun uploadToServer(profile: String, username: String, password: String): UploadResult` using the profile's `GameRepository.getAllGames()` and `ServerUploader(HttpUploadApi())` on `Dispatchers.IO`), `res/values/strings.xml`, `app/build.gradle.kts` (version 3 / "1.2")
- Create: `res/layout/dialog_server_login.xml`

**Interfaces:**
- Consumes: `ServerUploader`, `UploadResult`.
- Strings: `upload_server` "Uploaden naar server", `upload_server_again` "Opnieuw uploaden (laatst: %s)", `upload_login_title` "Inloggen op toepen.t-wezeman.nl", `username` "Gebruikersnaam", `password` "Wachtwoord", `upload_busy` "Bezig met uploaden…", `upload_success` "Verzoek verstuurd: %1$d spellen. De beheerder moet het nog goedkeuren.", `upload_skipped` "%d spellen overgeslagen (onvolledige gegevens)", `upload_wrong_credentials` "Gebruikersnaam of wachtwoord klopt niet", `upload_too_many` "Te vaak geprobeerd. Probeer het over 15 minuten opnieuw.", `upload_no_games` "Er zijn geen spellen om te uploaden", `upload_failed` "Uploaden mislukt: %s".
- On `Success`: store `uploadedAt` (epoch ms) in `ToepenSettings_<profile>`; button text switches to `upload_server_again` with date `dd-MM-yyyy HH:mm`. Button disabled while busy.

- [ ] **Step 1:** Implement layout, dialog and wiring.
- [ ] **Step 2:** Run `./gradlew testDebugUnitTest` (full suite). Expected: PASS, including existing tests.
- [ ] **Step 3:** Manual check on an emulator with the Docker API running (Plan 1): wrong password shows the error; correct login with a profile of a few games shows "Verzoek verstuurd: N spellen…"; the request appears in the PWA admin "Verzoeken" (or table `sync_requests`); uploading again and approving both results in no duplicate games.
- [ ] **Step 4:** Run `./gradlew assembleRelease`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit `feat(android): upload profile to server from settings, version 1.2`.
