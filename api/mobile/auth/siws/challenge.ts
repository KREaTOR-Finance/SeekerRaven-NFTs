import { readAppConfig } from "../../../../scripts/common/app-config.js";
import { createSiwsChallenge } from "../../../../scripts/backend/mobile/auth.js";
import { sendError } from "../../../../scripts/backend/mobile/http.js";
import { getBackendRuntime } from "../../../../scripts/backend/runtime.js";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const runtime = getBackendRuntime();
    const appConfig = readAppConfig(runtime.cluster);
    const challenge = createSiwsChallenge(runtime, appConfig);
    res.status(200).json({ ok: true, ...challenge });
  } catch (error) {
    sendError(res, error);
  }
}
