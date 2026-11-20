package com.example.toepscoretracker

import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.upload.buildSyncPayload
import com.example.toepscoretracker.upload.gameUuid
import com.example.toepscoretracker.upload.toIsoTimestamp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class SyncPayloadTest {
    private val ams = TimeZone.getTimeZone("Europe/Amsterdam")

    private fun game(
        players: List<String> = listOf("Ravi", "Kees"),
        winner: String = "Ravi",
        max: Int = 10,
        duration: Long = 120_000,
        ts: String = "18-11-26 21:04:05",
        scores: List<Int> = listOf(10, 4),
        boers: List<Int> = listOf(1, 0)
    ) = Game(1, players, winner, max, duration, ts, scores, boers)

    private fun firstGame(g: Game) =
        buildSyncPayload("Work", listOf(g), ams).json.getJSONArray("games").getJSONObject(0)

    @Test fun `iso timestamp uses local offset`() {
        assertEquals("2026-11-18T21:04:05+01:00", toIsoTimestamp("18-11-26 21:04:05", ams))
    }

    @Test fun `unparseable timestamp returns null`() {
        assertNull(toIsoTimestamp("2026-11-18 21:04", ams))
    }

    @Test fun `uuid is stable for the same game and independent of the profile name`() {
        val g = game()
        assertEquals(gameUuid(g), gameUuid(g.copy()))
        val a = buildSyncPayload("Work", listOf(g), ams).json.getJSONArray("games").getJSONObject(0)
        val b = buildSyncPayload("Renamed", listOf(g), ams).json.getJSONArray("games").getJSONObject(0)
        assertEquals(a.getString("id"), b.getString("id"))
        assertEquals(36, gameUuid(g).length)
    }

    @Test fun `different games get different uuids`() {
        assertNotEquals(gameUuid(game()), gameUuid(game(ts = "18-11-26 21:04:06")))
        assertNotEquals(gameUuid(game()), gameUuid(game(scores = listOf(10, 5))))
    }

    @Test fun `identical rows are sent once and counted as skipped`() {
        val r = buildSyncPayload("Work", listOf(game(), game()), ams)
        assertEquals(1, r.included)
        assertEquals(1, r.skipped)
        assertEquals(1, r.json.getJSONArray("games").length())
    }

    @Test fun `empty winner becomes ended early`() {
        val j = firstGame(game(winner = ""))
        assertTrue(j.isNull("winner"))
        assertTrue(j.getBoolean("ended_early"))
    }

    @Test fun `Niemand becomes no winner not ended early`() {
        val j = firstGame(game(winner = "Niemand"))
        assertTrue(j.isNull("winner"))
        assertFalse(j.getBoolean("ended_early"))
    }

    @Test fun `winner matched case-insensitively`() {
        val j = firstGame(game(winner = "ravi"))
        assertEquals("Ravi", j.getString("winner"))
        assertFalse(j.getBoolean("ended_early"))
    }

    @Test fun `missing scores and boer counts become zero`() {
        val p = firstGame(game(scores = emptyList(), boers = emptyList())).getJSONArray("players")
        for (i in 0 until 2) {
            assertEquals(0, p.getJSONObject(i).getInt("final_score"))
            assertEquals(0, p.getJSONObject(i).getInt("boer_count"))
        }
    }

    @Test fun `scores above max are capped`() {
        val p = firstGame(game(scores = listOf(15, -3))).getJSONArray("players")
        assertEquals(10, p.getJSONObject(0).getInt("final_score"))
        assertEquals(0, p.getJSONObject(1).getInt("final_score"))
    }

    @Test fun `invalid games are skipped and counted`() {
        val nine = game(players = (1..9).map { "P$it" }, winner = "P1", scores = emptyList(), boers = emptyList())
        val r = buildSyncPayload("Work", listOf(game(), nine, game(ts = "bad")), ams)
        assertEquals(1, r.included)
        assertEquals(2, r.skipped)
        assertEquals(1, r.json.getJSONArray("games").length())
    }

    @Test fun `other server rules are prechecked`() {
        val bad = listOf(
            game(players = listOf("Ravi", "ravi")),
            game(players = listOf("Ravi", " ")),
            game(players = listOf("Ravi", "x".repeat(41))),
            game(max = 0), game(max = 101),
            game(winner = "Zed"),
            game(duration = -1)
        )
        val r = buildSyncPayload("Work", bad, ams)
        assertEquals(0, r.included)
        assertEquals(bad.size, r.skipped)
    }

    @Test fun `payload has source group name and seat order`() {
        val r = buildSyncPayload("KVW", listOf(game(players = listOf(" Kees ", "Ravi"), winner = "kees")), ams)
        assertEquals("android", r.json.getString("source"))
        assertEquals("KVW", r.json.getString("group_name"))
        val g = r.json.getJSONArray("games").getJSONObject(0)
        val p = g.getJSONArray("players")
        assertEquals("Kees", p.getJSONObject(0).getString("name"))
        assertEquals("Ravi", p.getJSONObject(1).getString("name"))
        assertEquals("Kees", g.getString("winner"))
        assertEquals("2026-11-18T21:04:05+01:00", g.getString("started_at"))
        assertEquals(120000L, g.getLong("duration_ms"))
        assertEquals(10, g.getInt("max_penalty_points"))
        assertFalse(g.has("group_id"))
    }

    @Test fun `whitespace runs are collapsed before duplicate check`() {
        val r = buildSyncPayload("Work", listOf(game(players = listOf("Ravi  K", "Ravi K"), winner = "")), ams)
        assertEquals(0, r.included)
        assertEquals(1, r.skipped)
    }

    @Test fun `winner matched after whitespace collapse and sent as collapsed name`() {
        val j = firstGame(game(players = listOf("Ravi  K", "Kees"), winner = "ravi k"))
        assertEquals("Ravi K", j.getString("winner"))
        assertEquals("Ravi K", j.getJSONArray("players").getJSONObject(0).getString("name"))
    }
}
