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
        val profile = intent.getStringExtra("profile") ?: "Vrienden"
        RepositoryViewModelFactory(
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_leaderboard)

        val profile = intent.getStringExtra("profile") ?: "Vrienden"
        findViewById<TextView>(R.id.tvLeaderboardTitle).text =
            getString(R.string.leaderboard_title, profile)

        findViewById<Button>(R.id.btnBackFromLeaderboard).setOnClickListener { finish() }

        val llLeaderboard = findViewById<LinearLayout>(R.id.llLeaderboard)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.playerStats.collect { stats ->
                    llLeaderboard.removeAllViews()
                    if (stats.isEmpty()) {
                        llLeaderboard.addView(TextView(this@LeaderboardActivity).apply {
                            text = "Nog geen winnaars bekend."
                            textSize = 18f
                            setTextColor(getColor(R.color.white))
                            gravity = Gravity.CENTER
                        })
                    } else {
                        stats.forEachIndexed { index, s ->
                            val winRatePct = (s.winRate * 100).toInt()
                            val line1 = "${index + 1}. ${s.name}  —  ${s.wins} winst(en)"
                            val line2 = "${s.gamesPlayed} gespeeld · ${winRatePct}% winstrate · ${s.totalBoer}× Boer"

                            llLeaderboard.addView(TextView(this@LeaderboardActivity).apply {
                                text = line1
                                textSize = 20f
                                setTextColor(getColor(R.color.white))
                                setPadding(0, 8, 0, 0)
                                gravity = Gravity.CENTER
                            })
                            llLeaderboard.addView(TextView(this@LeaderboardActivity).apply {
                                text = line2
                                textSize = 14f
                                setTextColor(0xFFBDBDBD.toInt())
                                setPadding(0, 2, 0, 12)
                                gravity = Gravity.CENTER
                            })
                        }
                    }
                }
            }
        }
    }
}
