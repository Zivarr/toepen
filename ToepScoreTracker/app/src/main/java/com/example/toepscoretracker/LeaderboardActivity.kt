package com.example.toepscoretracker

import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.viewmodel.LeaderboardViewModel
import com.example.toepscoretracker.viewmodel.RepositoryViewModelFactory
import kotlinx.coroutines.launch

class LeaderboardActivity : AppCompatActivity() {

    private val viewModel: LeaderboardViewModel by viewModels {
        val profile = intent.getStringExtra("profile") ?: "Work"
        RepositoryViewModelFactory(
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_leaderboard)

        val profile = intent.getStringExtra("profile") ?: "Work"
        findViewById<TextView>(R.id.tvLeaderboardTitle).text =
            getString(R.string.leaderboard_title, profile)

        findViewById<Button>(R.id.btnBackFromLeaderboard).setOnClickListener { finish() }

        val llLeaderboard = findViewById<LinearLayout>(R.id.llLeaderboard)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.winCounts.collect { winCounts ->
                    llLeaderboard.removeAllViews()
                    if (winCounts.isEmpty()) {
                        llLeaderboard.addView(TextView(this@LeaderboardActivity).apply {
                            text = "Nog geen winnaars bekend."
                            textSize = 18f
                            setTextColor(getColor(R.color.white))
                            gravity = Gravity.CENTER
                        })
                    } else {
                        winCounts.forEachIndexed { index, (name, wins) ->
                            llLeaderboard.addView(TextView(this@LeaderboardActivity).apply {
                                text = "${index + 1}. $name: $wins winst(en)"
                                textSize = 20f
                                setTextColor(getColor(R.color.white))
                                setPadding(0, 8, 0, 8)
                                gravity = Gravity.CENTER
                            })
                        }
                    }
                }
            }
        }
    }
}
