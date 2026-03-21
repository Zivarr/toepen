package com.example.toepscoretracker.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.toepscoretracker.repository.GameRepository
import kotlinx.coroutines.launch

class MainViewModel(
    private val repositoryProvider: (String) -> GameRepository
) : ViewModel() {

    fun deleteAll(profile: String) {
        viewModelScope.launch {
            repositoryProvider(profile).deleteAll()
        }
    }

    fun wipeAll() {
        viewModelScope.launch {
            repositoryProvider("Work").deleteAll()
            repositoryProvider("KVW").deleteAll()
        }
    }
}
