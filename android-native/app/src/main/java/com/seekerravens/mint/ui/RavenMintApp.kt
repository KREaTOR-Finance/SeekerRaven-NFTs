package com.seekerravens.mint.ui
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.BottomNavigation
import androidx.compose.material.BottomNavigationItem
import androidx.compose.material.Button
import androidx.compose.material.ButtonDefaults
import androidx.compose.material.Card
import androidx.compose.material.Icon
import androidx.compose.material.MaterialTheme
import androidx.compose.material.OutlinedButton
import androidx.compose.material.Scaffold
import androidx.compose.material.Surface
import androidx.compose.material.Text
import androidx.compose.material.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Collections
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil.compose.AsyncImage
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.seekerravens.mint.BuildConfig
import com.seekerravens.mint.R
import com.seekerravens.mint.core.TrustedLinkOpener
import com.seekerravens.mint.data.HoldingItem
import com.seekerravens.mint.data.MintGroup
import com.seekerravens.mint.data.MintHistoryItem
import com.seekerravens.mint.ui.theme.RavenBlack
import com.seekerravens.mint.ui.theme.RavenDanger
import com.seekerravens.mint.ui.theme.RavenGreen
import com.seekerravens.mint.ui.theme.RavenLine
import com.seekerravens.mint.ui.theme.RavenLineHot
import com.seekerravens.mint.ui.theme.RavenMint
import com.seekerravens.mint.ui.theme.RavenMuted
import com.seekerravens.mint.ui.theme.RavenPink
import com.seekerravens.mint.ui.theme.RavenRose
import com.seekerravens.mint.ui.theme.RavenSurface
import com.seekerravens.mint.ui.theme.RavenSurfaceAlt
import com.seekerravens.mint.ui.theme.RavenText
import com.seekerravens.mint.ui.theme.RavenWarning
import com.seekerravens.mint.ui.theme.SeekerRavensTheme
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

private enum class RavenRoute(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Mint("mint", "Mint", Icons.Default.AutoAwesome),
    Holdings("holdings", "Holdings", Icons.Default.Collections),
    Settings("settings", "Settings", Icons.Default.Settings)
}

private data class SampleCard(
    val title: String,
    val accent: String,
    val imageRes: Int
)

private val sampleCards = listOf(
    SampleCard("SeekerRaven I Prime", "Genesis green core", R.drawable.seekerraven_i),
    SampleCard("SeekerRaven II Sentinel", "Armor glyph frame", R.drawable.seekerraven_ii),
    SampleCard("SeekerRaven R Ghostline", "Cyan rail pulse", R.drawable.seekerraven_r_cyan),
    SampleCard("SeekerRaven R Ember", "Ember edge pulse", R.drawable.seekerraven_r_ember)
)

