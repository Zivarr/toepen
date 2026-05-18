package com.example.toepscoretracker.viewmodel

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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

    suspend fun backupToDownloads(context: Context, profile: String): String = withContext(Dispatchers.IO) {
        Log.d(TAG, "backupToDownloads: start, profile=$profile, SDK=${Build.VERSION.SDK_INT}")

        val db = AppDatabase.getDatabase(context, profile)
        Log.d(TAG, "backupToDownloads: database instance obtained")

        db.openHelper.writableDatabase.execSQL("PRAGMA wal_checkpoint(TRUNCATE)")
        Log.d(TAG, "backupToDownloads: WAL checkpoint done")

        val dbFile = context.getDatabasePath(dbNameFor(profile))
        Log.d(TAG, "backupToDownloads: dbFile=${dbFile.absolutePath}, exists=${dbFile.exists()}, size=${dbFile.length()}")

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val fileName = "toepen_${profile.lowercase()}_$today.db"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Log.d(TAG, "backupToDownloads: using MediaStore (Android 10+)")
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Kon geen Downloads-item aanmaken")
            Log.d(TAG, "backupToDownloads: MediaStore URI=$uri")
            resolver.openOutputStream(uri)?.use { out ->
                dbFile.inputStream().use { it.copyTo(out) }
            }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            Log.d(TAG, "backupToDownloads: MediaStore copy done")
        } else {
            Log.d(TAG, "backupToDownloads: using legacy Downloads dir")
            @Suppress("DEPRECATION")
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            downloadsDir.mkdirs()
            dbFile.copyTo(File(downloadsDir, fileName), overwrite = true)
            Log.d(TAG, "backupToDownloads: legacy copy done to ${downloadsDir.absolutePath}/$fileName")
        }

        Log.d(TAG, "backupToDownloads: success, fileName=$fileName")
        fileName
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
        private const val TAG = "SettingsViewModel"
        fun dbNameFor(profile: String) =
            if (profile == "KVW") "toepen_database_kvw" else "toepen_database_work"
    }
}
