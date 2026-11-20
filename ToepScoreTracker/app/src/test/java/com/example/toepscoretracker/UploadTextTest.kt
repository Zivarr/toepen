package com.example.toepscoretracker

import com.example.toepscoretracker.upload.UploadResult
import com.example.toepscoretracker.upload.uploadButtonLabel
import com.example.toepscoretracker.upload.uploadSkippedText
import com.example.toepscoretracker.upload.uploadStatusText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.TimeZone

class UploadTextTest {
    private val str: (Int, List<Any>) -> String = { id, args -> "$id:${args.joinToString(",")}" }

    @Test fun successUsesIncludedCount() {
        assertEquals("${R.string.upload_success}:3", uploadStatusText(UploadResult.Success(1, 3, 0), str))
    }

    @Test fun skippedLineOnlyWhenSkipped() {
        assertNull(uploadSkippedText(UploadResult.Success(1, 3, 0), str))
        assertNull(uploadSkippedText(UploadResult.NoGames, str))
        assertEquals("${R.string.upload_skipped}:2", uploadSkippedText(UploadResult.Success(1, 3, 2), str))
    }

    @Test fun errorResultsMapToTheirStrings() {
        assertEquals("${R.string.upload_wrong_credentials}:", uploadStatusText(UploadResult.WrongCredentials, str))
        assertEquals("${R.string.upload_too_many}:", uploadStatusText(UploadResult.TooManyAttempts, str))
        assertEquals("${R.string.upload_no_games}:", uploadStatusText(UploadResult.NoGames, str))
        assertEquals("${R.string.upload_failed}:boom", uploadStatusText(UploadResult.Failed("boom"), str))
    }

    @Test fun buttonLabelWithoutAndWithTimestamp() {
        assertEquals("${R.string.upload_server}:", uploadButtonLabel(null, str))
        // 2026-01-02 03:04:00 UTC
        val ts = 1767323040000L
        assertEquals(
            "${R.string.upload_server_again}:02-01-2026 03:04",
            uploadButtonLabel(ts, str, TimeZone.getTimeZone("UTC"))
        )
    }
}
