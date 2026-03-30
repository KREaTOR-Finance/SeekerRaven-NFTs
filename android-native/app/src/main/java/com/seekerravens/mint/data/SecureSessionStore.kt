package com.seekerravens.mint.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureSessionStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val prefs = EncryptedSharedPreferences.create(
        context,
        FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun readSession(): SecureSession? {
        val wallet = prefs.getString(KEY_WALLET, null) ?: return null
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return null
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
        val expiresAt = prefs.getString(KEY_EXPIRES_AT, null) ?: return null
        val mwaAuthToken = prefs.getString(KEY_MWA_AUTH_TOKEN, null)
        return SecureSession(wallet, accessToken, refreshToken, expiresAt, mwaAuthToken)
    }

    fun writeSession(session: SecureSession) {
        prefs.edit()
            .putString(KEY_WALLET, session.wallet)
            .putString(KEY_ACCESS_TOKEN, session.accessToken)
            .putString(KEY_REFRESH_TOKEN, session.refreshToken)
            .putString(KEY_EXPIRES_AT, session.expiresAt)
            .putString(KEY_MWA_AUTH_TOKEN, session.mwaAuthToken)
            .apply()
    }

    fun updateMwaAuthToken(authToken: String?) {
        prefs.edit().putString(KEY_MWA_AUTH_TOKEN, authToken).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val FILE_NAME = "seeker_ravens_session"
        private const val KEY_WALLET = "wallet"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_MWA_AUTH_TOKEN = "mwa_auth_token"
    }
}
