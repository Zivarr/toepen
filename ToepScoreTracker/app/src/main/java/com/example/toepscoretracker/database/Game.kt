package com.example.toepscoretracker.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "games")
data class Game(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val playerNames: List<String>,
    val winnerName: String = "",
    val maxPenaltyPoints: Int,
    val duration: Long,
    val timestamp: String,
    val finalScores: List<Int> = emptyList(),
    val boerCounts: List<Int> = emptyList()
)