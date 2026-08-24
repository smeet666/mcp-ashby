import { boardUrl } from "./config.js";
import { isAshbyError, parseFailure } from "./errors.js";
import type { RawBoard, RawJob, Read } from "../types.js";

/** What `readBoard` needs of a client, so it can be read without one. */
export interface BoardReader {
  read: (url: string) => Promise<{ value: RawBoard; cached: boolean }>;
}

/**
 * Reads one board whole.
 *
 * There is one route, it filters nothing and it pages nothing, so this is
 * every byte the server will ever have about a company.
 */
export async function readBoard(board: string, reader: BoardReader): Promise<Read<RawJob[]>> {
  const { value, cached } = await reader.read(boardUrl(board));
  return { data: jobsOf(value, board), cached };
}

/**
 * Reads a board and reports that it exists even when it holds nothing.
 *
 * Resolution asks this question and cannot use an exception for it: an unknown
 * token and a company between campaigns must stay distinguishable.
 */
export async function probeBoard(
  board: string,
  reader: BoardReader,
): Promise<{ exists: boolean; jobCount: number; cached: boolean }> {
  try {
    const read = await readBoard(board, reader);
    return { exists: true, jobCount: read.data.length, cached: read.cached };
  } catch (error) {
    if (isAshbyError(error) && error.code === "not_found") {
      return { exists: false, jobCount: 0, cached: false };
    }
    throw error;
  }
}

/**
 * An unknown value inside a posting travels through: no vocabulary here is
 * closed, and Ashby's documentation names values the corpus never showed.
 */
function jobsOf(payload: RawBoard | undefined, board: string): RawJob[] {
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.jobs)) {
    throw parseFailure(
      `Ashby answered for ${board} with something that carries no list of postings.`,
    );
  }
  return payload.jobs.filter((job): job is RawJob => typeof job?.id === "string");
}
