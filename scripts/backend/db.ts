import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

export type GuardUpdateRow = {
  cluster: string;
  candyGuard: string;
  previousAmount: string;
  newAmount: string;
  txSignature: string;
  reason: string;
};

export type PriceSnapshotRow = {
  cluster: string;
  inputLamports: string;
  outputSkrBaseUnits: string;
  effectiveSkrPrice: string;
  quoteResponse: unknown;
};

export type BuyerMintRow = {
  buyer: string;
  signature: string;
  slot: number | null;
  mintedAt: string | null;
};

export type BuyerMintHistoryEntry = {
  signature: string;
  slot: number | null;
  mintedAt: string | null;
};

export type BuyerSummaryRow = {
  buyer: string;
  firstMintSignature: string;
  firstMintSlot: number | null;
  firstMintedAt: string | null;
  lastMintSignature: string;
  lastMintSlot: number | null;
  lastMintedAt: string | null;
  mintHistory: BuyerMintHistoryEntry[];
  mintCount: number;
  updatedAt: string;
};

export type MobileSessionInsertRow = {
  id: string;
  wallet: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  expiresAt: string;
  userAgent?: string | null;
};

export type MobileSessionRow = {
  id: string;
  wallet: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  revokedAt: string | null;
};

export type HolderAssetUpsertRow = {
  assetId: string;
  mint: string;
  owner: string;
  name: string;
  imageUrl: string | null;
  ownershipModel: string;
  compressed: boolean;
  collectionMint: string;
  lastSignature: string | null;
  createdAt: string | null;
  lastSyncedAt?: string;
};

export type HolderAssetRow = {
  assetId: string;
  mint: string;
  owner: string;
  name: string;
  imageUrl: string | null;
  ownershipModel: string;
  compressed: boolean;
  collectionMint: string;
  lastSignature: string | null;
  createdAt: string | null;
  lastSyncedAt: string;
};

type BuyerSummaryRecord = {
  buyer: string;
  first_mint_signature: string;
  first_mint_slot: number | string | null;
  first_minted_at: string | null;
  last_mint_signature: string;
  last_mint_slot: number | string | null;
  last_minted_at: string | null;
  mint_history: unknown;
  mint_count: number | string;
  updated_at: string;
};

type MobileSessionRecord = {
  id: string;
  wallet: string;
  access_token_hash: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  last_used_at: string;
  user_agent: string | null;
  revoked_at: string | null;
};

type HolderAssetRecord = {
  asset_id: string;
  mint: string;
  owner: string;
  name: string;
  image_url: string | null;
  ownership_model: string;
  compressed: boolean;
  collection_mint: string;
  last_signature: string | null;
  created_at: string | null;
  last_synced_at: string;
};

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapBuyerSummary(row: BuyerSummaryRecord): BuyerSummaryRow {
  return {
    buyer: row.buyer,
    firstMintSignature: row.first_mint_signature,
    firstMintSlot: toNumber(row.first_mint_slot),
    firstMintedAt: row.first_minted_at,
    lastMintSignature: row.last_mint_signature,
    lastMintSlot: toNumber(row.last_mint_slot),
    lastMintedAt: row.last_minted_at,
    mintHistory: parseJsonField<BuyerMintHistoryEntry[]>(row.mint_history, []),
    mintCount: Number(row.mint_count),
    updatedAt: row.updated_at
  };
}

function mapMobileSession(row: MobileSessionRecord): MobileSessionRow {
  return {
    id: row.id,
    wallet: row.wallet,
    accessTokenHash: row.access_token_hash,
    refreshTokenHash: row.refresh_token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    userAgent: row.user_agent,
    revokedAt: row.revoked_at
  };
}

function mapHolderAsset(row: HolderAssetRecord): HolderAssetRow {
  return {
    assetId: row.asset_id,
    mint: row.mint,
    owner: row.owner,
    name: row.name,
    imageUrl: row.image_url,
    ownershipModel: row.ownership_model,
    compressed: row.compressed,
    collectionMint: row.collection_mint,
    lastSignature: row.last_signature,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at
  };
}

export function createSqlClient(databaseUrl: string): SqlClient {
  return neon(databaseUrl);
}

