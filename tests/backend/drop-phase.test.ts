import assert from "node:assert/strict";
import test from "node:test";
import { resolveDropPhase } from "../../scripts/backend/mobile/drop.js";
import type { AppConfigV2 } from "../../scripts/common/app-config.js";

const baseConfig: AppConfigV2 = {
  cluster: "devnet",
  clusterFlavor: "devnet",
  backendBaseUrl: "https://example.com",
  identityUri: "https://example.com/app",
  iconUri: "https://example.com/icon.png",
  siwsDomain: "example.com",
  siwsStatement: "Sign in to SeekerRavens Mint.",
  privacyPolicyUrl: "https://example.com/privacy",
  supportUrl: "https://example.com/support",
  termsOfUseUrl: "https://example.com/terms",
  collectionName: "SeekerRavens",
  rpcPrimary: "https://rpc.example.com",
  rpcFallback: "https://rpc-fallback.example.com",
  candyMachine: "11111111111111111111111111111111",
  candyGuard: "11111111111111111111111111111111",
  collectionMint: "11111111111111111111111111111111",
  collectionUpdateAuthority: "11111111111111111111111111111111",
  skrMint: "11111111111111111111111111111111",
  proceedsWallet: "11111111111111111111111111111111",
  proceedsSkrAta: "11111111111111111111111111111111",
  mintPriceSkrBaseUnits: "1000000000",
  allowlistStartIso: "2026-03-15T16:00:00Z",
  publicStartIso: "2026-03-15T17:00:00Z",
  allowlistPerWallet: 1,
  publicPerWallet: 3,
  botTaxLamports: 10000000,
  merkleRootBase58: "11111111111111111111111111111111",
  allowlistWalletCount: 1,
  policyAnnouncement: "Rewards eligibility remains off-chain in v1."
};

test("resolveDropPhase returns pre-allowlist before the allowlist window", () => {
  const phase = resolveDropPhase(baseConfig, 0, 34, new Date("2026-03-15T15:59:00Z"));
  assert.equal(phase, "pre-allowlist");
});

test("resolveDropPhase returns allowlist between allowlist and public windows", () => {
  const phase = resolveDropPhase(baseConfig, 0, 34, new Date("2026-03-15T16:30:00Z"));
  assert.equal(phase, "allowlist");
});

test("resolveDropPhase returns public after public mint opens", () => {
  const phase = resolveDropPhase(baseConfig, 0, 34, new Date("2026-03-15T17:30:00Z"));
  assert.equal(phase, "public");
});

test("resolveDropPhase returns sold-out once the supply is exhausted", () => {
  const phase = resolveDropPhase(baseConfig, 34, 34, new Date("2026-03-15T17:30:00Z"));
  assert.equal(phase, "sold-out");
});
