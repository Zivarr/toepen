package com.example.toepscoretracker

import com.example.toepscoretracker.util.DurationFormatter
import org.junit.Assert.assertEquals
import org.junit.Test

class DurationFormatterTest {

    @Test
    fun `format zero returns 00_00_00`() {
        assertEquals("00:00:00", DurationFormatter.format(0L))
    }

    @Test
    fun `format 59 seconds`() {
        assertEquals("00:00:59", DurationFormatter.format(59_000L))
    }

    @Test
    fun `format 1 hour 1 minute 1 second`() {
        assertEquals("01:01:01", DurationFormatter.format(3_661_000L))
    }

    @Test
    fun `format 2 hours`() {
        assertEquals("02:00:00", DurationFormatter.format(7_200_000L))
    }
}
