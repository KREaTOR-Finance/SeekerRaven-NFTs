import { countHolderAssetsByOwner, createSqlClient, ensureBackendSchema, replaceHolderAssets, setJobState } from "../db.js";
import { extractAssetImage, getAssetsByCollection } from "../helius.js";
import { getBackendRuntime } from "../runtime.js";

export type HolderSyncState = {
  cluster: "devnet" | "mainnet-beta";
  collectionMint: string;
  assetCount: number;
  holderCount: number;
  syncedAt: string;
};

export type HolderSyncResult = HolderSyncState;

export function getHolderSyncStateKey(cluster: "devnet" | "mainnet-beta", collectionMint: string): string {
  return `holder_sync:${cluster}:${collectionMint}`;
}

export async function runHolderSync(): Promise<HolderSyncResult> {
  const runtime = getBackendRuntime();
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const collectionAssets = await getAssetsByCollection(runtime.assetApiUrl, runtime.collectionMint);
  const syncedAt = new Date().toISOString();
  const rows = collectionAssets
    .map((asset) => {
      const owner = asset.ownership?.owner;
      if (!owner) {
        return null;
      }

      return {
        assetId: asset.id,
        mint: asset.id,
        owner,
        name: asset.content?.metadata?.name ?? asset.id,
        imageUrl: extractAssetImage(asset),
        ownershipModel: asset.ownership?.ownership_model ?? "unknown",
        compressed: Boolean(asset.compression?.compressed),
        collectionMint: runtime.collectionMint,
        lastSignature: null,
        createdAt: null,
        lastSyncedAt: syncedAt
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await replaceHolderAssets(sql, runtime.collectionMint, rows);

  const distinctOwners = new Set(rows.map((row) => row.owner));
  const result: HolderSyncResult = {
    cluster: runtime.cluster,
    collectionMint: runtime.collectionMint,
    assetCount: rows.length,
    holderCount: distinctOwners.size,
    syncedAt
  };

  await setJobState(sql, getHolderSyncStateKey(runtime.cluster, runtime.collectionMint), result);
  return result;
}
