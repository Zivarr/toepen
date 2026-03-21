package com.example.toepscoretracker.repository

import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.database.GameDao
import kotlinx.coroutines.flow.Flow

class GameRepository(private val gameDao: GameDao) {

    fun getGamesFlow(): Flow<List<Game>> = gameDao.getAllGamesFlow()

    suspend fun getAllGames(): List<Game> = gameDao.getAllGames()

    suspend fun insertGame(game: Game) = gameDao.insert(game)

    suspend fun deleteAll() = gameDao.deleteAll()

    suspend fun getWinCounts(): List<Pair<String, Int>> =
        getAllGames()
            .filter { it.winnerName.isNotEmpty() }
            .groupBy { it.winnerName }
            .map { (name, games) -> name to games.size }
            .sortedByDescending { it.second }
}
