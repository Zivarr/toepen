package com.example.toepscoretracker

import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.database.GameDao
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GameRepositoryTest {

    private fun makeGame(winner: String) = Game(
        playerNames = listOf("A", "B"),
        winnerName = winner,
        maxPenaltyPoints = 15,
        duration = 60_000L,
        timestamp = "2024-01-01 12:00:00"
    )

    private fun repoWith(vararg games: Game): GameRepository {
        val dao = object : GameDao {
            override suspend fun insert(game: Game) = Unit
            override fun getAllGamesFlow(): Flow<List<Game>> = flowOf(games.toList())
            override suspend fun getAllGames(): List<Game> = games.toList()
            override suspend fun deleteAll() = Unit
            override suspend fun deleteShortGames(maxDuration: Long) = Unit
            override suspend fun countByTimestampAndPlayers(timestamp: String, playerNames: String): Int = 0
        }
        return GameRepository(dao)
    }

    @Test
    fun `getWinCounts returns sorted by wins descending`() = runTest {
        val repo = repoWith(
            makeGame("Alice"),
            makeGame("Bob"),
            makeGame("Alice"),
            makeGame("Alice")
        )
        val result = repo.getWinCounts()
        assertEquals("Alice", result[0].first)
        assertEquals(3, result[0].second)
        assertEquals("Bob", result[1].first)
        assertEquals(1, result[1].second)
    }

    @Test
    fun `getWinCounts ignores games with empty winnerName`() = runTest {
        val repo = repoWith(
            makeGame("Alice"),
            makeGame("")
        )
        val result = repo.getWinCounts()
        assertEquals(1, result.size)
        assertEquals("Alice", result[0].first)
    }

    @Test
    fun `getWinCounts returns empty list when no games`() = runTest {
        val repo = repoWith()
        val result = repo.getWinCounts()
        assertTrue(result.isEmpty())
    }
}
