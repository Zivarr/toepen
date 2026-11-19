package com.example.toepscoretracker.upload

import com.example.toepscoretracker.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Resolves a string resource with format args; lets the text logic be tested without Android. */
typealias StringProvider = (resId: Int, args: List<Any>) -> String

/** Main status line for an upload result. */
fun uploadStatusText(result: UploadResult, str: StringProvider): String = when (result) {
    is UploadResult.Success -> str(R.string.upload_success, listOf(result.included))
    UploadResult.WrongCredentials -> str(R.string.upload_wrong_credentials, emptyList())
    UploadResult.TooManyAttempts -> str(R.string.upload_too_many, emptyList())
    UploadResult.NoGames -> str(R.string.upload_no_games, emptyList())
    is UploadResult.Failed -> str(R.string.upload_failed, listOf(result.message))
}

/** Extra line shown under a successful upload when games were skipped, else null. */
fun uploadSkippedText(result: UploadResult, str: StringProvider): String? =
    if (result is UploadResult.Success && result.skipped > 0)
        str(R.string.upload_skipped, listOf(result.skipped))
    else null

/** Button label: "again" variant with date when a previous upload timestamp (epoch ms) exists. */
fun uploadButtonLabel(
    uploadedAt: Long?,
    str: StringProvider,
    timeZone: TimeZone = TimeZone.getDefault()
): String {
    if (uploadedAt == null) return str(R.string.upload_server, emptyList())
    val fmt = SimpleDateFormat("dd-MM-yyyy HH:mm", Locale.getDefault()).apply { this.timeZone = timeZone }
    return str(R.string.upload_server_again, listOf(fmt.format(Date(uploadedAt))))
}
