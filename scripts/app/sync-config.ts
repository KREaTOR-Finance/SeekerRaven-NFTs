import fs from "node:fs";
import { URL } from "node:url";
import { parseArgs, getArgString } from "../common/args.js";
import type { AppConfigV2, DropCluster } from "../common/app-config.js";
import { getEnv } from "../common/env.js";
import { readJson, writeJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";
import { PROJECT_POLICY_ANNOUNCEMENT } from "../common/policy.js";

type DeployArtifact = {
  cluster: "devnet" | "mainnet-beta";
  candyMachine: string;
  candyGuard: string;
  collectionMint: string;
  collectionUpdateAuthority: string;
  deployedAt: string;
};

type AllowlistArtifact = {
  merkleRootBase58: string;
  walletCount: number;
};

function resolveProceedsAta(env: ReturnType<typeof getEnv>): string {
  return env.PROCEEDS_SKR_ATA ?? env.GUARDIAN_SKR_ATA ?? env.TREASURY_SKR_ATA ?? "";
}

function resolveProceedsWallet(env: ReturnType<typeof getEnv>): string {
  return env.PROCEEDS_WALLET ?? env.GUARDIAN_WALLET ?? "";
}

function resolveIdentityUri(env: ReturnType<typeof getEnv>): string {
  return env.APP_IDENTITY_URI ?? env.EXTERNAL_BASE_URL ?? "https://yourdomain.com";
}

function resolveOrigin(value: string): string {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return value;
  }
}

function resolveDomain(env: ReturnType<typeof getEnv>, identityUri: string): string {
  if (env.SIWS_DOMAIN) {
    return env.SIWS_DOMAIN;
  }
  try {
    return new URL(identityUri).host;
  } catch {
    return "localhost";
  }
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function main(): void {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER) as DropCluster;

  if (!cluster) {
    throw new Error("Missing cluster argument.");
  }

  const configPath = rootPath("config", `drop.${cluster}.json`);
  const deployPath = rootPath("artifacts", `deploy.${cluster}.json`);
  const allowlistPath = rootPath("artifacts", `allowlist-proofs.${cluster}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing drop config: ${configPath}`);
  }
  if (!fs.existsSync(deployPath)) {
    throw new Error(`Missing deploy artifact: ${deployPath}`);
  }
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`Missing allowlist artifact: ${allowlistPath}`);
  }

  const config = readJson<Record<string, unknown>>(configPath);
  const deploy = readJson<DeployArtifact>(deployPath);
  const allowlist = readJson<AllowlistArtifact>(allowlistPath);
  const identityUri = resolveIdentityUri(env);
  const identityOrigin = resolveOrigin(identityUri);

  const appConfig: AppConfigV2 = {
    cluster,
    clusterFlavor: cluster,
    backendBaseUrl: env.BACKEND_BASE_URL ?? identityOrigin,
    identityUri,
    iconUri: env.APP_ICON_URI ?? "favicon.ico",
    siwsDomain: resolveDomain(env, identityUri),
    siwsStatement:
      env.SIWS_STATEMENT ??
      "Sign in to SeekerRaven Mint to manage your wallet session, mint history, and holder eligibility.",
    privacyPolicyUrl: env.PRIVACY_POLICY_URL ?? `${identityOrigin}/privacy`,
    supportUrl: env.SUPPORT_URL ?? identityOrigin,
    termsOfUseUrl: env.TERMS_OF_USE_URL ?? `${identityOrigin}/terms`,
    collectionName: String(config["collectionName"] ?? env.COLLECTION_NAME ?? "SeekerRavens"),
    rpcPrimary: env.HELIUS_RPC_URL ?? env.SOLANA_RPC_URL ?? "",
    rpcFallback: env.FALLBACK_RPC_URL ?? env.SOLANA_RPC_URL ?? "",
    candyMachine: deploy.candyMachine,
    candyGuard: deploy.candyGuard,
    collectionMint: deploy.collectionMint,
    collectionUpdateAuthority: deploy.collectionUpdateAuthority,
    skrMint: env.SKR_MINT ?? "",
    proceedsWallet: resolveProceedsWallet(env),
    proceedsSkrAta: resolveProceedsAta(env),
    mintPriceSkrBaseUnits: env.MINT_PRICE_SKR_BASE_UNITS ?? "",
    allowlistStartIso: env.ALLOWLIST_START_ISO ?? "",
    publicStartIso: env.PUBLIC_START_ISO ?? "",
    allowlistPerWallet: asNumber(config["allowlistPerWallet"]),
    publicPerWallet: asNumber(config["publicPerWallet"]),
    botTaxLamports: asNumber(config["botTaxLamports"]),
    merkleRootBase58: allowlist.merkleRootBase58,
    allowlistWalletCount: allowlist.walletCount,
    policyAnnouncement: PROJECT_POLICY_ANNOUNCEMENT
  };

  writeJson(rootPath("artifacts", `app-config.${cluster}.json`), appConfig);
  writeJson(rootPath("mobile", "src", "config", `drop-config.${cluster}.json`), appConfig);
  writeJson(rootPath("mobile", "src", "config", "drop-config.json"), appConfig);
  writeJson(rootPath("android-native", "app", "src", "main", "assets", `drop-config.${cluster}.json`), appConfig);
  writeJson(rootPath("android-native", "app", "src", "main", "assets", "drop-config.json"), appConfig);
  console.log(`Wrote app config artifact for ${cluster}.`);
}

main();
