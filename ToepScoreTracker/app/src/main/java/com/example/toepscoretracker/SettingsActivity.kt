package com.example.toepscoretracker

import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.lifecycle.lifecycleScope
import com.example.toepscoretracker.database.AppDatabase
import com.example.toepscoretracker.repository.GameRepository
import com.example.toepscoretracker.viewmodel.SettingsViewModel
import com.example.toepscoretracker.viewmodel.SettingsViewModelFactory
import com.example.toepscoretracker.upload.UploadResult
import com.example.toepscoretracker.upload.uploadButtonLabel
import com.example.toepscoretracker.upload.uploadSkippedText
import com.example.toepscoretracker.upload.uploadStatusText
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class SettingsActivity : AppCompatActivity() {

    private val viewModel: SettingsViewModel by viewModels {
        SettingsViewModelFactory(
            repositoryProvider = { profile ->
                GameRepository(AppDatabase.getDatabase(this, profile).gameDao())
            },
            profileListProvider = { ProfileManager.getProfiles(this) }
        )
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

        val profile = intent.getStringExtra("profile") ?: "Vrienden"

        findViewById<TextView>(R.id.tvCurrentProfile).text =
            getString(R.string.current_profile, profile)

        val prefs = getSharedPreferences("ToepenSettings_$profile", Context.MODE_PRIVATE)
        val etMaxPoints = findViewById<EditText>(R.id.etMaxPoints)
        etMaxPoints.setText(prefs.getInt("lastMaxPoints", 10).toString())

        findViewById<Button>(R.id.btnSaveMaxPoints).setOnClickListener {
            val pts = etMaxPoints.text.toString().toIntOrNull()
            if (pts != null && pts > 0) {
                prefs.edit().putInt("lastMaxPoints", pts).apply()
                Toast.makeText(this, getString(R.string.settings_saved), Toast.LENGTH_SHORT).show()
            }
        }

        val switchConfirmPenalty = findViewById<SwitchCompat>(R.id.switchConfirmPenalty)
        switchConfirmPenalty.isChecked = prefs.getBoolean("confirmPenalty", false)
        switchConfirmPenalty.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("confirmPenalty", checked).apply()
        }

        val switchShowRematch = findViewById<SwitchCompat>(R.id.switchShowRematch)
        switchShowRematch.isChecked = prefs.getBoolean("showRematchButton", true)
        switchShowRematch.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("showRematchButton", checked).apply()
        }

        findViewById<Button>(R.id.btnBackup).setOnClickListener { startBackup(profile) }
        findViewById<Button>(R.id.btnRestore).setOnClickListener { startRestore(profile) }

        setupUpload(profile, prefs)

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

    private fun setupUpload(profile: String, prefs: android.content.SharedPreferences) {
        val btn = findViewById<Button>(R.id.btnUploadServer)
        val tvStatus = findViewById<TextView>(R.id.tvUploadStatus)
        val str: (Int, List<Any>) -> String = { id, args -> getString(id, *args.toTypedArray()) }

        fun refreshLabel() {
            val at = if (prefs.contains(KEY_UPLOADED_AT)) prefs.getLong(KEY_UPLOADED_AT, 0L) else null
            btn.text = uploadButtonLabel(at, str)
        }
        refreshLabel()

        fun startUpload(username: String, password: String) {
            btn.isEnabled = false
            tvStatus.visibility = View.VISIBLE
            tvStatus.text = getString(R.string.upload_busy)
            lifecycleScope.launch {
                val result = viewModel.uploadToServer(profile, username, password)
                if (result is UploadResult.Success) {
                    prefs.edit().putLong(KEY_UPLOADED_AT, System.currentTimeMillis()).apply()
                    refreshLabel()
                }
                val main = uploadStatusText(result, str)
                tvStatus.text = uploadSkippedText(result, str)?.let { "$main\n$it" } ?: main
                Toast.makeText(this@SettingsActivity, main, Toast.LENGTH_LONG).show()
                btn.isEnabled = true
            }
        }

        btn.setOnClickListener {
            val view = layoutInflater.inflate(R.layout.dialog_server_login, null)
            val etUser = view.findViewById<EditText>(R.id.etServerUsername)
            val etPass = view.findViewById<EditText>(R.id.etServerPassword)
            AlertDialog.Builder(this)
                .setTitle(R.string.upload_login_title)
                .setView(view)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    startUpload(etUser.text.toString().trim(), etPass.text.toString())
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
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

    companion object {
        private const val TAG = "SettingsActivity"
        private const val KEY_UPLOADED_AT = "uploadedAt"
    }
}
