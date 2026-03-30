package com.seekerravens.mint.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.seekerravens.mint.core.AppContainer
import com.seekerravens.mint.core.AppConfig
import com.seekerravens.mint.data.BootstrapResponse
import com.seekerravens.mint.data.MintGroup
import com.seekerravens.mint.data.MobileProfile
import com.seekerravens.mint.data.SessionSnapshot
import com.seekerravens.mint.data.WalletSignInProof
import com.seekerravens.mint.wallet.WalletOperationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MainUiState(
    val appConfig: AppConfig,
    val bootstrap: BootstrapResponse? = null,
    val profile: MobileProfile? = null,
    val wallet: String? = null,
    val isBootstrapLoading: Boolean = true,
    val isSessionLoading: Boolean = false,
    val isConnecting: Boolean = false,
    val isRefreshingProfile: Boolean = false,
    val isMinting: Boolean = false,
    val isLoggingOut: Boolean = false,
    val selectedMintGroup: MintGroup = MintGroup.PUBLIC,
    val walletFound: Boolean = true,
    val showingCachedBootstrap: Boolean = false,
    val showingCachedProfile: Boolean = false,
    val lastMintSignature: String? = null,
    val lastMintAddress: String? = null,
    val infoMessage: String? = null,
    val errorMessage: String? = null
)

