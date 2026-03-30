import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional()
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional()
);

const ENV_SCHEMA = z.object({
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SOLANA_RPC_URL: optionalUrl,
  HELIUS_RPC_URL: optionalUrl,
  FALLBACK_RPC_URL: optionalUrl,
  DEPLOYER_SECRET_KEY_BASE58: optionalString,
  SKR_MINT: optionalString,
  TREASURY_SKR_ATA: optionalString,
  PROCEEDS_WALLET: optionalString,
  PROCEEDS_SKR_ATA: optionalString,
  GUARDIAN_WALLET: optionalString,
  GUARDIAN_SKR_ATA: optionalString,
  MINT_PRICE_SKR_BASE_UNITS: optionalString,
  CREATOR_WALLET: optionalString,
  ALLOWLIST_START_ISO: optionalString,
  PUBLIC_START_ISO: optionalString,
  BOT_TAX_LAMPORTS: optionalString,
  EXTERNAL_BASE_URL: optionalString,
  COLLECTION_NAME: optionalString,
  COLLECTION_FAMILY: optionalString,
  SYMBOL: optionalString,
  ROYALTY_BPS: optionalString,
  IRYS_NODE_URL: optionalString,
  IRYS_GATEWAY_URL: optionalUrl,
  COLLECTION_MINT_OVERRIDE: optionalString,
  CANDY_MACHINE_ID: optionalString,
  CANDY_GUARD_ID: optionalString,
  BACKEND_BASE_URL: optionalUrl,
  APP_IDENTITY_URI: optionalUrl,
  APP_ICON_URI: optionalString,
  SIWS_DOMAIN: optionalString,
  SIWS_STATEMENT: optionalString,
  PRIVACY_POLICY_URL: optionalUrl,
  SUPPORT_URL: optionalUrl,
  TERMS_OF_USE_URL: optionalUrl,
  MOBILE_AUTH_SECRET: optionalString,
  JUPITER_QUOTE_URL: optionalUrl,
  PRICE_SYNC_SOL_INPUT_LAMPORTS: optionalString,
  PRICE_BUFFER_BPS: optionalString,
  PRICE_UPDATE_MIN_CHANGE_BPS: optionalString,
  NEON_DATABASE_URL: optionalUrl,
  CRON_SECRET: optionalString
});

type Env = z.infer<typeof ENV_SCHEMA>;

export function getEnv(): Env {
  return ENV_SCHEMA.parse(process.env);
}
