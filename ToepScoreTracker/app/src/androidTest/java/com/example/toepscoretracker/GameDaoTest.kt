package com.example.toepscoretracker

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.database.GameDao
import com.example.toepscoretracker.database.MIGRATION_2_3
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GameDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var dao: GameDao

    @Before
    fun createDb() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).build()
        dao = db.gameDao()
    }

    @After
    fun closeDb() = db.close()

    private fun makeGame(winner: String = "", players: List<String> = listOf("Alice", "Bob")) = Game(
        playerNames = players,
        winnerName = winner,
        maxPenaltyPoints = 15,
        duration = 60_000L,
        timestamp = "2024-01-01 12:00:00"
    )

    @Test
    fun insertAndRetrieveGame() = runTest {
        dao.insert(makeGame("Alice"))
        val games = dao.getAllGames()
        assertEquals(1, games.size)
        assertEquals("Alice", games[0].winnerName)
    }

    @Test
    fun getAllGamesReturnsInDescendingOrder() = runTest {
        dao.insert(makeGame("Alice"))
        dao.insert(makeGame("Bob"))
        val games = dao.getAllGames()
        assertEquals("Bob", games[0].winnerName)
        assertEquals("Alice", games[1].winnerName)
    }

    @Test
    fun deleteAllRemovesAllRecords() = runTest {
        dao.insert(makeGame("Alice"))
        dao.insert(makeGame("Bob"))
        dao.deleteAll()
        val games = dao.getAllGames()
        assertTrue(games.isEmpty())
    }

    @Test
    fun playerNamesRoundTripThroughTypeConverter() = runTest {
        val players = listOf("Alice", "Bob", "Charlie")
        dao.insert(makeGame(players = players))
        val retrieved = dao.getAllGames().first()
        assertEquals(players, retrieved.playerNames)
    }

    @Test
    fun flowEmitsUpdatesOnInsert() = runTest {
        dao.insert(makeGame("Alice"))
        val games = dao.getAllGamesFlow().first()
        assertEquals(1, games.size)
        assertEquals("Alice", games[0].winnerName)
    }
}
