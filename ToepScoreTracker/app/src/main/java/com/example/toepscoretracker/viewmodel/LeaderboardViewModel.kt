package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class LeaderboardViewModel(repository: GameRepository) : ViewModel() {

    val winCounts: StateFlow<List<Pair<String, Int>>> = repository.getGamesFlow()
        .map { games ->
            games
                .filter { it.winnerName.isNotEmpty() }
                .groupBy { it.winnerName }
                .map { (name, list) -> name to list.size }
                .sortedByDescending { it.second }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
