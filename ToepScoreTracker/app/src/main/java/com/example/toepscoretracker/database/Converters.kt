package com.example.toepscoretracker.database

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromString(value: String): List<String> =
        if (value.isBlank()) emptyList() else value.split("|")

    @TypeConverter
    fun fromList(list: List<String>): String = list.joinToString("|")
}
