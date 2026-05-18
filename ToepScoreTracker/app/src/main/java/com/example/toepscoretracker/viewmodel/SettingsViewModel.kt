package com.example.toepscoretracker.viewmodel

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class SettingsViewModel(
    private val repositoryProvider: (String) -> GameRepository
) : ViewModel() {

    fun deleteAll(profile: String) {
        viewModelScope.launch {
            repositoryProvider(profile).deleteAll()
        }
    }

    fun wipeAll() {
        viewModelScope.launch {
            repositoryProvider("Work").deleteAll()
            repositoryProvider("KVW").deleteAll()
        }
    }

    fun deleteShortGames(profile: String) {
        viewModelScope.launch {
            repositoryProvider(profile).deleteShortGames(60_000L)
        }
    }

    suspend fun prepareBackupFile(context: Context, profile: String): File = withContext(Dispatchers.IO) {
        val db = AppDatabase.getDatabase(context, profile)
        db.openHelper.writableDatabase.execSQL("PRAGMA wal_checkpoint(TRUNCATE)")
        context.getDatabasePath(dbNameFor(profile))
    }

    suspend fun restoreFromFile(context: Context, profile: String, backupFile: File) = withContext(Dispatchers.IO) {
        val rawDb = SQLiteDatabase.openDatabase(backupFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        val games = mutableListOf<Game>()
        val cursor = rawDb.rawQuery(
            "SELECT playerNames, winnerName, maxPenaltyPoints, duration, timestamp, finalScores, boerCounts FROM games",
            null
        )
        while (cursor.moveToNext()) {
            val playerNamesStr = cursor.getString(0) ?: ""
            val winnerName = cursor.getString(1) ?: ""
            val maxPenaltyPoints = cursor.getInt(2)
            val duration = cursor.getLong(3)
            val timestamp = cursor.getString(4) ?: ""
            val finalScoresStr = cursor.getString(5) ?: ""
            val boerCountsStr = cursor.getString(6) ?: ""
            games.add(Game(
                playerNames = if (playerNamesStr.isBlank()) emptyList() else playerNamesStr.split("|"),
                winnerName = winnerName,
                maxPenaltyPoints = maxPenaltyPoints,
                duration = duration,
                timestamp = timestamp,
                finalScores = if (finalScoresStr.isBlank()) emptyList() else finalScoresStr.split("|").map { it.toInt() },
                boerCounts = if (boerCountsStr.isBlank()) emptyList() else boerCountsStr.split("|").map { it.toInt() }
            ))
        }
        cursor.close()
        rawDb.close()

        val repository = repositoryProvider(profile)
        for (game in games) {
            val key = game.playerNames.joinToString("|")
            if (repository.countByTimestampAndPlayers(game.timestamp, key) == 0) {
                repository.insertGame(game)
            }
        }
    }

    companion object {
        fun dbNameFor(profile: String) =
            if (profile == "KVW") "toepen_database_kvw" else "toepen_database_work"
    }
}
