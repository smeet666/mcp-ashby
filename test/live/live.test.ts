/**
 * The live suite: one request per route, against Ashby itself.
 *
 * It runs behind `ASHBY_LIVE=1` and as a nightly canary. Its job is to fail
 * when the site changes its mind, rather than to let a change pass unnoticed:
 * the robots.txt of the domain is read back on every run, and a rule newly
 * aimed at this agent, at `ClaudeBot`, or at `/posting-api/` breaks the build.
 */

import { describe, expect, it } from "vitest";
import { Client } from "../../src/ashby/client.js";
import { USER_AGENT } from "../../src/ashby/config.js";

const live = process.env["ASHBY_LIVE"] === "1";
const board = "Ashby";

describe.skipIf(!live)("Ashby, live", () => {
  const client = new Client();

  it("resolves a company name to the token that answers", async () => {
    const resolution = await client.resolveBoard(board);
    expect(resolution.found[0]?.board).toBeTypeOf("string");
    expect(resolution.found[0]?.jobCount).toBeGreaterThan(0);
  });

  it("reads a board whole, with the fields the postings carry", async () => {
    const read = await client.readBoard(board);
    expect(read.data.length).toBeGreaterThan(0);
    const posting = read.data[0];
    expect(posting?.id).toBeTypeOf("string");
    expect(posting?.descriptionPlain.length).toBeGreaterThan(0);
    // Requested without includeCompensation, both of these are absent, and the
    // server loses the ability to tell a withheld range from an unasked one.
    expect(posting).toHaveProperty("compensation");
    expect(posting).toHaveProperty("shouldDisplayCompensationOnJobPostings");
  });

  it("reports a token that names nothing as an absence rather than an empty board", async () => {
    await expect(client.readBoard("this-token-names-nothing-12345")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("serves the second read of one board from what it already holds", async () => {
    const again = await client.readBoard(board);
    expect(again.cached).toBe(true);
  });

  it("is served by every robots.txt on the domain", async () => {
    for (const host of ["https://jobs.ashbyhq.com", "https://www.ashbyhq.com"]) {
      const response = await fetch(`${host}/robots.txt`, {
        headers: { "user-agent": USER_AGENT },
      });
      if (!response.ok) continue;
      const rules = (await response.text()).toLowerCase();
      expect(rules).not.toContain("mcp-ashby");
      expect(rules).not.toContain("claudebot");
      expect(rules).not.toContain("/posting-api/");
    }
  });
});
