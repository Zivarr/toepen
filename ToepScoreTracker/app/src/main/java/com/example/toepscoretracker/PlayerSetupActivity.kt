package com.example.toepscoretracker

import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import androidx.appcompat.app.AppCompatActivity
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton

class PlayerSetupActivity : AppCompatActivity() {

    private val nameInputFields = mutableListOf<EditText>()
    private lateinit var llPlayerNames: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player_setup)

        val profile = intent.getStringExtra("profile") ?: "Vrienden"
        val prefillNames = intent.getStringArrayExtra("playerNames")
        val prefillMaxPoints = intent.getIntExtra("maxPenaltyPoints", -1)

        llPlayerNames = findViewById(R.id.llPlayerNames)
        val etMaxPoints = findViewById<EditText>(R.id.etMaxPoints)
        val btnStartGame = findViewById<Button>(R.id.btnStartGame)
        val btnAddPlayer = findViewById<Button>(R.id.btnAddPlayer)

        val sharedPrefs = getSharedPreferences("ToepenSettings_$profile", Context.MODE_PRIVATE)
        val lastMaxPoints = sharedPrefs.getInt("lastMaxPoints", 10)
        etMaxPoints.setText(if (prefillMaxPoints > 0) prefillMaxPoints.toString() else lastMaxPoints.toString())

        llPlayerNames.removeAllViews()
        nameInputFields.clear()

        if (prefillNames != null) {
            prefillNames.forEach { addPlayerRow(it) }
        } else {
            val playerCount = intent.getIntExtra("playerCount", 2).coerceAtLeast(2)
            repeat(playerCount) { addPlayerRow() }
        }

        btnAddPlayer.setOnClickListener { addPlayerRow() }

        btnStartGame.setOnClickListener {
            val maxPointsStr = etMaxPoints.text.toString()
            val maxPoints = maxPointsStr.toIntOrNull()

            if (maxPoints == null || maxPoints <= 0) {
                Toast.makeText(this, "Voer een geldig maximum aantal punten in", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

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

    private fun addPlayerRow(name: String = "") {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 8, 0, 8) }
        }

        val et = EditText(this).apply {
            hint = "Naam van speler ${nameInputFields.size + 1}"
            setText(name)
            id = View.generateViewId()
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val removeSize = dpToPx(36)
        val btnRemove = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "×"
            contentDescription = getString(R.string.remove_player)
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(context, R.color.remove_red))
            strokeColor = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.remove_red))
            strokeWidth = dpToPx(1)
            cornerRadius = removeSize / 2
            insetTop = 0
            insetBottom = 0
            minWidth = removeSize
            minimumWidth = removeSize
            minHeight = removeSize
            minimumHeight = removeSize
            setPadding(0, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(removeSize, removeSize).apply { marginStart = dpToPx(8) }
            setOnClickListener { removePlayerRow(row, et) }
        }

        row.addView(et)
        row.addView(btnRemove)
        llPlayerNames.addView(row)
        nameInputFields.add(et)
        updateRemoveButtons()
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics).toInt()

    private fun removePlayerRow(row: LinearLayout, et: EditText) {
        llPlayerNames.removeView(row)
        nameInputFields.remove(et)
        updateRemoveButtons()
    }

    private fun updateRemoveButtons() {
        val canRemove = nameInputFields.size > 2
        for (i in 0 until llPlayerNames.childCount) {
            val row = llPlayerNames.getChildAt(i) as? LinearLayout ?: continue
            val btn = row.getChildAt(1) as? Button ?: continue
            btn.isEnabled = canRemove
            btn.alpha = if (canRemove) 1f else 0.3f
        }
    }
}
