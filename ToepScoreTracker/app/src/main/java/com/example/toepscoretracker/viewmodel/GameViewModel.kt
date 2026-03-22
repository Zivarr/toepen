package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Stack

data class GameUiState(
    val scores: Map<String, Int> = emptyMap(),
    val currentRoundPoints: Int = 1,
    val isGameOver: Boolean = false,
    val winner: String = "",
    val durationAtEnd: Long = 0L
)

sealed class GameEvent {
    data class GameSaved(val quiet: Boolean) : GameEvent()
    object UndoEmpty : GameEvent()
    data class PlayerEliminated(val name: String) : GameEvent()
}

class GameViewModel(
    private val repository: GameRepository,
    val playerNames: List<String>,
    val maxPenaltyPoints: Int
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        GameUiState(scores = playerNames.associateWith { 0 })
    )
    val uiState: StateFlow<GameUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<GameEvent>()
    val events: SharedFlow<GameEvent> = _events.asSharedFlow()

    private val history = Stack<Map<String, Int>>()
    private val startTime = System.currentTimeMillis()
    private var savedOnGameOver = false

    fun incrementKlop() {
        _uiState.value = _uiState.value.copy(
            currentRoundPoints = _uiState.value.currentRoundPoints + 1
        )
    }

    fun applyPenalty(playerName: String) {
        val state = _uiState.value
        if (state.isGameOver) return

        history.push(HashMap(state.scores))

        val newScore = (state.scores[playerName] ?: 0) + state.currentRoundPoints
        val newScores = state.scores.toMutableMap().apply { put(playerName, newScore) }

        _uiState.value = checkGameOver(state.copy(scores = newScores))

        if (newScore >= maxPenaltyPoints) {
            viewModelScope.launch { _events.emit(GameEvent.PlayerEliminated(playerName)) }
        }
    }

    fun applyFold(playerName: String) {
        val state = _uiState.value
        if (state.isGameOver) return

        history.push(HashMap(state.scores))

        val foldPoints = state.currentRoundPoints - 1
        val newScore = (state.scores[playerName] ?: 0) + foldPoints
        val newScores = state.scores.toMutableMap().apply { put(playerName, newScore) }

        _uiState.value = checkGameOver(state.copy(scores = newScores))

        if (newScore >= maxPenaltyPoints) {
            viewModelScope.launch { _events.emit(GameEvent.PlayerEliminated(playerName)) }
        }
    }

    fun applyBoer(playerName: String) {
        val state = _uiState.value
        if (state.isGameOver) return

        history.push(HashMap(state.scores))

        val newScore = maxOf(0, (state.scores[playerName] ?: 0) - 1)
        val newScores = state.scores.toMutableMap().apply { put(playerName, newScore) }

        _uiState.value = checkGameOver(state.copy(scores = newScores))
    }

    fun undo() {
        if (_uiState.value.isGameOver) return
        if (history.isNotEmpty()) {
            _uiState.value = _uiState.value.copy(scores = history.pop())
        } else {
            viewModelScope.launch { _events.emit(GameEvent.UndoEmpty) }
        }
    }

    fun nextRound() {
        if (_uiState.value.isGameOver) return
        history.clear()
        _uiState.value = _uiState.value.copy(currentRoundPoints = 1)
    }

    fun endGame() {
        if (_uiState.value.isGameOver) return
        saveGame(winner = "", duration = System.currentTimeMillis() - startTime, quiet = false)
    }

    fun getDurationAtEnd(): Long = _uiState.value.durationAtEnd

    private fun saveGame(winner: String, duration: Long, quiet: Boolean) {
        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
        val game = Game(
            playerNames = playerNames,
            winnerName = winner,
            maxPenaltyPoints = maxPenaltyPoints,
            duration = duration,
            timestamp = timestamp
        )
        viewModelScope.launch {
            repository.insertGame(game)
            _events.emit(GameEvent.GameSaved(quiet))
        }
    }

    private fun checkGameOver(state: GameUiState): GameUiState {
        val remaining = state.scores.filter { it.value < maxPenaltyPoints }.keys
        return if (remaining.size <= 1 && !state.isGameOver) {
            val winner = remaining.firstOrNull() ?: "Niemand"
            val duration = System.currentTimeMillis() - startTime
            val newState = state.copy(isGameOver = true, winner = winner, durationAtEnd = duration)
            if (!savedOnGameOver) {
                savedOnGameOver = true
                saveGame(winner, duration = duration, quiet = true)
            }
            newState
        } else {
            state
        }
    }
}
