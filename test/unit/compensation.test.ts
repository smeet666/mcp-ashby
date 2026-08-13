import { describe, expect, it } from "vitest";
import { comparePay, componentsOfType, readPay } from "../../src/ashby/compensation.js";
import type { PayComponent, PayTier, RawJob } from "../../src/types.js";
import {
  eightTiers,
  equityWithoutAmount,
  paidByTheHour,
  shape,
  shapesJobs,
  singleAmount,
  unknownVocabulary,
  withheldPay,
} from "./_corpus.js";

/** The published branch of the union, read once a test has established it. */
const read = (job: RawJob): { published: boolean; summary: string | null; tiers: PayTier[] } =>
  readPay(job) as unknown as { published: boolean; summary: string | null; tiers: PayTier[] };

const componentTypes = (components: PayComponent[]): string[] =>
  components.map((component) => component.type);

describe("a company that withholds its ranges", () => {
  it("publishes nothing", () => {
    expect(read(withheldPay()).published).toBe(false);
  });

  it("carries a null summary rather than an empty one", () => {
    expect(read(withheldPay()).summary).toBeNull();
  });

  it("carries no tier", () => {
    expect(read(withheldPay()).tiers).toEqual([]);
  });

  it("names no amount, neither zero nor an empty range", () => {
    expect(JSON.stringify(readPay(withheldPay()))).not.toContain("0");
  });

  it("holds no component of any type", () => {
    expect(componentsOfType(withheldPay(), "Salary")).toEqual([]);
  });
});

describe("a company that publishes its ranges", () => {
  it("says so", () => {
    expect(read(singleAmount()).published).toBe(true);
  });

  it("repeats the summary the company wrote", () => {
    expect(read(singleAmount()).summary).toBe("€110K");
  });

  it("carries one tier per range the company published", () => {
    expect(read(eightTiers()).tiers).toHaveLength(8);
  });

  it("names the zone each tier covers", () => {
    expect(read(eightTiers()).tiers.map((tier) => tier.title)).toContain("Zone A");
  });

  it("leaves an unnamed tier without a title", () => {
    expect(read(singleAmount()).tiers[0]?.title).toBeNull();
  });

  it("carries the free text a tier adds, absent as null", () => {
    expect(read(singleAmount()).tiers[0]?.additional_information).toBeNull();
  });
});

describe("where the components come from", () => {
  it("reads the tiers, which carry the currency on every component", () => {
    const components = read(equityWithoutAmount()).tiers[0]?.components ?? [];

    expect(componentTypes(components)).toEqual(["Salary", "EquityPercentage", "EquityCashValue"]);
  });

  it("keeps the currency of a capital share null, the flattened list dropping that key", () => {
    const equity = componentsOfType(equityWithoutAmount(), "EquityPercentage")[0];

    expect(equity?.currency).toBeNull();
  });

  it("keeps a capital share on its own interval", () => {
    const equity = componentsOfType(equityWithoutAmount(), "EquityPercentage")[0];

    expect(equity?.interval).toBe("NONE");
  });

  it("keeps a promise without a figure unbounded", () => {
    const equity = componentsOfType(equityWithoutAmount(), "EquityPercentage")[0];

    expect(equity?.min).toBeNull();
    expect(equity?.max).toBeNull();
  });

  it("repeats the summary the company wrote on a promise without a figure", () => {
    const equity = componentsOfType(equityWithoutAmount(), "EquityCashValue")[0];

    expect(equity?.summary).toBe("Offers Equity");
    expect(equity?.min).toBeNull();
  });

  it("lets a single amount through without turning it into a range", () => {
    const salary = componentsOfType(singleAmount(), "Salary")[0];

    expect(salary?.min).toBe(110_000);
    expect(salary?.max).toBe(110_000);
  });

  it("keeps the currency and the interval of an amount", () => {
    const salary = componentsOfType(singleAmount(), "Salary")[0];

    expect(salary?.currency).toBe("EUR");
    expect(salary?.interval).toBe("1 YEAR");
  });

  it("lets a compensation type this server has never seen through", () => {
    const components = read(unknownVocabulary()).tiers[0]?.components ?? [];

    expect(componentTypes(components)).toEqual(["BarterCredits"]);
    expect(components[0]?.interval).toBe("1 MOON");
    expect(components[0]?.currency).toBe("XBT");
  });

  it("gathers a component type across every tier", () => {
    expect(componentsOfType(eightTiers(), "Salary")).toHaveLength(8);
  });

  it("returns nothing for a type the posting does not carry", () => {
    expect(componentsOfType(singleAmount(), "Bonus")).toEqual([]);
  });
});

