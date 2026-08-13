import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "../ashby/client.js";
import type { RawJob } from "../types.js";
import { oneOrMany, parseArgs, strictInput, text, values, wholeNumber } from "./arguments.js";
import { DEFAULT_PAY_INTERVAL, MAX_LIMIT } from "../ashby/config.js";
import { applyCriteria, type Criteria } from "../ashby/filter.js";
import { comparePay } from "../ashby/compensation.js";
import { notFound } from "../ashby/errors.js";
import { toolFailure } from "./errorShape.js";
import { summarise } from "./render.js";

export const compareCompensationDescription =
  "Put the pay ranges of one Ashby board side by side, one component at a time and one period at a time. " +
  "Nothing is converted between currencies, summed across components or averaged: a third of the postings publish no range at all, and they are named rather than dropped.";

export const compareCompensationSchema = strictInput({
  board: text("board", "a company name, or an Ashby board token"),
  job_ids: values("job_ids", "posting identifiers search_jobs returned", 50).optional(),
  department: oneOrMany("department", "departments as the board spells them", 10).optional(),
  team: oneOrMany("team", "teams as the board spells them", 10).optional(),
  query: text("query", "words to look for in the titles").optional(),
  component: z
    .enum(["Salary", "EquityCashValue", "EquityPercentage", "Commission", "Bonus"])
    .default("Salary")
    .describe("One component at a time: a share of capital and a salary do not add up."),
  interval: text("interval", "the period to keep")
    .default(DEFAULT_PAY_INTERVAL)
    .describe(
      `The period compared, ${DEFAULT_PAY_INTERVAL} unless named. Postings on another period are listed apart, unconverted.`,
    ),
  limit: wholeNumber("limit", 1, MAX_LIMIT, "how many postings to compare").default(25),
});

export const compareCompensationInput = compareCompensationSchema.shape;

export type CompareCompensationArgs = z.infer<typeof compareCompensationSchema>;

export async function runCompareCompensation(
  client: Client,
  args: CompareCompensationArgs,
): Promise<CallToolResult> {
  try {
    const input = parseArgs(compareCompensationSchema, args);
    const resolution = await client.resolveBoard(input.board);
    const found = resolution.found[0];
    if (found === undefined) {
      throw notFound(
        `No Ashby board answered for ${input.board}. Forms sent: ${resolution.tried.join(", ")}.`,
      );
    }

    const board = await client.readBoard(found.board);
    const selected = choose(board.data, input);
    if (input.job_ids !== undefined && selected.length === 0) {
      throw notFound(
        `The ${found.board} board carries none of the identifiers named. A posting Ashby has taken down leaves the board, so an identifier from an earlier search can name a posting that closed.`,
      );
    }
    const chosen = selected.slice(0, input.limit);
    const comparison = comparePay(chosen, input.component, input.interval);

    const notes: string[] = [];
    if (comparison.currencies_present.length > 1) {
      notes.push(
        `These rows carry ${comparison.currencies_present.join(", ")}. Nothing here converts between currencies, so rows in different ones do not rank against each other.`,
      );
    }
    if (comparison.not_published.length > 0) {
      notes.push(
        `${comparison.not_published.length} of the ${chosen.length} postings belong to a company that withholds its pay ranges, and they are named rather than dropped. That is a decision of the company, never an amount of zero.`,
      );
    }
    if (comparison.without_component > 0) {
      notes.push(
        `${comparison.without_component} postings publish a range that carries no ${input.component}. Their company states other components, so it withholds nothing.`,
      );
    }
    if (comparison.other_intervals.length > 0) {
      notes.push(
        `${comparison.other_intervals.length} postings state this component over another period, and they are listed apart rather than converted to ${input.interval}.`,
      );
    }
    if (comparison.rows.some((row) => row.min === null && row.max === null)) {
      notes.push(
        "Some rows carry no amount: the company promises the component without naming a figure.",
      );
    }

    const payload = {
      board: found.board,
      component: input.component,
      interval: input.interval,
      rows: comparison.rows,
      currencies_present: comparison.currencies_present,
      not_published: comparison.not_published,
      other_intervals: comparison.other_intervals,
      notes,
    };

    const lines = [
      `${comparison.rows.length} postings state a ${input.component} over ${input.interval} on ${found.board}.`,
      ...comparison.rows.map((row) =>
        `${row.title}${row.tier_title === null ? "" : ` [${row.tier_title}]`}: ${amountOf(row.min)} – ${amountOf(row.max)} ${row.currency ?? ""}`.trim(),
      ),
      ...notes,
    ];

    return { content: [{ type: "text", text: summarise(lines) }], structuredContent: payload };
  } catch (error) {
    return toolFailure(error);
  }
}

/** Named postings win over a filter, since a caller naming them has chosen. */
function choose(jobs: readonly RawJob[], input: CompareCompensationArgs): RawJob[] {
  if (input.job_ids !== undefined) {
    const wanted = new Set(input.job_ids);
    return jobs.filter((job) => wanted.has(job.id));
  }
  const criteria: Criteria = {};
  if (input.department !== undefined) criteria.department = input.department;
  if (input.team !== undefined) criteria.team = input.team;
  if (input.query !== undefined) criteria.query = input.query;
  return applyCriteria(jobs, criteria).kept;
}

function amountOf(value: number | null): string {
  return value === null ? "unstated" : String(value);
}
