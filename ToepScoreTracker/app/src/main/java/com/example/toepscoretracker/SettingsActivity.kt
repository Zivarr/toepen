package com.example.toepscoretracker

import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.viewmodel.SettingsViewModel
import com.example.toepscoretracker.viewmodel.SettingsViewModelFactory
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class SettingsActivity : AppCompatActivity() {

    private val viewModel: SettingsViewModel by viewModels {
        SettingsViewModelFactory { profile ->
            GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
        }
    }

    private var pendingRestoreProfile: String? = null

    private val restoreLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri ?: return@registerForActivityResult
        val profile = pendingRestoreProfile ?: return@registerForActivityResult
        lifecycleScope.launch {
            try {
                val tempFile = File(cacheDir, "restore_temp.db")
                withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri)?.use { inp ->
                        tempFile.outputStream().use { inp.copyTo(it) }
                    }
                }
                viewModel.restoreFromFile(applicationContext, profile, tempFile)
                withContext(Dispatchers.IO) { tempFile.delete() }
                Toast.makeText(this@SettingsActivity, getString(R.string.restore_success), Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@SettingsActivity, getString(R.string.restore_failed), Toast.LENGTH_SHORT).show()
            }
            pendingRestoreProfile = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val profile = intent.getStringExtra("profile") ?: "Work"

        findViewById<TextView>(R.id.tvCurrentProfile).text =
            getString(R.string.current_profile, profile)

        val etMaxPointsWork = findViewById<EditText>(R.id.etMaxPointsWork)
        val etMaxPointsKvw = findViewById<EditText>(R.id.etMaxPointsKvw)
        val prefsWork = getSharedPreferences("ToepenSettings_Work", Context.MODE_PRIVATE)
        val prefsKvw = getSharedPreferences("ToepenSettings_KVW", Context.MODE_PRIVATE)
        etMaxPointsWork.setText(prefsWork.getInt("lastMaxPoints", 10).toString())
        etMaxPointsKvw.setText(prefsKvw.getInt("lastMaxPoints", 15).toString())

        findViewById<Button>(R.id.btnSaveMaxPoints).setOnClickListener {
            val workPoints = etMaxPointsWork.text.toString().toIntOrNull()
            val kvwPoints = etMaxPointsKvw.text.toString().toIntOrNull()
            if (workPoints != null && kvwPoints != null) {
                prefsWork.edit().putInt("lastMaxPoints", workPoints).apply()
                prefsKvw.edit().putInt("lastMaxPoints", kvwPoints).apply()
                Toast.makeText(this, getString(R.string.settings_saved), Toast.LENGTH_SHORT).show()
            }
        }

        findViewById<Button>(R.id.btnBackupWork).setOnClickListener { startBackup("Work") }
        findViewById<Button>(R.id.btnBackupKvw).setOnClickListener { startBackup("KVW") }
        findViewById<Button>(R.id.btnRestoreWork).setOnClickListener { startRestore("Work") }
        findViewById<Button>(R.id.btnRestoreKvw).setOnClickListener { startRestore("KVW") }

        findViewById<Button>(R.id.btnDeleteShortGames).setOnClickListener {
            showConfirmDialog(
                getString(R.string.delete_short_games),
                getString(R.string.confirm_delete_short_games)
            ) { viewModel.deleteShortGames(profile) }
        }

        findViewById<Button>(R.id.btnClearHistory).setOnClickListener {
            showConfirmDialog(
                getString(R.string.clear_history),
                getString(R.string.confirm_clear)
            ) { viewModel.deleteAll(profile) }
        }

        findViewById<Button>(R.id.btnWipeAll).setOnClickListener {
            showConfirmDialog(
                getString(R.string.wipe_all_databases),
                getString(R.string.confirm_wipe_all)
            ) { viewModel.wipeAll() }
        }

        findViewById<Button>(R.id.btnBackFromSettings).setOnClickListener { finish() }
    }

    private fun startBackup(profile: String) {
        lifecycleScope.launch {
            try {
                val fileName = viewModel.backupToDownloads(applicationContext, profile)
                Toast.makeText(this@SettingsActivity, getString(R.string.backup_success_file, fileName), Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Log.e(TAG, "startBackup: failed for profile=$profile", e)
                Toast.makeText(this@SettingsActivity, getString(R.string.backup_failed), Toast.LENGTH_SHORT).show()
            }
        }
    }

    companion object {
        private const val TAG = "SettingsActivity"
    }

    private fun startRestore(profile: String) {
        showConfirmDialog(
            getString(R.string.restore_title),
            getString(R.string.confirm_restore)
        ) {
            pendingRestoreProfile = profile
            restoreLauncher.launch(arrayOf("*/*"))
        }
    }

    private fun showConfirmDialog(title: String, message: String, onConfirm: () -> Unit) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(R.string.yes) { _, _ -> onConfirm() }
            .setNegativeButton(R.string.no, null)
            .show()
    }
}
