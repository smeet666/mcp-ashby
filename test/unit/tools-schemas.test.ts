import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareCompensationOutputShape,
  facetValueSchema,
  getJobOutputShape,
  jobRecordSchema,
  jobRowSchema,
  jobRowShape,
  listFilterValuesOutputShape,
  payComponentSchema,
  paySchema,
  payTierSchema,
  placeSchema,
  resolveBoardOutputShape,
  searchJobsOutputShape,
  companyOutcomeSchema,
  undeclaredSchema,
} from "../../src/tools/schemas.js";
import {
  EPOCH,
  clientWith,
  compareCompensationTool,
  fakeFetch,
  getJobTool,
  listFilterValuesTool,
  objectSchema,
  resolveBoardTool,
  searchJobsTool,
  settled,
  structured,
} from "./_harness.js";
import { fixtureId, shapesBoard, wideBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

function client() {
  return clientWith(fakeFetch({ invented: shapesBoard, wide: wideBoard }));
}

const parses = (shape: unknown, payload: unknown): boolean =>
  objectSchema(shape).safeParse(payload).success;

describe("every tool declares the shape of what it returns", () => {
  it("declares one for each of the five tools", () => {
    for (const shape of [
      resolveBoardOutputShape,
      searchJobsOutputShape,
      getJobOutputShape,
      listFilterValuesOutputShape,
      compareCompensationOutputShape,
    ]) {
      expect(shape).toBeDefined();
    }
  });

  it("returns a resolution the declaration accepts", async () => {
    const payload = structured(await settled(resolveBoardTool(client(), { name: "invented" })));

    expect(parses(resolveBoardOutputShape, payload)).toBe(true);
  });

  it("returns a search the declaration accepts", async () => {
    const payload = structured(
      await settled(searchJobsTool(client(), { companies: ["wide"], limit: 100 })),
    );

    expect(parses(searchJobsOutputShape, payload)).toBe(true);
  });

  // The declaration governs what a tool returns, a tier leaving out a field it
  // declares breaking that promise.
  it("returns a posting the declaration accepts", async () => {
    const payload = structured(
      await settled(getJobTool(client(), { board: "invented", job_id: fixtureId(3) })),
    );

    expect(parses(getJobOutputShape, payload)).toBe(true);
  });

  it("returns the facets the declaration accepts", async () => {
    const payload = structured(await settled(listFilterValuesTool(client(), { board: "wide" })));

    expect(parses(listFilterValuesOutputShape, payload)).toBe(true);
  });

  it("returns a comparison the declaration accepts", async () => {
    const payload = structured(
      await settled(compareCompensationTool(client(), { board: "invented", limit: 100 })),
    );

    expect(parses(compareCompensationOutputShape, payload)).toBe(true);
  });

  it("returns a posting whose company withholds its ranges, in the branch the declaration carries", async () => {
    const payload = structured(
      await settled(getJobTool(client(), { board: "invented", job_id: fixtureId(1) })),
    );

    expect((payload.compensation as Record<string, unknown>).published).toBe(false);
    expect(parses(getJobOutputShape, payload)).toBe(true);
  });

  it("returns a resolution for a company nothing answered, which the declaration accepts", async () => {
    const payload = structured(await settled(resolveBoardTool(client(), { name: "nobody" })));

    expect(payload.found).toEqual([]);
    expect(parses(resolveBoardOutputShape, payload)).toBe(true);
  });
});

describe("the branch a withheld range takes", () => {
  it("accepts a published range with its tiers", () => {
    expect(
      parses(paySchema, {
        published: true,
        summary: "€110K",
        tiers: [
          {
            title: null,
            summary: "€110K",
            additional_information: null,
            components: [
              {
                type: "Salary",
                min: 110_000,
                max: 110_000,
                currency: "EUR",
                interval: "1 YEAR",
                summary: "€110K",
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts a withheld range carrying no tier", () => {
    expect(parses(paySchema, { published: false, summary: null, tiers: [] })).toBe(true);
  });

  it("refuses a withheld range carrying a summary, the two branches holding different fields", () => {
    expect(parses(paySchema, { published: false, summary: "€110K", tiers: [] })).toBe(false);
  });
});

describe("the pieces a payload is built from", () => {
  it("accepts a place whose parsed fields are absent", () => {
    expect(
      parses(placeSchema, { label: "Remote", locality: null, region: null, country: null }),
    ).toBe(true);
  });

  it("refuses a place carrying no free text", () => {
    expect(parses(placeSchema, { locality: null, region: null, country: null })).toBe(false);
  });

  it("accepts a component without bounds and without a currency", () => {
    expect(
      parses(payComponentSchema, {
        type: "EquityPercentage",
        min: null,
        max: null,
        currency: null,
        interval: "NONE",
        summary: "Offers Equity",
      }),
    ).toBe(true);
  });

  it("accepts a component type this server has never seen", () => {
    expect(
      parses(payComponentSchema, {
        type: "BarterCredits",
        min: 1,
        max: 2,
        currency: "XBT",
        interval: "1 MOON",
        summary: "Bartered",
      }),
    ).toBe(true);
  });

  it("accepts a tier that names no zone", () => {
    expect(
      parses(payTierSchema, {
        title: null,
        summary: "$100K – $120K",
        additional_information: null,
        components: [],
      }),
    ).toBe(true);
  });

  it("accepts counts of what the board left unsaid", () => {
    expect(parses(undeclaredSchema, { workplace_type: 24, is_remote: 24, compensation: 40 })).toBe(
      true,
    );
  });

  it("accepts a facet value and its count", () => {
    expect(parses(facetValueSchema, { value: "Engineering", count: 40 })).toBe(true);
  });

  it("refuses a facet value without a count", () => {
    expect(parses(facetValueSchema, { value: "Engineering" })).toBe(false);
  });

  // The five fields a company outcome carries: the name asked for, the token
  // read, the state of that read, the postings the board holds, and the count
  // kept. A count of matches states little without the count it came out of.
  it("accepts the outcome of one company", () => {
    expect(
      parses(companyOutcomeSchema, {
        input: "invented",
        board: "invented",
        status: "read",
        read: 120,
        matched: 12,
      }),
    ).toBe(true);
  });

  // A read that broke counts nothing, and a zero would read as a board with
  // nothing on it.
  it("accepts an outcome whose counts stayed null", () => {
    expect(
      parses(companyOutcomeSchema, {
        input: "broken",
        board: null,
        status: "failed",
        read: null,
        matched: null,
      }),
    ).toBe(true);
  });
});

describe("the compact row and the full record", () => {
  it("declares no description on the compact row", () => {
    const declared = Object.keys(jobRowShape as Record<string, unknown>);

    expect(declared).not.toContain("description");
    expect(declared).not.toContain("description_plain");
    expect(declared).not.toContain("description_html");
  });

  it("accepts a compact row rendered by a search", async () => {
    const payload = structured(
      await settled(searchJobsTool(client(), { companies: ["wide"], limit: 1 })),
    );
    const row = (payload.jobs as unknown[])[0];

    expect(parses(jobRowSchema, row)).toBe(true);
  });

  it("accepts a full record rendered for one posting", async () => {
    const payload = structured(
      await settled(getJobTool(client(), { board: "invented", job_id: fixtureId(9) })),
    );

    expect(parses(jobRecordSchema, payload)).toBe(true);
  });
});
