import { deleteWalletSessions, requireMobileSession } from "../../scripts/backend/mobile/auth.js";
import { buildMobileProfile } from "../../scripts/backend/mobile/profile.js";
import { sendError } from "../../scripts/backend/mobile/http.js";
import { getBackendRuntime } from "../../scripts/backend/runtime.js";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const runtime = getBackendRuntime();
    const session = await requireMobileSession(runtime, req);

    if (req.method === "GET") {
      const profile = await buildMobileProfile(runtime, session.wallet, { ensureFresh: true });
      res.status(200).json({ ok: true, profile });
      return;
    }

    if (req.method === "DELETE") {
      await deleteWalletSessions(runtime, session.wallet);
      res.status(200).json({
        ok: true,
        wallet: session.wallet,
        message: "Off-chain mobile sessions were deleted. Public on-chain history remains on Solana."
      });
      return;
    }

    res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    sendError(res, error);
  }
}
