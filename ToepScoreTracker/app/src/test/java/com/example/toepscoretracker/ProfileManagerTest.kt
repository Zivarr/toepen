package com.example.toepscoretracker

import android.content.SharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Test
import java.lang.reflect.Proxy

class ProfileManagerTest {
    @Test fun `copyPrefs keeps long float and string set values`() {
        val calls = mutableListOf<String>()
        val editor = Proxy.newProxyInstance(
            javaClass.classLoader, arrayOf(SharedPreferences.Editor::class.java)
        ) { proxy, method, args ->
            calls += "${method.name}:${args?.joinToString(",")}"
            proxy
        } as SharedPreferences.Editor

        copyPrefs(
            mapOf("a" to 1, "b" to true, "c" to "x", "uploadedAt" to 123L, "f" to 1.5f, "s" to setOf("q")),
            editor
        )

        assertEquals(
            listOf("putInt:a,1", "putBoolean:b,true", "putString:c,x", "putLong:uploadedAt,123",
                "putFloat:f,1.5", "putStringSet:s,[q]"),
            calls
        )
    }
}
