import { MobileApiError, isMobileApiError } from "./errors.js";

export function assertMethod(req: any, methods: string[]): void {
  if (!methods.includes(req?.method)) {
    throw new MobileApiError(405, "method_not_allowed", "Method not allowed.");
  }
}

export function readJsonBody<T>(req: any): T {
  if (req?.body === undefined || req?.body === null || req.body === "") {
    throw new MobileApiError(400, "invalid_body", "Request body is required.");
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      throw new MobileApiError(400, "invalid_body", "Request body must be valid JSON.");
    }
  }

  return req.body as T;
}

export function getBearerToken(req: any): string | null {
  const header = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return null;
}

export function getUserAgent(req: any): string | null {
  const header = req?.headers?.["user-agent"] ?? req?.headers?.["User-Agent"];
  return typeof header === "string" ? header : null;
}

export function sendError(res: any, error: unknown): void {
  if (isMobileApiError(error)) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      details: error.details
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({
    ok: false,
    code: "internal_error",
    error: message
  });
}
