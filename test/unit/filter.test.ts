import { describe, expect, it } from "vitest";
import { applyCriteria, sortJobs } from "../../src/ashby/filter.js";
import type { Criteria, FilterResult } from "../../src/ashby/filter.js";
import type { RawJob } from "../../src/types.js";
import { eightTiers, paidByTheHour, shape, shapesJobs, wideJobs } from "./_corpus.js";

/** Criteria are assembled loosely so a test states the request a caller makes. */
const crit = (fields: Record<string, unknown>): Criteria => fields as unknown as Criteria;

/** The counts of postings that stayed silent, addressed by field. */
const silent = (result: FilterResult): Record<string, number> =>
  result.undeclared as unknown as Record<string, number>;

function unmatchedCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flat().length;
  }
  return 0;
}

const titles = (jobs: RawJob[]): string[] => jobs.map((job) => job.title);

describe("keywords", () => {
  it("matches the title by default", () => {
    const result = applyCriteria(shapesJobs, crit({ query: "equity" }));

    expect(titles(result.kept)).toEqual(["Posting promising equity without an amount"]);
  });

  it("matches the title without regard to case", () => {
    const result = applyCriteria(shapesJobs, crit({ query: "EQUITY" }));

    expect(result.kept).toHaveLength(1);
  });

  it("leaves the description out of the search by default", () => {
    const result = applyCriteria(shapesJobs, crit({ query: "number", searchIn: "title" }));

    expect(result.kept).toEqual([]);
  });

  it("reads the description when the caller asks for it", () => {
    const result = applyCriteria(
      shapesJobs,
      crit({ query: "number", searchIn: "title_and_description" }),
    );

    expect(result.kept).toHaveLength(14);
  });
});

describe("the board vocabularies", () => {
  it("keeps the postings of one department", () => {
    const result = applyCriteria(wideJobs, crit({ department: ["Engineering"] }));

    expect(result.kept).toHaveLength(40);
  });

  it("accepts several departments at once", () => {
    const result = applyCriteria(wideJobs, crit({ department: ["Engineering", "Design"] }));

    expect(result.kept).toHaveLength(80);
  });

  it("keeps the postings of one team", () => {
    const result = applyCriteria(wideJobs, crit({ team: ["Growth"] }));

    expect(result.kept).toHaveLength(40);
  });

  it("keeps the postings of one employment type", () => {
    const result = applyCriteria(wideJobs, crit({ employmentType: ["Intern"] }));

    expect(result.kept).toHaveLength(3);
  });

  it("keeps the postings of one workplace type", () => {
    const result = applyCriteria(wideJobs, crit({ workplaceType: ["Remote"] }));

    expect(result.kept).toHaveLength(32);
  });

  it("names a value the board does not carry, which lets the tool answer with the values it has", () => {
    const result = applyCriteria(wideJobs, crit({ department: ["Marketing"] }));

    expect(unmatchedCount(result.unmatchedValues)).toBeGreaterThan(0);
    expect(JSON.stringify(result.unmatchedValues)).toContain("Marketing");
  });

  it("names no unmatched value when every value asked for is on the board", () => {
    const result = applyCriteria(wideJobs, crit({ department: ["Engineering"] }));

    expect(unmatchedCount(result.unmatchedValues)).toBe(0);
  });
});

