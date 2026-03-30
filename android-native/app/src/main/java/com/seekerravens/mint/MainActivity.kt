package com.seekerravens.mint

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.seekerravens.mint.ui.MainViewModel
import com.seekerravens.mint.ui.RavenMintApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val container = (application as SeekerRavensApplication).container
        val sender = ActivityResultSender(this)

        setContent {
            val mainViewModel: MainViewModel = viewModel(factory = MainViewModel.factory(container))
            RavenMintApp(sender = sender, viewModel = mainViewModel)
        }
    }
}
