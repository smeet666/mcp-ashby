import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "../ashby/client.js";
import { parseArgs, strictInput, text } from "./arguments.js";
import { notFound } from "../ashby/errors.js";
import { boardUrl } from "../ashby/config.js";
import { toolFailure } from "./errorShape.js";
import { summarise, toJobRecord } from "./render.js";

export const getJobDescription =
  "Read one Ashby posting in full: its locations, its description and the pay ranges its company published. " +
  "Ashby addresses a posting by board and identifier, both of which search_jobs returns.";

export const getJobSchema = strictInput({
  board: text("board", "a company name, or an Ashby board token"),
  job_id: text("job_id", "the identifier search_jobs returned for this posting"),
  description: z
    .enum(["plain", "html", "none"])
    .default("plain")
    .describe(
      "The description runs to thousands of characters. html is the company's own markup, unrewritten.",
    ),
  include_compensation: z.boolean().default(true),
});

export const getJobInput = getJobSchema.shape;

export type GetJobArgs = z.infer<typeof getJobSchema>;

export async function runGetJob(client: Client, args: GetJobArgs): Promise<CallToolResult> {
  try {
    const input = parseArgs(getJobSchema, args);
    const resolution = await client.resolveBoard(input.board);
    const found = resolution.found[0];
    if (found === undefined) {
      throw notFound(
        `No Ashby board answered for ${input.board}. Forms sent: ${resolution.tried.join(", ")}. A board token does not always derive from the company name, so this proves no absence from Ashby.`,
      );
    }

    const board = await client.readBoard(found.board);
    const job = board.data.find((one) => one.id === input.job_id);
    if (job === undefined) {
      throw notFound(
        `The ${found.board} board publishes ${board.data.length} postings and none of them is ${input.job_id}. A posting Ashby has taken down leaves the board, so an identifier from an earlier search can name a posting that closed.`,
      );
    }

    const record = toJobRecord(
      job,
      found.board,
      input.description,
      input.include_compensation,
      boardUrl(found.board),
    );

    const notes: string[] = [];
    if (record.compensation !== null && !record.compensation.published) {
      notes.push(
        "This company withholds its pay ranges on this posting. That is a decision of the company, and it is never a salary of zero.",
      );
    }
    if (record.workplace_type === null) {
      notes.push(
        "This posting records no workplace at all, so nothing here says whether the work is remote.",
      );
    }
    if (!record.is_listed) {
      notes.push("Ashby serves this posting by direct link rather than on the company's board.");
    }
    if (input.description === "html") {
      notes.push("The description is the company's own markup, carried as published.");
    }

    const payload = { ...record, notes };
    const lines = [
      `${record.title} — ${record.location.label} (${found.board})`,
      record.compensation?.published === true && record.compensation.summary !== null
        ? record.compensation.summary
        : "",
      record.apply_url,
      ...notes,
    ];

    return { content: [{ type: "text", text: summarise(lines) }], structuredContent: payload };
  } catch (error) {
    return toolFailure(error);
  }
}
