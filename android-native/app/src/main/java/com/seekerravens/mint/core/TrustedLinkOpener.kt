package com.seekerravens.mint.core

import android.content.Context
import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import com.seekerravens.mint.data.BootstrapResponse
import java.net.URI
import java.util.Locale

object TrustedLinkOpener {
    fun open(
        context: Context,
        url: String,
        appConfig: AppConfig,
        bootstrap: BootstrapResponse?
    ): Boolean {
        if (!canOpen(url, appConfig, bootstrap)) {
            return false
        }

        val resolved = resolveUrl(appConfig.identityUri, url)
        val uri = android.net.Uri.parse(resolved)
        return runCatching {
            CustomTabsIntent.Builder().build().launchUrl(context, uri)
            true
        }.getOrElse {
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                true
            }.getOrElse {
                false
            }
        }
    }

    fun canOpen(url: String, appConfig: AppConfig, bootstrap: BootstrapResponse?): Boolean {
        val candidateHost = extractHost(resolveUrl(appConfig.identityUri, url)) ?: return false
        return allowedHosts(appConfig, bootstrap).contains(candidateHost)
    }

    private fun allowedHosts(appConfig: AppConfig, bootstrap: BootstrapResponse?): Set<String> {
        val hosts = mutableSetOf("explorer.solana.com", "wallets.solanamobile.com")
        listOf(
            appConfig.identityUri,
            appConfig.backendBaseUrl,
            appConfig.privacyPolicyUrl,
            appConfig.supportUrl,
            appConfig.termsOfUseUrl,
            bootstrap?.links?.backendBaseUrl,
            bootstrap?.links?.privacyPolicyUrl,
            bootstrap?.links?.supportUrl,
            bootstrap?.links?.termsOfUseUrl
        ).filterNotNull().mapNotNull { extractHost(resolveUrl(appConfig.identityUri, it)) }.forEach(hosts::add)
        return hosts
    }

    private fun extractHost(value: String): String? = runCatching {
        URI(value).host?.lowercase(Locale.US)
    }.getOrNull()
}
