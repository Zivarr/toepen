package com.example.toepscoretracker.upload

import com.example.toepscoretracker.database.Game
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

data class PayloadResult(val json: JSONObject, val included: Int, val skipped: Int)

private const val NO_WINNER = "Niemand"
private val WHITESPACE = Regex("(?U)\\s+")

/** Like the server's Names::titleCase minus the capitalisation: collapse whitespace runs, then trim. */
private fun collapse(name: String): String = name.replace(WHITESPACE, " ").trim()

fun gameUuid(game: Game): String =
    UUID.nameUUIDFromBytes(
        ("${game.timestamp}|${game.playerNames.joinToString("|")}|" +
            "${game.finalScores.joinToString("|")}|${game.duration}").toByteArray(Charsets.UTF_8)
    ).toString()

fun toIsoTimestamp(timestamp: String, zone: TimeZone): String? {
    val parser = SimpleDateFormat("dd-MM-yy HH:mm:ss", Locale.US).apply {
        isLenient = false
        timeZone = zone
    }
    val date = try {
        parser.parse(timestamp)
    } catch (e: java.text.ParseException) {
        null
    } ?: return null
    val out = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).apply { timeZone = zone }
    return out.format(date)
}

fun buildSyncPayload(
    profile: String,
    games: List<Game>,
    zone: TimeZone = TimeZone.getDefault()
): PayloadResult {
    val array = JSONArray()
    var skipped = 0
    val seen = HashSet<String>()
    for (game in games) {
        val upload = toGameUpload(game, zone)
        if (upload == null || !seen.add(upload.getString("id"))) skipped++ else array.put(upload)
    }
    val json = JSONObject()
        .put("source", "android")
        .put("group_name", profile)
        .put("games", array)
    return PayloadResult(json, array.length(), skipped)
}

private fun toGameUpload(game: Game, zone: TimeZone): JSONObject? {
    val startedAt = toIsoTimestamp(game.timestamp, zone) ?: return null
    val names = game.playerNames.map { collapse(it) }
    if (names.size !in 2..8) return null
    if (names.any { it.isEmpty() || it.codePointCount(0, it.length) > 40 }) return null
    if (names.map { it.lowercase() }.toSet().size != names.size) return null
    if (game.maxPenaltyPoints !in 1..100) return null
    if (game.duration < 0) return null

    val rawWinner = collapse(game.winnerName)
    val endedEarly = rawWinner.isEmpty()
    val winner: String? = when {
        endedEarly || rawWinner.equals(NO_WINNER, ignoreCase = true) -> null
        else -> names.firstOrNull { it.equals(rawWinner, ignoreCase = true) } ?: return null
    }

    val players = JSONArray()
    names.forEachIndexed { i, name ->
        val score = (game.finalScores.getOrNull(i) ?: 0).coerceIn(0, game.maxPenaltyPoints)
        val boer = (game.boerCounts.getOrNull(i) ?: 0).coerceAtLeast(0)
        players.put(
            JSONObject().put("name", name).put("final_score", score).put("boer_count", boer)
        )
    }
    return JSONObject()
        .put("id", gameUuid(game))
        .put("started_at", startedAt)
        .put("duration_ms", game.duration)
        .put("max_penalty_points", game.maxPenaltyPoints)
        .put("ended_early", endedEarly)
        .put("winner", winner ?: JSONObject.NULL)
        .put("players", players)
}
