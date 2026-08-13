import { describe, expect, it } from "vitest";
import { assertAllowed } from "../../src/ashby/hosts.js";
import { ALLOWED_HOSTS, BOARD_BASE, BOARD_QUERY, boardUrl } from "../../src/ashby/config.js";
import { captureError, ALLOWED_HOST, FORBIDDEN_HOST } from "./_harness.js";

describe("the allowlist names a single host", () => {
  it("holds api.ashbyhq.com and nothing else", () => {
    expect([...ALLOWED_HOSTS]).toEqual([ALLOWED_HOST]);
  });

  it("returns the parsed address when the host is allowed", () => {
    const url = assertAllowed(`https://${ALLOWED_HOST}/posting-api/job-board/ashby`);
    expect(url).toBeInstanceOf(URL);
    expect(url.host).toBe(ALLOWED_HOST);
    expect(url.pathname).toBe("/posting-api/job-board/ashby");
  });

  it("refuses the host serving the public postings pages", async () => {
    const error = await captureError(() =>
      assertAllowed(`https://${FORBIDDEN_HOST}/ashby/0000-1111`),
    );
    expect(error.code).toBe("invalid_input");
    expect(error.message).toContain(FORBIDDEN_HOST);
  });

  it("names the refused host in the message", async () => {
    const error = await captureError(() => assertAllowed("https://example.invalid/posting-api"));
    expect(error.message).toContain("example.invalid");
  });

  it("refuses a host whose name merely ends with the allowed one", async () => {
    const error = await captureError(() =>
      assertAllowed(`https://${ALLOWED_HOST}.example.invalid/posting-api/job-board/ashby`),
    );
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a host carrying the allowed name in its userinfo", async () => {
    const error = await captureError(() =>
      assertAllowed(`https://${ALLOWED_HOST}@example.invalid/posting-api/job-board/ashby`),
    );
    expect(error.code).toBe("invalid_input");
  });

  it("refuses plain http on the allowed host", async () => {
    const error = await captureError(() =>
      assertAllowed(`http://${ALLOWED_HOST}/posting-api/job-board/ashby`),
    );
    expect(error.code).toBe("invalid_input");
  });

  it("refuses an address that does not parse", async () => {
    const error = await captureError(() => assertAllowed("not an address"));
    expect(error.code).toBe("invalid_input");
  });
});

describe("boardUrl builds the only address the server reads", () => {
  it("stays on the allowed host", () => {
    expect(new URL(boardUrl("ashby")).host).toBe(ALLOWED_HOST);
    expect(assertAllowed(boardUrl("ashby")).host).toBe(ALLOWED_HOST);
  });

  it("carries includeCompensation=true", () => {
    expect(new URL(boardUrl("ashby")).searchParams.get("includeCompensation")).toBe("true");
  });

  it("builds on the documented base and query", () => {
    expect(BOARD_BASE).toContain(ALLOWED_HOST);
    expect(BOARD_QUERY).toContain("includeCompensation");
    expect(boardUrl("ashby")).toContain(BOARD_BASE);
  });

  it("encodes a token carrying a space", () => {
    const url = boardUrl("eleven labs");
    expect(url).not.toContain(" ");
    expect(new URL(url).host).toBe(ALLOWED_HOST);
    expect(new URL(url).pathname.endsWith("eleven%20labs")).toBe(true);
  });

  it("encodes a token carrying reserved characters, keeping the address on one host", () => {
    const url = boardUrl("../../evil?x=1#y");
    const parsed = new URL(url);
    expect(parsed.host).toBe(ALLOWED_HOST);
    expect(parsed.pathname.startsWith("/posting-api/job-board/")).toBe(true);
    expect(parsed.searchParams.get("x")).toBeNull();
    expect(parsed.searchParams.get("includeCompensation")).toBe("true");
  });

  it("keeps the token the caller wrote, case included", () => {
    expect(boardUrl("AsHbY")).toContain("AsHbY");
  });
});
