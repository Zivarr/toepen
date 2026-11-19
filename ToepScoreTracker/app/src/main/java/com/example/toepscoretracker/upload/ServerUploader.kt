package com.example.toepscoretracker.upload

import com.example.toepscoretracker.database.Game
import java.io.IOException

sealed class UploadResult {
    data class Success(val requestId: Int, val included: Int, val skipped: Int) : UploadResult()
    object WrongCredentials : UploadResult()
    object TooManyAttempts : UploadResult()
    object NoGames : UploadResult()
    data class Failed(val message: String) : UploadResult()
}

class ServerUploader(private val api: UploadApi) {

    /** Blocking; call on Dispatchers.IO. */
    fun upload(profile: String, games: List<Game>, username: String, password: String): UploadResult {
        val payload = buildSyncPayload(profile, games)
        if (payload.included == 0) return UploadResult.NoGames

        return try {
            val token = api.login(username, password, DEVICE_NAME)
            try {
                val id = api.createSyncRequest(token, payload.json)
                UploadResult.Success(id, payload.included, payload.skipped)
            } finally {
                try {
                    api.logout(token)
                } catch (e: Exception) {
                    // A failing logout must not change the result.
                }
            }
        } catch (e: ApiException) {
            when {
                e.status == 429 -> UploadResult.TooManyAttempts
                e.status == 401 && e.code == "invalid_credentials" -> UploadResult.WrongCredentials
                else -> UploadResult.Failed(e.message?.takeIf { it.isNotBlank() } ?: GENERIC_ERROR)
            }
        } catch (e: UnexpectedResponseException) {
            UploadResult.Failed(e.message ?: GENERIC_ERROR)
        } catch (e: IOException) {
            UploadResult.Failed(NO_CONNECTION)
        } catch (e: RuntimeException) {
            UploadResult.Failed(GENERIC_ERROR)
        }
    }

    private companion object {
        const val DEVICE_NAME = "Android"
        const val NO_CONNECTION = "Geen verbinding met de server"
        const val GENERIC_ERROR = "Er ging iets mis bij het versturen"
    }
}
