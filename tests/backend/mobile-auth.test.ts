import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import { __testing, buildSiwsMessage, createSiwsChallenge } from "../../scripts/backend/mobile/auth.js";
import type { AppConfigV2 } from "../../scripts/common/app-config.js";

const appConfig: AppConfigV2 = {
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

const runtime = {
  cluster: "devnet",
  mobileAuthSecret: "test-secret"
} as const;

test("createSiwsChallenge signs and round-trips the stateless challenge payload", () => {
  const challenge = createSiwsChallenge(runtime as any, appConfig);
  const payload = __testing.verifySignedPayload(runtime.mobileAuthSecret, challenge.challengeToken);

  assert.equal(payload.domain, appConfig.siwsDomain);
  assert.equal(payload.statement, appConfig.siwsStatement);
  assert.equal(payload.uri, appConfig.identityUri);
  assert.equal(payload.chainId, "103");
  assert.deepEqual(payload.resources, [appConfig.privacyPolicyUrl, appConfig.supportUrl, appConfig.termsOfUseUrl]);
});

test("verifySignedPayload rejects a tampered token", () => {
  const challenge = createSiwsChallenge(runtime as any, appConfig);
  const tampered = challenge.challengeToken.replace(/.$/, "A");
  assert.throws(() => __testing.verifySignedPayload(runtime.mobileAuthSecret, tampered));
});

test("buildSiwsMessage matches ed25519 signature verification", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const rawPublicKey = Buffer.from(spki.subarray(spki.length - 32));
  const address = new PublicKey(rawPublicKey).toBase58();
  const challenge = createSiwsChallenge(runtime as any, appConfig);
  const payload = __testing.verifySignedPayload(runtime.mobileAuthSecret, challenge.challengeToken);
  const message = Buffer.from(buildSiwsMessage(payload, address), "utf8");
  const signature = crypto.sign(null, message, privateKey);

  assert.equal(__testing.verifyEd25519Signature(rawPublicKey, message, signature), true);
});
