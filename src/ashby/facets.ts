import type { FacetValue, RawJob, Undeclared } from "../types.js";
import { countryOf } from "./filter.js";

export type FacetKey =
  | "departments"
  | "teams"
  | "locations"
  | "countries"
  | "employment_types"
  | "workplace_types";

export interface Facets {
  totalJobs: number;
  facets: Partial<Record<FacetKey, FacetValue[]>>;
  /**
   * Postings that declare nothing, per field. Without it a caller reads
   * "447 postings sorted" as "447 postings on the board".
   */
  undeclared: Undeclared;
  /**
   * Spellings on this board that name what looks like one place, `USA` and
   * `United States` for instance, so a caller asks for both rather than
   * picking one.
   */
  siblingSpellings: string[][];
}

/** A facet is plural, and the field a caller filters on is singular. */
const FIELD_OF: Record<FacetKey, string> = {
  departments: "department",
  teams: "team",
  locations: "location",
  countries: "country",
  employment_types: "employment_type",
  workplace_types: "workplace_type",
};

const READERS: Record<FacetKey, (job: RawJob) => string | null> = {
  departments: (job) => nonEmpty(job.department),
  teams: (job) => nonEmpty(job.team),
  locations: (job) => nonEmpty(job.location),
  countries: countryOf,
  employment_types: (job) => nonEmpty(job.employmentType),
  workplace_types: (job) => job.workplaceType,
};

/**
 * The vocabulary of one board, counted from the board itself.
 *
 * Each board carries its own departments and teams, and a filter checked
 * against another board's words returns an emptiness that reads as an absence
 * of openings.
 */
export function countFacets(jobs: readonly RawJob[], wanted: readonly FacetKey[]): Facets {
  const facets: Partial<Record<FacetKey, FacetValue[]>> = {};
  const undeclared: Undeclared = {};

  for (const key of wanted) {
    const read = READERS[key];
    const counts = new Map<string, number>();
    let silent = 0;
    for (const job of jobs) {
      const value = read(job);
      if (value === null) {
        silent += 1;
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    facets[key] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    if (silent > 0) {
      undeclared[FIELD_OF[key]] = silent;
    }
  }

  // Both fields fall silent together, and a caller filtering on either one
  // needs the same count.
  const noWorkplace = jobs.filter((job) => job.workplaceType === null).length;
  if (noWorkplace > 0) {
    undeclared.workplace_type = noWorkplace;
    undeclared.is_remote = noWorkplace;
  }
  const withheld = jobs.filter(
    (job) => job.shouldDisplayCompensationOnJobPostings === false,
  ).length;
  if (withheld > 0) {
    undeclared.compensation = withheld;
  }

  return {
    totalJobs: jobs.length,
    facets,
    undeclared,
    siblingSpellings: siblingSpellings(facets.countries ?? []),
  };
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Groups spellings that look like one place, so a caller sees both before
 * choosing.
 *
 * Ashby documents this field as no country code, and one board writes `USA`
 * where another writes `United States`. The grouping suggests and never
 * merges: the counts stay separate, and a filter still asks for the spelling
 * it wants.
 */
function siblingSpellings(countries: readonly FacetValue[]): string[][] {
  const keyed = countries
    .map(({ value }) => ({ value, key: initials(value) }))
    .filter((entry) => entry.key.length >= 2);
  const groups: { key: string; values: string[] }[] = [];
  for (const entry of keyed) {
    const sibling = groups.find(
      (group) => group.key.startsWith(entry.key) || entry.key.startsWith(group.key),
    );
    if (sibling) {
      sibling.values.push(entry.value);
      if (entry.key.length < sibling.key.length) {
        sibling.key = entry.key;
      }
      continue;
    }
    groups.push({ key: entry.key, values: [entry.value] });
  }
  return groups.filter((group) => group.values.length > 1).map((group) => group.values);
}

/**
 * The initials of a multi-word name, the letters of a single word.
 *
 * `United States` and `USA` both reduce to something starting `us`, which is
 * what puts them in front of a caller together.
 */
function initials(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  if (words.length === 1) {
    return words[0] ?? "";
  }
  return words.map((word) => word.slice(0, 1)).join("");
}
