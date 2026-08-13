/**
 * The fakes every unit test shares.
 *
 * Two invariants are enforced here rather than in a single test, because a
 * violation must fail the test that caused it: the fake transport refuses any
 * host outside the allowlist and any address lacking `includeCompensation=true`.
 * Every request the suite makes goes through one of these fakes, so the check
 * covers the whole run.
 */

import { vi } from "vitest";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RawBoard } from "../../src/types.js";
import type { ClientOptions } from "../../src/ashby/config.js";
import type { BoardReader } from "../../src/ashby/board.js";
import type { Conditional, HttpOptions } from "../../src/ashby/http.js";
import { Client } from "../../src/ashby/client.js";
import {
  AshbyError,
  isAshbyError,
  notFound,
  parseFailure,
  networkError,
} from "../../src/ashby/errors.js";
import { runResolveBoard } from "../../src/tools/resolveBoard.js";
import { runSearchJobs } from "../../src/tools/searchJobs.js";
import { runGetJob } from "../../src/tools/getJob.js";
import { runListFilterValues } from "../../src/tools/listFilterValues.js";
import { runCompareCompensation } from "../../src/tools/compareCompensation.js";
import { createServer } from "../../src/server.js";

export const ALLOWED_HOST = "api.ashbyhq.com";
export const FORBIDDEN_HOST = "jobs.ashbyhq.com";

/** A fixed epoch, so every clock-sensitive test states the same instant. */
export const EPOCH = Date.UTC(2026, 7, 13, 12, 0, 0);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** What a board token answers with. A bare board is the 200 case. */
export interface RouteSpec {
  board?: RawBoard;
  status?: number;
  bodyText?: string;
  etag?: string | null;
  retryAfterSeconds?: number;
  /** Rejects the call, which is how a cut connection reaches the client. */
  reject?: Error;
}

export type Route = RouteSpec | RawBoard;

export interface FakeFetch {
  fetchImpl: FetchLike;
  calls: RecordedRequest[];
  urls: () => string[];
}

function isBoard(route: Route): route is RawBoard {
  return Array.isArray((route as RawBoard).jobs);
}

