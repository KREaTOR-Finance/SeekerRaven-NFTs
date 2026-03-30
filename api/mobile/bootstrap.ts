import { buildMobileBootstrap } from "../../scripts/backend/mobile/bootstrap.js";
import { sendError } from "../../scripts/backend/mobile/http.js";
import { getBackendRuntime } from "../../scripts/backend/runtime.js";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed." });
      return;
    }

    const runtime = getBackendRuntime();
    const result = await buildMobileBootstrap(runtime);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
}