describe("comparing what several postings pay", () => {
  const comparison = () => comparePay(shapesJobs, "Salary", "1 YEAR");

  it("lays one row per tier carrying the component asked for", () => {
    expect(comparison().rows).toHaveLength(19);
  });

  it("names the tier a row came from", () => {
    const rows = comparison().rows.filter((row) => row.job_id === eightTiers().id);

    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.tier_title)).toContain("Zone A");
  });

  it("carries the amounts and the currency of each row", () => {
    const row = comparison().rows.find((entry) => entry.job_id === singleAmount().id);

    expect(row?.min).toBe(110_000);
    expect(row?.max).toBe(110_000);
    expect(row?.currency).toBe("EUR");
  });

  it("carries the title of the posting on each row", () => {
    const row = comparison().rows.find((entry) => entry.job_id === singleAmount().id);

    expect(row?.title).toBe("Posting on a single amount");
  });

  it("names every currency present, keeping them apart", () => {
    expect([...comparison().currencies_present].sort()).toEqual(["EUR", "USD"]);
  });

  it("converts nothing between currencies", () => {
    const rows = comparison().rows;

    expect(rows.some((row) => row.currency === "EUR")).toBe(true);
    expect(rows.some((row) => row.currency === "USD")).toBe(true);
  });

  it("names the postings whose company publishes nothing", () => {
    const withheld = comparison().not_published;

    expect(withheld.map((entry) => entry.job_id)).toEqual([withheldPay().id]);
    expect(withheld[0]?.title).toBe("Posting whose company withholds its ranges");
  });

  it("sets aside a posting paid on another interval, naming that interval", () => {
    const others = comparison().other_intervals;

    expect(others.some((entry) => entry.job_id === paidByTheHour().id)).toBe(true);
    expect(others.find((entry) => entry.job_id === paidByTheHour().id)?.interval).toBe("1 HOUR");
  });

  it("keeps a posting paid on another interval out of the rows", () => {
    expect(comparison().rows.some((row) => row.job_id === paidByTheHour().id)).toBe(false);
  });

  it("multiplies nothing to bring another interval into the comparison", () => {
    const rows = comparison().rows;

    expect(rows.every((row) => (row.min ?? 0) !== 45 * 2080)).toBe(true);
  });

  it("computes no average and no median", () => {
    const keys = Object.keys(comparison() as unknown as Record<string, unknown>);

    for (const forbidden of ["average", "median", "mean", "total", "sum"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("compares another component type on its own", () => {
    const equity = comparePay([equityWithoutAmount()], "EquityCashValue", "1 YEAR");

    expect(equity.rows).toHaveLength(1);
    expect(equity.rows[0]?.min).toBeNull();
    expect(equity.rows[0]?.max).toBeNull();
  });

  it("adds nothing between a salary and a capital share", () => {
    const equity = comparePay([equityWithoutAmount()], "EquityPercentage", "NONE");

    expect(equity.rows).toHaveLength(1);
    expect(equity.rows[0]?.currency).toBeNull();
  });

  it("lays no row for a posting carrying no component of the type asked for", () => {
    const bonus = comparePay([shape(2)], "Bonus", "1 YEAR");

    expect(bonus.rows).toEqual([]);
  });
});
