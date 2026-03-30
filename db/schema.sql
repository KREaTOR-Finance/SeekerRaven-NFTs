CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cluster TEXT NOT NULL,
  input_lamports NUMERIC(40, 0) NOT NULL,
  output_skr_base_units NUMERIC(40, 0) NOT NULL,
  effective_skr_price NUMERIC(40, 0) NOT NULL,
  quote_response JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS guard_updates (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cluster TEXT NOT NULL,
  candy_guard TEXT NOT NULL,
  previous_amount NUMERIC(40, 0) NOT NULL,
  new_amount NUMERIC(40, 0) NOT NULL,
  tx_signature TEXT NOT NULL,
  reason TEXT NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS job_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

CREATE INDEX IF NOT EXISTS mobile_sessions_wallet_idx ON mobile_sessions (wallet);
CREATE INDEX IF NOT EXISTS mobile_sessions_expires_idx ON mobile_sessions (expires_at);

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
);

CREATE INDEX IF NOT EXISTS holder_assets_owner_idx ON holder_assets (owner);
CREATE INDEX IF NOT EXISTS holder_assets_collection_idx ON holder_assets (collection_mint);