@Composable
fun RavenMintApp(sender: ActivityResultSender, viewModel: MainViewModel) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()
    val navController = rememberNavController()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route ?: RavenRoute.Mint.route

    fun openTrustedUrl(url: String) {
        val opened = TrustedLinkOpener.open(context, url, state.appConfig, state.bootstrap)
        if (!opened) {
            Toast.makeText(context, "Blocked untrusted or invalid link.", Toast.LENGTH_SHORT).show()
        }
    }

    SeekerRavensTheme {
        Surface(color = RavenBlack) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color(0xFF13221C),
                                RavenBlack,
                                Color(0xFF210C1F)
                            )
                        )
                    )
            ) {
                Scaffold(
                    backgroundColor = Color.Transparent,
                    bottomBar = {
                        BottomNavigation(
                            backgroundColor = RavenSurface.copy(alpha = 0.96f),
                            contentColor = RavenText,
                            elevation = 0.dp
                        ) {
                            RavenRoute.entries.forEach { route ->
                                BottomNavigationItem(
                                    selected = currentRoute == route.route,
                                    onClick = {
                                        navController.navigate(route.route) {
                                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    },
                                    icon = { Icon(route.icon, contentDescription = route.label) },
                                    label = { Text(route.label) },
                                    selectedContentColor = RavenMint,
                                    unselectedContentColor = RavenMuted
                                )
                            }
                        }
                    }
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = RavenRoute.Mint.route,
                        modifier = Modifier.padding(innerPadding)
                    ) {
                        composable(RavenRoute.Mint.route) {
                            MintScreen(
                                state = state,
                                onConnect = { viewModel.connectWallet(sender) },
                                onRefresh = { viewModel.refreshProfile() },
                                onMint = { viewModel.mint(sender) },
                                onSelectGroup = viewModel::selectMintGroup,
                                onDismissMessage = viewModel::dismissMessages,
                                onOpenUrl = ::openTrustedUrl
                            )
                        }
                        composable(RavenRoute.Holdings.route) {
                            HoldingsScreen(
                                state = state,
                                onRefresh = viewModel::refreshProfile,
                                onDismissMessage = viewModel::dismissMessages,
                                onOpenUrl = ::openTrustedUrl
                            )
                        }
                        composable(RavenRoute.Settings.route) {
                            SettingsScreen(
                                state = state,
                                onLogout = { viewModel.logout(sender) },
                                onDeleteAccount = { viewModel.deleteAccount(sender) },
                                onRefresh = viewModel::refresh,
                                onDismissMessage = viewModel::dismissMessages,
                                onOpenUrl = ::openTrustedUrl
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MintScreen(
    state: MainUiState,
    onConnect: () -> Unit,
    onRefresh: () -> Unit,
    onMint: () -> Unit,
    onSelectGroup: (MintGroup) -> Unit,
    onDismissMessage: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    ScreenColumn {
        MessageBanner(state, onDismissMessage)

        GlassCard {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .border(2.dp, RavenLineHot, CircleShape)
                        .background(RavenSurfaceAlt),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.raven_logo),
                        contentDescription = null,
                        modifier = Modifier.size(56.dp)
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("SEEKERRAVEN GENESIS", style = MaterialTheme.typography.subtitle1, color = RavenRose)
                    Text(state.bootstrap?.collectionName ?: state.appConfig.collectionName, style = MaterialTheme.typography.h4)
                    Text(
                        text = if (state.wallet != null) {
                            "Wallet live: ${shortAddress(state.wallet)}"
                        } else {
                            "Native Solana Mobile wallet auth and SKR minting."
                        },
                        color = RavenMuted,
                        style = MaterialTheme.typography.body2
                    )
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatChip("Phase", formatPhase(state.bootstrap?.phase))
                StatChip("Supply", state.bootstrap?.supply?.toString() ?: "--")
                StatChip("Minted", state.bootstrap?.mintedCount?.toString() ?: "--")
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatChip("Allowlist", formatSkr(state.bootstrap?.pricing?.allowlistSkrBaseUnits))
                StatChip("Public", formatSkr(state.bootstrap?.pricing?.publicSkrBaseUnits))
            }
        }

        GlassCard {
            Text("Collection Preview", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                sampleCards.forEach { sample ->
                    Card(
                        backgroundColor = RavenSurfaceAlt,
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier.width(180.dp)
                    ) {
                        Column {
                            Image(
                                painter = painterResource(id = sample.imageRes),
                                contentDescription = sample.title,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp),
                                contentScale = ContentScale.Crop
                            )
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(sample.title, fontWeight = FontWeight.Bold)
                                Text(sample.accent, color = RavenRose, style = MaterialTheme.typography.body2)
                            }
                        }
                    }
                }
            }
        }

        GlassCard {
            Text("Wallet And Mint", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onConnect,
                    enabled = !state.isConnecting && !state.isLoggingOut,
                    colors = ButtonDefaults.buttonColors(backgroundColor = RavenPink, contentColor = RavenBlack)
                ) {
                    Text(if (state.isConnecting) "CONNECTING" else if (state.wallet != null) "REAUTHORIZE" else "REGISTER WALLET")
                }
                OutlinedButton(
                    onClick = onRefresh,
                    enabled = state.wallet != null && !state.isRefreshingProfile && !state.isMinting,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RavenMint)
                ) {
                    Text(if (state.isRefreshingProfile) "REFRESHING" else "REFRESH")
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MintGroup.entries.forEach { group ->
                    val selected = state.selectedMintGroup == group
                    OutlinedButton(
                        onClick = { onSelectGroup(group) },
                        border = androidx.compose.foundation.BorderStroke(2.dp, if (selected) RavenPink else RavenLine),
                        colors = ButtonDefaults.outlinedButtonColors(
                            backgroundColor = if (selected) RavenSurfaceAlt else Color.Transparent,
                            contentColor = if (selected) RavenRose else RavenMuted
                        )
                    ) {
                        Text(group.label.uppercase())
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onMint,
                enabled = state.wallet != null && !state.isMinting && !state.isConnecting,
                colors = ButtonDefaults.buttonColors(backgroundColor = RavenGreen, contentColor = RavenBlack),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.isMinting) "MINTING" else "MINT SEEKERRAVEN")
            }
            Spacer(modifier = Modifier.height(10.dp))
            state.lastMintAddress?.let {
                InlineDetail("Last NFT Mint", shortAddress(it), explorerAssetUrl(state.appConfig.cluster, it), onOpenUrl)
            }
            state.lastMintSignature?.let {
                InlineDetail("Last Tx", shortAddress(it), explorerTxUrl(state.appConfig.cluster, it), onOpenUrl)
            }
        }

        GlassCard {
            Text("Drop Policy", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = state.bootstrap?.releaseMessage ?: state.appConfig.policyAnnouncement,
                color = RavenMuted,
                style = MaterialTheme.typography.body2
            )
            if (!state.walletFound) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(onClick = { onOpenUrl("https://wallets.solanamobile.com/") }) {
                    Icon(Icons.Default.OpenInBrowser, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("INSTALL A WALLET")
                }
            }
        }
    }
}

