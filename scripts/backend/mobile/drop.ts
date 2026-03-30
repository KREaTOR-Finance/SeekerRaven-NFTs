import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchCandyMachine, mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";
import type { AppConfigV2, DropCluster } from "../../common/app-config.js";
import { readJson } from "../../common/io.js";
import { rootPath } from "../../common/paths.js";
import { fetchGroupTokenPrices } from "../candy-guard.js";
import type { BackendRuntime } from "../runtime.js";

type DropConfig = {
  cluster: DropCluster;
  itemsAvailable: number;
  collectionName: string;
  allowlistPerWallet: number;
  publicPerWallet: number;
};

export type DropLifecyclePhase = "sold-out" | "pre-allowlist" | "allowlist" | "public";

export type ChainDropState = {
  supply: number;
  mintedCount: number;
  remainingCount: number;
  allowlistPriceSkrBaseUnits: string;
  publicPriceSkrBaseUnits: string;
};

export function readDropConfig(cluster: DropCluster): DropConfig {
  return readJson<DropConfig>(rootPath("config", `drop.${cluster}.json`));
}

export function resolveDropPhase(
  appConfig: AppConfigV2,
  mintedCount: number,
  supply: number,
  now = new Date()
): DropLifecyclePhase {
  if (mintedCount >= supply) {
    return "sold-out";
  }

  const allowlistStart = new Date(appConfig.allowlistStartIso);
  const publicStart = new Date(appConfig.publicStartIso);

  if (!Number.isNaN(allowlistStart.getTime()) && now < allowlistStart) {
    return "pre-allowlist";
  }

  if (!Number.isNaN(publicStart.getTime()) && now < publicStart) {
    return "allowlist";
  }

  return "public";
}

export async function fetchChainDropState(runtime: BackendRuntime): Promise<ChainDropState> {
  const umi = createUmi(runtime.rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
  const candyMachine = (await fetchCandyMachine(umi, publicKey(runtime.candyMachineId))) as any;
  const prices = await fetchGroupTokenPrices(runtime);
  const dropConfig = readDropConfig(runtime.cluster);
  const mintedCount = Number(candyMachine.itemsRedeemed ?? 0);
  const supply = dropConfig.itemsAvailable;

  return {
    supply,
    mintedCount,
    remainingCount: Math.max(supply - mintedCount, 0),
    allowlistPriceSkrBaseUnits: prices.allowlistAmount.toString(),
    publicPriceSkrBaseUnits: prices.publicAmount.toString()
  };
}
