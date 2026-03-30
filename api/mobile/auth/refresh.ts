import { refreshMobileSession } from "../../../scripts/backend/mobile/auth.js";
import { readJsonBody, sendError } from "../../../scripts/backend/mobile/http.js";
import { MobileApiError } from "../../../scripts/backend/mobile/errors.js";
import { getBackendRuntime } from "../../../scripts/backend/runtime.js";

type RefreshRequest = {
  refreshToken: string;
};

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const body = readJsonBody<RefreshRequest>(req);
    if (!body.refreshToken) {
      throw new MobileApiError(400, "missing_refresh_token", "refreshToken is required.");
    }

    const runtime = getBackendRuntime();
    const result = await refreshMobileSession(runtime, body.refreshToken);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
}
