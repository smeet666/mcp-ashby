import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/tools/arguments.js";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_COMPANIES,
  DEFAULT_PAY_INTERVAL,
  MAX_COMPANIES,
  MAX_LIMIT,
} from "../../src/ashby/config.js";
import { resolveBoardSchema } from "../../src/tools/resolveBoard.js";
import { searchJobsSchema } from "../../src/tools/searchJobs.js";
import { getJobSchema } from "../../src/tools/getJob.js";
import { listFilterValuesSchema } from "../../src/tools/listFilterValues.js";
import { compareCompensationSchema } from "../../src/tools/compareCompensation.js";
import { invalidInput } from "../../src/ashby/errors.js";
import { toolFailure } from "../../src/tools/errorShape.js";
import { captureError, makeNotFound, resultText } from "./_harness.js";

/** What a refusal states, whether in its message or in the values it lists. */
const refusalNames = (error: { message: string; allowedValues?: string[] }): string =>
  `${error.message} ${JSON.stringify(error.allowedValues ?? [])}`;
import { fixtureId } from "./_corpus.js";

/** Arguments are read through the schema each tool publishes. */
const parse = (schema: unknown, args: Record<string, unknown>): Record<string, unknown> =>
  (parseArgs as unknown as (s: unknown, a: unknown) => Record<string, unknown>)(schema, args);

describe("the ceilings the server holds", () => {
  it("returns twenty postings unless asked otherwise", () => {
    expect(DEFAULT_LIMIT).toBe(20);
  });

  it("returns a hundred postings at most", () => {
    expect(MAX_LIMIT).toBe(100);
  });

  it("reads five companies unless asked otherwise", () => {
    expect(DEFAULT_MAX_COMPANIES).toBe(5);
  });

  it("reads ten companies at most, each one costing a payload of several megabytes", () => {
    expect(MAX_COMPANIES).toBe(10);
  });

  it("reads a yearly interval unless asked otherwise", () => {
    expect(DEFAULT_PAY_INTERVAL).toBe("1 YEAR");
  });
});

describe("an argument the server does not publish", () => {
  it("is refused on resolve_board", async () => {
    const error = await captureError(() => parse(resolveBoardSchema, { name: "Ashby", depth: 3 }));

    expect(error.code).toBe("invalid_input");
  });

  it("is refused on search_jobs, which is what additionalProperties false announces", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], sort_by: "salary" }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("is refused on get_job", async () => {
    const error = await captureError(() =>
      parse(getJobSchema, { board: "ashby", job_id: fixtureId(1), format: "markdown" }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("is refused on list_filter_values", async () => {
    const error = await captureError(() =>
      parse(listFilterValuesSchema, { board: "ashby", top: 5 }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("is refused on compare_compensation", async () => {
    const error = await captureError(() =>
      parse(compareCompensationSchema, { board: "ashby", currency: "USD", convert_to: "EUR" }),
    );

    expect(error.code).toBe("invalid_input");
  });
});

describe("a required argument", () => {
  it("is demanded on resolve_board", async () => {
    const error = await captureError(() => parse(resolveBoardSchema, {}));

    expect(error.code).toBe("invalid_input");
  });

  it("is demanded on search_jobs, which names the companies to read", async () => {
    const error = await captureError(() => parse(searchJobsSchema, {}));

    expect(error.code).toBe("invalid_input");
  });

  it("refuses an empty list of companies", async () => {
    const error = await captureError(() => parse(searchJobsSchema, { companies: [] }));

    expect(error.code).toBe("invalid_input");
  });

  it("is demanded on get_job for the posting identifier", async () => {
    const error = await captureError(() => parse(getJobSchema, { board: "ashby" }));

    expect(error.code).toBe("invalid_input");
  });
});

describe("what search_jobs accepts", () => {
  it("reads a company name", () => {
    expect(parse(searchJobsSchema, { companies: ["Eleven Labs"] }).companies).toEqual([
      "Eleven Labs",
    ]);
  });

  it("returns twenty postings when no limit is asked for", () => {
    expect(parse(searchJobsSchema, { companies: ["ashby"] }).limit).toBe(DEFAULT_LIMIT);
  });

  it("accepts the highest limit it publishes", () => {
    expect(parse(searchJobsSchema, { companies: ["ashby"], limit: MAX_LIMIT }).limit).toBe(
      MAX_LIMIT,
    );
  });

  it("refuses a limit beyond the ceiling, before any board is read", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], limit: 101 }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("refuses a limit that is not a whole number", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], limit: 2.5 }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("refuses a negative offset", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], offset: -1 }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("accepts ten companies", () => {
    const companies = Array.from({ length: MAX_COMPANIES }, (_, i) => `company-${i}`);

    expect(parse(searchJobsSchema, { companies }).companies).toHaveLength(MAX_COMPANIES);
  });

  it("refuses eleven companies, before any board is read", async () => {
    const companies = Array.from({ length: MAX_COMPANIES + 1 }, (_, i) => `company-${i}`);

    const error = await captureError(() => parse(searchJobsSchema, { companies }));

    expect(error.code).toBe("invalid_input");
  });

  it("refuses keywords that are not text", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], query: 7 }),
    );

    expect(error.code).toBe("invalid_input");
  });

  // The published argument table offers a single value or a list of them, a
  // caller naming one country having no list to write.
  it("accepts a single country and a list of countries", () => {
    expect(parse(searchJobsSchema, { companies: ["ashby"], country: "USA" }).country).toBeDefined();
    expect(
      parse(searchJobsSchema, { companies: ["ashby"], country: ["USA", "United States"] }).country,
    ).toBeDefined();
  });

  it("refuses a currency that is not a three-letter code", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], salary_min: 100_000, currency: "dollars" }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("accepts a three-letter currency code", () => {
    const parsed = parse(searchJobsSchema, {
      companies: ["ashby"],
      salary_min: 100_000,
      currency: "USD",
    });

    expect(parsed.currency).toBe("USD");
  });

  it("refuses a place to search that it does not publish", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], search_in: "requirements" }),
    );

    expect(error.code).toBe("invalid_input");
  });

  it("names the values it accepts when an enumerated value is refused", async () => {
    const error = await captureError(() =>
      parse(searchJobsSchema, { companies: ["ashby"], sort: "salary_desc" }),
    );

    expect(error.code).toBe("invalid_input");
    expect(refusalNames(error)).toContain("published_desc");
  });
});