function tokenOf(url: URL): string {
  const marker = "/posting-api/job-board/";
  const at = url.pathname.indexOf(marker);
  if (at < 0) return "";
  return decodeURIComponent(url.pathname.slice(at + marker.length));
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Builds a transport answering the given board tokens, matched without regard
 * to case since the token itself is case-insensitive.
 */
export function fakeFetch(routes: Record<string, Route>): FakeFetch {
  const table = new Map<string, Route>();
  for (const [key, route] of Object.entries(routes)) table.set(key.toLowerCase(), route);

  const calls: RecordedRequest[] = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const raw = urlOf(input);
    const url = new URL(raw);
    const headers: Record<string, string> = {};
    for (const [key, value] of new Headers(init?.headers ?? {})) headers[key.toLowerCase()] = value;
    calls.push({ url: raw, method: init?.method ?? "GET", headers });

    if (url.host !== ALLOWED_HOST) {
      throw new Error(`a connection was opened to the host ${url.host}`);
    }
    if (url.searchParams.get("includeCompensation") !== "true") {
      throw new Error(`the address ${raw} travels without includeCompensation=true`);
    }

    const route = table.get(tokenOf(url).toLowerCase()) ?? table.get("*");
    if (route === undefined) {
      return new Response("Not Found", { status: 404 });
    }
    if (isBoard(route)) {
      return jsonResponse(route, headers);
    }
    if (route.reject !== undefined) throw route.reject;

    const status = route.status ?? 200;
    if (status === 304) return new Response(null, { status: 304 });
    if (status !== 200) {
      const responseHeaders = new Headers();
      if (route.retryAfterSeconds !== undefined) {
        responseHeaders.set("retry-after", String(route.retryAfterSeconds));
      }
      return new Response(route.bodyText ?? "", { status, headers: responseHeaders });
    }
    if (route.bodyText !== undefined) {
      return new Response(route.bodyText, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return jsonResponse(
      route.board ?? ({ apiVersion: "1", jobs: [] } as RawBoard),
      headers,
      route.etag,
    );
  };

  return { fetchImpl, calls, urls: () => calls.map((call) => call.url) };
}

function jsonResponse(
  board: RawBoard,
  requestHeaders: Record<string, string>,
  etag: string | null = 'W/"job-board:fixture"',
): Response {
  const body = JSON.stringify(board);
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "public, max-age=60, stale-while-revalidate=60",
  });
  if (etag !== null) headers.set("etag", etag);
  if (etag !== null && requestHeaders["if-none-match"] === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

/** What a board token answers when a reader, rather than the transport, is faked. */
export type ReaderRoute = RawBoard | "unknown-token" | "unreadable" | "cut";

export interface FakeReader extends BoardReader {
  urls: string[];
  tokens: string[];
  /** Tokens whose next read is served from a store rather than the network. */
  cachedTokens: Set<string>;
}

export function fakeReader(routes: Record<string, ReaderRoute>): FakeReader {
  const table = new Map<string, ReaderRoute>();
  for (const [key, route] of Object.entries(routes)) table.set(key.toLowerCase(), route);

  const reader: FakeReader = {
    urls: [],
    tokens: [],
    cachedTokens: new Set<string>(),
    async read(url: string) {
      const parsed = new URL(url);
      if (parsed.host !== ALLOWED_HOST) {
        throw new Error(`a read was attempted on the host ${parsed.host}`);
      }
      if (parsed.searchParams.get("includeCompensation") !== "true") {
        throw new Error(`the address ${url} travels without includeCompensation=true`);
      }
      const token = tokenOf(parsed);
      reader.urls.push(url);
      reader.tokens.push(token);

      const route = table.get(token.toLowerCase());
      if (route === undefined || route === "unknown-token") throw makeNotFound(token);
      if (route === "unreadable") throw makeParseFailure(token);
      if (route === "cut") throw makeNetworkError(token);
      return { value: route, cached: reader.cachedTokens.has(token.toLowerCase()) };
    },
  };
  return reader;
}

/**
 * The error constructors are reached through a loose signature so a test states
 * the failure it wants without depending on how the message is assembled.
 */
type ErrorMaker = (message?: string) => AshbyError;
export const makeNotFound = notFound as unknown as ErrorMaker;
export const makeParseFailure = parseFailure as unknown as ErrorMaker;
export const makeNetworkError = networkError as unknown as ErrorMaker;

export function clientWith(fake: FakeFetch, extra: Record<string, unknown> = {}): Client {
  return new Client({ fetchImpl: fake.fetchImpl, ...extra } as unknown as ClientOptions);
}

export function httpOptions(fake: FakeFetch, extra: Record<string, unknown> = {}): HttpOptions {
  return {
    timeoutMs: 5_000,
    userAgent: "mcp-ashby-tests/0.1.0 (+https://github.com/smeet666/mcp-ashby)",
    fetchImpl: fake.fetchImpl,
    maxBodyBytes: 1_000_000,
    ...extra,
  } as unknown as HttpOptions;
}

export function conditional(etag: string): Conditional {
  return { etag } as unknown as Conditional;
}

type ToolRunner = (client: Client, args: Record<string, unknown>) => Promise<CallToolResult>;

export const resolveBoardTool = runResolveBoard as unknown as ToolRunner;
export const searchJobsTool = runSearchJobs as unknown as ToolRunner;
export const getJobTool = runGetJob as unknown as ToolRunner;
export const listFilterValuesTool = runListFilterValues as unknown as ToolRunner;
export const compareCompensationTool = runCompareCompensation as unknown as ToolRunner;

export const makeServer = createServer as unknown as (options?: Record<string, unknown>) => unknown;

/** The structured half of a tool result, which is what the output schema governs. */
export function structured(result: CallToolResult): Record<string, unknown> {
  const payload = (result as { structuredContent?: unknown }).structuredContent;
  if (payload === undefined || payload === null || typeof payload !== "object") {
    throw new Error("the tool result carries no structured content");
  }
  return payload as Record<string, unknown>;
}

/** The concatenated text of a tool result, which is where the notes live. */
export function resultText(result: CallToolResult): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "",
    )
    .join("\n");
}

/**
 * Output declarations are published either as a raw shape or as an assembled
 * schema; both are usable for validation once wrapped.
 */
export function objectSchema(shapeOrSchema: unknown): z.ZodType {
  const candidate = shapeOrSchema as { parse?: unknown };
  if (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.parse === "function"
  ) {
    return shapeOrSchema as z.ZodType;
  }
  return z.object(shapeOrSchema as z.ZodRawShape) as unknown as z.ZodType;
}

/**
 * Drives the simulated clock until a call that waits on the pacing interval
 * finishes, so nothing in the suite measures a real second.
 */
export async function settled<T>(promise: Promise<T>): Promise<T> {
  const guarded = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await guarded;
  if (outcome.ok) return outcome.value;
  throw outcome.error;
}

/** Runs a call expected to fail and hands back the Ashby error it raised. */
export async function captureError(run: () => unknown | Promise<unknown>): Promise<AshbyError> {
  try {
    await run();
  } catch (error) {
    if (isAshbyError(error)) return error as AshbyError;
    throw error;
  }
  throw new Error("the call was expected to fail and returned instead");
}
