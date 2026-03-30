import { getEnv } from "../common/env.js";

export class CronAuthError extends Error {}

function getAuthorizationToken(req: any): string | null {
  const header = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  const queryToken = req?.query?.secret;
  if (typeof queryToken === "string") {
    return queryToken;
  }

  return null;
}

export function assertCronAuthorized(req: any): void {
  const env = getEnv();
  const expected = env.CRON_SECRET;

  if (!expected) {
    return;
  }

  const actual = getAuthorizationToken(req);
  if (actual !== expected) {
    throw new CronAuthError("Unauthorized");
  }
}

export function isCronAuthError(error: unknown): error is CronAuthError {
  return error instanceof CronAuthError;
}

