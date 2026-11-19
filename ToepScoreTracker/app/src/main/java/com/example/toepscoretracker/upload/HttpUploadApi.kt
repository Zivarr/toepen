package com.example.toepscoretracker.upload

import com.example.toepscoretracker.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class HttpUploadApi(private val baseUrl: String = BuildConfig.API_BASE_URL) : UploadApi {

    override fun login(username: String, password: String, deviceName: String): String {
        val body = JSONObject()
            .put("username", username)
            .put("password", password)
            .put("device_name", deviceName)
        val text = call("/login", null, body)
        return parse { JSONObject(text).getString("token") }
    }

    override fun createSyncRequest(token: String, payload: JSONObject): Int {
        val text = call("/sync-requests", token, payload)
        return parse { JSONObject(text).getJSONObject("request").getInt("id") }
    }

    override fun logout(token: String) {
        call("/logout", token, null)
    }

    private fun <T> parse(block: () -> T): T =
        try {
            block()
        } catch (e: org.json.JSONException) {
            throw UnexpectedResponseException(e)
        }

    private fun call(path: String, token: String?, body: JSONObject?): String {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token != null) {
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("X-Auth-Token", token)
            }
            conn.doOutput = true
            val bytes = (body?.toString() ?: "{}").toByteArray(Charsets.UTF_8)
            conn.outputStream.use { it.write(bytes) }

            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val (code, message) = parseError(text)
                throw ApiException(status, code, message ?: "Serverfout ($status)")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun parseError(text: String): Pair<String, String?> =
        try {
            val j = JSONObject(text)
            j.optString("error", "") to j.optString("message", "").ifEmpty { null }
        } catch (e: Exception) {
            "" to null
        }
}
