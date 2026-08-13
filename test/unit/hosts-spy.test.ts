import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT, USER_AGENT } from "../../src/ashby/config.js";
import { getJson } from "../../src/ashby/http.js";
import {
  ALLOWED_HOST,
  EPOCH,
  FORBIDDEN_HOST,
  clientWith,
  fakeFetch,
  getJobTool,
  httpOptions,
  resolveBoardTool,
  searchJobsTool,
  settled,
} from "./_harness.js";
import { shapesBoard, fixtureId } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Every address the suite requests is recorded by the fake transport, which
 * refuses a foreign host and an address missing the compensation parameter at
 * the moment of the call. These tests drive the paths that reach the network
 * and state the same invariants on the recording.
 */
describe("every address the server opens carries the allowed host", () => {
  it("requests only api.ashbyhq.com while resolving, searching and reading a posting", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    await settled(resolveBoardTool(client, { name: "Invented" }));
    await settled(searchJobsTool(client, { companies: ["invented"] }));
    await settled(getJobTool(client, { board: "invented", job_id: fixtureId(9) }));

    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(new URL(call.url).host).toBe(ALLOWED_HOST);
    }
  });

  it("never requests the host serving the public postings pages", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    await settled(searchJobsTool(client, { companies: ["invented"] }));
    await settled(getJobTool(client, { board: "invented", job_id: fixtureId(1) }));

    expect(fake.urls().some((url) => url.includes(FORBIDDEN_HOST))).toBe(false);
  });

  it("carries includeCompensation=true on every address", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    await settled(client.readBoard("invented"));
    await settled(client.resolveBoard("Invented"));

    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(new URL(call.url).searchParams.get("includeCompensation")).toBe("true");
    }
  });

  it("leaves the posting addresses in the payload without requesting them", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    const read = await settled(client.readBoard("invented"));
    const first = read.data[0];
    expect(first?.jobUrl).toContain(FORBIDDEN_HOST);
    expect(first?.applyUrl).toContain(FORBIDDEN_HOST);
    expect(fake.urls().every((url) => !url.includes(FORBIDDEN_HOST))).toBe(true);
  });

  it("sends the project user agent on every request", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    await settled(client.readBoard("invented"));

    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(call.headers["user-agent"]).toBe(USER_AGENT);
    }
  });

  it("accepts gzip, which is what makes a board of several megabytes bearable", async () => {
    const fake = fakeFetch({ invented: shapesBoard });

    await settled(
      getJson(
        `https://${ALLOWED_HOST}/posting-api/job-board/invented?includeCompensation=true`,
        httpOptions(fake),
      ),
    );

    expect(fake.calls[0]?.headers["accept-encoding"]).toContain("gzip");
  });
});

describe("the user agent names the project and a contact", () => {
  it("carries the package name", () => {
    expect(USER_AGENT).toContain("mcp-ashby");
  });

  it("carries an address where a person is reachable", () => {
    expect(CONTACT.length).toBeGreaterThan(0);
    expect(USER_AGENT).toContain(CONTACT);
  });

  it("imitates no browser", () => {
    for (const token of ["Mozilla", "AppleWebKit", "Chrome", "Safari", "Gecko", "Edg/"]) {
      expect(USER_AGENT).not.toContain(token);
    }
  });
});
