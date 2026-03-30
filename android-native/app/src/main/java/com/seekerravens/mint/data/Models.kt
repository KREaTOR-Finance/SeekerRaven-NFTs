package com.seekerravens.mint.data

import foundation.metaplex.solanaeddsa.Keypair

data class BootstrapResponse(
    val ok: Boolean,
    val cluster: String,
    val clusterFlavor: String,
    val collectionName: String,
    val phase: String,
    val supply: Int,
    val mintedCount: Int,
    val remainingCount: Int,
    val allowlistStartIso: String,
    val publicStartIso: String,
    val pricing: BootstrapPricing,
    val links: BootstrapLinks,
    val releaseMessage: String
)

data class BootstrapPricing(
    val allowlistSkrBaseUnits: String,
    val publicSkrBaseUnits: String
)

data class BootstrapLinks(
    val backendBaseUrl: String,
    val privacyPolicyUrl: String,
    val supportUrl: String,
    val termsOfUseUrl: String
)

data class ChallengeEnvelope(
    val ok: Boolean,
    val challengeToken: String,
    val payload: SiwsChallengePayload
)

data class SiwsChallengePayload(
    val domain: String,
    val statement: String,
    val uri: String,
    val version: String,
    val chainId: String,
    val nonce: String,
    val issuedAt: String,
    val expirationTime: String,
    val requestId: String,
    val resources: List<String> = emptyList()
)

data class VerifySiwsRequest(
    val challengeToken: String,
    val wallet: String,
    val publicKeyBase64: String,
    val signedMessageBase64: String,
    val signatureBase64: String,
    val signatureType: String
)

data class RefreshRequest(
    val refreshToken: String
)

data class SessionEnvelope(
    val ok: Boolean,
    val wallet: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
    val profile: MobileProfile
)

data class ProfileEnvelope(
    val ok: Boolean,
    val profile: MobileProfile
)

data class WalletEnvelope(
    val ok: Boolean,
    val wallet: String? = null,
    val message: String? = null
)

data class DeleteAccountEnvelope(
    val ok: Boolean,
    val wallet: String? = null,
    val message: String? = null
)

data class PrepareMintRequest(
    val wallet: String,
    val group: String,
    val nftMint: String
)

data class PrepareMintEnvelope(
    val ok: Boolean,
    val wallet: String,
    val mintAddress: String,
    val group: String,
    val phase: String,
    val expectedPriceSkrBaseUnits: String,
    val unsignedTransactionBase64: String,
    val blockhash: String,
    val lastValidBlockHeight: Long,
    val mintedCount: Int,
    val remainingCount: Int
)

data class ConfirmMintRequest(
    val signature: String,
    val mintAddress: String,
    val slot: Long?,
    val mintedAt: String?
)

data class ConfirmMintEnvelope(
    val ok: Boolean,
    val signature: String,
    val mintAddress: String? = null,
    val holderSync: HolderSyncSummary? = null,
    val profile: MobileProfile? = null
)

data class HolderSyncSummary(
    val syncedAt: String? = null,
    val ownerCount: Int? = null,
    val assetCount: Int? = null
)

data class MobileProfile(
    val wallet: String,
    val eligible: Boolean,
    val holdingCount: Int,
    val holderSyncStale: Boolean,
    val lastHolderSyncAt: String?,
    val mintCount: Int,
    val firstMintedAt: String?,
    val lastMintedAt: String?,
    val mintHistory: List<MintHistoryItem>,
    val holdings: List<HoldingItem>
)

data class HoldingItem(
    val assetId: String,
    val mint: String,
    val name: String,
    val imageUrl: String?
)

data class MintHistoryItem(
    val signature: String,
    val slot: Long?,
    val mintedAt: String?
)

data class SecureSession(
    val wallet: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
    val mwaAuthToken: String?
)

data class SessionSnapshot(
    val session: SecureSession,
    val profile: MobileProfile
)

data class CachedValue<T>(
    val value: T,
    val fromCache: Boolean
)

enum class MintGroup(val apiValue: String, val label: String) {
    ALLOWLIST("allowlist", "Allowlist"),
    PUBLIC("public", "Public")
}

data class WalletSignInProof(
    val wallet: String,
    val publicKeyBase64: String,
    val signedMessageBase64: String,
    val signatureBase64: String,
    val signatureType: String,
    val authToken: String?
)

data class LocalMintKeypair(
    val publicKeyBase58: String,
    internal val signer: Keypair
)

data class WalletMintSubmission(
    val signature: String,
    val authToken: String?
)
