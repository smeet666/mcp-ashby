import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  EPOCH,
  clientWith,
  fakeFetch,
  listFilterValuesTool,
  resultText,
  settled,
  structured,
} from "./_harness.js";
import { emptyBoard, shapesBoard, wideBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const values = (result: CallToolResult, key: string): { value: string; count: number }[] => {
  const facets = structured(result).facets as Record<string, { value: string; count: number }[]>;
  return facets[key] ?? [];
};

const countOf = (result: CallToolResult, key: string, value: string): number | undefined =>
  values(result, key).find((entry) => entry.value === value)?.count;

const list = (board: unknown, args: Record<string, unknown>) => {
  const fake = fakeFetch(board as never);
  const client = clientWith(fake);
  return { fake, run: (): Promise<CallToolResult> => settled(listFilterValuesTool(client, args)) };
};

describe("the vocabulary of one board", () => {
  it("names the board and counts its postings", async () => {
    const result = await list({ invented: wideBoard }, { board: "invented" }).run();

    const payload = structured(result);
    expect(payload.board).toBe("invented");
    expect(payload.total_jobs).toBe(120);
  });

  it("counts every facet when none is named", async () => {
    const result = await list({ invented: wideBoard }, { board: "invented" }).run();

    expect(Object.keys(structured(result).facets as object).sort()).toEqual([
      "countries",
      "departments",
      "employment_types",
      "locations",
      "teams",
      "workplace_types",
    ]);
  });

  it("counts the facet the caller named, and no other", async () => {
    const result = await list(
      { invented: wideBoard },
      { board: "invented", facet: "departments" },
    ).run();

    expect(Object.keys(structured(result).facets as object)).toEqual(["departments"]);
  });

  it("counts the postings behind each value", async () => {
    const result = await list(
      { invented: wideBoard },
      { board: "invented", facet: "departments" },
    ).run();

    expect(countOf(result, "departments", "Engineering")).toBe(40);
  });

  it("counts each country under the spelling the board publishes", async () => {
    const result = await list(
      { invented: wideBoard },
      { board: "invented", facet: "countries" },
    ).run();

    expect(countOf(result, "countries", "UI")).toBe(106);
    expect(countOf(result, "countries", "United Inventia")).toBe(14);
  });

  it("counts a value this server has never seen", async () => {
    const result = await list(
      { invented: shapesBoard },
      { board: "invented", facet: "employment_types" },
    ).run();

    expect(countOf(result, "employment_types", "Seasonal")).toBe(1);
  });
});

describe("what the board leaves unsaid", () => {
  it("counts the postings recording no workplace type", async () => {
    const result = await list({ invented: wideBoard }, { board: "invented" }).run();

    const undeclared = structured(result).undeclared as Record<string, number>;
    expect(undeclared.workplace_type).toBe(24);
    expect(undeclared.is_remote).toBe(24);
  });

  it("counts the postings whose company withholds its ranges", async () => {
    const result = await list({ invented: wideBoard }, { board: "invented" }).run();

    const undeclared = structured(result).undeclared as Record<string, number>;
    expect(undeclared.compensation).toBe(40);
  });

  it("keeps the counted postings apart from the postings on the board", async () => {
    const result = await list(
      { invented: wideBoard },
      { board: "invented", facet: "workplace_types" },
    ).run();

    const counted = values(result, "workplace_types").reduce((sum, entry) => sum + entry.count, 0);
    expect(counted).toBe(96);
    expect(structured(result).total_jobs).toBe(120);
  });
});

describe("the note beside the counts", () => {
  it("names the neighbouring spellings a board carries", async () => {
    const result = await list(
      { invented: shapesBoard },
      { board: "invented", facet: "countries" },
    ).run();

    const message = resultText(result);
    expect(message).toContain("United Inventia");
    expect(message).toContain("Inventia");
  });
});

describe("a board that publishes nothing", () => {
  it("counts no posting and refuses nothing", async () => {
    const result = await list({ quiet: emptyBoard }, { board: "quiet" }).run();

    expect(result.isError).toBeFalsy();
    expect(structured(result).total_jobs).toBe(0);
  });

  it("is answered differently from a token no board carries", async () => {
    const quiet = await list({ quiet: emptyBoard }, { board: "quiet" }).run();
    const unknown = await list({ quiet: emptyBoard }, { board: "nobody" }).run();

    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).not.toBe(resultText(quiet));
  });
});
