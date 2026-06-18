package com.example.toepscoretracker

import android.app.AlertDialog
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.toepscoretracker.database.AppDatabase
import java.io.File

class ManageProfilesActivity : AppCompatActivity() {

    private lateinit var llProfileList: LinearLayout
    private lateinit var etNewProfileName: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_manage_profiles)

        llProfileList = findViewById(R.id.llProfileList)
        etNewProfileName = findViewById(R.id.etNewProfileName)

        renderProfileList()

        findViewById<Button>(R.id.btnAddProfile).setOnClickListener { addProfile() }
        findViewById<Button>(R.id.btnBackFromManage).setOnClickListener { finish() }
    }

    private fun renderProfileList() {
        llProfileList.removeAllViews()
        val profiles = ProfileManager.getProfiles(this)

        for (name in profiles) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 0, 0, 12) }
            }

            val nameView = TextView(this).apply {
                text = name
                textSize = 18f
                setTextColor(resources.getColor(R.color.white, theme))
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
                ).apply { gravity = Gravity.CENTER_VERTICAL }
            }

            val renameBtn = Button(this).apply {
                text = getString(R.string.rename_profile)
                setOnClickListener { showRenameDialog(name) }
            }

            val deleteBtn = Button(this).apply {
                text = getString(R.string.delete_profile)
                isEnabled = profiles.size > 1
                setOnClickListener { confirmDelete(name) }
            }

            row.addView(nameView)
            row.addView(renameBtn)
            row.addView(deleteBtn)
            llProfileList.addView(row)
        }
    }

    private fun addProfile() {
        val name = etNewProfileName.text.toString().trim()
        when {
            name.isEmpty() ->
                Toast.makeText(this, getString(R.string.profile_name_empty), Toast.LENGTH_SHORT).show()
            name.length > 30 ->
                Toast.makeText(this, getString(R.string.profile_name_too_long), Toast.LENGTH_SHORT).show()
            ProfileManager.getProfiles(this).any { it.equals(name, ignoreCase = true) } ->
                Toast.makeText(this, getString(R.string.profile_already_exists), Toast.LENGTH_SHORT).show()
            else -> {
                ProfileManager.addProfile(this, name)
                etNewProfileName.text.clear()
                renderProfileList()
            }
        }
    }

    private fun showRenameDialog(currentName: String) {
        val input = EditText(this).apply {
            setText(currentName)
            selectAll()
            hint = getString(R.string.rename_dialog_hint)
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.rename_profile))
            .setView(input)
            .setPositiveButton(R.string.yes) { _, _ ->
                val newName = input.text.toString().trim()
                when {
                    newName.isEmpty() ->
                        Toast.makeText(this, getString(R.string.rename_profile_empty), Toast.LENGTH_SHORT).show()
                    newName.length > 30 ->
                        Toast.makeText(this, getString(R.string.profile_name_too_long), Toast.LENGTH_SHORT).show()
                    newName.equals(currentName, ignoreCase = true) -> Unit
                    ProfileManager.getProfiles(this).any { it.equals(newName, ignoreCase = true) } ->
                        Toast.makeText(this, getString(R.string.rename_profile_duplicate), Toast.LENGTH_SHORT).show()
                    else -> executeRename(currentName, newName)
                }
            }
            .setNegativeButton(R.string.no, null)
            .show()
    }

    private fun executeRename(oldName: String, newName: String) {
        AppDatabase.renameDatabase(this, oldName, newName)
        ProfileManager.renameProfile(this, oldName, newName)
        renderProfileList()
    }

    private fun confirmDelete(name: String) {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.delete_profile))
            .setMessage(getString(R.string.confirm_delete_profile, name))
            .setPositiveButton(R.string.yes) { _, _ -> deleteProfile(name) }
            .setNegativeButton(R.string.no, null)
            .show()
    }

    private fun deleteProfile(name: String) {
        AppDatabase.closeAndRemove(name)

        val dbFile = getDatabasePath(ProfileManager.dbNameFor(name))
        dbFile.delete()
        File("${dbFile.absolutePath}-wal").delete()
        File("${dbFile.absolutePath}-shm").delete()

        getSharedPreferences("ToepenSettings_$name", MODE_PRIVATE).edit().clear().apply()
        deleteSharedPreferences("ToepenSettings_$name")

        ProfileManager.removeProfile(this, name)
        renderProfileList()
    }
}
