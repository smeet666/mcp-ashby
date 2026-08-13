import { describe, expect, it } from "vitest";
import { getJson } from "../../src/ashby/http.js";
import type { RawBoard } from "../../src/types.js";
import {
  ALLOWED_HOST,
  FORBIDDEN_HOST,
  captureError,
  conditional,
  fakeFetch,
  httpOptions,
} from "./_harness.js";
import { shapesBoard } from "./_corpus.js";

const address = (token: string): string =>
  `https://${ALLOWED_HOST}/posting-api/job-board/${token}?includeCompensation=true`;

describe("a readable answer", () => {
  it("hands back the payload and the validator", async () => {
    const fake = fakeFetch({ invented: { board: shapesBoard, etag: 'W/"job-board:abc"' } });

    const result = await getJson<RawBoard>(address("invented"), httpOptions(fake));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("the read was expected to succeed");
    expect(result.body.apiVersion).toBe("1");
    expect(result.body.jobs).toHaveLength(15);
    expect(result.etag).toBe('W/"job-board:abc"');
  });

  it("hands back a null validator when the answer carries no etag", async () => {
    const fake = fakeFetch({ invented: { board: shapesBoard, etag: null } });

    const result = await getJson<RawBoard>(address("invented"), httpOptions(fake));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("the read was expected to succeed");
    expect(result.etag).toBeNull();
  });
});

describe("a conditional read", () => {
  it("sends If-None-Match when a validator is handed in", async () => {
    const fake = fakeFetch({ invented: { board: shapesBoard, etag: 'W/"job-board:abc"' } });

    await getJson<RawBoard>(
      address("invented"),
      httpOptions(fake),
      conditional('W/"job-board:other"'),
    );

    expect(fake.calls[0]?.headers["if-none-match"]).toBe('W/"job-board:other"');
  });

  it("sends no validator when none is handed in", async () => {
    const fake = fakeFetch({ invented: shapesBoard });

    await getJson<RawBoard>(address("invented"), httpOptions(fake));

    expect(fake.calls[0]?.headers["if-none-match"]).toBeUndefined();
  });

  it("reports an unchanged board when the service answers 304", async () => {
    const fake = fakeFetch({ invented: { status: 304 } });

    const result = await getJson<RawBoard>(
      address("invented"),
      httpOptions(fake),
      conditional('W/"job-board:abc"'),
    );

    expect(result.status).toBe("unchanged");
  });
});

describe("a failure is never rendered as an empty result", () => {
  it("raises not_found on 404, which is what an unknown token answers", async () => {
    const fake = fakeFetch({ invented: { status: 404, bodyText: "Not Found" } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("not_found");
  });

  it("raises rate_limited on 429", async () => {
    const fake = fakeFetch({ invented: { status: 429 } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("rate_limited");
  });

  it("carries the delay the answer names, in milliseconds", async () => {
    const fake = fakeFetch({ invented: { status: 429, retryAfterSeconds: 30 } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.retryAfterMs).toBe(30_000);
  });

  it("leaves the delay unset when the answer names none", async () => {
    const fake = fakeFetch({ invented: { status: 429 } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.retryAfterMs).toBeUndefined();
  });

  it("raises network_error on 500", async () => {
    const fake = fakeFetch({ invented: { status: 500 } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("network_error");
  });

  it("raises network_error on 503", async () => {
    const fake = fakeFetch({ invented: { status: 503 } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("network_error");
  });

  it("raises parse_failure on a body that is not JSON", async () => {
    const fake = fakeFetch({ invented: { bodyText: "<html>a gateway page</html>" } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("parse_failure");
  });

  it("raises parse_failure on a body beyond the ceiling", async () => {
    const oversized = JSON.stringify({ apiVersion: "1", jobs: [], filler: "x".repeat(5_000) });
    const fake = fakeFetch({ invented: { bodyText: oversized } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake, { maxBodyBytes: 500 })),
    );

    expect(error.code).toBe("parse_failure");
  });

  // An aborted call is how a deadline reaches the caller, and the six codes
  // hold one for it.
  it("raises timeout when the call is aborted", async () => {
    const fake = fakeFetch({
      invented: { reject: new DOMException("The operation was aborted", "AbortError") },
    });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("timeout");
  });

  it("raises network_error when the connection is cut", async () => {
    const fake = fakeFetch({ invented: { reject: new TypeError("fetch failed") } });

    const error = await captureError(() =>
      getJson<RawBoard>(address("invented"), httpOptions(fake)),
    );

    expect(error.code).toBe("network_error");
  });
});

describe("a foreign host is refused before a connection is opened", () => {
  it("raises invalid_input", async () => {
    const fake = fakeFetch({ invented: shapesBoard });

    const error = await captureError(() =>
      getJson<RawBoard>(
        `https://${FORBIDDEN_HOST}/invented/0000?includeCompensation=true`,
        httpOptions(fake),
      ),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("opens no connection at all", async () => {
    const fake = fakeFetch({ invented: shapesBoard });

    await captureError(() =>
      getJson<RawBoard>(
        `https://${FORBIDDEN_HOST}/invented/0000?includeCompensation=true`,
        httpOptions(fake),
      ),
    );

    expect(fake.calls).toHaveLength(0);
  });
});
