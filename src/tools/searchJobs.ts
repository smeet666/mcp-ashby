import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "../ashby/client.js";
import type { CompanyOutcome, JobRow, RawJob, Undeclared } from "../types.js";
import {
  amount,
  countriesOneOrMany,
  currencyCode,
  oneOrMany,
  parseArgs,
  strictInput,
  text,
  values,
  wholeNumber,
} from "./arguments.js";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_COMPANIES,
  DEFAULT_PAY_INTERVAL,
  MAX_COMPANIES,
  MAX_LIMIT,
} from "../ashby/config.js";
import { applyCriteria, jobComparator, type Criteria } from "../ashby/filter.js";
import { countFacets, type FacetKey } from "../ashby/facets.js";
import { invalidInput, isAshbyError } from "../ashby/errors.js";
import { toolFailure } from "./errorShape.js";
import { summarise, toJobRow, undeclaredNotes } from "./render.js";

export const searchJobsDescription =
  "Search the open postings of named companies on Ashby. Ashby publishes no index across its customers, so companies are required. " +
  "Every filter runs here rather than at the source, and the answer reports how many postings declared nothing about a field it filtered on. " +
  "Rows carry no description: read one posting with get_job.";

export const searchJobsSchema = strictInput({
  companies: values("companies", "company names or Ashby board tokens", MAX_COMPANIES).describe(
    `Company names or board tokens, one to ${MAX_COMPANIES}. Each costs a request and a whole board, which is why ${DEFAULT_MAX_COMPANIES} at a time is the comfortable number.`,
  ),
  query: text("query", "words to look for").optional(),
  search_in: z
    .enum(["title", "title_and_description"])
    .default("title")
    .describe("Where query is looked for. Descriptions run to thousands of characters each."),
  department: oneOrMany("department", "departments as the board spells them", 10).optional(),
  team: oneOrMany("team", "teams as the board spells them", 10).optional(),
  employment_type: oneOrMany("employment_type", "employment types", 6).optional(),
  workplace_type: oneOrMany("workplace_type", "workplace types", 4).optional(),
  is_remote: z
    .boolean()
    .optional()
    .describe(
      "Keeps only postings that declare it. Postings recording nothing are counted in undeclared rather than treated as on site.",
    ),
  country: countriesOneOrMany("country", "countries as the board spells them", 10).optional(),
  location_contains: text("location_contains", "part of a location line").optional(),
  published_after: text("published_after", "an ISO 8601 date").optional(),
  has_compensation: z
    .boolean()
    .optional()
    .describe("Keeps only postings whose company publishes a pay range."),
  salary_min: amount("salary_min", "a floor for the salary component").optional(),
  currency: currencyCode("currency").optional(),
  salary_interval: text("salary_interval", "the period the floor belongs to")
    .default(DEFAULT_PAY_INTERVAL)
    .describe(
      `The period salary_min belongs to, ${DEFAULT_PAY_INTERVAL} unless named. An hourly amount is never weighed against a yearly floor.`,
    ),
  sort: z.enum(["published_desc", "published_asc", "title"]).default("published_desc"),
  limit: wholeNumber("limit", 1, MAX_LIMIT, "how many postings to return").default(DEFAULT_LIMIT),
  offset: wholeNumber("offset", 0, 10_000, "how many postings to skip").default(0),
});

export const searchJobsInput = searchJobsSchema.shape;

export type SearchJobsArgs = z.infer<typeof searchJobsSchema>;

export async function runSearchJobs(client: Client, args: SearchJobsArgs): Promise<CallToolResult> {
  try {
    const input = parseArgs(searchJobsSchema, args);

    if (input.salary_min !== undefined && input.currency === undefined) {
      throw invalidInput(
        "salary_min needs a currency. Ashby publishes each amount in the currency the company wrote it in, and nothing here converts between them, so a threshold with no currency would compare amounts that share no scale.",
      );
    }

    const criteria = toCriteria(input);
    const outcomes: CompanyOutcome[] = [];
    const undeclared: Undeclared = {};
    const unmatched: Record<string, Set<string>> = {};
    const present: Record<string, Set<string>> = {};
    const rows: { row: JobRow; job: RawJob }[] = [];
    let totalOnBoard = 0;

    for (const company of input.companies) {
      const outcome = await searchOne(client, company, criteria, {
        rows,
        undeclared,
        unmatched,
        present,
      });
      totalOnBoard += outcome.read ?? 0;
      outcomes.push(outcome);
    }

    const boardsRead = outcomes.filter((o) => o.status === "read" || o.status === "empty");
    if (rows.length === 0 && boardsRead.length > 0) {
      refuseUnknownValues(unmatched, present, boardsRead);
    }

    const order = jobComparator(input.sort);
    const page = [...rows]
      .sort((a, b) => order(a.job, b.job))
      .slice(input.offset, input.offset + input.limit)
      .map((pair) => pair.row);

    const notes = [...undeclaredNotes(undeclared)];
    for (const outcome of outcomes) {
      if (outcome.status === "unresolved") {
        notes.push(
          `No Ashby board answered for ${outcome.input}. A board token does not always derive from the company name, so this proves no absence from Ashby.`,
        );
      }
      if (outcome.status === "empty") {
        notes.push(`The ${outcome.board} board publishes nothing right now.`);
      }
      if (outcome.status === "failed") {
        notes.push(
          `Reading ${outcome.input} failed, so this answer states nothing about what that company publishes.`,
        );
      }
    }

    const payload = {
      total_on_board: totalOnBoard,
      total_matched: rows.length,
      returned: page.length,
      jobs: page,
      per_company: outcomes,
      filters_applied: appliedFilters(input),
      undeclared,
      notes,
    };

    const lines = [
      `${rows.length} of ${totalOnBoard} postings match, ${page.length} shown.`,
      ...page.map((row) => `${row.title} — ${row.location} (${row.board})`),
      ...notes,
    ];

    return { content: [{ type: "text", text: summarise(lines) }], structuredContent: payload };
  } catch (error) {
    return toolFailure(error);
  }
}

