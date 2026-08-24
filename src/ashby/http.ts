import { assertAllowed } from "./hosts.js";
import { networkError, notFound, parseFailure, rateLimited, timeout } from "./errors.js";

export interface HttpOptions {
  timeoutMs: number;
  userAgent: string;
  fetchImpl: typeof fetch;
  maxBodyBytes: number;
}

export interface Conditional {
  /** The validator a previous read carried, replayed as `If-None-Match`. */
  etag: string;
}

export type HttpResult<T> =
  | { status: "ok"; body: T; etag: string | null }
  /** The board has not changed, and the answer carried no body. */
  | { status: "unchanged" };

/**
 * One read, paced and bounded.
 *
 * A failure is never an empty board: a refused request, an unreadable payload
 * and a board holding nothing are three different answers.
 */
export async function getJson<T>(
  url: string,
  options: HttpOptions,
  conditional?: Conditional,
): Promise<HttpResult<T>> {
  const address = assertAllowed(url);
  const controller = new AbortController();
  const expiry = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs);

  const headers: Record<string, string> = {
    accept: "application/json",
    // A board falls from megabytes to a tenth of that on the wire.
    "accept-encoding": "gzip, deflate",
    "user-agent": options.userAgent,
  };
  if (conditional) {
    headers["if-none-match"] = conditional.etag;
  }

  let response: Response;
  try {
    response = await options.fetchImpl(address.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error) {
    clearTimeout(expiry);
    if (controller.signal.aborted || isAbort(error)) {
      throw timeout(`Ashby did not answer ${address.pathname} within ${options.timeoutMs}ms.`);
    }
    throw networkError(`The request to Ashby failed: ${describe(error)}`);
  }

  try {
    if (response.status === 304) {
      return { status: "unchanged" };
    }
    if (response.status === 404) {
      throw notFound(
        `Ashby holds no board at ${decodeURIComponent(address.pathname.split("/").pop() ?? "")}. A board that exists and publishes nothing answers with an empty list instead, so this is an address that names nothing.`,
      );
    }
    if (response.status === 429) {
      const failure = rateLimited("Ashby asked for a slower pace, so this read was refused.");
      const retry = retryAfterMs(response.headers.get("retry-after"));
      if (retry !== undefined) {
        failure.retryAfterMs = retry;
      }
      throw failure;
    }
    if (response.status >= 500) {
      throw networkError(`Ashby answered ${response.status}, so this read states nothing.`);
    }
    if (!response.ok) {
      throw networkError(`Ashby answered ${response.status}, so this read states nothing.`);
    }

    const text = await response.text();
    if (text.length > options.maxBodyBytes) {
      throw parseFailure(
        `Ashby answered with ${text.length} characters, past the ${options.maxBodyBytes} this client holds.`,
      );
    }
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch (cause) {
      throw parseFailure("Ashby answered something this client cannot read as a board.", cause);
    }
    return { status: "ok", body, etag: response.headers.get("etag") };
  } finally {
    clearTimeout(expiry);
  }
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const when = Date.parse(header);
  if (Number.isNaN(when)) {
    return undefined;
  }
  return Math.max(0, when - Date.now());
}

/** An abort raised by the caller's own signal is an expiry all the same. */
function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
