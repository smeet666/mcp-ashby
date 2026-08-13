import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "../ashby/client.js";
import { parseArgs, strictInput, text } from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { summarise } from "./render.js";

export const resolveBoardDescription =
  "Turn a company name into the token that addresses its Ashby job board, and report every form that answered. " +
  "search_jobs does this on its own, so call this when a name returns nothing and you want to see the spellings that were tried.";

export const resolveBoardSchema = strictInput({
  name: text("name", "a company name, or an Ashby board token you already know"),
});

export const resolveBoardInput = resolveBoardSchema.shape;

export interface ResolveBoardArgs {
  name: string;
}

export async function runResolveBoard(
  client: Client,
  args: ResolveBoardArgs,
): Promise<CallToolResult> {
  try {
    args = parseArgs(resolveBoardSchema, args) as typeof args;
    const resolution = await client.resolveBoard(args.name);
    const notes: string[] = [];

    if (resolution.found.length === 0) {
      notes.push(
        `None of the forms tried addresses an Ashby board. A board token does not always derive from the company name, so this does not prove that ${args.name} is absent from Ashby.`,
      );
    }
    for (const board of resolution.found) {
      if (!board.publishes) {
        notes.push(
          `The ${board.board} board exists and publishes nothing right now, which is a different answer from a token Ashby does not hold.`,
        );
      }
      notes.push(
        `Ashby ignores the case of a token and echoes the spelling it was given, so ${board.board} is the form that answered rather than an official spelling.`,
      );
    }

    const payload = {
      input: resolution.input,
      found: resolution.found.map((board) => ({
        board: board.board,
        job_count: board.jobCount,
        publishes: board.publishes,
      })),
      tried: resolution.tried,
      notes,
    };

    const lines = [
      resolution.found.length === 0
        ? `No Ashby board answered for ${resolution.input}.`
        : resolution.found
            .map((b) => `${resolution.input} -> ${b.board} (${b.jobCount} postings)`)
            .join("\n"),
      `Forms sent: ${resolution.tried.join(", ")}.`,
      ...notes,
    ];

    return { content: [{ type: "text", text: summarise(lines) }], structuredContent: payload };
  } catch (error) {
    return toolFailure(error);
  }
}
