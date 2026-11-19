package com.example.toepscoretracker

import com.example.toepscoretracker.database.Game
import com.example.toepscoretracker.upload.ApiException
import com.example.toepscoretracker.upload.ServerUploader
import com.example.toepscoretracker.upload.UploadApi
import com.example.toepscoretracker.upload.UploadResult
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class ServerUploaderTest {
    private class FakeApi : UploadApi {
        var loginError: Exception? = null
        var createError: Exception? = null
        var logoutError: Exception? = null
        val calls = mutableListOf<String>()
        var deviceName: String? = null
        var sentPayload: JSONObject? = null

        override fun login(username: String, password: String, deviceName: String): String {
            calls += "login"
            this.deviceName = deviceName
            loginError?.let { throw it }
            return "tok"
        }

        override fun createSyncRequest(token: String, payload: JSONObject): Int {
            calls += "create:$token"
            sentPayload = payload
            createError?.let { throw it }
            return 42
        }

        override fun logout(token: String) {
            calls += "logout:$token"
            logoutError?.let { throw it }
        }
    }

    private val good = Game(1, listOf("Ravi", "Kees"), "Ravi", 10, 1000, "18-11-26 21:04:05", listOf(10, 4), listOf(0, 0))
    private val bad = good.copy(timestamp = "garbage")

    @Test fun `success returns request id and counts and logs out`() {
        val api = FakeApi()
        val r = ServerUploader(api).upload("Work", listOf(good, bad), "u", "p")
        assertEquals(UploadResult.Success(42, 1, 1), r)
        assertEquals(listOf("login", "create:tok", "logout:tok"), api.calls)
        assertEquals("Android", api.deviceName)
    }

    @Test fun `wrong credentials maps to WrongCredentials and sends nothing`() {
        val api = FakeApi().apply { loginError = ApiException(401, "invalid_credentials", "x") }
        val r = ServerUploader(api).upload("Work", listOf(good), "u", "p")
        assertEquals(UploadResult.WrongCredentials, r)
        assertEquals(listOf("login"), api.calls)
    }

    @Test fun `429 maps to TooManyAttempts`() {
        val api = FakeApi().apply { loginError = ApiException(429, "too_many_attempts", "x") }
        assertEquals(UploadResult.TooManyAttempts, ServerUploader(api).upload("Work", listOf(good), "u", "p"))
    }

    @Test fun `no valid games returns NoGames without login`() {
        val api = FakeApi()
        assertEquals(UploadResult.NoGames, ServerUploader(api).upload("Work", listOf(bad), "u", "p"))
        assertTrue(api.calls.isEmpty())
    }

    @Test fun `logout is called when create request fails`() {
        val api = FakeApi().apply { createError = ApiException(422, "validation", "Ongeldige game") }
        val r = ServerUploader(api).upload("Work", listOf(good), "u", "p")
        assertEquals(UploadResult.Failed("Ongeldige game"), r)
        assertEquals(listOf("login", "create:tok", "logout:tok"), api.calls)
    }

    @Test fun `failing logout does not change the result`() {
        val api = FakeApi().apply { logoutError = IOException("boom") }
        assertEquals(UploadResult.Success(42, 1, 0), ServerUploader(api).upload("Work", listOf(good), "u", "p"))
    }

    @Test fun `network error maps to Failed with Dutch message`() {
        val api = FakeApi().apply { loginError = IOException("down") }
        assertEquals(
            UploadResult.Failed("Geen verbinding met de server"),
            ServerUploader(api).upload("Work", listOf(good), "u", "p")
        )
    }
}
