package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class PlayerStats(
    val name: String,
    val wins: Int,
    val gamesPlayed: Int,
    val totalBoer: Int
) {
    val winRate: Float get() = if (gamesPlayed == 0) 0f else wins.toFloat() / gamesPlayed
}

class LeaderboardViewModel(repository: GameRepository) : ViewModel() {

    val playerStats: StateFlow<List<PlayerStats>> = repository.getGamesFlow()
        .map { games ->
            val allNames = games.flatMap { it.playerNames }.toSet()
            allNames.map { name ->
                val played = games.count { name in it.playerNames }
                val wins = games.count { it.winnerName == name }
                val boer = games.sumOf { game ->
                    val idx = game.playerNames.indexOf(name)
                    if (idx >= 0 && idx < game.boerCounts.size) game.boerCounts[idx] else 0
                }
                PlayerStats(name, wins, played, boer)
            }
                .filter { it.gamesPlayed > 0 }
                .sortedByDescending { it.wins }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