describe("what the other tools accept", () => {
  it("reads a posting in plain text unless asked otherwise", () => {
    expect(parse(getJobSchema, { board: "ashby", job_id: fixtureId(1) }).description).toBe("plain");
  });

  it("refuses a description format it does not publish", async () => {
    const error = await captureError(() =>
      parse(getJobSchema, { board: "ashby", job_id: fixtureId(1), description: "markdown" }),
    );

    expect(error.code).toBe("invalid_input");
    expect(refusalNames(error)).toContain("plain");
  });

  it("counts every facet unless one is named", () => {
    expect(parse(listFilterValuesSchema, { board: "ashby" }).facet).toBe("all");
  });

  it("refuses a facet the board has no field for", async () => {
    const error = await captureError(() =>
      parse(listFilterValuesSchema, { board: "ashby", facet: "seniority" }),
    );

    expect(error.code).toBe("invalid_input");
    expect(refusalNames(error)).toContain("departments");
  });

  it("compares salaries on a yearly interval unless asked otherwise", () => {
    const parsed = parse(compareCompensationSchema, { board: "ashby" });

    expect(parsed.component).toBe("Salary");
    expect(parsed.interval).toBe(DEFAULT_PAY_INTERVAL);
  });

  it("refuses a component type it does not publish", async () => {
    const error = await captureError(() =>
      parse(compareCompensationSchema, { board: "ashby", component: "Pension" }),
    );

    expect(error.code).toBe("invalid_input");
    expect(refusalNames(error)).toContain("Salary");
  });

  it("refuses a comparison beyond the ceiling of a hundred rows", async () => {
    const error = await captureError(() =>
      parse(compareCompensationSchema, { board: "ashby", limit: 101 }),
    );

    expect(error.code).toBe("invalid_input");
  });
});

describe("how a refusal reaches the caller", () => {
  it("is marked as a failure rather than returned as a result", () => {
    const result = toolFailure(invalidInput("the department Marketing is not on this board"));

    expect(result.isError).toBe(true);
  });

  it("names the code the layer raised", () => {
    const result = toolFailure(invalidInput("the department Marketing is not on this board"));

    expect(resultText(result)).toContain("invalid_input");
  });

  it("names the values the board does carry", () => {
    const result = toolFailure(
      invalidInput("the department Marketing is not on this board", ["Engineering", "Sales"]),
    );

    expect(resultText(result)).toContain("Engineering");
    expect(resultText(result)).toContain("Sales");
  });

  it("keeps a missing board distinct from a refused argument", () => {
    const missing = toolFailure(makeNotFound("no board answers the token nobody"));

    expect(resultText(missing)).toContain("not_found");
  });

  it("carries no structured result, an outage being no answer about the board", () => {
    const result = toolFailure(invalidInput("the limit 101 is beyond the ceiling"));

    expect((result as { structuredContent?: unknown }).structuredContent).toBeUndefined();
  });
});