/**
 * What one board answered, with what every board so far has put into the lists.
 *
 * The four lists are filled across companies rather than per company: a wording
 * one board does not know can be a wording another one does, and the refusal is
 * written once the whole search has been read.
 */
async function searchOne(
  client: Client,
  company: string,
  criteria: Criteria,
  collecting: {
    rows: { row: JobRow; job: RawJob }[];
    undeclared: Undeclared;
    unmatched: Record<string, Set<string>>;
    present: Record<string, Set<string>>;
  },
): Promise<CompanyOutcome> {
  const { rows, undeclared, unmatched, present } = collecting;
  try {
    const resolution = await client.resolveBoard(company);
    const found = resolution.found[0];
    if (found === undefined) {
      return { input: company, board: null, status: "unresolved", read: null, matched: null };
    }
    const board = await client.readBoard(found.board);
    if (board.data.length === 0) {
      return { input: company, board: found.board, status: "empty", read: 0, matched: 0 };
    }
    const result = applyCriteria(board.data, criteria);
    for (const [field, count] of Object.entries(result.undeclared)) {
      undeclared[field] = (undeclared[field] ?? 0) + count;
    }
    for (const [field, missing] of Object.entries(result.unmatchedValues)) {
      unmatched[field] = new Set([...(unmatched[field] ?? []), ...missing]);
      const facet = FACET_OF[field];
      if (facet === undefined) {
        continue;
      }
      const counted = countFacets(board.data, [facet]).facets[facet] ?? [];
      present[field] = new Set([...(present[field] ?? []), ...counted.map((one) => one.value)]);
    }
    for (const job of result.kept) {
      rows.push({ row: toJobRow(job, found.board), job });
    }
    return {
      input: company,
      board: found.board,
      status: "read",
      read: board.data.length,
      matched: result.kept.length,
    };
  } catch (error) {
    return {
      input: company,
      board: null,
      status: "failed",
      read: null,
      matched: null,
      error: isAshbyError(error) ? `[${error.code}] ${error.message}` : String(error),
    };
  }
}

/**
 * An emptiness caused by a word no board carries is refused rather than
 * returned: a caller reads an empty list as an absence of openings.
 */
function refuseUnknownValues(
  unmatched: Record<string, Set<string>>,
  present: Record<string, Set<string>>,
  boardsRead: CompanyOutcome[],
): void {
  const fields = Object.entries(unmatched).filter(
    ([, unknownWordings]) => unknownWordings.size > 0,
  );
  if (fields.length === 0) {
    return;
  }
  const [field, missing] = fields[0] as [string, Set<string>];
  const carried = [...(present[field] ?? [])].sort();
  throw invalidInput(
    `The boards read carry no ${field} spelled ${[...missing].join(", ")}. Every board keeps its own wording, and ${boardsRead.map((o) => o.board).join(", ")} carries: ${carried.join(", ")}.`,
    carried,
  );
}

/** The facet that publishes the words a filter on this field compares against. */
const FACET_OF: Record<string, FacetKey> = {
  department: "departments",
  team: "teams",
  employment_type: "employment_types",
  workplace_type: "workplace_types",
  country: "countries",
};

function toCriteria(input: SearchJobsArgs): Criteria {
  const criteria: Criteria = { searchIn: input.search_in, salaryInterval: input.salary_interval };
  if (input.query !== undefined) {
    criteria.query = input.query;
  }
  if (input.department !== undefined) {
    criteria.department = input.department;
  }
  if (input.team !== undefined) {
    criteria.team = input.team;
  }
  if (input.employment_type !== undefined) {
    criteria.employmentType = input.employment_type;
  }
  if (input.workplace_type !== undefined) {
    criteria.workplaceType = input.workplace_type;
  }
  if (input.is_remote !== undefined) {
    criteria.isRemote = input.is_remote;
  }
  if (input.country !== undefined) {
    criteria.country = input.country;
  }
  if (input.location_contains !== undefined) {
    criteria.locationContains = input.location_contains;
  }
  if (input.published_after !== undefined) {
    criteria.publishedAfter = input.published_after;
  }
  if (input.has_compensation !== undefined) {
    criteria.hasCompensation = input.has_compensation;
  }
  if (input.salary_min !== undefined) {
    criteria.salaryMin = input.salary_min;
  }
  if (input.currency !== undefined) {
    criteria.currency = input.currency;
  }
  return criteria;
}

function appliedFilters(input: SearchJobsArgs): Record<string, unknown> {
  const applied: Record<string, unknown> = {};
  const carried = [
    "query",
    "search_in",
    "department",
    "team",
    "employment_type",
    "workplace_type",
    "is_remote",
    "country",
    "location_contains",
    "published_after",
    "has_compensation",
    "salary_min",
    "currency",
    "salary_interval",
  ] as const;
  for (const key of carried) {
    const value = input[key];
    if (value !== undefined) {
      applied[key] = value;
    }
  }
  return applied;
}
