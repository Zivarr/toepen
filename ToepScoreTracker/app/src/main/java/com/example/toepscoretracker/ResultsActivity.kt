package com.example.toepscoretracker

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
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
        val profile = intent.getStringExtra("profile") ?: "Work"
        RepositoryViewModelFactory(
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_results)

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
                            gravity = Gravity.CENTER
                        })
                    } else {
                        games.forEach { game ->
                            llResults.addView(TextView(this@ResultsActivity).apply {
                                text = """
                                    Datum: ${game.timestamp}
                                    Spelers: ${game.playerNames.joinToString(", ")}
                                    Maximale strafpunten: ${game.maxPenaltyPoints}
                                    Duur: ${DurationFormatter.format(game.duration)}
                                    ----------------------------
                                """.trimIndent()
                                textSize = 16f
                                gravity = Gravity.CENTER
                                setPadding(0, 8, 0, 8)
                            })
                        }
                    }
                }
            }
        }
    }
}
