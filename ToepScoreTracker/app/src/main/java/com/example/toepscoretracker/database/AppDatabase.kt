package com.example.toepscoretracker.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Normalize separator: "Alice, Bob" -> "Alice,Bob"
        db.execSQL("UPDATE games SET playerNames = REPLACE(playerNames, ', ', ',')")
    }
}

val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Switch separator from "," to "|" to allow commas in player names
        db.execSQL("UPDATE games SET playerNames = REPLACE(playerNames, ',', '|')")
    }
}

val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE games ADD COLUMN finalScores TEXT NOT NULL DEFAULT ''")
        db.execSQL("ALTER TABLE games ADD COLUMN boerCounts TEXT NOT NULL DEFAULT ''")
    }
}

val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        val cursor = db.query("SELECT id, winnerName, playerNames FROM games")
        val updates = mutableListOf<Triple<Long, String, String>>()
        while (cursor.moveToNext()) {
            val id = cursor.getLong(0)
            val winnerName = cursor.getString(1) ?: ""
            val playerNames = cursor.getString(2) ?: ""
            val fixedWinner = winnerName.capitalizeFirst()
            val fixedPlayerNames = playerNames.split("|").joinToString("|") { it.capitalizeFirst() }
            updates.add(Triple(id, fixedWinner, fixedPlayerNames))
        }
        cursor.close()
        for ((id, winner, players) in updates) {
            db.execSQL("UPDATE games SET winnerName = ?, playerNames = ? WHERE id = ?", arrayOf<Any>(winner, players, id))
        }
    }

    private fun String.capitalizeFirst() = if (isEmpty()) this else this[0].uppercaseChar() + substring(1)
}

@Database(entities = [Game::class], version = 6)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun gameDao(): GameDao

    companion object {
        @Volatile
        private var WORK_INSTANCE: AppDatabase? = null
        @Volatile
        private var KVW_INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context, profile: String): AppDatabase {
            return if (profile == "KVW") {
                KVW_INSTANCE ?: synchronized(this) {
                    val instance = Room.databaseBuilder(
                        context.applicationContext,
                        AppDatabase::class.java,
                        "toepen_database_kvw"
                    )
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
                    .build()
                    KVW_INSTANCE = instance
                    instance
                }
            } else {
                WORK_INSTANCE ?: synchronized(this) {
                    val instance = Room.databaseBuilder(
                        context.applicationContext,
                        AppDatabase::class.java,
                        "toepen_database_work"
                    )
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
                    .build()
                    WORK_INSTANCE = instance
                    instance
                }
            }
        }
    }
}
