export class MobileApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isMobileApiError(error: unknown): error is MobileApiError {
  return error instanceof MobileApiError;
}
