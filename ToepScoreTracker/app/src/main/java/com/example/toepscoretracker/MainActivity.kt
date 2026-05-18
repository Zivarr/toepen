package com.example.toepscoretracker

import android.content.Context
import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Spinner
import android.widget.Toast

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val etPlayerCount = findViewById<EditText>(R.id.etPlayerCount)
        val btnNext = findViewById<Button>(R.id.btnNext)
        val btnViewResults = findViewById<Button>(R.id.btnViewResults)
        val btnLeaderboard = findViewById<Button>(R.id.btnLeaderboard)
        val btnSettings = findViewById<ImageButton>(R.id.btnSettings)
        val spinnerProfile = findViewById<Spinner>(R.id.spinnerProfile)

        val profiles = arrayOf("Work", "KVW")
        val adapter = ArrayAdapter(this, R.layout.spinner_item, profiles)
        adapter.setDropDownViewResource(R.layout.spinner_dropdown_item)
        spinnerProfile.adapter = adapter

        val sharedPrefs = getSharedPreferences("ToepenSettings", Context.MODE_PRIVATE)
        val lastProfile = sharedPrefs.getString("lastProfile", "Work")
        val lastProfileIndex = profiles.indexOf(lastProfile)
        if (lastProfileIndex >= 0) {
            spinnerProfile.setSelection(lastProfileIndex)
        }

        btnNext.setOnClickListener {
            val playerCount = etPlayerCount.text.toString()
            val count = playerCount.toIntOrNull()
            when {
                count == null -> Toast.makeText(this, getString(R.string.enter_player_count), Toast.LENGTH_SHORT).show()
                count < 2 || count > 8 -> Toast.makeText(this, getString(R.string.player_count_out_of_range), Toast.LENGTH_SHORT).show()
                else -> {
                    val selectedProfile = spinnerProfile.selectedItem.toString()
                    sharedPrefs.edit().putString("lastProfile", selectedProfile).apply()
                    startActivity(Intent(this, PlayerSetupActivity::class.java).apply {
                        putExtra("playerCount", count)
                        putExtra("profile", selectedProfile)
                    })
                }
            }
        }

        btnViewResults.setOnClickListener {
            val selectedProfile = spinnerProfile.selectedItem.toString()
            startActivity(Intent(this, ResultsActivity::class.java).apply {
                putExtra("profile", selectedProfile)
            })
        }

        btnLeaderboard.setOnClickListener {
            val selectedProfile = spinnerProfile.selectedItem.toString()
            startActivity(Intent(this, LeaderboardActivity::class.java).apply {
                putExtra("profile", selectedProfile)
            })
        }

        btnSettings.setOnClickListener {
            val selectedProfile = spinnerProfile.selectedItem.toString()
            startActivity(Intent(this, SettingsActivity::class.java).apply {
                putExtra("profile", selectedProfile)
            })
        }
    }
}
