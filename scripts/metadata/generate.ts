import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../common/env.js";
import { ensureDir, writeJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";
import { buildImageMappings, parseTraitCsv, EXPECTED_SUPPLY } from "../common/traits.js";

type MetadataFile = {
  name: string;
  symbol: string;
  description: string;
  seller_fee_basis_points: number;
  image: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string }>;
  collection: {
    name: string;
    family: string;
  };
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: "image";
    creators: Array<{ address: string; share: number }>;
  };
};

function clearGeneratedMetadataFiles(metadataDir: string): void {
  ensureDir(metadataDir);
  for (const fileName of fs.readdirSync(metadataDir)) {
    if (fileName.toLowerCase().endsWith(".json")) {
      fs.unlinkSync(path.join(metadataDir, fileName));
    }
  }
}

function main(): void {
  const env = getEnv();
  const csvPath = rootPath("data", "seekerravens_traits.csv");
  const metadataDir = rootPath("metadata");
  const artifactsDir = rootPath("artifacts");
  const rows = parseTraitCsv(csvPath);
  const imageMappings = buildImageMappings(rootPath());

  const externalBaseUrl = env.EXTERNAL_BASE_URL ?? "https://yourdomain.com/seekerravens";
  const creatorAddress = env.CREATOR_WALLET ?? "[YOUR_SOLANA_WALLET_ADDRESS]";
  const symbol = env.SYMBOL ?? "SRVN";
  const collectionName = env.COLLECTION_NAME ?? "SeekerRavens";
  const collectionFamily = env.COLLECTION_FAMILY ?? "SeekerRavens Genesis";
  const royaltyBps = Number.parseInt(env.ROYALTY_BPS ?? "750", 10);

  clearGeneratedMetadataFiles(metadataDir);
  ensureDir(artifactsDir);

  const imageMapOut: Array<{ id: number; imageFile: string }> = [];
  const metadataManifestOut: Array<{
    id: number;
    metadataFile: string;
    imageFile: string;
    imagePlaceholderUri: string;
  }> = [];

  for (const row of rows) {
    const imageMapping = imageMappings.find((m) => m.id === row.id);
    if (!imageMapping) {
      throw new Error(`Image mapping not found for token ID ${row.id}`);
    }

    const metadata: MetadataFile = {
      name: row.name,
      symbol,
      description: `A rain-soaked biomechanical raven embedded with ${row.glyph} protocol fragment. Cybernetic augmentations pulse in neon hues against the eternal downpour of the megacity.`,
      seller_fee_basis_points: royaltyBps,
      image: `https://arweave.net/[ARWEAVE_TX_ID_FOR_IMAGE_${row.id}]`,
      external_url: `${externalBaseUrl}/${row.id}`,
      attributes: [
        { trait_type: "Glyph", value: row.glyph },
        { trait_type: "Eye Color", value: row.eyeColor },
        { trait_type: "Dominant Glow", value: row.dominantGlow },
        { trait_type: "Rarity Tier", value: row.rarityTier },
        { trait_type: "Special Trait", value: row.specialTrait },
        { trait_type: "Background City Hue", value: row.backgroundCityHue }
      ],
      collection: {
        name: collectionName,
        family: collectionFamily
      },
      properties: {
        files: [{ uri: "image.png", type: "image/png" }],
        category: "image",
        creators: [{ address: creatorAddress, share: 100 }]
      }
    };

    const metadataFile = `${row.id}.json`;
    writeJson(path.join(metadataDir, metadataFile), metadata);

    imageMapOut.push({ id: row.id, imageFile: imageMapping.imageFile });
    metadataManifestOut.push({
      id: row.id,
      metadataFile,
      imageFile: imageMapping.imageFile,
      imagePlaceholderUri: metadata.image
    });
  }

  writeJson(rootPath("artifacts", "image-map.json"), imageMapOut);
  writeJson(rootPath("artifacts", "metadata-manifest.json"), metadataManifestOut);

  console.log(
    `Generated ${EXPECTED_SUPPLY} metadata files in ${metadataDir} and wrote image/manifest artifacts.`
  );
}

main();

