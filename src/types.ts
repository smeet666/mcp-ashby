/**
 * The shapes every layer agrees on. Nothing here imports the MCP SDK, so the
 * low-level client can be consumed as an ordinary library.
 */

/** Every read reports whether it came from the cache and what it left out. */
export interface Read<T> {
  data: T;
  cached: boolean;
  skipped?: string[];
}

/**
 * A board as Ashby publishes it.
 *
 * The whole board arrives in one response: the service filters nothing and
 * pages nothing.
 */
export interface RawBoard {
  apiVersion: string;
  jobs: RawJob[];
}

/**
 * A posting as Ashby publishes it, read with `includeCompensation=true`.
 *
 * Without that parameter both `compensation` and
 * `shouldDisplayCompensationOnJobPostings` are absent, which makes a posting
 * indistinguishable from one whose company withholds its pay ranges.
 */
export interface RawJob {
  id: string;
  title: string;
  department: string;
  team: string;
  employmentType: string;
  location: string;
  secondaryLocations: RawSecondaryLocation[];
  publishedAt: string;
  isListed: boolean;
  /** Null on a posting whose company records no workplace, never false. */
  isRemote: boolean | null;
  /** Null alongside `isRemote`: the two fall silent together. */
  workplaceType: string | null;
  address: RawAddress;
  shouldDisplayCompensationOnJobPostings: boolean;
  compensation: RawCompensation;
  jobUrl: string;
  applyUrl: string;
  descriptionHtml: string;
  descriptionPlain: string;
}

export interface RawSecondaryLocation {
  location: string;
  address?: RawAddress;
}

/** One posting carries an `address` with no `postalAddress` inside it. */
export interface RawAddress {
  postalAddress?: RawPostalAddress;
}

/**
 * Follows the schema.org vocabulary. A field arrives absent or as an empty
 * string, and the two say the same thing. `addressCountry` is not a country
 * code: `USA`, `United States` and `European Union` all appear.
 */
export interface RawPostalAddress {
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
  postalCode?: string;
}

/**
 * Everything here is null or empty on a posting whose company withholds its
 * pay ranges, which is a third of the corpus.
 */
export interface RawCompensation {
  compensationTierSummary: string | null;
  scrapeableCompensationSalarySummary: string | null;
  compensationTiers: RawCompensationTier[];
  /**
   * The tiers flattened. The `currencyCode` key is missing entirely on some of
   * these, so the tiers are the source that holds.
   */
  summaryComponents: RawSummaryComponent[];
}

export interface RawCompensationTier {
  id: string;
  /** Names a zone or a level, and is null on most tiers. */
  title: string | null;
  tierSummary: string;
  additionalInformation: string | null;
  components: RawCompensationComponent[];
}

/** Carries all seven keys on every component observed. */
export interface RawCompensationComponent {
  id: string;
  summary: string;
  compensationType: string;
  interval: string;
  currencyCode: string | null;
  minValue: number | null;
  maxValue: number | null;
}

export interface RawSummaryComponent {
  compensationType: string;
  interval: string;
  currencyCode?: string | null;
  minValue: number | null;
  maxValue: number | null;
}

/** What a name resolved to, and what was sent to find out. */
export interface Resolution {
  input: string;
  found: ResolvedBoard[];
  /** The forms actually sent, in order. */
  tried: string[];
  cached?: boolean;
}

export interface ResolvedBoard {
  /**
   * The token that answered. Ashby ignores case and echoes the spelling it was
   * given, so no response reveals a canonical spelling and none is claimed.
   */
  board: string;
  jobCount: number;
  /** False when the board exists and publishes nothing. */
  publishes: boolean;
}

/** An address normalised for rendering, with empty strings read as absences. */
export interface Place {
  label: string;
  locality: string | null;
  region: string | null;
  /** As published, `European Union` included. Never corrected. */
  country: string | null;
}

/** One pay component, typed, with its own currency and period. */
export interface PayComponent {
  type: string;
  /** Null when the company promises a component without naming an amount. */
  min: number | null;
  max: number | null;
  /** Null on a percentage of equity, which has no currency. */
  currency: string | null;
  /** As Ashby writes it: `1 YEAR`, `1 MONTH`, `1 HOUR`, `NONE`. */
  interval: string;
  summary: string;
}

export interface PayTier {
  title: string | null;
  summary: string;
  additional_information: string | null;
  components: PayComponent[];
}

/**
 * Pay as a posting states it. `published: false` carries no amounts: the
 * company withholds them, which is never a salary of zero.
 */
export type Pay =
  | { published: true; summary: string | null; tiers: PayTier[] }
  | { published: false; summary: null; tiers: [] };

/** A posting reduced to what a list can carry. It holds no description. */
export interface JobRow {
  board: string;
  id: string;
  title: string;
  department: string;
  team: string;
  employment_type: string;
  location: string;
  country: string | null;
  secondary_location_count: number;
  workplace_type: string | null;
  is_remote: boolean | null;
  is_listed: boolean;
  published_at: string;
  compensation_summary: string | null;
  job_url: string;
  apply_url: string;
}

/** A posting in full, description included. */
export interface JobRecord extends Omit<
  JobRow,
  "location" | "country" | "secondary_location_count"
> {
  location: Place;
  secondary_locations: Place[];
  description: { format: "plain" | "html"; text: string } | null;
  compensation: Pay | null;
  source: { site: "Ashby"; retrieved_from: string };
}

/** What a company amounted to inside one search. */
export interface CompanyOutcome {
  input: string;
  board: string | null;
  /**
   * A company read, one whose token was not found, one publishing nothing and
   * one that failed are four different answers.
   */
  status: "read" | "unresolved" | "empty" | "failed";
  /** Null when nothing was read, since zero would read as a board with nothing on it. */
  read: number | null;
  matched: number | null;
  error?: string;
}

/** How many postings a filter could say nothing about, per field. */
export type Undeclared = Record<string, number>;

export interface FacetValue {
  value: string;
  count: number;
}
