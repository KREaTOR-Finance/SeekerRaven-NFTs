import fs from "node:fs";
import { readJson } from "./io.js";
import { rootPath } from "./paths.js";

export type DropCluster = "devnet" | "mainnet-beta";

export type AppConfigV2 = {
  cluster: DropCluster;
  clusterFlavor: DropCluster;
  backendBaseUrl: string;
  identityUri: string;
  iconUri: string;
  siwsDomain: string;
  siwsStatement: string;
  privacyPolicyUrl: string;
  supportUrl: string;
  termsOfUseUrl: string;
  collectionName: string;
  rpcPrimary: string;
  rpcFallback: string;
  candyMachine: string;
  candyGuard: string;
  collectionMint: string;
  collectionUpdateAuthority: string;
  skrMint: string;
  proceedsWallet: string;
  proceedsSkrAta: string;
  mintPriceSkrBaseUnits: string;
  allowlistStartIso: string;
  publicStartIso: string;
  allowlistPerWallet: number;
  publicPerWallet: number;
  botTaxLamports: number;
  merkleRootBase58: string;
  allowlistWalletCount: number;
  policyAnnouncement: string;
};

export function getAppConfigPath(cluster: DropCluster): string {
  return rootPath("artifacts", `app-config.${cluster}.json`);
}

export function readAppConfig(cluster: DropCluster): AppConfigV2 {
  const path = getAppConfigPath(cluster);
  if (!fs.existsSync(path)) {
    throw new Error(`Missing app config artifact: ${path}`);
  }
  return readJson<AppConfigV2>(path);
}
