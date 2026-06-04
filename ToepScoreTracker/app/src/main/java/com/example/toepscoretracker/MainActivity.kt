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

    private lateinit var spinnerProfile: Spinner

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        ProfileManager.runMigrationIfNeeded(this)

        val etPlayerCount = findViewById<EditText>(R.id.etPlayerCount)
        val btnNext = findViewById<Button>(R.id.btnNext)
        val btnViewResults = findViewById<Button>(R.id.btnViewResults)
        val btnLeaderboard = findViewById<Button>(R.id.btnLeaderboard)
        val btnSettings = findViewById<ImageButton>(R.id.btnSettings)
        val btnManageProfiles = findViewById<Button>(R.id.btnManageProfiles)
        spinnerProfile = findViewById(R.id.spinnerProfile)

        refreshSpinner()

        btnNext.setOnClickListener {
            val playerCount = etPlayerCount.text.toString()
            val count = playerCount.toIntOrNull()
            when {
                count == null -> Toast.makeText(this, getString(R.string.enter_player_count), Toast.LENGTH_SHORT).show()
                count < 2 || count > 8 -> Toast.makeText(this, getString(R.string.player_count_out_of_range), Toast.LENGTH_SHORT).show()
                else -> {
                    val selectedProfile = spinnerProfile.selectedItem.toString()
                    getSharedPreferences("ToepenSettings", Context.MODE_PRIVATE)
                        .edit().putString("lastProfile", selectedProfile).apply()
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

        btnManageProfiles.setOnClickListener {
            startActivity(Intent(this, ManageProfilesActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        refreshSpinner()
    }

    private fun refreshSpinner() {
        val profiles = ProfileManager.getProfiles(this)
        val adapter = ArrayAdapter(this, R.layout.spinner_item, profiles)
        adapter.setDropDownViewResource(R.layout.spinner_dropdown_item)
        spinnerProfile.adapter = adapter

        val lastProfile = getSharedPreferences("ToepenSettings", Context.MODE_PRIVATE)
            .getString("lastProfile", "Vrienden")
        val idx = profiles.indexOf(lastProfile)
        spinnerProfile.setSelection(if (idx >= 0) idx else 0)
    }
}
