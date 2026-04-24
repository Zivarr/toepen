package com.example.toepscoretracker

import android.content.Context
import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast

class PlayerSetupActivity : AppCompatActivity() {
    
    private val nameInputFields = mutableListOf<EditText>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player_setup)

        val playerCount = intent.getIntExtra("playerCount", 0)
        val profile = intent.getStringExtra("profile") ?: "Work"
        
        val llPlayerNames = findViewById<LinearLayout>(R.id.llPlayerNames)
        val etMaxPoints = findViewById<EditText>(R.id.etMaxPoints)
        val btnStartGame = findViewById<Button>(R.id.btnStartGame)

        // Laad de laatste instelling voor dit profiel
        val sharedPrefs = getSharedPreferences("ToepenSettings_$profile", Context.MODE_PRIVATE)
        val lastMaxPoints = sharedPrefs.getInt("lastMaxPoints", if (profile == "KVW") 15 else 10)
        etMaxPoints.setText(lastMaxPoints.toString())

        llPlayerNames.removeAllViews()
        nameInputFields.clear()

        for (i in 1..playerCount) {
            val editText = EditText(this).apply {
                hint = "Naam van speler $i"
                id = View.generateViewId()
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 8, 0, 8)
                }
            }
            llPlayerNames.addView(editText)
            nameInputFields.add(editText)
        }

        btnStartGame.setOnClickListener {
            val maxPointsStr = etMaxPoints.text.toString()
            val maxPoints = maxPointsStr.toIntOrNull()
            
            if (maxPoints == null || maxPoints <= 0) {
                Toast.makeText(this, "Voer een geldig maximum aantal punten in", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Sla de instelling op voor dit profiel
            sharedPrefs.edit().putInt("lastMaxPoints", maxPoints).apply()

            val playerNames = nameInputFields.map { it.text.toString().trim().replaceFirstChar { c -> c.uppercase() } }
            
            if (playerNames.any { it.isEmpty() }) {
                Toast.makeText(this, "Voer alle spelersnamen in", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (playerNames.size != playerNames.toSet().size) {
                Toast.makeText(this, "Spelersnamen moeten uniek zijn", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val intent = Intent(this, GameActivity::class.java).apply {
                putExtra("playerNames", playerNames.toTypedArray())
                putExtra("maxPenaltyPoints", maxPoints)
                putExtra("profile", profile)
            }
            startActivity(intent)
        }
    }
}
