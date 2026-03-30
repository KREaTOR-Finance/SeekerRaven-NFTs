package com.seekerravens.mint.core

import android.content.Context
import com.google.gson.GsonBuilder
import com.seekerravens.mint.data.CacheStore
import com.seekerravens.mint.data.MobileApiService
import com.seekerravens.mint.data.MobileRepository
import com.seekerravens.mint.data.SecureSessionStore
import com.seekerravens.mint.data.SolanaRpcClient
import com.seekerravens.mint.wallet.SolanaWalletManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class AppContainer(context: Context) {
    private val gson = GsonBuilder().disableHtmlEscaping().create()
    private val appConfig = AppConfigLoader(context, gson).load()
    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
        )
        .build()
    private val api = Retrofit.Builder()
        .baseUrl(appConfig.resolvedBackendBaseUrl())
        .client(httpClient)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(MobileApiService::class.java)
    private val sessionStore = SecureSessionStore(context)
    private val cacheStore = CacheStore(context, gson)
    private val rpcClient = SolanaRpcClient(httpClient, gson, appConfig)

    val repository = MobileRepository(appConfig, api, sessionStore, cacheStore, rpcClient)
    val walletManager = SolanaWalletManager(appConfig, sessionStore)
}
