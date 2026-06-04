package com.example.toepscoretracker

import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.database.GameDao
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.viewmodel.GameEvent
import com.example.toepscoretracker.viewmodel.GameViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private val insertedGames = mutableListOf<Game>()

    private val fakeDao = object : GameDao {
        override suspend fun insert(game: Game) { insertedGames.add(game) }
        override fun getAllGamesFlow(): Flow<List<Game>> = flowOf(emptyList())
        override suspend fun getAllGames(): List<Game> = emptyList()
        override suspend fun deleteAll() = Unit
        override suspend fun deleteShortGames(maxDuration: Long) = Unit
        override suspend fun countByTimestampAndPlayers(timestamp: String, playerNames: String): Int = 0
    }

    private val repository = GameRepository(fakeDao)

    private lateinit var viewModel: GameViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        insertedGames.clear()
        viewModel = GameViewModel(repository, listOf("Alice", "Bob", "Charlie"), maxPenaltyPoints = 5)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial scores are all zero`() {
        val state = viewModel.uiState.value
        assertEquals(0, state.scores["Alice"])
        assertEquals(0, state.scores["Bob"])
        assertEquals(0, state.scores["Charlie"])
    }

    @Test
    fun `applyPenalty increases player score by currentRoundPoints`() {
        viewModel.applyPenalty("Alice")
        assertEquals(1, viewModel.uiState.value.scores["Alice"])
    }

    @Test
    fun `applyPenalty adds currentRoundPoints to player score`() {
        viewModel.incrementKlop()
        viewModel.incrementKlop()
        assertEquals(3, viewModel.uiState.value.currentRoundPoints)
        viewModel.applyPenalty("Alice")
        assertEquals(3, viewModel.uiState.value.scores["Alice"])
    }

    @Test
    fun `nextRound resets currentRoundPoints to 1`() {
        viewModel.incrementKlop()
        viewModel.incrementKlop()
        viewModel.nextRound()
        assertEquals(1, viewModel.uiState.value.currentRoundPoints)
    }

    @Test
    fun `incrementKlop increases currentRoundPoints`() {
        viewModel.incrementKlop()
        assertEquals(2, viewModel.uiState.value.currentRoundPoints)
    }

    @Test
    fun `applyBoer decreases player score by 1`() {
        viewModel.applyPenalty("Alice")
        viewModel.applyBoer("Alice")
        assertEquals(0, viewModel.uiState.value.scores["Alice"])
    }

    @Test
    fun `applyBoer does not go below zero`() {
        viewModel.applyBoer("Alice")
        assertEquals(0, viewModel.uiState.value.scores["Alice"])
    }

    @Test
    fun `undo restores previous score state`() {
        viewModel.applyPenalty("Alice")
        viewModel.undo()
        assertEquals(0, viewModel.uiState.value.scores["Alice"])
    }

    @Test
    fun `undo emits UndoEmpty event when history is empty`() = runTest {
        var receivedEvent: GameEvent? = null
        val job = launch(testDispatcher) {
            viewModel.events.collect { receivedEvent = it }
        }
        viewModel.undo()
        assertTrue(receivedEvent is GameEvent.UndoEmpty)
        job.cancel()
    }

    @Test
    fun `game over when one player remains`() {
        // Eliminate Alice and Bob, leaving Charlie
        repeat(5) { viewModel.applyPenalty("Alice") }
        repeat(5) { viewModel.applyPenalty("Bob") }
        assertTrue(viewModel.uiState.value.isGameOver)
        assertEquals("Charlie", viewModel.uiState.value.winner)
    }

    @Test
    fun `game is saved to repository when game over`() = runTest {
        repeat(5) { viewModel.applyPenalty("Alice") }
        repeat(5) { viewModel.applyPenalty("Bob") }
        // Let coroutines run
        assertTrue(insertedGames.isNotEmpty())
        assertEquals("Charlie", insertedGames.last().winnerName)
    }

    @Test
    fun `endGame saves game with empty winner`() = runTest {
        viewModel.endGame()
        assertTrue(insertedGames.isNotEmpty())
        assertEquals("", insertedGames.last().winnerName)
    }

    @Test
    fun `cannot apply penalty after game over`() {
        repeat(5) { viewModel.applyPenalty("Alice") }
        repeat(5) { viewModel.applyPenalty("Bob") }
        val scoreBeforeExtra = viewModel.uiState.value.scores["Charlie"]
        viewModel.applyPenalty("Charlie")
        assertEquals(scoreBeforeExtra, viewModel.uiState.value.scores["Charlie"])
    }

    @Test
    fun `game is not saved twice on game over`() = runTest {
        repeat(5) { viewModel.applyPenalty("Alice") }
        repeat(5) { viewModel.applyPenalty("Bob") }
        assertEquals(1, insertedGames.size)
    }
}
