import {
  createSqlClient,
  ensureBackendSchema,
  upsertBuyerMint
} from "../../../scripts/backend/db.js";
import { requireMobileSession } from "../../../scripts/backend/mobile/auth.js";
import { MobileApiError } from "../../../scripts/backend/mobile/errors.js";
import { buildMobileProfile } from "../../../scripts/backend/mobile/profile.js";
import { readJsonBody, sendError } from "../../../scripts/backend/mobile/http.js";
import { runHolderSync } from "../../../scripts/backend/jobs/holder-sync.js";
import { getBackendRuntime } from "../../../scripts/backend/runtime.js";

type MintConfirmRequest = {
  signature: string;
  mintAddress?: string;
  slot?: number | null;
  mintedAt?: string | null;
};

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const runtime = getBackendRuntime();
    const session = await requireMobileSession(runtime, req);
    const body = readJsonBody<MintConfirmRequest>(req);

    if (!body.signature) {
      throw new MobileApiError(400, "missing_signature", "signature is required.");
    }

    const sql = createSqlClient(runtime.neonDatabaseUrl);
    await ensureBackendSchema(sql);
    await upsertBuyerMint(sql, {
      buyer: session.wallet,
      signature: body.signature,
      slot: body.slot ?? null,
      mintedAt: body.mintedAt ?? new Date().toISOString()
    });

    const holderSync = await runHolderSync();
    const profile = await buildMobileProfile(runtime, session.wallet);

    res.status(200).json({
      ok: true,
      signature: body.signature,
      mintAddress: body.mintAddress ?? null,
      holderSync,
      profile
    });
  } catch (error) {
    sendError(res, error);
  }
}
