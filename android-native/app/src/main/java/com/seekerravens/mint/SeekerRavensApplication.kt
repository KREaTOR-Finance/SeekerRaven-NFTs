package com.seekerravens.mint

import android.app.Application
import com.seekerravens.mint.core.AppContainer

class SeekerRavensApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
