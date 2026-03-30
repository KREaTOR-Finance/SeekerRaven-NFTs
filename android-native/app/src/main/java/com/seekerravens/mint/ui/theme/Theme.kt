package com.seekerravens.mint.ui.theme

import androidx.compose.material.MaterialTheme
import androidx.compose.material.darkColors
import androidx.compose.runtime.Composable

private val RavenColorPalette = darkColors(
    primary = RavenGreen,
    primaryVariant = RavenMint,
    secondary = RavenPink,
    background = RavenBlack,
    surface = RavenSurface,
    error = RavenDanger,
    onPrimary = RavenBlack,
    onSecondary = RavenBlack,
    onBackground = RavenText,
    onSurface = RavenText,
    onError = RavenBlack
)

@Composable
fun SeekerRavensTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = RavenColorPalette,
        typography = RavenTypography,
        content = content
    )
}
