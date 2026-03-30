import fs from "node:fs";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { parseArgs, getArgString } from "../common/args.js";
import { getEnv } from "../common/env.js";
import { readJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

const DROP_CONFIG_SCHEMA = z.object({
  cluster: z.enum(["devnet", "mainnet-beta"]),
  supply: z.number().int().positive(),
  symbol: z.string().min(1),
  collectionName: z.string().min(1),
  collectionFamily: z.string().min(1),
  sellerFeeBasisPoints: z.number().int().min(0).max(10000),
  allowlistPerWallet: z.number().int().positive(),
  publicPerWallet: z.number().int().positive(),
  botTaxLamports: z.number().int().min(0),
  itemsAvailable: z.number().int().positive()
});

function assertPubkey(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  try {
    new PublicKey(value);
  } catch {
    throw new Error(`${name} is not a valid public key: ${value}`);
  }
}

function resolveProceedsAta(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_SKR_ATA ?? env.GUARDIAN_SKR_ATA ?? env.TREASURY_SKR_ATA;
}

function resolveProceedsWallet(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_WALLET ?? env.GUARDIAN_WALLET;
}

function main(): void {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER);

  if (!cluster) {
    throw new Error("Cluster not provided.");
  }

  const configPath = rootPath("config", `drop.${cluster}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }

  const config = DROP_CONFIG_SCHEMA.parse(readJson<unknown>(configPath));
  if (config.cluster !== cluster) {
    throw new Error(`Config cluster mismatch in ${configPath}`);
  }
  if (config.supply !== 34 || config.itemsAvailable !== 34) {
    throw new Error("SeekerRavens Genesis supply must remain fixed at 34.");
  }

  assertPubkey("CREATOR_WALLET", env.CREATOR_WALLET);
  assertPubkey("PROCEEDS_WALLET or GUARDIAN_WALLET", resolveProceedsWallet(env));
  assertPubkey("SKR_MINT", env.SKR_MINT);
  assertPubkey(
    "PROCEEDS_SKR_ATA (or GUARDIAN_SKR_ATA / TREASURY_SKR_ATA)",
    resolveProceedsAta(env)
  );

  if (!env.DEPLOYER_SECRET_KEY_BASE58) {
    throw new Error("DEPLOYER_SECRET_KEY_BASE58 is required.");
  }
  if (!env.MINT_PRICE_SKR_BASE_UNITS) {
    throw new Error("MINT_PRICE_SKR_BASE_UNITS is required.");
  }
  if (!env.ALLOWLIST_START_ISO || !env.PUBLIC_START_ISO) {
    throw new Error("ALLOWLIST_START_ISO and PUBLIC_START_ISO are required.");
  }

  const allowlistDate = new Date(env.ALLOWLIST_START_ISO);
  const publicDate = new Date(env.PUBLIC_START_ISO);
  if (Number.isNaN(allowlistDate.getTime()) || Number.isNaN(publicDate.getTime())) {
    throw new Error("ALLOWLIST_START_ISO or PUBLIC_START_ISO is not valid ISO datetime.");
  }
  if (publicDate <= allowlistDate) {
    throw new Error("PUBLIC_START_ISO must be after ALLOWLIST_START_ISO.");
  }

  console.log(`Config validated for cluster: ${cluster}`);
}

main();
