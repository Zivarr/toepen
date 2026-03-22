# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ToepScoreTracker** — An Android app for tracking scores in the Dutch card game Toepen. Players accumulate penalty points; the last player standing wins. The app supports two independent profiles ("Work" and "KVW"), each with its own SQLite database.

The Android project lives under `ToepScoreTracker/`.

## Build & Test Commands

All commands run from `ToepScoreTracker/`:

```bash
./gradlew assembleDebug          # Build debug APK
./gradlew assembleRelease        # Build release APK
./gradlew test                   # Run unit tests
./gradlew connectedAndroidTest   # Run instrumented tests (requires device/emulator)
./gradlew testDebugUnitTest      # Run a specific variant's unit tests
./gradlew clean                  # Clean build outputs
```

To run a single test class:
```bash
./gradlew testDebugUnitTest --tests "com.example.toepscoretracker.GameViewModelTest"
```

## Architecture

**MVVM + Repository pattern** with Jetpack Compose for theming and Room for persistence.

### Layers

```
Activities (UI) → ViewModels (StateFlow/SharedFlow) → GameRepository → Room DAOs → AppDatabase
```

- **Activities** observe `StateFlow<UiState>` via `lifecycleScope.repeatOnLifecycle()`.
- **GameViewModel** is the most complex: it manages game state with a history stack for undo, emits one-time `GameEvent` via `SharedFlow`, and coordinates auto-save to the database when the game ends.
- **GameRepository** is the single data access point, injected into ViewModels via Factory classes (`GameViewModelFactory`, `RepositoryViewModelFactory`, etc.).
- **AppDatabase** maintains two singleton instances (`WORK_INSTANCE`, `KVW_INSTANCE`) — the profile string selects which database is used.

### Navigation flow

```
MainActivity → PlayerSetupActivity → GameActivity → (back to MainActivity)
                                                  ↘ ResultsActivity / LeaderboardActivity
```

`MainActivity` handles profile selection and player count. `PlayerSetupActivity` collects player names and max penalty points. `GameActivity` runs the live game. `ResultsActivity` and `LeaderboardActivity` are read-only views into the database.

### Key data models

**`Game` entity** (Room): `playerNames: List<String>` (persisted via `Converters.kt` as comma-separated string), `winnerName`, `maxPenaltyPoints`, `duration` (ms), `timestamp`.

**`GameUiState`**: `scores: Map<String, Int>`, `currentRoundPoints`, `isGameOver`, `winner`, `durationAtEnd`.

**`GameEvent`** (sealed class): `GameSaved`, `UndoEmpty`, `PlayerEliminated` — one-time UI notifications emitted via `SharedFlow`.

### Multi-profile databases

`AppDatabase.getDatabase(context, profile)` returns the instance for the given profile. Each profile has its own `.db` file. SharedPreferences (`ToepenSettings`, `ToepenSettings_<profile>`) persist the last-used profile and max penalty points per profile.

### Room migration

`MIGRATION_2_3` normalizes player name separators from `", "` to `","` to match the TypeConverter format.

## Dependencies (version catalog: `gradle/libs.versions.toml`)

- **Room** (alpha) with KSP for annotation processing
- **Kotlin Coroutines** 1.7.3
- **Jetpack Compose** BOM 2024.04.01 + Material 3
- **ViewModel + LiveData**
- Min SDK 24 / Target SDK 35 / Java 11 / Kotlin 2.1.0