describe("a criterion on a field a posting leaves silent", () => {
  it("keeps the postings declaring remote work", () => {
    const result = applyCriteria(wideJobs, crit({ isRemote: true }));

    expect(result.kept).toHaveLength(32);
  });

  it("keeps the postings declaring work that is not remote", () => {
    const result = applyCriteria(wideJobs, crit({ isRemote: false }));

    expect(result.kept).toHaveLength(64);
  });

  it("discards the postings that declare nothing", () => {
    const result = applyCriteria(wideJobs, crit({ isRemote: false }));

    expect(result.kept.every((job) => job.isRemote === false)).toBe(true);
  });

  it("counts the silent postings it discarded", () => {
    const result = applyCriteria(wideJobs, crit({ isRemote: false }));

    expect(silent(result).is_remote).toBe(24);
  });

  it("counts the postings recording no workplace type", () => {
    const result = applyCriteria(wideJobs, crit({ workplaceType: ["Remote"] }));

    expect(silent(result).workplace_type).toBe(24);
  });

  // A threshold cannot conclude anything about a company that publishes no
  // range, so those postings are counted beside the result.
  it("counts the postings whose company withholds its ranges", () => {
    const result = applyCriteria(
      wideJobs,
      crit({ salaryMin: 100_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(silent(result).compensation).toBe(40);
  });
});

describe("the compensation criteria", () => {
  it("keeps the postings whose company publishes a range", () => {
    const result = applyCriteria(wideJobs, crit({ hasCompensation: true }));

    expect(result.kept).toHaveLength(80);
  });

  it("keeps the postings whose company withholds its ranges", () => {
    const result = applyCriteria(wideJobs, crit({ hasCompensation: false }));

    expect(result.kept).toHaveLength(40);
  });

  it("keeps a posting whose whole range sits above the threshold", () => {
    const result = applyCriteria(
      [shape(2)],
      crit({ salaryMin: 90_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toHaveLength(1);
  });

  it("keeps a posting whose range crosses the threshold", () => {
    const result = applyCriteria(
      [shape(2)],
      crit({ salaryMin: 110_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toHaveLength(1);
  });

  it("discards a posting whose whole range sits under the threshold", () => {
    const result = applyCriteria(
      [shape(2)],
      crit({ salaryMin: 150_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toEqual([]);
  });

  it("leaves another currency out of the comparison", () => {
    const result = applyCriteria(
      [shape(2)],
      crit({ salaryMin: 90_000, currency: "CAD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toEqual([]);
  });

  it("refuses an hourly amount for a yearly threshold", () => {
    const result = applyCriteria(
      [paidByTheHour()],
      crit({ salaryMin: 40, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toEqual([]);
  });

  it("keeps an hourly amount for an hourly threshold", () => {
    const result = applyCriteria(
      [paidByTheHour()],
      crit({ salaryMin: 40, currency: "USD", salaryInterval: "1 HOUR" }),
    );

    expect(result.kept).toHaveLength(1);
  });

  it("keeps a posting as soon as one of its tiers passes the threshold", () => {
    const result = applyCriteria(
      [eightTiers()],
      crit({ salaryMin: 155_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toHaveLength(1);
  });

  it("discards a posting whose every tier stays under the threshold", () => {
    const result = applyCriteria(
      [eightTiers()],
      crit({ salaryMin: 500_000, currency: "USD", salaryInterval: "1 YEAR" }),
    );

    expect(result.kept).toEqual([]);
  });
});

describe("the place", () => {
  it("compares the country to the spelling the board publishes", () => {
    const result = applyCriteria(wideJobs, crit({ country: ["UI"] }));

    expect(result.kept).toHaveLength(106);
  });

  it("keeps two spellings of one country apart", () => {
    const result = applyCriteria(wideJobs, crit({ country: ["United Inventia"] }));

    expect(result.kept).toHaveLength(14);
  });

  it("accepts both spellings when the caller asks for both", () => {
    const result = applyCriteria(wideJobs, crit({ country: ["UI", "United Inventia"] }));

    expect(result.kept).toHaveLength(120);
  });

  it("searches the free text of the location", () => {
    const result = applyCriteria(wideJobs, crit({ locationContains: "Nowhere" }));

    expect(result.kept).toHaveLength(120);
  });

  it("returns nothing for a location the board never wrote", () => {
    const result = applyCriteria(wideJobs, crit({ locationContains: "Atlantis" }));

    expect(result.kept).toEqual([]);
  });
});

describe("the publication date", () => {
  it("keeps the postings published after the date asked for", () => {
    const result = applyCriteria(wideJobs, crit({ publishedAfter: "2026-05-15" }));

    expect(result.kept).toHaveLength(52);
  });

  it("keeps every posting for a date preceding the whole board", () => {
    const result = applyCriteria(wideJobs, crit({ publishedAfter: "2020-01-01" }));

    expect(result.kept).toHaveLength(120);
  });
});

describe("several criteria at once", () => {
  it("keeps the postings satisfying all of them", () => {
    const result = applyCriteria(
      wideJobs,
      crit({ department: ["Engineering"], employmentType: ["FullTime"], isRemote: true }),
    );

    expect(
      result.kept.every((job) => job.department === "Engineering" && job.isRemote === true),
    ).toBe(true);
  });

  it("keeps every posting when no criterion is given", () => {
    const result = applyCriteria(wideJobs, crit({}));

    expect(result.kept).toHaveLength(120);
  });
});

describe("sorting", () => {
  it("puts the most recent posting first by default order of publication", () => {
    const sorted = sortJobs(wideJobs, "published_desc");

    expect(sorted[0]?.publishedAt.startsWith("2026-09")).toBe(true);
    expect(sorted.at(-1)?.publishedAt.startsWith("2026-01")).toBe(true);
  });

  it("puts the oldest posting first on the ascending order", () => {
    const sorted = sortJobs(wideJobs, "published_asc");

    expect(sorted[0]?.publishedAt.startsWith("2026-01")).toBe(true);
  });

  it("orders titles without regard to case", () => {
    const jobs: RawJob[] = [
      { ...wideJobs[0]!, title: "beta" },
      { ...wideJobs[1]!, title: "Alpha" },
      { ...wideJobs[2]!, title: "Gamma" },
    ];

    expect(titles(sortJobs(jobs, "title"))).toEqual(["Alpha", "beta", "Gamma"]);
  });

  it("keeps postings sharing a key in the order they arrived", () => {
    const jobs: RawJob[] = [
      { ...wideJobs[0]!, title: "Same title", id: "first" },
      { ...wideJobs[1]!, title: "Same title", id: "second" },
      { ...wideJobs[2]!, title: "Same title", id: "third" },
    ];

    expect(sortJobs(jobs, "title").map((job) => job.id)).toEqual(["first", "second", "third"]);
  });

  it("keeps postings sharing a date in the order they arrived", () => {
    const jobs: RawJob[] = [
      { ...wideJobs[0]!, publishedAt: "2026-03-01T09:00:00.000+00:00", id: "first" },
      { ...wideJobs[1]!, publishedAt: "2026-03-01T09:00:00.000+00:00", id: "second" },
    ];

    expect(sortJobs(jobs, "published_desc").map((job) => job.id)).toEqual(["first", "second"]);
  });

  it("leaves the list handed in untouched", () => {
    const jobs = wideJobs.slice(0, 5);
    const before = jobs.map((job) => job.id);

    sortJobs(jobs, "title");

    expect(jobs.map((job) => job.id)).toEqual(before);
  });
});
