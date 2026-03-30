package com.seekerravens.mint.data

import com.seekerravens.mint.core.AppConfig
import retrofit2.HttpException

class MobileRepository(
    private val appConfig: AppConfig,
    private val api: MobileApiService,
    private val sessionStore: SecureSessionStore,
    private val cacheStore: CacheStore,
    private val rpcClient: SolanaRpcClient
) {
    fun appConfig(): AppConfig = appConfig

    fun currentSession(): SecureSession? = sessionStore.readSession()

    fun updateMwaAuthToken(authToken: String?) {
        sessionStore.updateMwaAuthToken(authToken)
    }

    fun clearLocalSession() {
        sessionStore.clear()
    }

    suspend fun loadBootstrap(): CachedValue<BootstrapResponse> {
        return try {
            val response = api.getBootstrap()
            cacheStore.saveBootstrap(response)
            CachedValue(response, false)
        } catch (error: Throwable) {
            val cached = cacheStore.readBootstrap() ?: throw error
            CachedValue(cached, true)
        }
    }

    suspend fun restoreSession(): CachedValue<SessionSnapshot>? {
        val existing = currentSession() ?: return null

        return try {
            val activeSession = if (isExpiring(existing)) refreshSession(existing) else existing
            val profile = fetchProfile(activeSession)
            CachedValue(SessionSnapshot(activeSession, profile), false)
        } catch (error: Throwable) {
            val activeSession = currentSession() ?: throw error
            val cachedProfile = cacheStore.readProfile() ?: throw error
            CachedValue(SessionSnapshot(activeSession, cachedProfile), true)
        }
    }

    suspend fun createChallenge(): ChallengeEnvelope = api.createChallenge()

    suspend fun verifySiws(challengeToken: String, proof: WalletSignInProof): SessionSnapshot {
        val response = api.verifySiws(
            VerifySiwsRequest(
                challengeToken = challengeToken,
                wallet = proof.wallet,
                publicKeyBase64 = proof.publicKeyBase64,
                signedMessageBase64 = proof.signedMessageBase64,
                signatureBase64 = proof.signatureBase64,
                signatureType = proof.signatureType
            )
        )
        return persistVerifiedSession(response, proof.authToken)
    }

    suspend fun refreshProfile(): CachedValue<SessionSnapshot> {
        return try {
            val snapshot = withAuthorizedSession { session ->
                SessionSnapshot(session, fetchProfile(session))
            }
            CachedValue(snapshot, false)
        } catch (error: Throwable) {
            val session = currentSession() ?: throw error
            val cached = cacheStore.readProfile() ?: throw error
            CachedValue(SessionSnapshot(session, cached), true)
        }
    }

    suspend fun prepareMint(group: MintGroup, wallet: String, nftMint: String): PrepareMintEnvelope {
        return withAuthorizedSession { session ->
            api.prepareMint(
                bearer(session.accessToken),
                PrepareMintRequest(wallet = wallet, group = group.apiValue, nftMint = nftMint)
            )
        }
    }

    suspend fun awaitMintConfirmation(signature: String): Long? = rpcClient.awaitConfirmation(signature)

    suspend fun confirmMint(signature: String, mintAddress: String, slot: Long?): SessionSnapshot {
        return withAuthorizedSession { session ->
            val response = api.confirmMint(
                bearer(session.accessToken),
                ConfirmMintRequest(
                    signature = signature,
                    mintAddress = mintAddress,
                    slot = slot,
                    mintedAt = null
                )
            )
            val profile = response.profile ?: fetchProfile(session)
            cacheStore.saveProfile(profile)
            SessionSnapshot(sessionStore.readSession() ?: session, profile)
        }
    }

    suspend fun logout() {
        val session = currentSession()
        try {
            if (session != null) {
                api.revokeSession(bearer(session.accessToken))
            }
        } finally {
            clearLocalSession()
        }
    }

    suspend fun deleteAccount(): String? {
        val session = currentSession()
        return try {
            if (session == null) {
                null
            } else {
                api.deleteAccount(bearer(session.accessToken)).message
            }
        } finally {
            clearLocalSession()
        }
    }

    private suspend fun fetchProfile(session: SecureSession): MobileProfile {
        val response = api.getProfile(bearer(session.accessToken)).profile
        cacheStore.saveProfile(response)
        return response
    }

    private suspend fun persistVerifiedSession(
        response: SessionEnvelope,
        mwaAuthToken: String?
    ): SessionSnapshot {
        val session = SecureSession(
            wallet = response.wallet,
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            expiresAt = response.expiresAt,
            mwaAuthToken = mwaAuthToken
        )
        sessionStore.writeSession(session)
        cacheStore.saveProfile(response.profile)
        return SessionSnapshot(session, response.profile)
    }

    private suspend fun refreshSession(session: SecureSession): SecureSession {
        return try {
            val response = api.refreshSession(RefreshRequest(session.refreshToken))
            val updatedSession = SecureSession(
                wallet = response.wallet,
                accessToken = response.accessToken,
                refreshToken = response.refreshToken,
                expiresAt = response.expiresAt,
                mwaAuthToken = session.mwaAuthToken
            )
            sessionStore.writeSession(updatedSession)
            cacheStore.saveProfile(response.profile)
            updatedSession
        } catch (error: Throwable) {
            if (error is HttpException && error.code() == 401) {
                clearLocalSession()
            }
            throw error
        }
    }

    private suspend fun <T> withAuthorizedSession(block: suspend (SecureSession) -> T): T {
        val current = currentSession() ?: error("Wallet session is required.")
        val active = if (isExpiring(current)) refreshSession(current) else current
        return try {
            block(active)
        } catch (error: HttpException) {
            if (error.code() != 401) {
                throw error
            }

            val refreshed = refreshSession(active)
            block(refreshed)
        }
    }

    private fun isExpiring(session: SecureSession): Boolean {
        val expiresAt = runCatching { java.time.Instant.parse(session.expiresAt) }.getOrNull() ?: return true
        return expiresAt.minusSeconds(300).isBefore(java.time.Instant.now())
    }

    private fun bearer(accessToken: String): String = "Bearer $accessToken"
}