@Composable
private fun HoldingsScreen(
    state: MainUiState,
    onRefresh: () -> Unit,
    onDismissMessage: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    ScreenColumn {
        MessageBanner(state, onDismissMessage)

        GlassCard {
            Text("Holder Status", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            if (state.profile == null) {
                Text("Connect a wallet to load holdings, mint history, and holder eligibility.", color = RavenMuted)
            } else {
                StatChip("Eligible", if (state.profile.eligible) "YES" else "NO")
                Spacer(modifier = Modifier.height(8.dp))
                StatChip("Holding Count", state.profile.holdingCount.toString())
                Spacer(modifier = Modifier.height(8.dp))
                StatChip("Last Sync", formatDateTime(state.profile.lastHolderSyncAt))
                if (state.profile.holderSyncStale || state.showingCachedProfile) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Holder data is stale or cached. Refresh when backend connectivity is back.", color = RavenWarning)
                }
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(onClick = onRefresh, enabled = !state.isRefreshingProfile) {
                    Text(if (state.isRefreshingProfile) "REFRESHING" else "REFRESH HOLDER DATA")
                }
            }
        }

        state.profile?.holdings?.takeIf { it.isNotEmpty() }?.let { holdings ->
            GlassCard {
                Text("Current Holdings", style = MaterialTheme.typography.h6)
                Spacer(modifier = Modifier.height(10.dp))
                holdings.forEach { holding ->
                    HoldingRow(holding, state.appConfig.cluster, onOpenUrl)
                    Spacer(modifier = Modifier.height(10.dp))
                }
            }
        }

        GlassCard {
            Text("Mint History", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            val history = state.profile?.mintHistory.orEmpty()
            if (history.isEmpty()) {
                Text("No confirmed mints recorded for this wallet yet.", color = RavenMuted)
            } else {
                history.forEach { entry ->
                    MintHistoryRow(entry, state.appConfig.cluster, onOpenUrl)
                    Spacer(modifier = Modifier.height(10.dp))
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: MainUiState,
    onLogout: () -> Unit,
    onDeleteAccount: () -> Unit,
    onRefresh: () -> Unit,
    onDismissMessage: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    ScreenColumn {
        MessageBanner(state, onDismissMessage)

        GlassCard {
            Text("Links", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            SettingsLink("Support", state.bootstrap?.links?.supportUrl ?: state.appConfig.supportUrl, onOpenUrl)
            SettingsLink("Privacy Policy", state.bootstrap?.links?.privacyPolicyUrl ?: state.appConfig.privacyPolicyUrl, onOpenUrl)
            SettingsLink("Terms Of Use", state.bootstrap?.links?.termsOfUseUrl ?: state.appConfig.termsOfUseUrl, onOpenUrl)
            SettingsLink("Wallet Install Guide", "https://wallets.solanamobile.com/", onOpenUrl)
        }

        GlassCard {
            Text("Build Info", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            SettingsValue("Package", BuildConfig.APPLICATION_ID)
            SettingsValue("Version", BuildConfig.VERSION_NAME)
            SettingsValue("Cluster", state.appConfig.cluster)
            SettingsValue("Candy Machine", shortAddress(state.appConfig.candyMachine))
            SettingsValue("Collection Mint", shortAddress(state.appConfig.collectionMint))
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(onClick = onRefresh) {
                Text("REFRESH BOOTSTRAP")
            }
        }

        GlassCard {
            Text("Session", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = state.wallet?.let { "Active wallet: ${shortAddress(it)}" } ?: "No active wallet session.",
                color = RavenMuted
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = onLogout,
                    enabled = state.wallet != null && !state.isLoggingOut,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RavenMint)
                ) {
                    Text(if (state.isLoggingOut) "PROCESSING" else "LOG OUT")
                }
                Button(
                    onClick = onDeleteAccount,
                    enabled = state.wallet != null && !state.isLoggingOut,
                    colors = ButtonDefaults.buttonColors(backgroundColor = RavenDanger, contentColor = RavenBlack)
                ) {
                    Text(if (state.isLoggingOut) "PROCESSING" else "DELETE ACCOUNT")
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Deleting account clears off-chain session and profile data only. Solana transaction history remains public.",
                color = RavenMuted,
                style = MaterialTheme.typography.body2
            )
        }
    }
}

@Composable
private fun MessageBanner(state: MainUiState, onDismiss: () -> Unit) {
    val message = state.errorMessage ?: state.infoMessage ?: return
    val borderColor = if (state.errorMessage != null) RavenDanger else RavenGreen
    val background = if (state.errorMessage != null) Color(0x332B0A12) else Color(0x1F0C2314)
    Card(
        backgroundColor = background,
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(2.dp, borderColor, RoundedCornerShape(20.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(message, modifier = Modifier.weight(1f), color = if (state.errorMessage != null) RavenDanger else RavenMint)
            TextButton(onClick = onDismiss) {
                Text("DISMISS")
            }
        }
    }
}

@Composable
private fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = content
    )
}

@Composable
private fun GlassCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        backgroundColor = RavenSurface.copy(alpha = 0.96f),
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier.fillMaxWidth(),
        elevation = 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, RavenLine, RoundedCornerShape(24.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
            content = content
        )
    }
}

@Composable
private fun StatChip(label: String, value: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(RavenSurfaceAlt)
            .border(1.dp, RavenLine, RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label.uppercase(), style = MaterialTheme.typography.subtitle1, color = RavenMuted)
        Text(value, color = RavenMint, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun InlineDetail(label: String, value: String, url: String, onOpenUrl: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = RavenMuted, style = MaterialTheme.typography.body2)
            Text(value, fontWeight = FontWeight.Bold)
        }
        TextButton(onClick = { onOpenUrl(url) }) {
            Text("EXPLORER")
        }
    }
}

@Composable
private fun HoldingRow(holding: HoldingItem, cluster: String, onOpenUrl: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(
            model = holding.imageUrl,
            contentDescription = holding.name,
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(RavenSurfaceAlt),
            contentScale = ContentScale.Crop,
            error = painterResource(id = R.drawable.raven_logo),
            placeholder = painterResource(id = R.drawable.raven_logo)
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(holding.name, fontWeight = FontWeight.Bold)
            Text(shortAddress(holding.mint), color = RavenMuted, style = MaterialTheme.typography.body2)
        }
        TextButton(onClick = { onOpenUrl(explorerAssetUrl(cluster, holding.mint)) }) {
            Text("VIEW")
        }
    }
}

@Composable
private fun MintHistoryRow(entry: MintHistoryItem, cluster: String, onOpenUrl: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(shortAddress(entry.signature), fontWeight = FontWeight.Bold)
            Text(formatDateTime(entry.mintedAt), color = RavenMuted, style = MaterialTheme.typography.body2)
        }
        TextButton(onClick = { onOpenUrl(explorerTxUrl(cluster, entry.signature)) }) {
            Text("TX")
        }
    }
}

