import { readAppConfig } from "../../../../scripts/common/app-config.js";
import { verifySiwsAndCreateSession, type SiwsVerifyRequest } from "../../../../scripts/backend/mobile/auth.js";
import { readJsonBody, sendError } from "../../../../scripts/backend/mobile/http.js";
import { getBackendRuntime } from "../../../../scripts/backend/runtime.js";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const runtime = getBackendRuntime();
    const appConfig = readAppConfig(runtime.cluster);
    const body = readJsonBody<SiwsVerifyRequest>(req);
    const result = await verifySiwsAndCreateSession(runtime, appConfig, req, body);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
}
