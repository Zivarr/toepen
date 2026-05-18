package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.toepscoretracker.repository.GameRepository

class GameViewModelFactory(
    private val repository: GameRepository,
    private val playerNames: List<String>,
    private val maxPenaltyPoints: Int
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        GameViewModel(repository, playerNames, maxPenaltyPoints) as T
}

class RepositoryViewModelFactory(
    private val repository: GameRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when {
        modelClass.isAssignableFrom(ResultsViewModel::class.java) -> ResultsViewModel(repository) as T
        modelClass.isAssignableFrom(LeaderboardViewModel::class.java) -> LeaderboardViewModel(repository) as T
        else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

class MainViewModelFactory(
    private val repositoryProvider: (String) -> GameRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        MainViewModel(repositoryProvider) as T
}

class SettingsViewModelFactory(
    private val repositoryProvider: (String) -> GameRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        SettingsViewModel(repositoryProvider) as T
}
