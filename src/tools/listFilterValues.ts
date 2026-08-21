import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "../ashby/client.js";
import { parseArgs, strictInput, text } from "./arguments.js";
import { countFacets, type FacetKey } from "../ashby/facets.js";
import { notFound } from "../ashby/errors.js";
import { toolFailure } from "./errorShape.js";
import { summarise } from "./render.js";

const FACETS: readonly FacetKey[] = [
  "departments",
  "teams",
  "locations",
  "countries",
  "employment_types",
  "workplace_types",
];

export const listFilterValuesDescription =
  "List the words one Ashby board actually uses, with how many postings carry each, and how many declare nothing. " +
  "Every board keeps its own departments and teams, so a filter written from another board's vocabulary narrows to nothing.";

export const listFilterValuesSchema = strictInput({
  board: text("board", "a company name, or an Ashby board token"),
  facet: z.enum([...FACETS, "all"]).default("all"),
});

export const listFilterValuesInput = listFilterValuesSchema.shape;

export type ListFilterValuesArgs = z.infer<typeof listFilterValuesSchema>;

export async function runListFilterValues(
  client: Client,
  args: ListFilterValuesArgs,
): Promise<CallToolResult> {
  try {
    const input = parseArgs(listFilterValuesSchema, args);
    const resolution = await client.resolveBoard(input.board);
    const found = resolution.found[0];
    if (found === undefined) {
      throw notFound(
        `No Ashby board answered for ${input.board}. Forms sent: ${resolution.tried.join(", ")}.`,
      );
    }

    const board = await client.readBoard(found.board);
    const wanted = input.facet === "all" ? FACETS : [input.facet];
    const counted = countFacets(board.data, wanted);

    const notes: string[] = [];
    if (board.data.length === 0) {
      notes.push(
        `The ${found.board} board publishes nothing right now, so there is no wording to report.`,
      );
    }
    const silent = counted.undeclared.workplace_type;
    if (silent !== undefined && silent > 0) {
      notes.push(
        `${silent} of ${counted.totalJobs} postings record no workplace at all. They are counted apart, so a facet total is never the size of the board.`,
      );
    }
    const withheld = counted.undeclared.compensation;
    if (withheld !== undefined && withheld > 0) {
      notes.push(
        `${withheld} of ${counted.totalJobs} postings belong to a company that withholds its pay ranges.`,
      );
    }
    for (const group of counted.siblingSpellings) {
      notes.push(
        `This board writes ${group.join(" and ")} for what looks like one place. Ashby publishes no country code here, so ask for the spellings you want rather than one of them.`,
      );
    }

    const payload = {
      board: found.board,
      total_jobs: counted.totalJobs,
      facets: counted.facets,
      undeclared: counted.undeclared,
      sibling_spellings: counted.siblingSpellings,
      notes,
    };

    const lines = [
      `${found.board}: ${counted.totalJobs} postings.`,
      ...Object.entries(counted.facets).map(
        ([key, entries]) =>
          `${key}: ${(entries ?? []).map((e) => `${e.value} (${e.count})`).join(", ")}`,
      ),
      ...notes,
    ];

    return { content: [{ type: "text", text: summarise(lines) }], structuredContent: payload };
  } catch (error) {
    return toolFailure(error);
  }
}
