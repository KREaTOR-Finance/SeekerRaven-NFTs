import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { getEnv } from "../common/env.js";
import { readJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type DeployArtifact = {
  candyMachine: string;
  candyGuard: string;
  collectionMint: string;
};

export type BackendRuntime = {
  cluster: "devnet" | "mainnet-beta";
  rpcUrl: string;
  assetApiUrl: string;
  deployerSecretKeyBase58: string;
  candyMachineId: string;
  candyGuardId: string;
  collectionMint: string;
  skrMint: string;
  proceedsSkrAta: string;
  jupiterQuoteUrl: string;
  priceSyncSolInputLamports: bigint;
  priceBufferBps: number;
  priceUpdateMinChangeBps: number;
  neonDatabaseUrl: string;
  mobileAuthSecret: string;
};

function assertPublicKey(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${name} is not a valid public key: ${value}`);
  }
}

function parseBigIntConfig(name: string, value: string | undefined, fallback: string): bigint {
  const raw = value ?? fallback;
  let parsed: bigint;
  try {
    parsed = BigInt(raw);
  } catch {
    throw new Error(`${name} must be an integer string.`);
  }
  if (parsed <= 0n) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return parsed;
}

function parseBpsConfig(name: string, value: string | undefined, fallback: number): number {
  const raw = value ?? String(fallback);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(`${name} must be an integer between 0 and 10000.`);
  }
  return parsed;
}

function resolveProceedsAta(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_SKR_ATA ?? env.GUARDIAN_SKR_ATA ?? env.TREASURY_SKR_ATA;
}

function readDeployArtifact(cluster: "devnet" | "mainnet-beta"): DeployArtifact | null {
  const path = rootPath("artifacts", `deploy.${cluster}.json`);
  if (!fs.existsSync(path)) {
    return null;
  }
  return readJson<DeployArtifact>(path);
}

export function getBackendRuntime(): BackendRuntime {
  const env = getEnv();
  const deploy = readDeployArtifact(env.SOLANA_CLUSTER);

  if (!env.DEPLOYER_SECRET_KEY_BASE58) {
    throw new Error("DEPLOYER_SECRET_KEY_BASE58 is required.");
  }
  if (!env.NEON_DATABASE_URL) {
    throw new Error("NEON_DATABASE_URL is required.");
  }

  const rpcUrl =
    env.SOLANA_RPC_URL ??
    (env.SOLANA_CLUSTER === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");
  const assetApiUrl = env.HELIUS_RPC_URL ?? env.SOLANA_RPC_URL ?? rpcUrl;
  const mobileAuthSecret = env.MOBILE_AUTH_SECRET ?? env.CRON_SECRET;
  if (!mobileAuthSecret) {
    throw new Error("MOBILE_AUTH_SECRET (or CRON_SECRET fallback) is required.");
  }

  return {
    cluster: env.SOLANA_CLUSTER,
    rpcUrl,
    assetApiUrl,
    deployerSecretKeyBase58: env.DEPLOYER_SECRET_KEY_BASE58,
    candyMachineId: assertPublicKey("CANDY_MACHINE_ID", env.CANDY_MACHINE_ID ?? deploy?.candyMachine),
    candyGuardId: assertPublicKey("CANDY_GUARD_ID", env.CANDY_GUARD_ID ?? deploy?.candyGuard),
    collectionMint: assertPublicKey("COLLECTION_MINT", deploy?.collectionMint),
    skrMint: assertPublicKey("SKR_MINT", env.SKR_MINT),
    proceedsSkrAta: assertPublicKey(
      "PROCEEDS_SKR_ATA (or GUARDIAN_SKR_ATA / TREASURY_SKR_ATA)",
      resolveProceedsAta(env)
    ),
    jupiterQuoteUrl: env.JUPITER_QUOTE_URL ?? "https://quote-api.jup.ag/v6/quote",
    priceSyncSolInputLamports: parseBigIntConfig(
      "PRICE_SYNC_SOL_INPUT_LAMPORTS",
      env.PRICE_SYNC_SOL_INPUT_LAMPORTS,
      "1000000000"
    ),
    priceBufferBps: parseBpsConfig("PRICE_BUFFER_BPS", env.PRICE_BUFFER_BPS, 100),
    priceUpdateMinChangeBps: parseBpsConfig(
      "PRICE_UPDATE_MIN_CHANGE_BPS",
      env.PRICE_UPDATE_MIN_CHANGE_BPS,
      100
    ),
    neonDatabaseUrl: env.NEON_DATABASE_URL,
    mobileAuthSecret
  };
}
