package com.seekerravens.mint.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface MobileApiService {
    @GET("api/mobile/bootstrap")
    suspend fun getBootstrap(): BootstrapResponse

    @POST("api/mobile/auth/siws/challenge")
    suspend fun createChallenge(): ChallengeEnvelope

    @POST("api/mobile/auth/siws/verify")
    suspend fun verifySiws(@Body request: VerifySiwsRequest): SessionEnvelope

    @POST("api/mobile/auth/refresh")
    suspend fun refreshSession(@Body request: RefreshRequest): SessionEnvelope

    @DELETE("api/mobile/auth/session")
    suspend fun revokeSession(@Header("Authorization") bearerToken: String): WalletEnvelope

    @GET("api/mobile/me")
    suspend fun getProfile(@Header("Authorization") bearerToken: String): ProfileEnvelope

    @DELETE("api/mobile/me")
    suspend fun deleteAccount(@Header("Authorization") bearerToken: String): DeleteAccountEnvelope

    @POST("api/mobile/mint/prepare")
    suspend fun prepareMint(
        @Header("Authorization") bearerToken: String,
        @Body request: PrepareMintRequest
    ): PrepareMintEnvelope

    @POST("api/mobile/mint/confirm")
    suspend fun confirmMint(
        @Header("Authorization") bearerToken: String,
        @Body request: ConfirmMintRequest
    ): ConfirmMintEnvelope
}
