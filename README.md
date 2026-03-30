# SeekerRavens Mint Pipeline

## Status (Devnet)

- Deploy complete.
- On-chain verification complete.
- Smoke mint complete.

## Policy

- Mint price: **1 SOL-equivalent in SKR**.
- Proceeds routing: minter pays SKR directly into the configured **MUKZ proceeds ATA** via Candy Guard `tokenPayment`.
- No in-app staking transfer logic is implemented.
- Rewards allocation: **pending V2**.

## Current Configured Addresses

- Deployer / creator wallet: `3NuxwGwuwacwyaA7UKJuTpmkvAEhWXUVs7c2Kdexm7Yw`
- MUKZ proceeds wallet: `3RDG3GjGbECBLThKnE2NBJo9wJyZJB3Lgy8rC7QCMUkZ`
- SKR mint: `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`
- Proceeds ATA: `3psqoYnh8e3U4596vXfMN3Z5AAsSFDkTW8tu22X1ZnfP`
- Collection mint: `GbTMJb7KSiLz8VZzHNuwiHL6UkjZn7QVjRcxK4ckeeo9`
- Candy Machine: `2fXDKgHmixUQTQNsfdTuqFCaTxmKjZgKUBBJUN1LatSW`
- Candy Guard: `FErPMKcLhBZYYBycQ59mS3tNeyCqd91yYQoLJoy2gxJA`

## What Is Implemented

- Traits CSV -> metadata JSON generation (`metadata/1.json` .. `metadata/34.json`).
- Metadata validation and fixed Raven2..raven35 mapping to IDs 1..34.
- Allowlist CSV -> Merkle root + proofs artifacts.
- Irys/Arweave upload pipeline and manifest outputs.
- Candy Machine deploy + verify scripts with:
  - allowlist group (`alwlst`)
  - public group (`public`)
  - SKR `tokenPayment`
  - per-wallet mint limits
  - bot tax on public group
- Mobile app config sync and Solana Mobile wallet connect scaffold.
- Native Android app scaffold (`android-native/`) with:
  - Jetpack Compose shell
  - Solana Mobile Wallet Adapter Kotlin integration
  - SIWS-backed backend session flow
  - native mint / holdings / settings screens
- Backend automation scaffold (Vercel + Neon):
  - Jupiter-driven guard price sync
  - primary mint buyer ingestion
  - holder ownership sync for dashboard eligibility

## Core Commands

```powershell
npm run metadata:generate
npm run metadata:validate
npm run allowlist:build -- --cluster devnet
npx tsx scripts/storage/upload.ts --cluster devnet
npx tsx scripts/drop/deploy.ts --cluster devnet
npx tsx scripts/drop/verify.ts --cluster devnet
npx tsx scripts/app/sync-config.ts --cluster devnet
```

## Backend Commands

```powershell
npm run backend:init-db
npm run backend:price-sync
npm run backend:buyer-sync
npm run backend:holder-sync
npm run test:backend
```

Vercel cron endpoints:

- `GET/POST /api/cron/price-sync`
- `GET/POST /api/cron/buyer-sync`
- `GET/POST /api/cron/holder-sync`

If `CRON_SECRET` is set, pass `Authorization: Bearer <CRON_SECRET>` (or `?secret=` in query for manual checks).

## Environment

Use `.env` (already scaffolded) and set at minimum:

- `DEPLOYER_SECRET_KEY_BASE58`
- `CREATOR_WALLET`
- `SKR_MINT`
- `PROCEEDS_WALLET`
- `PROCEEDS_SKR_ATA`
- `MINT_PRICE_SKR_BASE_UNITS`
- `ALLOWLIST_START_ISO`
- `PUBLIC_START_ISO`
- `IRYS_GATEWAY_URL` (recommended: `https://gateway.irys.xyz`)

Backend vars:

- `CANDY_MACHINE_ID` / `CANDY_GUARD_ID` (or ensure deploy artifact exists for auto-fallback)
- `NEON_DATABASE_URL`
- `CRON_SECRET` (recommended)

## Mainnet Checklist

1. Set `.env` for `SOLANA_CLUSTER=mainnet-beta` and mainnet RPC + addresses.
2. Ensure `artifacts/upload-manifest.mainnet-beta.json` and allowlist proofs are final (and that the manifest URLs return real JSON/PNG, not HTML).
3. Run:
   - `npm run config:validate -- --cluster mainnet-beta`
   - `npm run storage:upload -- --cluster mainnet-beta`
   - `npm run drop:deploy -- --cluster mainnet-beta`
   - `npm run drop:verify -- --cluster mainnet-beta`
   - `npm run app:sync-config -- --cluster mainnet-beta`
4. Seed Neon schema (`npm run backend:init-db`) and deploy Vercel cron.
5. Build the native Android APK from `android-native/` and finish `android-native/dapp-store/config.yaml` before submission.
