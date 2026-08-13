import { describe, expect, it } from "vitest";
import { countFacets } from "../../src/ashby/facets.js";
import type { FacetKey, Facets } from "../../src/ashby/facets.js";
import { shape, shapesJobs, wideJobs } from "./_corpus.js";

const want = (...keys: string[]): FacetKey[] => keys as unknown as FacetKey[];

const values = (facets: Facets, key: string): { value: string; count: number }[] =>
  (facets.facets as unknown as Record<string, { value: string; count: number }[]>)[key] ?? [];

const countOf = (facets: Facets, key: string, value: string): number | undefined =>
  values(facets, key).find((entry) => entry.value === value)?.count;

const silent = (facets: Facets): Record<string, number> =>
  facets.undeclared as unknown as Record<string, number>;

const groupCount = (groups: unknown): number => {
  if (Array.isArray(groups)) return groups.length;
  if (groups !== null && typeof groups === "object") return Object.keys(groups as object).length;
  return 0;
};

describe("what a facet counts", () => {
  it("reports how many postings the board carries", () => {
    expect(countFacets(wideJobs, want("departments")).totalJobs).toBe(120);
  });

  it("counts the postings declaring each department", () => {
    const facets = countFacets(wideJobs, want("departments"));

    expect(countOf(facets, "departments", "Engineering")).toBe(40);
    expect(countOf(facets, "departments", "Sales")).toBe(40);
    expect(countOf(facets, "departments", "Design")).toBe(40);
  });

  it("counts the postings declaring each team", () => {
    const facets = countFacets(wideJobs, want("teams"));

    expect(countOf(facets, "teams", "Platform")).toBe(40);
  });

  it("counts the postings declaring each employment type", () => {
    const facets = countFacets(wideJobs, want("employment_types"));

    expect(countOf(facets, "employment_types", "FullTime")).toBe(117);
    expect(countOf(facets, "employment_types", "Intern")).toBe(3);
  });

  it("counts only the postings that declare a workplace type", () => {
    const facets = countFacets(wideJobs, want("workplace_types"));

    expect(countOf(facets, "workplace_types", "Remote")).toBe(32);
    expect(countOf(facets, "workplace_types", "Hybrid")).toBe(32);
    expect(countOf(facets, "workplace_types", "OnSite")).toBe(32);
    expect(values(facets, "workplace_types").reduce((sum, entry) => sum + entry.count, 0)).toBe(96);
  });

  it("counts the free text of each location", () => {
    const facets = countFacets(wideJobs, want("locations"));

    expect(countOf(facets, "locations", "Nowhere City")).toBe(120);
  });

  it("counts each country under the spelling the board publishes", () => {
    const facets = countFacets(wideJobs, want("countries"));

    expect(countOf(facets, "countries", "UI")).toBe(106);
    expect(countOf(facets, "countries", "United Inventia")).toBe(14);
  });

  it("counts a value this server has never seen", () => {
    const facets = countFacets(shapesJobs, want("employment_types", "workplace_types"));

    expect(countOf(facets, "employment_types", "Seasonal")).toBe(1);
    expect(countOf(facets, "workplace_types", "Nomadic")).toBe(1);
  });
});

describe("what a facet leaves out", () => {
  it("omits a facet the caller did not ask for", () => {
    const facets = countFacets(wideJobs, want("departments"));

    expect(Object.keys(facets.facets as object)).toEqual(["departments"]);
  });

  it("returns every facet asked for", () => {
    const facets = countFacets(wideJobs, want("departments", "countries"));

    expect(Object.keys(facets.facets as object).sort()).toEqual(["countries", "departments"]);
  });
});

describe("the postings that stay silent", () => {
  it("counts those recording no workplace type", () => {
    expect(silent(countFacets(wideJobs, want("workplace_types"))).workplace_type).toBe(24);
  });

  it("counts those recording no remote flag", () => {
    expect(silent(countFacets(wideJobs, want("workplace_types"))).is_remote).toBe(24);
  });

  it("counts those whose company withholds its ranges", () => {
    expect(silent(countFacets(wideJobs, want("departments"))).compensation).toBe(40);
  });

  // A posting carrying no country is silent on it, the same way a posting
  // carrying no workplace type is silent on that.
  it("counts those carrying no country", () => {
    expect(silent(countFacets(shapesJobs, want("countries"))).country).toBe(1);
  });

  // The corpus writes an absent country as a missing key and as an empty
  // string, and the two say the same thing.
  it("counts an empty country string as a posting carrying none", () => {
    const facets = countFacets([shape(7), shape(8)], want("countries"));

    expect(silent(facets).country).toBe(1);
    expect(countOf(facets, "countries", "Inventia")).toBe(1);
  });
});

describe("the neighbouring spellings of one board", () => {
  it("groups the long spelling with the short one", () => {
    const facets = countFacets(shapesJobs, want("countries"));
    const grouped = JSON.stringify(facets.siblingSpellings);

    expect(grouped).toContain("United Inventia");
    expect(grouped).toContain("Inventia");
  });

  it("groups nothing on a board writing a single spelling", () => {
    const facets = countFacets([shape(1), shape(2)], want("countries"));

    expect(groupCount(facets.siblingSpellings)).toBe(0);
  });
});
