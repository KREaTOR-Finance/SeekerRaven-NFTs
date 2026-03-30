import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import NodeIrys from "@irys/sdk";
import { parseArgs, getArgString } from "../common/args.js";
import { getEnv } from "../common/env.js";
import { ensureDir, readJson, writeJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type ImageMapItem = {
  id: number;
  imageFile: string;
};

type Metadata = {
  name: string;
  image: string;
  properties: {
    files: Array<{ uri: string; type: string }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

type UploadManifestItem = {
  id: number;
  name: string;
  imageFile: string;
  metadataFile: string;
  imageUri: string;
  metadataUri: string;
};

function makeMockId(seed: Buffer): string {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 43);
}

async function ensureIrysBalance(
  irys: NodeIrys,
  imageMap: ImageMapItem[],
  tempMetadataDir: string
): Promise<void> {
  let totalBytes = 0;
  for (const item of imageMap) {
    totalBytes += fs.statSync(rootPath(item.imageFile)).size;
    const metadataPath = path.join(tempMetadataDir, `${item.id}.json`);
    if (fs.existsSync(metadataPath)) {
      totalBytes += fs.statSync(metadataPath).size;
    } else {
      totalBytes += fs.statSync(rootPath("metadata", `${item.id}.json`)).size;
    }
  }

  const paddedBytes = Math.ceil(totalBytes * 1.35);
  const needed = await irys.getPrice(paddedBytes);
  const balance = await irys.getLoadedBalance();

  if (balance.lt(needed)) {
    const topUp = needed.minus(balance).multipliedBy(1.1).integerValue();
    console.log(
      `Funding Irys wallet. balance=${balance.toString()} needed=${needed.toString()} topUp=${topUp.toString()}`
    );
    await irys.fund(topUp);
  }
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER) as "devnet" | "mainnet-beta";
  const dryRun = Boolean(args["dry-run"]);

  const gatewayBaseUrl = (env.IRYS_GATEWAY_URL ?? "https://gateway.irys.xyz").replace(/\/+$/, "");

  const imageMapPath = rootPath("artifacts", "image-map.json");
  if (!fs.existsSync(imageMapPath)) {
    throw new Error("image-map.json missing. Run metadata:generate first.");
  }
  const imageMap = readJson<ImageMapItem[]>(imageMapPath).sort((a, b) => a.id - b.id);

  let irys: NodeIrys | null = null;
  if (!dryRun) {
    if (!env.DEPLOYER_SECRET_KEY_BASE58) {
      throw new Error("DEPLOYER_SECRET_KEY_BASE58 required for non-dry upload.");
    }

    const irysUrl =
      env.IRYS_NODE_URL ??
      (cluster === "mainnet-beta" ? "https://node1.irys.xyz" : "https://devnet.irys.xyz");

    if (cluster === "mainnet-beta" && irysUrl.includes("devnet")) {
      throw new Error(
        `Refusing to upload mainnet-beta assets to a devnet Irys node (${irysUrl}). Remove IRYS_NODE_URL override or set it to a mainnet node.`
      );
    }

    irys = await NodeIrys.init({
      url: irysUrl,
      token: "solana",
      privateKey: env.DEPLOYER_SECRET_KEY_BASE58,
      providerUrl: env.SOLANA_RPC_URL
    });
  }

  const tempMetadataDir = rootPath("artifacts", "tmp-metadata");
  ensureDir(tempMetadataDir);

  if (irys) {
    await ensureIrysBalance(irys, imageMap, tempMetadataDir);
  }

  const imageUriById = new Map<number, string>();
  for (const item of imageMap) {
    const imagePath = rootPath(item.imageFile);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Missing image file: ${imagePath}`);
    }

    const imageBytes = fs.readFileSync(imagePath);
    let imageId: string;
    if (dryRun) {
      imageId = `mock-${item.id}-${makeMockId(imageBytes)}`;
    } else {
      const receipt = await irys!.uploadFile(imagePath, {
        tags: [
          { name: "Content-Type", value: "image/png" },
          { name: "App-Name", value: "SeekerRavensGenesis" },
          { name: "Asset-ID", value: String(item.id) }
        ]
      });
      imageId = receipt.id;
    }

    imageUriById.set(item.id, `${gatewayBaseUrl}/${imageId}`);
  }

  const uploadManifest: UploadManifestItem[] = [];
  for (const item of imageMap) {
    const metadataPath = rootPath("metadata", `${item.id}.json`);
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Missing metadata file: ${metadataPath}`);
    }

    const metadata = readJson<Metadata>(metadataPath);
    const imageUri = imageUriById.get(item.id);
    if (!imageUri) {
      throw new Error(`Image URI missing for ID ${item.id}`);
    }

    const finalizedMetadata: Metadata = {
      ...metadata,
      image: imageUri,
      properties: {
        ...metadata.properties,
        files: [{ uri: imageUri, type: "image/png" }]
      }
    };

    const tempMetadataPath = path.join(tempMetadataDir, `${item.id}.json`);
    writeJson(tempMetadataPath, finalizedMetadata);

    let metadataId: string;
    if (dryRun) {
      const bytes = fs.readFileSync(tempMetadataPath);
      metadataId = `mock-meta-${item.id}-${makeMockId(bytes)}`;
    } else {
      const receipt = await irys!.uploadFile(tempMetadataPath, {
        tags: [
          { name: "Content-Type", value: "application/json" },
          { name: "App-Name", value: "SeekerRavensGenesis" },
          { name: "Asset-ID", value: String(item.id) }
        ]
      });
      metadataId = receipt.id;
    }

    uploadManifest.push({
      id: item.id,
      name: finalizedMetadata.name,
      imageFile: item.imageFile,
      metadataFile: `${item.id}.json`,
      imageUri,
      metadataUri: `${gatewayBaseUrl}/${metadataId}`
    });
  }

  writeJson(rootPath("artifacts", `upload-manifest.${cluster}.json`), uploadManifest);
  console.log(
    `${dryRun ? "Dry-run generated" : "Uploaded"} ${uploadManifest.length} image+metadata pairs for ${cluster}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
