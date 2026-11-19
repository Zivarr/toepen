package com.example.toepscoretracker

import com.example.toepscoretracker.upload.UploadResult
import com.example.toepscoretracker.viewmodel.SettingsViewModel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsViewModelTest {
    @Test fun `upload maps repository exceptions to Failed`() = runBlocking {
        val vm = SettingsViewModel({ throw IllegalStateException("corrupt") }, { emptyList() })
        val result = vm.uploadToServer("Work", "u", "p")
        assertTrue(result is UploadResult.Failed)
    }
}
