import { PACKAGE_NAME, VERSION } from "../version.js";

/**
 * The one host this server is allowed to read. `jobs.ashbyhq.com` is
 * deliberately absent: its robots.txt disallows `/api/`, and the API host is
 * the door Ashby documents. `jobUrl` and `applyUrl` point at
 * `jobs.ashbyhq.com` and travel through rendering as strings, never as
 * requests.
 */
export const ALLOWED_HOSTS: readonly string[] = ["api.ashbyhq.com"];

export const BOARD_BASE = "https://api.ashbyhq.com/posting-api/job-board";

/**
 * Sent on every request. Without it the payload omits both `compensation` and
 * `shouldDisplayCompensationOnJobPostings`, which leaves no way to tell a
 * company that withholds its pay ranges from a request that failed to ask.
 */
export const BOARD_QUERY = "includeCompensation=true";

/**
 * Ashby publishes no crawl delay and no quota header, so the floor is set by
 * the weight of what is asked for: one board is megabytes. Configuration may
 * widen this interval and never narrows it, including through the published
 * client entry point.
 */
export const MIN_INTERVAL_MS = 1000;

/** A list never carries descriptions, and a caller still pages through it. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Each company costs a request, a second, and sometimes several megabytes. */
export const DEFAULT_MAX_COMPANIES = 5;
export const MAX_COMPANIES = 10;

/** How many spellings a resolution probes before giving up. */
export const MAX_BOARD_FORMS = 4;

/**
 * The most a single response may weigh. The largest board measured answers
 * 12.6 MB, and the whole of it lands in memory twice, once as text and once
 * parsed.
 */
export const MAX_BODY_BYTES = 32_000_000;

export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * A board is held for this long before it is revalidated, and revalidation
 * sends `If-None-Match`: a board that has not changed answers 304 with no body.
 * Four of the five tools read a board that is already down.
 */
export const CACHE_TTL_MS = 5 * 60_000;

/** A board weighs megabytes, so few of them are held at once. */
export const CACHE_MAX_ENTRIES = 20;

/** The period a pay threshold compares against unless the caller names another. */
export const DEFAULT_PAY_INTERVAL = "1 YEAR";

export const CONTACT = "https://github.com/smeet666/mcp-ashby";

/** Carries the project and a contact address, and imitates no browser. */
export const USER_AGENT = `${PACKAGE_NAME}/${VERSION} (+${CONTACT})`;

export interface ClientOptions {
  /** Widens the floor. A smaller value is ignored. */
  minIntervalMs?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
}

export function resolveInterval(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return MIN_INTERVAL_MS;
  }
  return Math.max(MIN_INTERVAL_MS, requested);
}

/**
 * The address of a board. The token is encoded, so a token carrying a space or
 * a reserved character produces a refusal that still names its reason rather
 * than a malformed address.
 */
export function boardUrl(board: string): string {
  return `${BOARD_BASE}/${encodeURIComponent(board)}?${BOARD_QUERY}`;
}
