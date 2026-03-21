package com.example.toepscoretracker.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface GameDao {
    @Insert
    suspend fun insert(game: Game)

    @Query("SELECT * FROM games ORDER BY id DESC")
    fun getAllGamesFlow(): Flow<List<Game>>

    @Query("SELECT * FROM games ORDER BY id DESC")
    suspend fun getAllGames(): List<Game>

    @Query("DELETE FROM games")
    suspend fun deleteAll()
}