export async function ensureBackendSchema(sql: SqlClient): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cluster TEXT NOT NULL,
      input_lamports NUMERIC(40, 0) NOT NULL,
      output_skr_base_units NUMERIC(40, 0) NOT NULL,
      effective_skr_price NUMERIC(40, 0) NOT NULL,
      quote_response JSONB NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS guard_updates (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cluster TEXT NOT NULL,
      candy_guard TEXT NOT NULL,
      previous_amount NUMERIC(40, 0) NOT NULL,
      new_amount NUMERIC(40, 0) NOT NULL,
      tx_signature TEXT NOT NULL,
      reason TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS buyers (
      buyer TEXT PRIMARY KEY,
      first_mint_signature TEXT NOT NULL,
      first_mint_slot BIGINT,
      first_minted_at TIMESTAMPTZ,
      last_mint_signature TEXT NOT NULL,
      last_mint_slot BIGINT,
      last_minted_at TIMESTAMPTZ,
      mint_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      mint_count INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE buyers
    ADD COLUMN IF NOT EXISTS mint_history JSONB NOT NULL DEFAULT '[]'::jsonb
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS job_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mobile_sessions (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      revoked_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS mobile_sessions_wallet_idx
    ON mobile_sessions (wallet)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS mobile_sessions_expires_idx
    ON mobile_sessions (expires_at)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS holder_assets (
      asset_id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      ownership_model TEXT NOT NULL,
      compressed BOOLEAN NOT NULL DEFAULT FALSE,
      collection_mint TEXT NOT NULL,
      last_signature TEXT,
      created_at TIMESTAMPTZ,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS holder_assets_owner_idx
    ON holder_assets (owner)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS holder_assets_collection_idx
    ON holder_assets (collection_mint)
  `;
}

export async function insertPriceSnapshot(sql: SqlClient, row: PriceSnapshotRow): Promise<void> {
  await sql`
    INSERT INTO price_snapshots (
      cluster,
      input_lamports,
      output_skr_base_units,
      effective_skr_price,
      quote_response
    )
    VALUES (
      ${row.cluster},
      ${row.inputLamports},
      ${row.outputSkrBaseUnits},
      ${row.effectiveSkrPrice},
      ${JSON.stringify(row.quoteResponse)}::jsonb
    )
  `;
}

export async function insertGuardUpdate(sql: SqlClient, row: GuardUpdateRow): Promise<void> {
  await sql`
    INSERT INTO guard_updates (
      cluster,
      candy_guard,
      previous_amount,
      new_amount,
      tx_signature,
      reason
    )
    VALUES (
      ${row.cluster},
      ${row.candyGuard},
      ${row.previousAmount},
      ${row.newAmount},
      ${row.txSignature},
      ${row.reason}
    )
  `;
}

export async function upsertBuyerMint(sql: SqlClient, row: BuyerMintRow): Promise<void> {
  await sql`
    INSERT INTO buyers (
      buyer,
      first_mint_signature,
      first_mint_slot,
      first_minted_at,
      last_mint_signature,
      last_mint_slot,
      last_minted_at,
      mint_history,
      mint_count
    )
    VALUES (
      ${row.buyer},
      ${row.signature},
      ${row.slot},
      ${row.mintedAt},
      ${row.signature},
      ${row.slot},
      ${row.mintedAt},
      jsonb_build_array(
        jsonb_build_object(
          'signature', ${row.signature},
          'slot', ${row.slot},
          'mintedAt', ${row.mintedAt}
        )
      ),
      1
    )
    ON CONFLICT (buyer) DO UPDATE SET
      last_mint_signature = EXCLUDED.last_mint_signature,
      last_mint_slot = EXCLUDED.last_mint_slot,
      last_minted_at = EXCLUDED.last_minted_at,
      mint_history = CASE
        WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(buyers.mint_history) AS item
          WHERE item->>'signature' = ${row.signature}
        ) THEN buyers.mint_history
        ELSE jsonb_build_array(
          jsonb_build_object(
            'signature', ${row.signature},
            'slot', ${row.slot},
            'mintedAt', ${row.mintedAt}
          )
        ) || buyers.mint_history
      END,
      mint_count = CASE
        WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(buyers.mint_history) AS item
          WHERE item->>'signature' = ${row.signature}
        ) THEN buyers.mint_count
        ELSE buyers.mint_count + 1
      END,
      updated_at = NOW()
  `;
}

export async function getBuyerByWallet(sql: SqlClient, buyer: string): Promise<BuyerSummaryRow | null> {
  const rows = (await sql`
    SELECT
      buyer,
      first_mint_signature,
      first_mint_slot,
      first_minted_at,
      last_mint_signature,
      last_mint_slot,
      last_minted_at,
      mint_history,
      mint_count,
      updated_at
    FROM buyers
    WHERE buyer = ${buyer}
    LIMIT 1
  `) as BuyerSummaryRecord[];

  if (!rows[0]) {
    return null;
  }

  return mapBuyerSummary(rows[0]);
}

export async function createMobileSession(sql: SqlClient, row: MobileSessionInsertRow): Promise<void> {
  await sql`
    INSERT INTO mobile_sessions (
      id,
      wallet,
      access_token_hash,
      refresh_token_hash,
      expires_at,
      user_agent
    )
    VALUES (
      ${row.id},
      ${row.wallet},
      ${row.accessTokenHash},
      ${row.refreshTokenHash},
      ${row.expiresAt},
      ${row.userAgent ?? null}
    )
  `;
}

async function getMobileSessionByField(
  sql: SqlClient,
  field: "access_token_hash" | "refresh_token_hash",
  value: string
): Promise<MobileSessionRow | null> {
  const query =
    field === "access_token_hash"
      ? sql`
          SELECT *
          FROM mobile_sessions
          WHERE access_token_hash = ${value}
            AND revoked_at IS NULL
          LIMIT 1
        `
      : sql`
          SELECT *
          FROM mobile_sessions
          WHERE refresh_token_hash = ${value}
            AND revoked_at IS NULL
          LIMIT 1
        `;

  const rows = (await query) as MobileSessionRecord[];
  if (!rows[0]) {
    return null;
  }
  return mapMobileSession(rows[0]);
}

export async function getMobileSessionByAccessTokenHash(
  sql: SqlClient,
  accessTokenHash: string
): Promise<MobileSessionRow | null> {
  return getMobileSessionByField(sql, "access_token_hash", accessTokenHash);
}

export async function getMobileSessionByRefreshTokenHash(
  sql: SqlClient,
  refreshTokenHash: string
): Promise<MobileSessionRow | null> {
  return getMobileSessionByField(sql, "refresh_token_hash", refreshTokenHash);
}

export async function rotateMobileSessionTokens(
  sql: SqlClient,
  params: {
    id: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    expiresAt: string;
  }
): Promise<void> {
  await sql`
    UPDATE mobile_sessions
    SET
      access_token_hash = ${params.accessTokenHash},
      refresh_token_hash = ${params.refreshTokenHash},
      expires_at = ${params.expiresAt},
      updated_at = NOW(),
      last_used_at = NOW()
    WHERE id = ${params.id}
  `;
}

export async function touchMobileSession(sql: SqlClient, id: string): Promise<void> {
  await sql`
    UPDATE mobile_sessions
    SET
      last_used_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function revokeMobileSession(sql: SqlClient, id: string): Promise<void> {
  await sql`
    UPDATE mobile_sessions
    SET
      revoked_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function revokeMobileSessionsByWallet(sql: SqlClient, wallet: string): Promise<void> {
  await sql`
    UPDATE mobile_sessions
    SET
      revoked_at = NOW(),
      updated_at = NOW()
    WHERE wallet = ${wallet}
      AND revoked_at IS NULL
  `;
}

export async function deleteMobileSessionsByWallet(sql: SqlClient, wallet: string): Promise<void> {
  await sql`
    DELETE FROM mobile_sessions
    WHERE wallet = ${wallet}
  `;
}

export async function replaceHolderAssets(
  sql: SqlClient,
  collectionMint: string,
  rows: HolderAssetUpsertRow[]
): Promise<void> {
  await sql`
    DELETE FROM holder_assets
    WHERE collection_mint = ${collectionMint}
  `;

  for (const row of rows) {
    await sql`
      INSERT INTO holder_assets (
        asset_id,
        mint,
        owner,
        name,
        image_url,
        ownership_model,
        compressed,
        collection_mint,
        last_signature,
        created_at,
        last_synced_at
      )
      VALUES (
        ${row.assetId},
        ${row.mint},
        ${row.owner},
        ${row.name},
        ${row.imageUrl},
        ${row.ownershipModel},
        ${row.compressed},
        ${row.collectionMint},
        ${row.lastSignature},
        ${row.createdAt},
        ${row.lastSyncedAt ?? new Date().toISOString()}
      )
    `;
  }
}

export async function getHolderAssetsByOwner(
  sql: SqlClient,
  owner: string,
  collectionMint: string
): Promise<HolderAssetRow[]> {
  const rows = (await sql`
    SELECT *
    FROM holder_assets
    WHERE owner = ${owner}
      AND collection_mint = ${collectionMint}
    ORDER BY name ASC, mint ASC
  `) as HolderAssetRecord[];

  return rows.map(mapHolderAsset);
}

export async function countHolderAssetsByOwner(
  sql: SqlClient,
  owner: string,
  collectionMint: string
): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM holder_assets
    WHERE owner = ${owner}
      AND collection_mint = ${collectionMint}
  `) as Array<{ count: number | string }>;

  return rows[0] ? Number(rows[0].count) : 0;
}

export async function setJobState(
  sql: SqlClient,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO job_state (key, value)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
  `;
}

export async function getJobState<T extends Record<string, unknown>>(
  sql: SqlClient,
  key: string
): Promise<T | null> {
  const rows = (await sql`SELECT value FROM job_state WHERE key = ${key} LIMIT 1`) as Array<{
    value: unknown;
  }>;
  if (!rows[0]) {
    return null;
  }
  return rows[0].value as T;
}
