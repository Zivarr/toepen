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

@Database(entities = [Game::class], version = 4)
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
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4)
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
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4)
                    .build()
                    WORK_INSTANCE = instance
                    instance
                }
            }
        }
    }
}
