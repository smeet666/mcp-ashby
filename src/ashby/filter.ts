import type { RawJob, Undeclared } from "../types.js";
import { clearsFloor } from "./compensation.js";

export interface Criteria {
  query?: string;
  searchIn?: "title" | "title_and_description";
  department?: string[];
  team?: string[];
  employmentType?: string[];
  workplaceType?: string[];
  isRemote?: boolean;
  /** Compared against what the board publishes, `USA` and `United States` apart. */
  country?: string[];
  locationContains?: string;
  publishedAfter?: string;
  hasCompensation?: boolean;
  salaryMin?: number;
  currency?: string;
  salaryInterval?: string;
}

export interface FilterResult {
  kept: RawJob[];
  /**
   * Postings a criterion could say nothing about, counted per field. A third
   * of the corpus publishes no pay and a fifth records no workplace: filtering
   * them out is a judgement about the criterion, never about the posting.
   */
  undeclared: Undeclared;
  /** Criteria that narrowed nothing because the board never carries them. */
  unmatchedValues: Record<string, string[]>;
}

/** Counts a posting the board says nothing about, per field. */
type CountUndeclared = (field: string) => void;

/**
 * One criterion group, answering whether a posting survives it.
 *
 * A posting the board says nothing about is counted and dropped, because
 * filtering it out is a judgement about the criterion and never about the
 * posting: a third of a corpus publishes no pay, and a fifth records no
 * workplace.
 */
type CriterionCheck = (job: RawJob, criteria: Criteria, count: CountUndeclared) => boolean;

const matchesWords: CriterionCheck = (job, criteria) => {
  if (criteria.query === undefined) {
    return true;
  }
  const haystack =
    criteria.searchIn === "title_and_description"
      ? `${job.title}\n${job.descriptionPlain}`
      : job.title;
  return haystack.toLowerCase().includes(criteria.query.toLowerCase());
};

const matchesTaxonomy: CriterionCheck = (job, criteria) =>
  matchesOneOf(job.department, criteria.department) &&
  matchesOneOf(job.team, criteria.team) &&
  matchesOneOf(job.employmentType, criteria.employmentType);

const matchesWorkplace: CriterionCheck = (job, criteria, count) => {
  if (criteria.workplaceType !== undefined) {
    if (job.workplaceType === null) {
      count("workplace_type");
      return false;
    }
    if (!matchesOneOf(job.workplaceType, criteria.workplaceType)) {
      return false;
    }
  }

  if (criteria.isRemote !== undefined) {
    if (job.isRemote === null) {
      count("is_remote");
      return false;
    }
    if (job.isRemote !== criteria.isRemote) {
      return false;
    }
  }

  return true;
};

const matchesPlace: CriterionCheck = (job, criteria, count) => {
  if (criteria.country !== undefined) {
    const country = countryOf(job);
    if (country === null) {
      count("country");
      return false;
    }
    if (!matchesOneOf(country, criteria.country)) {
      return false;
    }
  }

  if (criteria.locationContains !== undefined) {
    const needle = criteria.locationContains.toLowerCase();
    const places = [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)];
    if (!places.some((place) => place.toLowerCase().includes(needle))) {
      return false;
    }
  }

  return true;
};

const matchesWhen: CriterionCheck = (job, criteria, count) => {
  if (criteria.publishedAfter === undefined) {
    return true;
  }
  const when = Date.parse(job.publishedAt);
  if (Number.isNaN(when)) {
    count("published_at");
    return false;
  }
  return when >= Date.parse(criteria.publishedAfter);
};

const matchesPay: CriterionCheck = (job, criteria, count) => {
  if (criteria.hasCompensation !== undefined) {
    const published = job.shouldDisplayCompensationOnJobPostings === true;
    if (published !== criteria.hasCompensation) {
      return false;
    }
  }

  if (criteria.salaryMin === undefined) {
    return true;
  }

  const verdict = clearsFloor(
    job,
    criteria.salaryMin,
    criteria.currency ?? "",
    criteria.salaryInterval ?? "1 YEAR",
  );
  if (!verdict.declared) {
    count("compensation");
    return false;
  }
  if (!verdict.comparable) {
    count("salary_comparison");
    return false;
  }
  return verdict.cleared;
};

/** Every criterion group, in the order a posting is put through them. */
const CRITERIA_CHECKS: readonly CriterionCheck[] = [
  matchesWords,
  matchesTaxonomy,
  matchesWorkplace,
  matchesPlace,
  matchesWhen,
  matchesPay,
];

/** Every filter this server offers runs here, on a board already in memory. */
export function applyCriteria(jobs: readonly RawJob[], criteria: Criteria): FilterResult {
  const undeclared: Undeclared = {};
  const count = (field: string) => {
    undeclared[field] = (undeclared[field] ?? 0) + 1;
  };

  const kept = jobs.filter((job) => CRITERIA_CHECKS.every((check) => check(job, criteria, count)));

  return { kept, undeclared, unmatchedValues: unmatched(jobs, criteria) };
}

/** The country a posting states, with an empty string read as an absence. */
export function countryOf(job: RawJob): string | null {
  const country = job.address?.postalAddress?.addressCountry;
  if (country === undefined) {
    return null;
  }
  const trimmed = country.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function matchesOneOf(value: string, wanted: string[] | undefined): boolean {
  if (wanted === undefined) {
    return true;
  }
  return wanted.some((one) => one.toLowerCase() === value.toLowerCase());
}

/**
 * Values a caller asked for that this board never carries.
 *
 * A criterion checked against another board's wording returns an emptiness
 * that reads as an absence of openings, so the tools raise it as a refusal
 * carrying the words the board does publish.
 */
function unmatched(jobs: readonly RawJob[], criteria: Criteria): Record<string, string[]> {
  const fields: [string, string[] | undefined, (job: RawJob) => string | null][] = [
    ["department", criteria.department, (job) => job.department],
    ["team", criteria.team, (job) => job.team],
    ["employment_type", criteria.employmentType, (job) => job.employmentType],
    ["workplace_type", criteria.workplaceType, (job) => job.workplaceType],
    ["country", criteria.country, countryOf],
  ];
  const result: Record<string, string[]> = {};
  for (const [name, wanted, read] of fields) {
    if (wanted === undefined) {
      continue;
    }
    const present = new Set(
      jobs
        .map(read)
        .filter((v): v is string => v !== null)
        .map((v) => v.toLowerCase()),
    );
    const missing = wanted.filter((one) => !present.has(one.toLowerCase()));
    if (missing.length > 0) {
      result[name] = missing;
    }
  }
  return result;
}

export type SortKey = "published_desc" | "published_asc" | "title";

/** Orders the kept postings. Recency first, since a board spans five years. */
export function sortJobs(jobs: readonly RawJob[], by: SortKey): RawJob[] {
  return [...jobs].sort(jobComparator(by));
}

/** The same ordering, for a caller holding postings alongside what it rendered. */
export function jobComparator(by: SortKey): (a: RawJob, b: RawJob) => number {
  if (by === "title") {
    return (a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  }
  return (a, b) => {
    const left = Date.parse(a.publishedAt);
    const right = Date.parse(b.publishedAt);
    const gap = (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
    return by === "published_desc" ? -gap : gap;
  };
}
