import fs from "node:fs";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchCandyGuard, fetchCandyMachine, mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";
import { parseArgs, getArgString } from "../common/args.js";
import { getEnv } from "../common/env.js";
import { readJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type DropConfig = {
  cluster: "devnet" | "mainnet-beta";
  itemsAvailable: number;
  symbol: string;
  supply: number;
};

type DeployArtifact = {
  cluster: "devnet" | "mainnet-beta";
  rpcUrl: string;
  candyMachine: string;
  candyGuard: string;
  collectionMint: string;
};

type UploadManifestItem = {
  id: number;
  name: string;
  metadataUri: string;
};

async function main(): Promise<void> {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER) as "devnet" | "mainnet-beta";

  const configPath = rootPath("config", `drop.${cluster}.json`);
  const deployPath = rootPath("artifacts", `deploy.${cluster}.json`);
  const uploadPath = rootPath("artifacts", `upload-manifest.${cluster}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }
  if (!fs.existsSync(deployPath)) {
    throw new Error(`Missing deploy artifact: ${deployPath}`);
  }
  if (!fs.existsSync(uploadPath)) {
    throw new Error(`Missing upload manifest: ${uploadPath}`);
  }

  const config = readJson<DropConfig>(configPath);
  const deploy = readJson<DeployArtifact>(deployPath);
  const upload = readJson<UploadManifestItem[]>(uploadPath).sort((a, b) => a.id - b.id);

  if (deploy.cluster !== cluster || config.cluster !== cluster) {
    throw new Error("Cluster mismatch between config/deploy artifact.");
  }

  const rpcUrl =
    env.SOLANA_RPC_URL ??
    (cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());

  const candyMachine = (await fetchCandyMachine(umi, publicKey(deploy.candyMachine))) as any;
  const candyGuard = (await fetchCandyGuard(umi, publicKey(deploy.candyGuard))) as any;

  if (Number(candyMachine.data.itemsAvailable) !== config.itemsAvailable) {
    throw new Error(
      `itemsAvailable mismatch. on-chain=${candyMachine.data.itemsAvailable} expected=${config.itemsAvailable}`
    );
  }

  if (candyMachine.data.symbol.trim() !== config.symbol) {
    throw new Error(
      `Symbol mismatch. on-chain="${candyMachine.data.symbol}" expected="${config.symbol}"`
    );
  }

  if (candyMachine.itemsLoaded !== config.supply) {
    throw new Error(
      `itemsLoaded mismatch. on-chain=${candyMachine.itemsLoaded} expected=${config.supply}`
    );
  }

  if (candyMachine.items.length !== config.supply) {
    throw new Error(
      `Loaded config line count mismatch. on-chain=${candyMachine.items.length} expected=${config.supply}`
    );
  }

  for (let i = 0; i < upload.length; i += 1) {
    const onChain = candyMachine.items[i];
    const expected = upload[i];
    if (!onChain) {
      throw new Error(`Missing on-chain config line for index ${i}`);
    }
    if (onChain.name !== expected.name.slice(0, 32)) {
      throw new Error(`Config line name mismatch at index ${i}.`);
    }
    if (onChain.uri !== expected.metadataUri) {
      throw new Error(`Config line URI mismatch at index ${i}.`);
    }
  }

  if (candyMachine.collectionMint.toString() !== deploy.collectionMint) {
    throw new Error("Collection mint mismatch between on-chain candy machine and deploy artifact.");
  }

  if (candyGuard.base.toString() !== deploy.candyMachine) {
    throw new Error("Candy guard base mismatch.");
  }

  console.log(`Drop verification succeeded for ${cluster}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
