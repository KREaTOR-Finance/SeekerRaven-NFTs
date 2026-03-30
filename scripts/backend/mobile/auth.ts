import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import type { AppConfigV2 } from "../../common/app-config.js";
import {
  createMobileSession,
  createSqlClient,
  deleteMobileSessionsByWallet,
  ensureBackendSchema,
  getMobileSessionByAccessTokenHash,
  getMobileSessionByRefreshTokenHash,
  revokeMobileSession,
  revokeMobileSessionsByWallet,
  rotateMobileSessionTokens,
  touchMobileSession,
  type MobileSessionRow
} from "../db.js";
import type { BackendRuntime } from "../runtime.js";
import { MobileApiError } from "./errors.js";
import { getBearerToken, getUserAgent } from "./http.js";
import { buildMobileProfile } from "./profile.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 72 * 60 * 60 * 1000;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type SiwsChallengePayload = {
  domain: string;
  statement: string;
  uri: string;
  version: "1";
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  requestId: string;
  resources: string[];
};

export type SiwsVerifyRequest = {
  challengeToken: string;
  wallet: string;
  publicKeyBase64: string;
  signedMessageBase64: string;
  signatureBase64: string;
  signatureType?: string;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function decodeBase64(value: string, label: string): Buffer {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new MobileApiError(400, "invalid_payload", `${label} must be base64 encoded.`);
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeWalletAddress(wallet: string): string {
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new MobileApiError(400, "invalid_wallet", "Wallet address is invalid.");
  }
}

function clusterChainId(cluster: "devnet" | "mainnet-beta"): string {
  return cluster === "mainnet-beta" ? "101" : "103";
}

function randomAlphaNumeric(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < bytes.length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

function signPayload(secret: string, payload: SiwsChallengePayload): string {
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

function verifySignedPayload(secret: string, token: string): SiwsChallengePayload {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new MobileApiError(400, "invalid_challenge", "Challenge token is malformed.");
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  const actualSignature = base64UrlDecode(encodedSignature);
  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new MobileApiError(401, "invalid_challenge", "Challenge token signature is invalid.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SiwsChallengePayload;
  const expiration = new Date(payload.expirationTime).getTime();
  if (Number.isNaN(expiration) || expiration < Date.now()) {
    throw new MobileApiError(401, "challenge_expired", "Challenge token has expired.");
  }

  return payload;
}

export function buildSiwsMessage(payload: SiwsChallengePayload, address: string): string {
  const header = `${payload.domain} wants you to sign in with your Solana account:`;
  let prefix = `${header}\n${address}`;
  const suffix: string[] = [];

  if (payload.uri) suffix.push(`URI: ${payload.uri}`);
  if (payload.version) suffix.push(`Version: ${payload.version}`);
  if (payload.chainId) suffix.push(`Chain ID: ${payload.chainId}`);
  if (payload.nonce) suffix.push(`Nonce: ${payload.nonce}`);
  if (payload.issuedAt) suffix.push(`Issued At: ${payload.issuedAt}`);
  if (payload.expirationTime) suffix.push(`Expiration Time: ${payload.expirationTime}`);
  if (payload.requestId) suffix.push(`Request ID: ${payload.requestId}`);
  if (payload.resources.length > 0) {
    suffix.push(`Resources:\n- ${payload.resources.join("\n- ")}`);
  }

  if (payload.statement) {
    prefix = `${prefix}\n\n${payload.statement}\n`;
  } else {
    prefix = `${prefix}\n\n`;
  }

  return suffix.length === 0 ? prefix.trim() : `${prefix}\n${suffix.join("\n")}`;
}

function createEd25519PublicKey(publicKeyRaw: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
    format: "der",
    type: "spki"
  });
}

function verifyEd25519Signature(publicKeyRaw: Buffer, message: Buffer, signature: Buffer): boolean {
  const publicKey = createEd25519PublicKey(publicKeyRaw);
  return crypto.verify(null, message, publicKey, signature);
}

async function createSessionTokens(
  runtime: BackendRuntime,
  wallet: string,
  userAgent: string | null
): Promise<SessionTokens> {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const accessToken = createOpaqueToken();
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await createMobileSession(sql, {
    id: crypto.randomUUID(),
    wallet,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
    userAgent
  });

  return {
    accessToken,
    refreshToken,
    expiresAt
  };
}

async function rotateSessionTokens(runtime: BackendRuntime, sessionId: string): Promise<SessionTokens> {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const accessToken = createOpaqueToken();
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await rotateMobileSessionTokens(sql, {
    id: sessionId,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt
  });

  return {
    accessToken,
    refreshToken,
    expiresAt
  };
}

export function createSiwsChallenge(runtime: BackendRuntime, appConfig: AppConfigV2) {
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const payload: SiwsChallengePayload = {
    domain: appConfig.siwsDomain,
    statement: appConfig.siwsStatement,
    uri: appConfig.identityUri,
    version: "1",
    chainId: clusterChainId(runtime.cluster),
    nonce: randomAlphaNumeric(16),
    issuedAt,
    expirationTime,
    requestId: crypto.randomUUID(),
    resources: [appConfig.privacyPolicyUrl, appConfig.supportUrl, appConfig.termsOfUseUrl].filter(Boolean)
  };

  return {
    challengeToken: signPayload(runtime.mobileAuthSecret, payload),
    payload
  };
}

export async function verifySiwsAndCreateSession(
  runtime: BackendRuntime,
  appConfig: AppConfigV2,
  req: any,
  input: SiwsVerifyRequest
) {
  const challenge = verifySignedPayload(runtime.mobileAuthSecret, input.challengeToken);
  const wallet = normalizeWalletAddress(input.wallet);
  const publicKeyRaw = decodeBase64(input.publicKeyBase64, "publicKeyBase64");
  const signedMessage = decodeBase64(input.signedMessageBase64, "signedMessageBase64");
  const signature = decodeBase64(input.signatureBase64, "signatureBase64");

  if (input.signatureType && input.signatureType.toLowerCase() !== "ed25519") {
    throw new MobileApiError(400, "invalid_signature_type", "Only ed25519 signatures are supported.");
  }

  if (new PublicKey(publicKeyRaw).toBase58() !== wallet) {
    throw new MobileApiError(401, "wallet_mismatch", "Signed wallet does not match the requested wallet.");
  }

  const expectedMessage = buildSiwsMessage(challenge, wallet);
  if (signedMessage.toString("utf8") !== expectedMessage) {
    throw new MobileApiError(401, "message_mismatch", "Signed SIWS payload does not match the issued challenge.");
  }

  if (!verifyEd25519Signature(publicKeyRaw, signedMessage, signature)) {
    throw new MobileApiError(401, "invalid_signature", "SIWS signature verification failed.");
  }

  if (challenge.domain !== appConfig.siwsDomain) {
    throw new MobileApiError(401, "domain_mismatch", "SIWS domain does not match the configured relying party.");
  }

  const tokens = await createSessionTokens(runtime, wallet, getUserAgent(req));
  const profile = await buildMobileProfile(runtime, wallet, { ensureFresh: true });

  return {
    wallet,
    ...tokens,
    profile
  };
}

export async function refreshMobileSession(runtime: BackendRuntime, refreshToken: string) {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const session = await getMobileSessionByRefreshTokenHash(sql, hashToken(refreshToken));
  if (!session) {
    throw new MobileApiError(401, "invalid_session", "Refresh token is invalid.");
  }

  if (session.revokedAt) {
    throw new MobileApiError(401, "revoked_session", "Session has been revoked.");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await revokeMobileSession(sql, session.id);
    throw new MobileApiError(401, "expired_session", "Session has expired.");
  }

  const tokens = await rotateSessionTokens(runtime, session.id);
  const profile = await buildMobileProfile(runtime, session.wallet);

  return {
    wallet: session.wallet,
    ...tokens,
    profile
  };
}

export async function requireMobileSession(runtime: BackendRuntime, req: any): Promise<MobileSessionRow> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    throw new MobileApiError(401, "missing_session", "Authorization token is required.");
  }

  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);
  const session = await getMobileSessionByAccessTokenHash(sql, hashToken(accessToken));
  if (!session) {
    throw new MobileApiError(401, "invalid_session", "Authorization token is invalid.");
  }

  if (session.revokedAt) {
    throw new MobileApiError(401, "revoked_session", "Session has been revoked.");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await revokeMobileSession(sql, session.id);
    throw new MobileApiError(401, "expired_session", "Session has expired.");
  }

  await touchMobileSession(sql, session.id);
  return session;
}

export async function revokeCurrentSession(runtime: BackendRuntime, req: any): Promise<{ wallet: string }> {
  const session = await requireMobileSession(runtime, req);
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);
  await revokeMobileSession(sql, session.id);
  return { wallet: session.wallet };
}

export async function deleteWalletSessions(runtime: BackendRuntime, wallet: string): Promise<void> {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);
  await deleteMobileSessionsByWallet(sql, wallet);
}

export async function revokeWalletSessions(runtime: BackendRuntime, wallet: string): Promise<void> {
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);
  await revokeMobileSessionsByWallet(sql, wallet);
}

export const __testing = {
  verifySignedPayload,
  verifyEd25519Signature
};