class MainViewModel(
    private val container: AppContainer
) : ViewModel() {
    private val repository = container.repository
    private val walletManager = container.walletManager
    private val _uiState = MutableStateFlow(MainUiState(appConfig = repository.appConfig()))

    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        walletManager.restoreAuthToken(repository.currentSession()?.mwaAuthToken)
        viewModelScope.launch {
            loadBootstrap()
            restoreSession()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadBootstrap()
            if (_uiState.value.wallet != null) {
                refreshProfile()
            }
        }
    }

    fun connectWallet(sender: ActivityResultSender) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isConnecting = true,
                    walletFound = true,
                    errorMessage = null,
                    infoMessage = null
                )
            }

            try {
                val challenge = repository.createChallenge()
                val proof: WalletSignInProof = walletManager.signIn(sender, challenge.payload)
                val snapshot = repository.verifySiws(challenge.challengeToken, proof)
                repository.updateMwaAuthToken(proof.authToken)
                walletManager.restoreAuthToken(proof.authToken)
                applySnapshot(snapshot, fromCache = false)
                _uiState.update {
                    it.copy(
                        isConnecting = false,
                        infoMessage = "Wallet connected. Holder eligibility is now live.",
                        errorMessage = null,
                        walletFound = true
                    )
                }
            } catch (error: Throwable) {
                handleWalletError(error, connecting = true)
            }
        }
    }

    fun refreshProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshingProfile = true, errorMessage = null) }
            try {
                val result = repository.refreshProfile()
                applySnapshot(result.value, result.fromCache)
                _uiState.update {
                    it.copy(
                        isRefreshingProfile = false,
                        infoMessage = if (result.fromCache) {
                            "Showing cached holder data while the backend is unavailable."
                        } else {
                            "Holder data refreshed."
                        }
                    )
                }
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        isRefreshingProfile = false,
                        errorMessage = userMessage(error)
                    )
                }
            }
        }
    }

    fun selectMintGroup(group: MintGroup) {
        _uiState.update { it.copy(selectedMintGroup = group) }
    }

    fun mint(sender: ActivityResultSender) {
        viewModelScope.launch {
            val wallet = _uiState.value.wallet
            if (wallet.isNullOrBlank()) {
                _uiState.update { it.copy(errorMessage = "Connect a wallet before minting.") }
                return@launch
            }

            _uiState.update { it.copy(isMinting = true, errorMessage = null, infoMessage = null) }
            var lastSignature: String? = null
            var lastMintAddress: String? = null

            try {
                val mintKeypair = walletManager.generateLocalMintKeypair()
                lastMintAddress = mintKeypair.publicKeyBase58
                val prepared = repository.prepareMint(_uiState.value.selectedMintGroup, wallet, mintKeypair.publicKeyBase58)
                val submission = walletManager.submitMint(sender, prepared.unsignedTransactionBase64, mintKeypair)
                repository.updateMwaAuthToken(submission.authToken)
                walletManager.restoreAuthToken(submission.authToken)
                lastSignature = submission.signature
                val slot = runCatching { repository.awaitMintConfirmation(submission.signature) }.getOrNull()
                val snapshot = repository.confirmMint(submission.signature, mintKeypair.publicKeyBase58, slot)
                applySnapshot(snapshot, fromCache = false)
                _uiState.update {
                    it.copy(
                        isMinting = false,
                        lastMintSignature = submission.signature,
                        lastMintAddress = mintKeypair.publicKeyBase58,
                        infoMessage = "Mint submitted and profile updated.",
                        errorMessage = null
                    )
                }
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        isMinting = false,
                        lastMintSignature = lastSignature ?: it.lastMintSignature,
                        lastMintAddress = lastMintAddress ?: it.lastMintAddress,
                        errorMessage = if (lastSignature != null) {
                            "Transaction was submitted, but post-mint sync failed: ${userMessage(error)}"
                        } else {
                            userMessage(error)
                        }
                    )
                }
            }
        }
    }

    fun logout(sender: ActivityResultSender) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoggingOut = true, errorMessage = null, infoMessage = null) }
            val issues = mutableListOf<String>()

            runCatching { repository.logout() }.onFailure { issues += userMessage(it) }
            runCatching { walletManager.disconnect(sender) }.onFailure { issues += userMessage(it) }
            repository.clearLocalSession()
            walletManager.restoreAuthToken(null)

            _uiState.update {
                it.copy(
                    wallet = null,
                    profile = null,
                    isLoggingOut = false,
                    showingCachedProfile = false,
                    infoMessage = if (issues.isEmpty()) {
                        "Wallet session cleared."
                    } else {
                        "Local session cleared. ${issues.first()}"
                    }
                )
            }
        }
    }

    fun deleteAccount(sender: ActivityResultSender) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoggingOut = true, errorMessage = null, infoMessage = null) }
            val issues = mutableListOf<String>()
            var deleteMessage: String? = null

            runCatching { deleteMessage = repository.deleteAccount() }.onFailure { issues += userMessage(it) }
            runCatching { walletManager.disconnect(sender) }.onFailure { issues += userMessage(it) }
            repository.clearLocalSession()
            walletManager.restoreAuthToken(null)

            _uiState.update {
                it.copy(
                    wallet = null,
                    profile = null,
                    isLoggingOut = false,
                    showingCachedProfile = false,
                    infoMessage = deleteMessage ?: if (issues.isEmpty()) {
                        "Off-chain mobile account data deleted."
                    } else {
                        "Local data cleared. ${issues.first()}"
                    },
                    errorMessage = if (issues.isEmpty()) null else issues.first()
                )
            }
        }
    }

    fun dismissMessages() {
        _uiState.update { it.copy(infoMessage = null, errorMessage = null) }
    }

    private suspend fun loadBootstrap() {
        _uiState.update { it.copy(isBootstrapLoading = true) }
        try {
            val result = repository.loadBootstrap()
            _uiState.update {
                it.copy(
                    bootstrap = result.value,
                    isBootstrapLoading = false,
                    showingCachedBootstrap = result.fromCache,
                    infoMessage = if (result.fromCache) {
                        "Showing cached drop status while the backend is unavailable."
                    } else {
                        it.infoMessage
                    }
                )
            }
        } catch (error: Throwable) {
            _uiState.update {
                it.copy(
                    isBootstrapLoading = false,
                    errorMessage = userMessage(error)
                )
            }
        }
    }

    private suspend fun restoreSession() {
        _uiState.update { it.copy(isSessionLoading = true) }
        try {
            val result = repository.restoreSession()
            if (result == null) {
                _uiState.update { it.copy(isSessionLoading = false) }
                return
            }
            applySnapshot(result.value, result.fromCache)
            _uiState.update {
                it.copy(
                    isSessionLoading = false,
                    infoMessage = if (result.fromCache) {
                        "Wallet session restored with cached holder data."
                    } else {
                        "Wallet session restored."
                    }
                )
            }
        } catch (error: Throwable) {
            _uiState.update {
                it.copy(
                    isSessionLoading = false,
                    errorMessage = userMessage(error)
                )
            }
        }
    }

    private fun applySnapshot(snapshot: SessionSnapshot, fromCache: Boolean) {
        _uiState.update {
            it.copy(
                wallet = snapshot.session.wallet,
                profile = snapshot.profile,
                showingCachedProfile = fromCache
            )
        }
    }

    private fun handleWalletError(error: Throwable, connecting: Boolean = false) {
        val walletError = error as? WalletOperationException
        _uiState.update {
            it.copy(
                isConnecting = if (connecting) false else it.isConnecting,
                walletFound = walletError?.noWalletFound != true,
                errorMessage = userMessage(error)
            )
        }
    }

    private fun userMessage(error: Throwable): String {
        return when (error) {
            is WalletOperationException -> error.message ?: "Wallet operation failed."
            is IllegalStateException -> error.message ?: "The app is missing required configuration."
            else -> error.message ?: "Unexpected error."
        }
    }

    companion object {
        fun factory(container: AppContainer): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return MainViewModel(container) as T
            }
        }
    }
}
