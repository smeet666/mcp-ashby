import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  EPOCH,
  clientWith,
  fakeFetch,
  getJobTool,
  searchJobsTool,
  settled,
  structured,
} from "./_harness.js";
import { fixtureId, shapesBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const posting = (args: Record<string, unknown>) => {
  const fake = fakeFetch({ invented: shapesBoard });
  const client = clientWith(fake);
  return { fake, run: (): Promise<CallToolResult> => settled(getJobTool(client, args)) };
};

const read = async (n: number, extra: Record<string, unknown> = {}) =>
  structured(await posting({ board: "invented", job_id: fixtureId(n), ...extra }).run());

describe("the posting a caller asked for", () => {
  it("carries the fields that describe the role", async () => {
    const payload = await read(15);

    expect(payload.id).toBe(fixtureId(15));
    expect(payload.title).toBe("Posting published years ago");
    expect(payload.department).toBe("Design");
    expect(payload.team).toBe("Design");
    expect(payload.employment_type).toBe("FullTime");
    expect(payload.published_at).toBe("2021-04-27T20:13:45.158+00:00");
  });

  it("names the board it was read from", async () => {
    expect((await read(15)).board).toBe("invented");
  });

  it("carries the addresses of the posting as strings", async () => {
    const payload = await read(15);

    expect(payload.job_url).toBe(`https://jobs.ashbyhq.com/invented/${fixtureId(15)}`);
    expect(payload.apply_url).toBe(
      `https://jobs.ashbyhq.com/invented/${fixtureId(15)}/application`,
    );
  });

  it("renders the direct-link flag as a field", async () => {
    expect((await read(12)).is_listed).toBe(false);
  });
});

describe("the description", () => {
  it("comes as plain text unless another format is asked for", async () => {
    const description = (await read(15)).description as Record<string, unknown>;

    expect(description.format).toBe("plain");
    expect(description.text).toBe("An invented posting, number 15.");
  });

  it("comes as HTML on an explicit request", async () => {
    const description = (await read(15, { description: "html" })).description as Record<
      string,
      unknown
    >;

    expect(description.format).toBe("html");
    expect(description.text).toBe("<p>An invented posting, number 15.</p>");
  });

  it("is left out when the caller wants none", async () => {
    const payload = await read(15, { description: "none" });
    const description = payload.description as Record<string, unknown> | null;

    expect(description === null || description.text === null).toBe(true);
  });
});

describe("the place", () => {
  it("carries the free text of the location beside the parsed address", async () => {
    const place = (await read(15)).location as Record<string, unknown>;

    expect(place.label).toBe("Nowhere City");
    expect(place.locality).toBe("Nowhere City");
    expect(place.region).toBe("Nowhere State");
    expect(place.country).toBe("Inventia");
  });

  it("reads an empty address string as an absent value", async () => {
    const place = (await read(7)).location as Record<string, unknown>;

    expect(place.locality).toBeNull();
    expect(place.region).toBeNull();
    expect(place.country).toBe("Inventia");
  });

  it("reads an address carrying no postal address as absent values", async () => {
    const place = (await read(8)).location as Record<string, unknown>;

    expect(place.label).toBe("Nowhere City");
    expect(place.locality).toBeNull();
    expect(place.region).toBeNull();
    expect(place.country).toBeNull();
  });

  it("repeats a country the way the board publishes it", async () => {
    const place = (await read(10)).location as Record<string, unknown>;

    expect(place.country).toBe("United Inventia");
  });

  it("keeps nineteen secondary locations as a list of nineteen", async () => {
    const places = (await read(9)).secondary_locations as Record<string, unknown>[];

    expect(places).toHaveLength(19);
    expect(places[0]?.label).toBe("Second City 1");
  });

  it("reads an empty locality of a secondary location as absent", async () => {
    const places = (await read(9)).secondary_locations as Record<string, unknown>[];

    expect(places[0]?.locality).toBeNull();
  });

  it("carries an empty list when the posting names one place only", async () => {
    expect((await read(15)).secondary_locations).toEqual([]);
  });
});

describe("the compensation", () => {
  it("carries the tiers and their components when the company publishes them", async () => {
    const pay = (await read(3)).compensation as Record<string, unknown>;
    const tiers = pay.tiers as Record<string, unknown>[];
    const components = tiers[0]?.components as Record<string, unknown>[];

    expect(pay.published).toBe(true);
    expect(tiers[0]?.title).toBe("Zone A");
    expect(components.map((component) => component.type)).toEqual([
      "Salary",
      "EquityPercentage",
      "EquityCashValue",
    ]);
  });

  it("keeps a capital share without a currency and without bounds", async () => {
    const pay = (await read(3)).compensation as Record<string, unknown>;
    const tiers = pay.tiers as Record<string, unknown>[];
    const components = tiers[0]?.components as Record<string, unknown>[];
    const equity = components.find((component) => component.type === "EquityPercentage");

    expect(equity?.currency).toBeNull();
    expect(equity?.interval).toBe("NONE");
    expect(equity?.min).toBeNull();
    expect(equity?.max).toBeNull();
  });

  it("keeps a single amount from becoming a range", async () => {
    const pay = (await read(5)).compensation as Record<string, unknown>;
    const tiers = pay.tiers as Record<string, unknown>[];
    const components = tiers[0]?.components as Record<string, unknown>[];

    expect(components[0]?.min).toBe(110_000);
    expect(components[0]?.max).toBe(110_000);
  });

  it("says nothing is published when the company withholds its ranges", async () => {
    const pay = (await read(1)).compensation as Record<string, unknown>;

    expect(pay.published).toBe(false);
    expect(pay.summary).toBeNull();
    expect(pay.tiers).toEqual([]);
  });

  // A caller who asks for no compensation says nothing about the company, so
  // the answer must stay apart from the one a company withholding its ranges
  // gets.
  it("is left out when the caller asks for none", async () => {
    const payload = await read(3, { include_compensation: false });

    expect(payload.compensation ?? null).toBeNull();
  });
});

describe("a posting or a board that cannot be found", () => {
  it("refuses an identifier the board does not carry", async () => {
    const result = await posting({ board: "invented", job_id: fixtureId(999) }).run();

    expect(result.isError).toBe(true);
  });

  it("refuses a token no board answers", async () => {
    const result = await posting({ board: "nobody", job_id: fixtureId(1) }).run();

    expect(result.isError).toBe(true);
  });
});

describe("a board the session has already read", () => {
  it("is not requested again", async () => {
    const fake = fakeFetch({ invented: shapesBoard });
    const client = clientWith(fake);

    await settled(searchJobsTool(client, { companies: ["invented"] }));
    const before = fake.calls.length;
    await settled(getJobTool(client, { board: "invented", job_id: fixtureId(9) }));

    expect(fake.calls).toHaveLength(before);
  });
});
