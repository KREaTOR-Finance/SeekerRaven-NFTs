import { countHolderAssetsByOwner, createSqlClient, ensureBackendSchema, getBuyerByWallet, getHolderAssetsByOwner, getJobState } from "../db.js";
import type { BackendRuntime } from "../runtime.js";
import { runHolderSync, type HolderSyncState } from "../jobs/holder-sync.js";

export type MobileProfileSummary = {
  wallet: string;
  eligible: boolean;
  holdingCount: number;
  holderSyncStale: boolean;
  lastHolderSyncAt: string | null;
  mintCount: number;
  firstMintedAt: string | null;
  lastMintedAt: string | null;
  mintHistory: Array<{
    signature: string;
    slot: number | null;
    mintedAt: string | null;
  }>;
  holdings: Array<{
    assetId: string;
    mint: string;
    name: string;
    imageUrl: string | null;
  }>;
};

function isHolderSyncStale(lastSyncedAt: string | null, now = Date.now()): boolean {
  if (!lastSyncedAt) {
    return true;
  }

  const syncedAt = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(syncedAt)) {
    return true;
  }

  return now - syncedAt > 15 * 60 * 1000;
}

export async function buildMobileProfile(
  runtime: BackendRuntime,
  wallet: string,
  options: { ensureFresh?: boolean } = {}
): Promise<MobileProfileSummary> {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const stateKey = `holder_sync:${runtime.cluster}:${runtime.collectionMint}`;
  const state = await getJobState<HolderSyncState>(sql, stateKey);
  if (options.ensureFresh && isHolderSyncStale(state?.syncedAt ?? null)) {
    await runHolderSync();
  }

  const refreshedState = await getJobState<HolderSyncState>(sql, stateKey);
  const buyer = await getBuyerByWallet(sql, wallet);
  const holdings = await getHolderAssetsByOwner(sql, wallet, runtime.collectionMint);
  const holdingCount = await countHolderAssetsByOwner(sql, wallet, runtime.collectionMint);

  return {
    wallet,
    eligible: holdingCount > 0,
    holdingCount,
    holderSyncStale: isHolderSyncStale(refreshedState?.syncedAt ?? null),
    lastHolderSyncAt: refreshedState?.syncedAt ?? null,
    mintCount: buyer?.mintCount ?? 0,
    firstMintedAt: buyer?.firstMintedAt ?? null,
    lastMintedAt: buyer?.lastMintedAt ?? null,
    mintHistory: buyer?.mintHistory ?? [],
    holdings: holdings.map((holding) => ({
      assetId: holding.assetId,
      mint: holding.mint,
      name: holding.name,
      imageUrl: holding.imageUrl
    }))
  };
}
