import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CACHE_TTL_MS } from "../../src/ashby/config.js";
import {
  EPOCH,
  clientWith,
  fakeFetch,
  listFilterValuesTool,
  resultText,
  searchJobsTool,
  settled,
  structured,
} from "./_harness.js";
import { emptyBoard, shapesBoard, wideBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const rows = (result: CallToolResult): Record<string, unknown>[] =>
  structured(result).jobs as Record<string, unknown>[];

const perCompany = (result: CallToolResult): Record<string, unknown>[] =>
  structured(result).per_company as Record<string, unknown>[];

const search = (routes: Record<string, unknown>, args: Record<string, unknown>) => {
  const fake = fakeFetch(routes as never);
  const client = clientWith(fake);
  return { fake, run: () => settled(searchJobsTool(client, args)), client };
};

describe("the compact row a search returns", () => {
  it("carries no description, whatever the limit", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented"], limit: 100 });

    const result = await run();

    expect(rows(result)).toHaveLength(100);
    for (const row of rows(result)) {
      expect(row).not.toHaveProperty("description");
      expect(row).not.toHaveProperty("description_plain");
      expect(row).not.toHaveProperty("description_html");
    }
  });

  it("carries no posting text anywhere in the payload", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented"], limit: 100 });

    const result = await run();

    expect(JSON.stringify(structured(result))).not.toContain("An invented posting");
  });

  it("names the board the posting came from", async () => {
    const { run } = search({ invented: shapesBoard }, { companies: ["invented"] });

    expect(rows(await run())[0]?.board).toBe("invented");
  });

  it("carries the fields a caller needs to choose a posting", async () => {
    const { run } = search({ invented: shapesBoard }, { companies: ["invented"], limit: 1 });

    const row = rows(await run())[0]!;

    for (const field of [
      "id",
      "title",
      "department",
      "team",
      "employment_type",
      "location",
      "country",
      "workplace_type",
      "is_remote",
      "published_at",
      "job_url",
      "apply_url",
    ]) {
      expect(row).toHaveProperty(field);
    }
  });

  it("repeats the publication date the way Ashby writes it", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "years ago" },
    );

    expect(rows(await run())[0]?.published_at).toBe("2021-04-27T20:13:45.158+00:00");
  });

  it("renders a posting recording no workplace as undeclared rather than on site", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "no workplace" },
    );

    const row = rows(await run())[0]!;
    expect(row.workplace_type).toBeNull();
    expect(row.is_remote).toBeNull();
  });

  it("renders a withheld range as absent rather than as zero", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "withholds" },
    );

    const row = rows(await run())[0]!;
    expect(row.compensation_summary).toBeNull();
  });

  it("counts the secondary locations rather than gluing them to the location", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "nineteen" },
    );

    expect(rows(await run())[0]?.secondary_location_count).toBe(19);
  });

  it("repeats a country the way the board publishes it", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "long way" },
    );

    expect(rows(await run())[0]?.country).toBe("United Inventia");
  });

  it("renders an empty country string as absent", async () => {
    const { run } = search(
      { invented: shapesBoard },
      { companies: ["invented"], query: "no postal address" },
    );

    expect(rows(await run())[0]?.country).toBeNull();
  });
});

describe("the counts a search reports", () => {
  it("counts the board and the postings it kept under different names", async () => {
    const { run } = search(
      { invented: wideBoard },
      { companies: ["invented"], department: ["Engineering"] },
    );

    const payload = structured(await run());
    expect(payload.total_on_board).toBe(120);
    expect(payload.total_matched).toBe(40);
    expect(payload).not.toHaveProperty("total");
  });

  it("counts what it returned apart from what it kept", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented"], limit: 5 });

    const payload = structured(await run());
    expect(payload.total_matched).toBe(120);
    expect(payload.returned).toBe(5);
  });

  it("counts the postings that stayed silent on a field it filtered", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented"], is_remote: false });

    const undeclared = structured(await run()).undeclared as Record<string, number>;
    expect(undeclared.is_remote).toBe(24);
  });

  it("repeats the filters it applied", async () => {
    const { run } = search(
      { invented: wideBoard },
      { companies: ["invented"], workplace_type: ["Remote"] },
    );

    const applied = structured(await run()).filters_applied as Record<string, unknown>;
    expect(applied.workplace_type).toEqual(["Remote"]);
  });
});

