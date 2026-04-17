# SeekerRaven Mint (Android Release)

This app is intended to ship as a native Android app for the Solana Mobile dApp Store.
Minting is backendless: the app uses MWA to sign transactions and sends them to Solana RPC.

## Prereqs

- Android Studio (installed)
- Android SDK + Build Tools (installed via Android Studio)
- JDK 17 (Android Studio ships a compatible JDK)
- Node 20+

## 1) Verify devnet works first

From repo root:

```powershell
npm run app:sync-config -- --cluster devnet
```

Then from `mobile/`:

```powershell
npm run typecheck
npx expo run:android
```

On a Solana Mobile device (or emulator with a compatible wallet flow), connect wallet and run a mint.

## 2) Create native Android project (Expo prebuild)

From `mobile/`:

```powershell
npx expo prebuild --platform android
```

This generates `mobile/android/` for Android Studio.

## 3) Configure release signing

1. In `mobile/android/`, generate a keystore (choose a strong password):

```powershell
cd android
keytool -genkeypair -v -storetype JKS -keystore seekerraven-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias seekerraven
```

2. Create `mobile/android/keystore.properties` (do not commit it):

```properties
storeFile=seekerraven-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=seekerraven
keyPassword=YOUR_KEY_PASSWORD
```

3. Wire signing into `mobile/android/app/build.gradle`:
   - Add a `signingConfigs { release { ... } }` block that loads `keystore.properties`.
   - Set `buildTypes { release { signingConfig signingConfigs.release } }`.

## 4) Build AAB (preferred) or APK

Open `mobile/android/` in Android Studio.

- AAB: `Build` -> `Generate Signed Bundle / APK...` -> `Android App Bundle`
- APK: `Build` -> `Generate Signed Bundle / APK...` -> `APK`

Output locations are shown by Android Studio at the end of the build.

## 5) Publish on GitHub Releases

Attach:

- `.aab` (preferred) and/or `.apk`
- checksums file (recommended)

From repo root, generate checksums:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release/checksums.ps1 -Path C:\path\to\SeekerRavenMint.aab
```

## Mainnet switch

Before building the public release:

1. Set `.env` for `SOLANA_CLUSTER=mainnet-beta`.
2. Set the **official** mainnet SKR mint from Solana Mobile docs and compute the proceeds ATA.
3. Deploy + verify:

```powershell
npm run config:validate -- --cluster mainnet-beta
npm run storage:upload -- --cluster mainnet-beta
npm run drop:deploy -- --cluster mainnet-beta
npm run drop:verify -- --cluster mainnet-beta
npm run app:sync-config -- --cluster mainnet-beta
```

4. Rebuild the Android release.

