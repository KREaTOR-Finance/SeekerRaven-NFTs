package com.seekerravens.mint.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import kotlinx.coroutines.flow.first

private val Context.mobileCacheDataStore by preferencesDataStore(name = "seeker_ravens_cache")

class CacheStore(
    private val context: Context,
    private val gson: Gson
) {
    suspend fun readBootstrap(): BootstrapResponse? = read(BOOTSTRAP_JSON, BootstrapResponse::class.java)

    suspend fun saveBootstrap(value: BootstrapResponse) {
        write(BOOTSTRAP_JSON, value)
    }

    suspend fun readProfile(): MobileProfile? = read(PROFILE_JSON, MobileProfile::class.java)

    suspend fun saveProfile(value: MobileProfile) {
        write(PROFILE_JSON, value)
    }

    private suspend fun <T> read(key: Preferences.Key<String>, clazz: Class<T>): T? {
        val json = context.mobileCacheDataStore.data.first()[key] ?: return null
        return runCatching {
            gson.fromJson(json, clazz)
        }.getOrNull()
    }

    private suspend fun <T> write(key: Preferences.Key<String>, value: T) {
        context.mobileCacheDataStore.edit { prefs ->
            prefs[key] = gson.toJson(value)
        }
    }

    companion object {
        private val BOOTSTRAP_JSON = stringPreferencesKey("bootstrap_json")
        private val PROFILE_JSON = stringPreferencesKey("profile_json")
    }
}
