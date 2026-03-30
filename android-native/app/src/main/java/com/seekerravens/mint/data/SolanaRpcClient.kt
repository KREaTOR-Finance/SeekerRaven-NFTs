package com.seekerravens.mint.data

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName
import com.seekerravens.mint.core.AppConfig
import com.seekerravens.mint.core.activeRpcUrl
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class SolanaRpcClient(
    private val httpClient: OkHttpClient,
    private val gson: Gson,
    private val appConfig: AppConfig
) {
    suspend fun awaitConfirmation(
        signature: String,
        maxAttempts: Int = 15,
        delayMs: Long = 2_000L
    ): Long? {
        repeat(maxAttempts) {
            val status = getSignatureStatus(signature)
            if (status?.err != null) {
                throw IOException("Mint transaction failed on-chain.")
            }
            if (status?.confirmationStatus == "confirmed" || status?.confirmationStatus == "finalized") {
                return status.slot
            }
            delay(delayMs)
        }

        return null
    }

    private suspend fun getSignatureStatus(signature: String): SignatureStatus? = withContext(Dispatchers.IO) {
        val payload = gson.toJson(
            mapOf(
                "jsonrpc" to "2.0",
                "id" to 1,
                "method" to "getSignatureStatuses",
                "params" to listOf(
                    listOf(signature),
                    mapOf("searchTransactionHistory" to true)
                )
            )
        )
        val request = Request.Builder()
            .url(appConfig.activeRpcUrl())
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("RPC status lookup failed with HTTP ${response.code}.")
            }

            val body = response.body?.string() ?: return@withContext null
            val parsed = gson.fromJson(body, SignatureStatusesEnvelope::class.java)
            parsed.result?.value?.firstOrNull()
        }
    }

    private data class SignatureStatusesEnvelope(
        val result: SignatureStatusesResult?
    )

    private data class SignatureStatusesResult(
        val value: List<SignatureStatus?>
    )

    private data class SignatureStatus(
        val slot: Long?,
        val confirmations: Long?,
        @SerializedName("confirmationStatus") val confirmationStatus: String?,
        val err: JsonElement?
    )
}
