package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.launch

class MainViewModel(
    private val repositoryProvider: (String) -> GameRepository,
    private val profileListProvider: () -> List<String>
) : ViewModel() {

    fun deleteAll(profile: String) {
        viewModelScope.launch {
            repositoryProvider(profile).deleteAll()
        }
    }

    fun wipeAll() {
        viewModelScope.launch {
            profileListProvider().forEach { repositoryProvider(it).deleteAll() }
        }
    }
}
