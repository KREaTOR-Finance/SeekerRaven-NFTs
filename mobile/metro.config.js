const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Metaplex packages import this subpath, but Metro may not resolve it from package exports.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@metaplex-foundation/umi/serializers": path.resolve(
    __dirname,
    "node_modules/@metaplex-foundation/umi/dist/cjs/serializers.cjs"
  )
};

module.exports = config;
