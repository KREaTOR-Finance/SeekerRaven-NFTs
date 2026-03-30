import { runPriceSync } from "../../scripts/backend/jobs/price-sync.js";
import { assertCronAuthorized, isCronAuthError } from "../../scripts/backend/http-auth.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    assertCronAuthorized(req);
    const result = await runPriceSync();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (isCronAuthError(error)) {
      res.status(401).json({ ok: false, error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
}

