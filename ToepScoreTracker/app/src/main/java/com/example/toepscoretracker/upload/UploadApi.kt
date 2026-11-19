package com.example.toepscoretracker.upload

import org.json.JSONObject

class ApiException(val status: Int, val code: String, message: String) : Exception(message)

/** The server answered, but not with something we can read (e.g. a captive portal page). */
class UnexpectedResponseException(cause: Throwable? = null) :
    java.io.IOException("Onverwacht antwoord van de server", cause)

interface UploadApi {
    /** Returns the token; throws ApiException / IOException. */
    fun login(username: String, password: String, deviceName: String): String

    /** Returns the new request id. */
    fun createSyncRequest(token: String, payload: JSONObject): Int

    fun logout(token: String)
}
