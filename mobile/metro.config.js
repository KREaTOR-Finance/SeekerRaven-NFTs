const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const umiSerializersFile = path.resolve(
  __dirname,
  "node_modules/@metaplex-foundation/umi/dist/cjs/serializers.cjs"
);

// Metaplex packages import the `@metaplex-foundation/umi/serializers` subpath.
// Metro sometimes fails to resolve subpath exports reliably across platforms.
// Intercept the request and point it directly at Umi's bundled entry.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@metaplex-foundation/umi/serializers") {
    return {
      type: "sourceFile",
      filePath: umiSerializersFile
    };
  }

  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
