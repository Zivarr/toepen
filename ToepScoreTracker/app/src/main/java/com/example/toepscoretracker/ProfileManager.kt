package com.example.toepscoretracker

import android.content.Context

object ProfileManager {
    private const val PREFS_NAME = "ToepenProfiles"
    private const val KEY_PROFILES = "profile_list"

    fun getProfiles(context: Context): List<String> {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_PROFILES, null) ?: return listOf("Vrienden")
        return raw.split("|").filter { it.isNotEmpty() }
    }

    fun addProfile(context: Context, name: String) {
        val current = getProfiles(context).toMutableList()
        if (!current.any { it.equals(name, ignoreCase = true) }) {
            current.add(name)
            saveProfiles(context, current)
        }
    }

    fun removeProfile(context: Context, name: String) {
        val current = getProfiles(context).toMutableList()
        current.removeIf { it.equals(name, ignoreCase = true) }
        saveProfiles(context, current)
    }

    fun renameProfile(context: Context, oldName: String, newName: String) {
        val current = getProfiles(context).toMutableList()
        val idx = current.indexOfFirst { it.equals(oldName, ignoreCase = true) }
        if (idx < 0) return
        current[idx] = newName
        saveProfiles(context, current)

        val oldPrefs = context.getSharedPreferences("ToepenSettings_$oldName", Context.MODE_PRIVATE)
        val newPrefs = context.getSharedPreferences("ToepenSettings_$newName", Context.MODE_PRIVATE)
        newPrefs.edit().apply {
            oldPrefs.all.forEach { (k, v) ->
                when (v) {
                    is Int -> putInt(k, v)
                    is Boolean -> putBoolean(k, v)
                    is String -> putString(k, v)
                    else -> Unit
                }
            }
        }.apply()
        oldPrefs.edit().clear().apply()
        context.deleteSharedPreferences("ToepenSettings_$oldName")

        val globalPrefs = context.getSharedPreferences("ToepenSettings", Context.MODE_PRIVATE)
        if (globalPrefs.getString("lastProfile", null) == oldName) {
            globalPrefs.edit().putString("lastProfile", newName).apply()
        }
    }

    fun dbNameFor(profile: String): String =
        "toepen_database_${profile.trim().lowercase().replace(" ", "_")}"

    fun runMigrationIfNeeded(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.contains(KEY_PROFILES)) return

        val detected = mutableListOf<String>()
        if (context.getDatabasePath("toepen_database_work").exists()) detected.add("Work")
        if (context.getDatabasePath("toepen_database_kvw").exists()) detected.add("KVW")
        if (detected.isEmpty()) detected.add("Vrienden")

        saveProfiles(context, detected)
    }

    private fun saveProfiles(context: Context, profiles: List<String>) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PROFILES, profiles.joinToString("|"))
            .apply()
    }
}