describe("paging and ordering", () => {
  it("returns twenty postings when no limit is asked for", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented"] });

    expect(rows(await run())).toHaveLength(20);
  });

  it("moves along the list with an offset", async () => {
    const first = await search(
      { invented: wideBoard },
      { companies: ["invented"], sort: "title", limit: 2 },
    ).run();
    const second = await search(
      { invented: wideBoard },
      { companies: ["invented"], sort: "title", limit: 2, offset: 2 },
    ).run();

    expect(rows(first).map((row) => row.id)).not.toEqual(rows(second).map((row) => row.id));
  });

  it("refuses a limit beyond the ceiling before reading any board", async () => {
    const { fake, run } = search({ invented: wideBoard }, { companies: ["invented"], limit: 101 });

    const result = await run();

    expect(result.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses eleven companies before reading any board", async () => {
    const companies = Array.from({ length: 11 }, (_, i) => `company-${i}`);
    const { fake, run } = search({ "*": wideBoard }, { companies });

    const result = await run();

    expect(result.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("a filter value the board does not carry", () => {
  it("is refused rather than answered with an empty list", async () => {
    const { run } = search(
      { invented: wideBoard },
      { companies: ["invented"], department: ["Marketing"] },
    );

    const result = await run();

    expect(result.isError).toBe(true);
  });

  // Naming the values present is what lets the caller ask again, an empty list
  // reading as a board with no such postings.
  it("is answered with the values the board does carry", async () => {
    const { run } = search(
      { invented: wideBoard },
      { companies: ["invented"], department: ["Marketing"] },
    );

    const message = resultText(await run());

    expect(message).toContain("Engineering");
    expect(message).toContain("Sales");
  });
});

describe("what each company answered", () => {
  it("reports a company whose board was read", async () => {
    const { run } = search(
      { invented: wideBoard },
      { companies: ["invented"], department: ["Engineering"] },
    );

    const outcome = perCompany(await run())[0]!;
    expect(outcome.input).toBe("invented");
    expect(outcome.board).toBe("invented");
    expect(outcome.status).toBe("read");
    expect(outcome.matched).toBe(40);
  });

  it("keeps a company that was never resolved apart from one whose board was read", async () => {
    const { run } = search({ invented: wideBoard }, { companies: ["invented", "nobody"] });

    const outcomes = perCompany(await run());
    const read = outcomes.find((outcome) => outcome.input === "invented");
    const unresolved = outcomes.find((outcome) => outcome.input === "nobody");

    expect(read?.status).toBe("read");
    expect(unresolved?.status).not.toBe("read");
  });

  it("keeps a company whose read broke apart from one that was never resolved", async () => {
    const { run } = search(
      { invented: wideBoard, broken: { status: 500 } },
      { companies: ["invented", "nobody", "broken"] },
    );

    const outcomes = perCompany(await run());
    const unresolved = outcomes.find((outcome) => outcome.input === "nobody");
    const broken = outcomes.find((outcome) => outcome.input === "broken");

    expect(broken?.status).not.toBe("read");
    expect(broken?.status).not.toBe(unresolved?.status);
  });

  // A company whose read broke published no answer about its openings, and a
  // count of zero would read as a company hiring nobody.
  it("counts nothing rather than zero when the read broke", async () => {
    const { run } = search({ broken: { status: 500 } }, { companies: ["broken"] });

    const outcome = perCompany(await run())[0]!;

    expect(outcome.matched).not.toBe(0);
  });

  // A board between two campaigns publishes nothing, which is its own state
  // beside a board read and filtered down to nothing.
  it("reports a board between two campaigns as publishing nothing", async () => {
    const { run } = search({ quiet: emptyBoard }, { companies: ["quiet"] });

    const result = await run();
    const outcome = perCompany(result)[0]!;

    expect(outcome.status).toBe("empty");
    expect(outcome.matched).toBe(0);
    expect(structured(result).total_on_board).toBe(0);
  });
});

describe("the board a session has already read", () => {
  it("is downloaded once for two tools called in a row", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(searchJobsTool(client, { companies: ["invented"] }));
    await settled(listFilterValuesTool(client, { board: "invented" }));

    expect(fake.calls).toHaveLength(1);
  });

  it("is reported as cached on the second read", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(client.readBoard("invented"));
    const second = await settled(client.readBoard("invented"));

    expect(second.cached).toBe(true);
  });

  it("is resolved once for a company named twice in the session", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(client.resolveBoard("invented"));
    const requestsAfterFirst = fake.calls.length;
    await settled(client.resolveBoard("invented"));

    expect(fake.calls).toHaveLength(requestsAfterFirst);
  });

  it("revalidates with the stored validator once the lifetime has passed", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(client.readBoard("invented"));
    vi.setSystemTime(EPOCH + CACHE_TTL_MS + 1);
    await settled(client.readBoard("invented"));

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.headers["if-none-match"]).toBe('W/"job-board:fixture"');
  });

  it("keeps the payload in place when the revalidation answers unchanged", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(client.readBoard("invented"));
    vi.setSystemTime(EPOCH + CACHE_TTL_MS + 1);
    const second = await settled(client.readBoard("invented"));

    expect(second.data).toHaveLength(120);
    expect(second.cached).toBe(true);
  });

  it("serves two concurrent reads of one address with a single descent", async () => {
    const fake = fakeFetch({ invented: wideBoard });
    const client = clientWith(fake);

    await settled(Promise.all([client.readBoard("invented"), client.readBoard("invented")]));

    expect(fake.calls).toHaveLength(1);
  });
});
