# Native Android App

## Requirements

- Android Studio with Android SDK Platform 36 and build-tools installed
- OpenJDK 17
- At least one Solana Mobile compatible wallet app or Mock MWA Wallet
- A dedicated dApp Store signing keystore separate from any Google Play key

## Local Build

```powershell
cd android-native
.\gradlew.bat assembleDebug
```

Release build:

```powershell
cd android-native
.\gradlew.bat assembleRelease
```

This workspace did not have `java`, `adb`, `sdkmanager`, or `JAVA_HOME` configured on March 7, 2026, so Gradle builds were not executed here.

## Config Sync

The shared drop config is generated from the root TypeScript pipeline and copied into Android assets:

```powershell
npm run app:sync-config -- --cluster devnet
npm run app:sync-config -- --cluster mainnet-beta
```

Output path:

- `android-native/app/src/main/assets/drop-config.json`
- `android-native/app/src/main/assets/drop-config.<cluster>.json`

## Native Stack

- Jetpack Compose + Navigation Compose
- ViewModel + StateFlow
- Retrofit + OkHttp
- DataStore + EncryptedSharedPreferences
- Solana Mobile Wallet Adapter Kotlin client
- `web3-solana` transaction primitives
- Local NFT mint keypair signing through `foundation.metaplex:solanaeddsa`

## Release Checklist

1. Install Android tooling and verify `cd android-native; .\gradlew.bat tasks` works.
2. Build a release APK with the dedicated dApp Store keystore.
3. Replace placeholder assets under `android-native/dapp-store/media/` with store-ready dimensions.
4. Fill in publisher identity and release address fields in `android-native/dapp-store/config.yaml`.
5. Submit through the Solana Mobile publisher CLI / portal.

## Feature Coverage

- Native wallet connect / reconnect / disconnect
- Sign In With Solana backed backend sessions
- Native Candy Machine mint flow using backend-prepared unsigned transactions
- Holder dashboard with eligibility, holdings, and mint history
- Trusted external links only
- Settings, logout, and delete-account flows