@Composable
private fun SettingsLink(label: String, url: String, onOpenUrl: (String) -> Unit) {
    OutlinedButton(
        onClick = { onOpenUrl(url) },
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = RavenMint),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label)
            Icon(Icons.Default.OpenInBrowser, contentDescription = null)
        }
    }
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun SettingsValue(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label.uppercase(), color = RavenMuted, style = MaterialTheme.typography.subtitle1)
        Text(value, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    Spacer(modifier = Modifier.height(8.dp))
}

private fun formatSkr(value: String?): String {
    val parsed = value?.toBigDecimalOrNull() ?: return "--"
    val shifted = parsed.movePointLeft(9).stripTrailingZeros()
    return "${shifted.toPlainString()} SKR"
}

private fun formatPhase(value: String?): String {
    return when (value) {
        null -> "--"
        "pre-allowlist" -> "PRE-ALLOWLIST"
        "allowlist" -> "ALLOWLIST"
        "public" -> "PUBLIC"
        "sold-out" -> "SOLD OUT"
        else -> value.replace('-', ' ').uppercase()
    }
}

private fun shortAddress(value: String): String {
    if (value.length <= 12) {
        return value
    }
    return "${value.take(6)}...${value.takeLast(6)}"
}

private fun formatDateTime(value: String?): String {
    if (value.isNullOrBlank()) {
        return "--"
    }
    return runCatching {
        OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm"))
    }.getOrElse {
        value
    }
}

private fun explorerTxUrl(cluster: String, signature: String): String =
    "https://explorer.solana.com/tx/$signature?cluster=${clusterLabel(cluster)}"

private fun explorerAssetUrl(cluster: String, mint: String): String =
    "https://explorer.solana.com/address/$mint?cluster=${clusterLabel(cluster)}"

private fun clusterLabel(cluster: String): String = if (cluster == "mainnet-beta") "mainnet-beta" else cluster
