import { requireMobileSession } from "../../../scripts/backend/mobile/auth.js";
import { MobileApiError } from "../../../scripts/backend/mobile/errors.js";
import { prepareMintTransaction, type MintPrepareRequest } from "../../../scripts/backend/mobile/mint.js";
import { readJsonBody, sendError } from "../../../scripts/backend/mobile/http.js";
import { getBackendRuntime } from "../../../scripts/backend/runtime.js";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const runtime = getBackendRuntime();
    const session = await requireMobileSession(runtime, req);
    const body = readJsonBody<MintPrepareRequest>(req);

    if (body.wallet !== session.wallet) {
      throw new MobileApiError(403, "wallet_mismatch", "Mint preparation wallet does not match the active session.");
    }

    const result = await prepareMintTransaction(runtime, body);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
}
