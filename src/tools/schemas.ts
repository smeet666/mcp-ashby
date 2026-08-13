/**
 * The shapes each tool declares and then respects.
 *
 * Nothing here closes a vocabulary. Four employment types and three workplace
 * types appear in the corpus, and Ashby's own documentation names values
 * beyond them, so a closed set would reject a posting a company is entitled to
 * publish.
 *
 * Where the shape depends on a branch it is declared as a union. A posting
 * whose company withholds its pay ranges carries a different payload from one
 * that publishes them, and an optimistic schema describing only the second
 * would announce amounts that are not there.
 */

import { z } from "zod";

export const placeSchema = z.object({
  label: z.string().describe("The location as the company wrote it, free text with no taxonomy."),
  locality: z.string().nullable(),
  region: z.string().nullable(),
  country: z
    .string()
    .nullable()
    .describe(
      "As the board publishes it, European Union included. No country code, and never corrected: one board writes USA where another writes United States.",
    ),
});

export const payComponentSchema = z.object({
  type: z
    .string()
    .describe(
      "Salary, EquityCashValue, EquityPercentage, Commission, Bonus, or a value beyond them.",
    ),
  min: z
    .number()
    .nullable()
    .describe("Null when the company promises the component without naming an amount."),
  max: z.number().nullable(),
  currency: z
    .string()
    .nullable()
    .describe("Null on a percentage of equity, which has no currency. Never converted."),
  interval: z
    .string()
    .describe(
      "The period the amounts belong to, as Ashby writes it: 1 YEAR, 1 MONTH, 1 HOUR, NONE. Never annualised.",
    ),
  summary: z.string().describe("The line the company wrote for this component."),
});

export const payTierSchema = z.object({
  title: z.string().nullable().describe("Names a zone or a level, and is null on most tiers."),
  summary: z.string(),
  additional_information: z.string().nullable(),
  components: z.array(payComponentSchema),
});

/**
 * The branch that matters most in this server: withheld pay carries no
 * amounts, and that is a decision of the company rather than a salary of zero.
 */
export const paySchema = z.union([
  z.object({
    published: z.literal(true),
    summary: z.string().nullable(),
    tiers: z.array(payTierSchema),
  }),
  z.object({
    published: z.literal(false),
    summary: z.null(),
    tiers: z.tuple([]),
  }),
]);

export const undeclaredSchema = z
  .record(z.string(), z.number().int())
  .describe(
    "Postings a criterion could say nothing about, counted per field. A posting that records no workplace is not a posting on site.",
  );

export const jobRowShape = {
  board: z.string(),
  id: z.string(),
  title: z.string(),
  department: z.string(),
  team: z.string(),
  employment_type: z.string(),
  location: z.string(),
  country: z.string().nullable(),
  secondary_location_count: z.number().int(),
  workplace_type: z
    .string()
    .nullable()
    .describe("Null when the company records none, which is never the same as on site."),
  is_remote: z.boolean().nullable(),
  is_listed: z
    .boolean()
    .describe("False marks a posting Ashby serves by direct link alone rather than on the board."),
  published_at: z.string().describe("ISO 8601 with the offset Ashby publishes."),
  compensation_summary: z
    .string()
    .nullable()
    .describe("Null when the company withholds its pay ranges, which is never zero."),
  job_url: z.string(),
  apply_url: z.string(),
} as const;

export const jobRowSchema = z.object(jobRowShape);

/**
 * A row flattens each place to its label and counts the rest. A record carries
 * the places themselves, so the flattened country and the count would state the
 * same thing twice, and a caller reading one of the two copies would have no way
 * to know which the server updated.
 */
const { country: _rowCountry, secondary_location_count: _rowCount, ...recordBase } = jobRowShape;

export const jobRecordSchema = z.object({
  ...recordBase,
  location: placeSchema,
  secondary_locations: z.array(placeSchema),
  description: z
    .object({ format: z.enum(["plain", "html"]), text: z.string() })
    .nullable()
    .describe("Null when the caller asked for no description."),
  compensation: paySchema
    .nullable()
    .describe(
      "Null when the caller asked for no compensation, which states nothing about the company.",
    ),
  source: z.object({ site: z.literal("Ashby"), retrieved_from: z.string() }),
  notes: z.array(z.string()),
});

export const resolveBoardOutputShape = {
  input: z.string(),
  found: z.array(
    z.object({
      board: z
        .string()
        .describe(
          "The token that answered. Ashby ignores case and echoes the spelling it was given, so this is no canonical spelling.",
        ),
      job_count: z.number().int(),
      publishes: z.boolean().describe("False when the board exists and publishes nothing."),
    }),
  ),
  tried: z.array(z.string()).describe("The forms actually sent, in order."),
  notes: z.array(z.string()),
} as const;

export const companyOutcomeSchema = z.object({
  input: z.string(),
  board: z.string().nullable(),
  status: z
    .enum(["read", "unresolved", "empty", "failed"])
    .describe(
      "A company read, one whose token was not found, one publishing nothing and one that failed are four different answers.",
    ),
  read: z
    .number()
    .int()
    .nullable()
    .describe(
      "Postings the board holds, before the filters applied here. Null when nothing was read, since zero would read as a board with nothing on it.",
    ),
  matched: z.number().int().nullable().describe("Postings kept after them."),
  error: z.string().optional(),
});

export const searchJobsOutputShape = {
  total_on_board: z.number().int().describe("Postings the boards read hold, all of them."),
  total_matched: z.number().int().describe("Postings the criteria kept."),
  returned: z.number().int().describe("Postings in this answer, after limit and offset."),
  jobs: z.array(jobRowSchema).describe("No descriptions, at any limit."),
  per_company: z.array(companyOutcomeSchema),
  filters_applied: z.record(z.string(), z.unknown()),
  undeclared: undeclaredSchema,
  notes: z.array(z.string()),
} as const;

export const getJobOutputShape = jobRecordSchema.shape;

export const facetValueSchema = z.object({ value: z.string(), count: z.number().int() });

export const listFilterValuesOutputShape = {
  board: z.string(),
  total_jobs: z.number().int(),
  facets: z.object({
    departments: z.array(facetValueSchema).optional(),
    teams: z.array(facetValueSchema).optional(),
    locations: z.array(facetValueSchema).optional(),
    countries: z.array(facetValueSchema).optional(),
    employment_types: z.array(facetValueSchema).optional(),
    workplace_types: z.array(facetValueSchema).optional(),
  }),
  undeclared: undeclaredSchema,
  sibling_spellings: z
    .array(z.array(z.string()))
    .describe(
      "Spellings on this board that name what looks like one place, so a caller asks for both rather than picking one.",
    ),
  notes: z.array(z.string()),
} as const;

export const compareCompensationOutputShape = {
  board: z.string(),
  component: z.string(),
  interval: z.string(),
  rows: z.array(
    z.object({
      job_id: z.string(),
      title: z.string(),
      tier_title: z
        .string()
        .nullable()
        .describe("Which tier the amounts belong to, since one posting carries up to eight."),
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
    }),
  ),
  currencies_present: z
    .array(z.string())
    .describe("Named, because rows in different currencies do not rank against each other."),
  not_published: z
    .array(z.object({ job_id: z.string(), title: z.string() }))
    .describe("Postings whose company publishes no range, named rather than dropped."),
  other_intervals: z
    .array(z.object({ job_id: z.string(), interval: z.string() }))
    .describe("Postings on another period, left unconverted."),
  notes: z.array(z.string()),
} as const;
