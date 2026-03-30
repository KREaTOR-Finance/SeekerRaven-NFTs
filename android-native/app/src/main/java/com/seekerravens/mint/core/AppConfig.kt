package com.seekerravens.mint.core

import android.content.Context
import android.net.Uri
import com.google.gson.Gson
import java.net.URI

class AppConfigLoader(
    private val context: Context,
    private val gson: Gson
) {
    fun load(assetName: String = "drop-config.json"): AppConfig =
        context.assets.open(assetName).use { input ->
            gson.fromJson(input.reader(), AppConfig::class.java)
        }
}

data class AppConfig(
    val cluster: String,
    val clusterFlavor: String,
    val backendBaseUrl: String,
    val identityUri: String,
    val iconUri: String,
    val siwsDomain: String,
    val siwsStatement: String,
    val privacyPolicyUrl: String,
    val supportUrl: String,
    val termsOfUseUrl: String,
    val collectionName: String,
    val rpcPrimary: String,
    val rpcFallback: String,
    val candyMachine: String,
    val candyGuard: String,
    val collectionMint: String,
    val collectionUpdateAuthority: String,
    val skrMint: String,
    val proceedsWallet: String,
    val proceedsSkrAta: String,
    val mintPriceSkrBaseUnits: String,
    val allowlistStartIso: String,
    val publicStartIso: String,
    val allowlistPerWallet: Int,
    val publicPerWallet: Int,
    val botTaxLamports: Int,
    val merkleRootBase58: String,
    val allowlistWalletCount: Int,
    val policyAnnouncement: String
)

fun AppConfig.resolvedBackendBaseUrl(): String = ensureTrailingSlash(resolveUrl(identityUri, backendBaseUrl))

fun AppConfig.resolvedIdentityUri(): Uri = Uri.parse(resolveUrl(identityUri, identityUri))

fun AppConfig.resolvedIconUri(): Uri = Uri.parse(resolveUrl(identityUri, iconUri))

fun AppConfig.activeRpcUrl(): String {
    return listOf(rpcPrimary, rpcFallback)
        .firstOrNull { it.isNotBlank() && !it.contains("YOUR_KEY") }
        ?: "https://api.devnet.solana.com"
}

internal fun resolveUrl(base: String, value: String): String {
    if (value.startsWith("http://") || value.startsWith("https://")) {
        return value
    }

    return runCatching {
        URI(base).resolve(value).toString()
    }.getOrElse {
        value
    }
}

internal fun ensureTrailingSlash(value: String): String =
    if (value.endsWith('/')) value else "$value/"
