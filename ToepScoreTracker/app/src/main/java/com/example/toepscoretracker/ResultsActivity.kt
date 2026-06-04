package com.example.toepscoretracker

import android.content.Intent
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.util.DurationFormatter
import com.example.toepscoretracker.viewmodel.RepositoryViewModelFactory
import com.example.toepscoretracker.viewmodel.ResultsViewModel
import kotlinx.coroutines.launch

class ResultsActivity : AppCompatActivity() {

    private val viewModel: ResultsViewModel by viewModels {
        val profile = intent.getStringExtra("profile") ?: "Vrienden"
        RepositoryViewModelFactory(
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_results)

        val profile = intent.getStringExtra("profile") ?: "Vrienden"

        findViewById<ImageButton>(R.id.btnSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java).apply {
                putExtra("profile", profile)
            })
        }

        findViewById<Button>(R.id.btnBackToStart).setOnClickListener {
            val intent = Intent(this, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            startActivity(intent)
            finish()
        }

        val llResults = findViewById<LinearLayout>(R.id.llResults)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.games.collect { games ->
                    llResults.removeAllViews()
                    if (games.isEmpty()) {
                        llResults.addView(TextView(this@ResultsActivity).apply {
                            text = "Geen spelresultaten gevonden."
                            textSize = 18f
                            setTextColor(0xFFFFFFFF.toInt())
                            setPadding(0, 32, 0, 0)
                        })
                    } else {
                        games.forEach { game ->
                            val card = layoutInflater.inflate(R.layout.item_game_result, llResults, false)
                            card.findViewById<TextView>(R.id.tvTimestamp).text = game.timestamp
                            card.findViewById<TextView>(R.id.tvWinner).text =
                                "Winnaar: ${game.winnerName.ifBlank { "-" }}"
                            card.findViewById<TextView>(R.id.tvPlayers).text =
                                "Spelers: ${game.playerNames.joinToString(", ")}"
                            val scoresView = card.findViewById<TextView>(R.id.tvScores)
                            if (game.finalScores.isNotEmpty()) {
                                scoresView.text = game.playerNames.indices.joinToString("\n") { i ->
                                    val score = game.finalScores[i]
                                    val boer = game.boerCounts.getOrElse(i) { 0 }
                                    if (boer > 0) "${game.playerNames[i]}: $score (${boer}x Boer)"
                                    else "${game.playerNames[i]}: $score"
                                }
                                scoresView.visibility = View.VISIBLE
                            } else {
                                scoresView.visibility = View.GONE
                            }
                            card.findViewById<TextView>(R.id.tvMaxPoints).text =
                                "Max: ${game.maxPenaltyPoints} strafpunten"
                            card.findViewById<TextView>(R.id.tvDuration).text =
                                DurationFormatter.format(game.duration)
                            llResults.addView(card)
                        }
                    }
                }
            }
        }
    }
}
