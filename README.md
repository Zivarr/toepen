# ToepScoreTracker

An Android app for tracking scores in **Toepen**, a Dutch bluffing card game. Players accumulate penalty points each round; the last player standing wins.

## Features

- **Two independent profiles** — Work and KVW, each with their own game history
- **Live score tracking** — tally-style score display, klop counter, fold and penalty buttons per player
- **Boer (Jack) support** — apply a Boer penalty to reduce a player's score
- **Undo** — step back through the last action at any point during a game
- **Player elimination** — players are crossed out when they reach the penalty limit
- **Configurable penalty limit** — set per profile in Settings
- **Results & leaderboard** — full game history and win counts per profile
- **Backup & restore** — export the SQLite database to Downloads and restore it later
- **Confetti cannons** — fire on game win 🎉
- **Share results** — send the final standings via any share target

## Requirements

- Android 7.0+ (API 24)
- Android Studio (for building)

## Building

All commands run from the `ToepScoreTracker/` directory:

```bash
./gradlew assembleDebug          # Build debug APK
./gradlew assembleRelease        # Build release APK
./gradlew test                   # Run unit tests
./gradlew connectedAndroidTest   # Run instrumented tests (requires device/emulator)
./gradlew clean                  # Clean build outputs
```

The built APK ends up at `app/build/outputs/apk/debug/app-debug.apk`.

## Shared debug keystore

A shared debug keystore lives at `.android/debug.keystore` in this repo. Copy it to your machine so all dev machines sign debug builds with the same key — otherwise Android will refuse to install a build from one machine over a build from another.

**Windows:**
```
copy .android\debug.keystore %USERPROFILE%\.android\debug.keystore
```

**Mac / Linux:**
```bash
cp .android/debug.keystore ~/.android/debug.keystore
```

Restart Android Studio after copying.

## Architecture

MVVM + Repository pattern with Jetpack Compose theming and Room for persistence.

```
Activities (UI)
    └── ViewModels (StateFlow / SharedFlow)
            └── GameRepository
                    └── Room DAOs → AppDatabase
```

- **Activities** observe `StateFlow<UiState>` via `lifecycleScope.repeatOnLifecycle()`
- **GameViewModel** manages game state with a history stack for undo and emits one-time `GameEvent` via `SharedFlow`
- **AppDatabase** keeps two singleton instances — one per profile — each backed by its own `.db` file

### Navigation

```
MainActivity → PlayerSetupActivity → GameActivity
                                          ↓
                                 ResultsActivity / LeaderboardActivity
                                          ↓
                                   SettingsActivity
```

## Tech stack

| Library | Version |
|---|---|
| Kotlin | 2.1.0 |
| Room (alpha) | 2.7.0-alpha11 |
| Jetpack Compose BOM | 2024.04.01 |
| Material 3 | — |
| Kotlin Coroutines | 1.7.3 |
| Konfetti (confetti) | 2.0.4 |
| Min SDK | 24 |
| Target SDK | 35 |
