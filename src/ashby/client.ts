import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  MAX_BODY_BYTES,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  resolveInterval,
  type ClientOptions,
} from "./config.js";
import type { RawBoard, RawJob, Read, Resolution } from "../types.js";
import { Cache } from "./cache.js";
import { AshbyError, isAshbyError } from "./errors.js";
import { getJson, type HttpOptions } from "./http.js";
import { RateLimiter } from "./rateLimiter.js";
import { readBoard } from "./board.js";
import { resolveBoard } from "./resolve.js";

/**
 * The published low-level client: pacing, cache and error taxonomy, with no
 * protocol attached. The interval it accepts widens the published floor and
 * never narrows it.
 *
 * Its shape follows from the one route Ashby offers. A board arrives whole,
 * weighs megabytes and carries a validator, so a session that explores one
 * company downloads it once and revalidates it afterwards.
 */
export class Client {
  private readonly http: HttpOptions;
  private readonly limiter: RateLimiter;
  private readonly boards: Cache<RawBoard | AshbyError>;
  private readonly resolutions: Cache<Resolution>;
  private readonly inFlight = new Map<string, Promise<RawBoard>>();

  constructor(options: ClientOptions = {}) {
    this.http = {
      timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      userAgent: USER_AGENT,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      maxBodyBytes: MAX_BODY_BYTES,
    };
    this.limiter = new RateLimiter(resolveInterval(options.minIntervalMs));
    const ttl = options.cacheTtlMs ?? CACHE_TTL_MS;
    this.boards = new Cache<RawBoard | AshbyError>(ttl, CACHE_MAX_ENTRIES);
    this.resolutions = new Cache<Resolution>(ttl, CACHE_MAX_ENTRIES);
  }

  /**
   * Every read goes through here, so the allowlist and the pacing are
   * unavoidable, and two concurrent reads of one address are one read.
   */
  async read(url: string): Promise<{ value: RawBoard; cached: boolean }> {
    const held = this.boards.get(url);
    if (held !== undefined) {
      // An absence is held like anything else: resolving one company probes
      // several spellings, and re-asking for the same missing one would pay for
      // each of them again.
      if (held.value instanceof AshbyError) {
        throw held.value;
      }
      if (this.boards.isFresh(held)) {
        return { value: held.value, cached: true };
      }
      return this.revalidate(url, held.value, held.etag);
    }

    const pending = this.inFlight.get(url);
    if (pending) {
      return { value: await pending, cached: true };
    }

    const run = this.fetchBoard(url);
    this.inFlight.set(url, run);
    try {
      return { value: await run, cached: false };
    } finally {
      this.inFlight.delete(url);
    }
  }

  private async fetchBoard(url: string): Promise<RawBoard> {
    try {
      const result = await this.limiter.schedule(() => getJson<RawBoard>(url, this.http));
      if (result.status === "unchanged") {
        // A validator was never sent, so an unchanged answer states nothing
        // this client could hold.
        throw new AshbyError(
          "parse_failure",
          "Ashby answered that nothing changed, for a board this client holds no copy of.",
        );
      }
      this.boards.set(url, result.body, result.etag);
      return result.body;
    } catch (error) {
      this.note(error, url);
      throw error;
    }
  }

  /**
   * A board past its age is revalidated rather than fetched again: Ashby
   * answers 304 with no body when nothing changed, and the copy held stands.
   */
  private async revalidate(
    url: string,
    held: RawBoard,
    etag: string | null,
  ): Promise<{ value: RawBoard; cached: boolean }> {
    if (etag === null) {
      return { value: await this.fetchBoard(url), cached: false };
    }
    try {
      const result = await this.limiter.schedule(() => getJson<RawBoard>(url, this.http, { etag }));
      if (result.status === "unchanged") {
        this.boards.refresh(url);
        return { value: held, cached: true };
      }
      this.boards.set(url, result.body, result.etag);
      return { value: result.body, cached: false };
    } catch (error) {
      this.note(error, url);
      throw error;
    }
  }

  private note(error: unknown, url: string): void {
    if (!isAshbyError(error)) {
      return;
    }
    if (error.code === "not_found") {
      this.boards.set(url, error, null);
    }
    // Ashby named a delay, so the next departure waits it out rather than
    // walking straight back into the wall.
    if (error.code === "rate_limited" && error.retryAfterMs) {
      this.limiter.pause(error.retryAfterMs);
    }
  }

  /** The postings of one board, cached and revalidated by validator. */
  readBoard(board: string): Promise<Read<RawJob[]>> {
    return readBoard(board, this);
  }

  /** A name turned into the token that answered, held for the session. */
  async resolveBoard(name: string): Promise<Resolution> {
    const key = name.trim().toLowerCase();
    const held = this.resolutions.get(key);
    if (held !== undefined) {
      return { ...held.value, cached: true };
    }
    const resolution = await resolveBoard(name, this);
    this.resolutions.set(key, resolution, null);
    return resolution;
  }
}

export type { ClientOptions };
