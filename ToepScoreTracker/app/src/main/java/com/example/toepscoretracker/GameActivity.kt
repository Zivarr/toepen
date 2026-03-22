package com.example.toepscoretracker

import android.content.Intent
import android.graphics.Paint
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.util.DurationFormatter
import com.example.toepscoretracker.viewmodel.GameEvent
import com.example.toepscoretracker.viewmodel.GameUiState
import com.example.toepscoretracker.viewmodel.GameViewModel
import com.example.toepscoretracker.viewmodel.GameViewModelFactory
import androidx.activity.OnBackPressedCallback
import kotlinx.coroutines.launch

class GameActivity : AppCompatActivity() {

    private val viewModel: GameViewModel by viewModels {
        val profile = intent.getStringExtra("profile") ?: "Work"
        val playerNames = intent.getStringArrayExtra("playerNames")?.toList() ?: emptyList()
        val maxPenaltyPoints = intent.getIntExtra("maxPenaltyPoints", 15)
        GameViewModelFactory(
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao()),
            playerNames,
            maxPenaltyPoints
        )
    }

    private data class PlayerRowViews(
        val scoreText: TextView,
        val penaltyButton: Button,
        val boerButton: Button
    )

    private val playerViews = mutableMapOf<String, PlayerRowViews>()
    private lateinit var btnKlop: Button
    private lateinit var btnNextRound: Button
    private lateinit var btnEndGame: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_game)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        btnKlop = findViewById(R.id.btnKlop)

        buildPlayerViews()

        btnKlop.setOnClickListener { viewModel.incrementKlop() }

        btnNextRound = findViewById(R.id.btnNextRound)
        btnNextRound.setOnClickListener { viewModel.nextRound() }

        findViewById<Button>(R.id.btnUndo).setOnClickListener { viewModel.undo() }

        btnEndGame = findViewById(R.id.btnEndGame)
        btnEndGame.setOnClickListener { viewModel.endGame() }

        findViewById<Button>(R.id.btnBackToStart).setOnClickListener {
            val intent = Intent(this, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            startActivity(intent)
            finish()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (viewModel.uiState.value.isGameOver) {
                    val intent = Intent(this@GameActivity, MainActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                    startActivity(intent)
                    finish()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    updateUI(state)
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.events.collect { event ->
                    when (event) {
                        is GameEvent.GameSaved -> {
                            if (!event.quiet && !viewModel.uiState.value.isGameOver) {
                                Toast.makeText(this@GameActivity, getString(R.string.game_ended), Toast.LENGTH_SHORT).show()
                                finish()
                            }
                        }
                        is GameEvent.UndoEmpty -> {
                            Toast.makeText(this@GameActivity, "Niks om ongedaan te maken", Toast.LENGTH_SHORT).show()
                        }
                        is GameEvent.PlayerEliminated -> {
                            Toast.makeText(this@GameActivity, getString(R.string.player_lost, event.name), Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }
    }

    private fun buildPlayerViews() {
        val llPlayers = findViewById<LinearLayout>(R.id.llPlayers)
        llPlayers.removeAllViews()

        viewModel.playerNames.forEach { name ->
            val textView = TextView(this).apply {
                textSize = 20f
                setPadding(0, 16, 0, 8)
                gravity = android.view.Gravity.CENTER
            }

            val penaltyButton = Button(this).apply {
                text = getString(R.string.penalty_button, name)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener { viewModel.applyPenalty(name) }
            }

            val boerButton = Button(this).apply {
                text = getString(R.string.jack_button)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                setOnClickListener { viewModel.applyBoer(name) }
            }

            val buttonContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                addView(penaltyButton)
                addView(boerButton)
            }

            llPlayers.addView(textView)
            llPlayers.addView(buttonContainer)

            playerViews[name] = PlayerRowViews(textView, penaltyButton, boerButton)
        }
    }

    private fun updateUI(state: GameUiState) {
        btnKlop.text = getString(R.string.klop_button, state.currentRoundPoints)
        btnNextRound.isEnabled = !state.isGameOver
        btnEndGame.isEnabled = !state.isGameOver

        playerViews.forEach { (name, views) ->
            val score = state.scores[name] ?: 0
            val isEliminated = score >= viewModel.maxPenaltyPoints

            views.scoreText.text = getString(R.string.player_score, name, convertToTally(score))

            if (isEliminated) {
                views.scoreText.paintFlags = views.scoreText.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                views.scoreText.alpha = 0.5f
            } else {
                views.scoreText.paintFlags = views.scoreText.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
                views.scoreText.alpha = 1.0f
            }

            views.penaltyButton.isEnabled = !isEliminated && !state.isGameOver
            views.boerButton.isEnabled = !isEliminated && score > 0 && !state.isGameOver
        }

        if (state.isGameOver) {
            showCelebration(state.winner, state.durationAtEnd)
        }
    }

    private fun showCelebration(winnerName: String, durationMillis: Long) {
        val llGameLayout = findViewById<LinearLayout>(R.id.llGameLayout)
        val llSummaryLayout = findViewById<LinearLayout>(R.id.llSummaryLayout)
        val tvWinner = findViewById<TextView>(R.id.tvWinner)
        val tvDuration = findViewById<TextView>(R.id.tvDuration)
        val btnShare = findViewById<Button>(R.id.btnShare)

        val durationText = DurationFormatter.format(durationMillis)
        tvWinner.text = getString(R.string.player_won, winnerName)
        tvDuration.text = getString(R.string.duration_label, durationText)

        btnShare.setOnClickListener { shareResults(winnerName, durationText) }

        llGameLayout.visibility = View.GONE
        llSummaryLayout.visibility = View.VISIBLE
    }

    private fun shareResults(winnerName: String, durationText: String) {
        val summary = StringBuilder()
        summary.append("🎴 Toepen Resultaat!\n")
        summary.append("🏆 Winnaar: $winnerName\n")
        summary.append("⏱️ Speelduur: $durationText\n\n")
        summary.append("Eindstand:\n")

        viewModel.playerNames.forEach { name ->
            val score = viewModel.uiState.value.scores[name] ?: 0
            summary.append("• $name: $score strafpunten\n")
        }

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, getString(R.string.share_title))
            putExtra(Intent.EXTRA_TEXT, summary.toString())
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_results)))
    }

    private fun convertToTally(score: Int): String {
        if (score <= 0) return "0"
        val fullGroups = score / 5
        val remainder = score % 5
        val tallyString = StringBuilder()
        repeat(fullGroups) { tallyString.append("卌 ") }
        repeat(remainder) { tallyString.append("|") }
        return tallyString.toString().trim()
    }
}
