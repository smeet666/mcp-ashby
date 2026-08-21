/**
 * Six codes and no more. A failure is never rendered as an empty result: a
 * refused request, an unreadable payload and a genuine absence are three
 * different answers.
 */
export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "parse_failure"
  | "network_error"
  | "timeout";

export class AshbyError extends Error {
  readonly code: ErrorCode;
  /** Values the board actually publishes, when a filter was checked against them. */
  readonly allowedValues?: string[];
  /** Set on rate_limited when a delay was named. */
  retryAfterMs?: number;

  constructor(code: ErrorCode, message: string, allowedValues?: string[]) {
    super(message);
    this.name = "AshbyError";
    this.code = code;
    if (allowedValues) this.allowedValues = allowedValues;
  }
}

export const notFound = (message: string) => new AshbyError("not_found", message);
export const invalidInput = (message: string, allowed?: string[]) =>
  new AshbyError("invalid_input", message, allowed);
export const rateLimited = (message: string) => new AshbyError("rate_limited", message);
export const parseFailure = (message: string) => new AshbyError("parse_failure", message);
export const networkError = (message: string) => new AshbyError("network_error", message);
export const timeout = (message: string) => new AshbyError("timeout", message);

const CODES: readonly string[] = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

/**
 * Recognises this server's own failures by their shape.
 *
 * The package ships two entry points, each carrying its own copy of this
 * module, so an identity test would call one of them a stranger and hand a
 * caller a blank failure in place of a coded one.
 */
export function isAshbyError(error: unknown): error is AshbyError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "AshbyError" &&
    typeof candidate.code === "string" &&
    CODES.includes(candidate.code) &&
    typeof candidate.message === "string"
  );
}
