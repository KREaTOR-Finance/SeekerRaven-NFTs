package com.seekerravens.mint.wallet

import android.net.Uri
import android.util.Base64
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.common.signin.SignInWithSolana
import com.solana.publickey.SolanaPublicKey
import com.solana.signer.SolanaSigner
import com.solana.transaction.Transaction
import com.seekerravens.mint.core.AppConfig
import com.seekerravens.mint.core.resolvedIconUri
import com.seekerravens.mint.core.resolvedIdentityUri
import com.seekerravens.mint.data.LocalMintKeypair
import com.seekerravens.mint.data.SecureSessionStore
import com.seekerravens.mint.data.SiwsChallengePayload
import com.seekerravens.mint.data.WalletMintSubmission
import com.seekerravens.mint.data.WalletSignInProof
import foundation.metaplex.solanaeddsa.Keypair
import foundation.metaplex.solanaeddsa.SolanaEddsa
import org.bitcoinj.base.Base58

class WalletOperationException(
    message: String,
    val noWalletFound: Boolean = false,
    cause: Throwable? = null
) : Exception(message, cause)

class SolanaWalletManager(
    appConfig: AppConfig,
    private val sessionStore: SecureSessionStore
) {
    private val walletAdapter = MobileWalletAdapter(
        ConnectionIdentity(
            appConfig.resolvedIdentityUri(),
            appConfig.resolvedIconUri(),
            appConfig.collectionName
        )
    ).apply {
        blockchain = when (appConfig.cluster) {
            "mainnet-beta" -> Solana.Mainnet
            else -> Solana.Devnet
        }
        authToken = sessionStore.readSession()?.mwaAuthToken
    }

    fun restoreAuthToken(authToken: String?) {
        walletAdapter.authToken = authToken
    }

    suspend fun signIn(sender: ActivityResultSender, challenge: SiwsChallengePayload): WalletSignInProof {
        val payload = SignInWithSolana.Payload(
            challenge.domain,
            null as ByteArray?,
            challenge.statement,
            Uri.parse(challenge.uri),
            challenge.version,
            challenge.chainId,
            challenge.nonce,
            challenge.issuedAt,
            challenge.expirationTime,
            null,
            challenge.requestId,
            challenge.resources.map(Uri::parse).toTypedArray().takeIf { it.isNotEmpty() }
        )

        return when (val result = walletAdapter.signIn(sender, payload)) {
            is TransactionResult.Success -> {
                val authResult = result.authResult
                val account = authResult.accounts.firstOrNull()
                    ?: throw WalletOperationException("Wallet authorization returned no accounts.")
                val extraction = readSignInResult(result.payload as Any)
                val publicKeyBytes = account.publicKey
                val wallet = SolanaPublicKey(publicKeyBytes).base58()
                val signedMessage = extraction.signedMessage ?: payload.prepareMessage(publicKeyBytes).encodeToByteArray()
                val signature = extraction.signature
                    ?: throw WalletOperationException("Wallet did not return a SIWS signature.")
                val authToken = authResult.authToken
                sessionStore.updateMwaAuthToken(authToken)
                WalletSignInProof(
                    wallet = wallet,
                    publicKeyBase64 = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP),
                    signedMessageBase64 = Base64.encodeToString(signedMessage, Base64.NO_WRAP),
                    signatureBase64 = Base64.encodeToString(signature, Base64.NO_WRAP),
                    signatureType = extraction.signatureType ?: "ed25519",
                    authToken = authToken
                )
            }
            is TransactionResult.NoWalletFound -> throw WalletOperationException(result.message, true)
            is TransactionResult.Failure -> throw WalletOperationException(result.message, false, result.e)
        }
    }

    suspend fun generateLocalMintKeypair(): LocalMintKeypair {
        val keypair = SolanaEddsa.generateKeypair()
        return LocalMintKeypair(keypair.publicKey.toBase58(), keypair)
    }

    suspend fun submitMint(
        sender: ActivityResultSender,
        unsignedTransactionBase64: String,
        mintKeypair: LocalMintKeypair
    ): WalletMintSubmission {
        val unsignedTransaction = Base64.decode(unsignedTransactionBase64, Base64.DEFAULT)
        val transaction = Transaction.from(unsignedTransaction)
        val partiallySigned = LocalMintSigner(mintKeypair.signer).signTransaction(transaction)
            .getOrElse { throw WalletOperationException(it.message ?: "Failed to sign mint account locally.", false, it) }

        return when (
            val result = walletAdapter.transact(sender) { authResult ->
                val signatureBytes = signAndSendTransactions(arrayOf(partiallySigned.serialize())).signatures.firstOrNull()
                    ?: throw IllegalStateException("Wallet did not return a transaction signature.")
                WalletMintSubmission(
                    signature = Base58.encode(signatureBytes),
                    authToken = authResult.authToken
                )
            }
        ) {
            is TransactionResult.Success -> {
                sessionStore.updateMwaAuthToken(result.payload.authToken)
                result.payload
            }
            is TransactionResult.NoWalletFound -> throw WalletOperationException(result.message, true)
            is TransactionResult.Failure -> throw WalletOperationException(result.message, false, result.e)
        }
    }

    suspend fun disconnect(sender: ActivityResultSender) {
        when (val result = walletAdapter.disconnect(sender)) {
            is TransactionResult.Success -> sessionStore.updateMwaAuthToken(null)
            is TransactionResult.NoWalletFound -> throw WalletOperationException(result.message, true)
            is TransactionResult.Failure -> throw WalletOperationException(result.message, false, result.e)
        }
    }

    private data class SignInExtraction(
        val signedMessage: ByteArray?,
        val signature: ByteArray?,
        val signatureType: String?
    )

    private fun readSignInResult(payload: Any): SignInExtraction {
        return SignInExtraction(
            signedMessage = readByteArray(payload, "signedMessage", "message"),
            signature = readByteArray(payload, "signature"),
            signatureType = readString(payload, "signatureType")
        )
    }

    private fun readByteArray(payload: Any, vararg names: String): ByteArray? {
        for (name in names) {
            val value = readProperty(payload, name)
            if (value is ByteArray) {
                return value
            }
        }
        return null
    }

    private fun readString(payload: Any, vararg names: String): String? {
        for (name in names) {
            val value = readProperty(payload, name)
            if (value is String) {
                return value
            }
        }
        return null
    }

    private fun readProperty(payload: Any, name: String): Any? {
        val getterName = "get" + name.replaceFirstChar { it.uppercaseChar() }
        val method = payload.javaClass.methods.firstOrNull { it.name == getterName && it.parameterCount == 0 }
        if (method != null) {
            return runCatching { method.invoke(payload) }.getOrNull()
        }

        return runCatching {
            val field = payload.javaClass.getDeclaredField(name)
            field.isAccessible = true
            field.get(payload)
        }.getOrNull()
    }

    private class LocalMintSigner(
        private val keypair: Keypair
    ) : SolanaSigner() {
        override val publicKey = SolanaPublicKey(keypair.publicKey.toByteArray())

        override suspend fun signPayload(payload: ByteArray): Result<ByteArray> = runCatching {
            SolanaEddsa.sign(payload, keypair)
        }

        override suspend fun signAndSendTransaction(transaction: Transaction): Result<String> {
            return Result.failure(UnsupportedOperationException("Local mint signer cannot submit transactions."))
        }
    }
}
