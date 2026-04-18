module.exports = {
  dependencies: {
    "@solana-mobile/mobile-wallet-adapter-protocol": {
      platforms: {
        android: {
          sourceDir:
            "../node_modules/@solana-mobile/mobile-wallet-adapter-protocol/android",
          packageImportPath:
            "import com.solanamobile.mobilewalletadapter.reactnative.SolanaMobileWalletAdapterModulePackage;",
          packageInstance: "new SolanaMobileWalletAdapterModulePackage()"
        }
      }
    }
  }
};
