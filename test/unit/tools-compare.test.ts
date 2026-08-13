import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  EPOCH,
  clientWith,
  compareCompensationTool,
  fakeFetch,
  resultText,
  settled,
  structured,
} from "./_harness.js";
import { fixtureId, shapesBoard, wideBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const compare = (board: unknown, args: Record<string, unknown>) => {
  const fake = fakeFetch(board as never);
  const client = clientWith(fake);
  return {
    fake,
    run: (): Promise<CallToolResult> => settled(compareCompensationTool(client, args)),
  };
};

const rows = (result: CallToolResult): Record<string, unknown>[] =>
  structured(result).rows as Record<string, unknown>[];

describe("the rows a comparison lays side by side", () => {
  it("names the board, the component and the interval it compared", async () => {
    const result = await compare({ invented: shapesBoard }, { board: "invented" }).run();

    const payload = structured(result);
    expect(payload.board).toBe("invented");
    expect(payload.component).toBe("Salary");
    expect(payload.interval).toBe("1 YEAR");
  });

  it("carries the amounts, the currency and the tier of each row", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", job_ids: [fixtureId(5)] },
    ).run();

    const row = rows(result)[0]!;
    expect(row.job_id).toBe(fixtureId(5));
    expect(row.title).toBe("Posting on a single amount");
    expect(row.min).toBe(110_000);
    expect(row.max).toBe(110_000);
    expect(row.currency).toBe("EUR");
    expect(row.tier_title).toBeNull();
  });

  it("lays one row per tier for a posting carrying several", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", job_ids: [fixtureId(6)] },
    ).run();

    expect(rows(result)).toHaveLength(8);
    expect(rows(result).map((row) => row.tier_title)).toContain("Zone A");
  });

  it("selects postings with the filters of a search", async () => {
    const result = await compare(
      { invented: wideBoard },
      { board: "invented", department: ["Sales"] },
    ).run();

    expect(rows(result).length).toBeGreaterThan(0);
    expect(structured(result).not_published).toBeDefined();
  });
});

describe("what the comparison refuses to do", () => {
  it("names every currency present without converting any", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", limit: 100 },
    ).run();

    expect([...(structured(result).currencies_present as string[])].sort()).toEqual(["EUR", "USD"]);
  });

  it("names the postings whose company publishes nothing rather than dropping them", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", limit: 100 },
    ).run();

    const withheld = structured(result).not_published as Record<string, unknown>[];
    expect(withheld.map((entry) => entry.job_id)).toContain(fixtureId(1));
    expect(withheld[0]?.title).toBeDefined();
  });

  it("sets a posting paid on another interval aside rather than annualising it", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", limit: 100 },
    ).run();

    const others = structured(result).other_intervals as Record<string, unknown>[];
    expect(others.find((entry) => entry.job_id === fixtureId(4))?.interval).toBe("1 HOUR");
    expect(rows(result).some((row) => row.job_id === fixtureId(4))).toBe(false);
  });

  it("computes no average and no median", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", limit: 100 },
    ).run();

    const keys = Object.keys(structured(result));
    for (const forbidden of ["average", "median", "mean", "total", "sum"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("says in its note that amounts in different currencies do not rank against each other", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", limit: 100 },
    ).run();

    expect(resultText(result).toLowerCase()).toContain("currenc");
  });

  it("keeps a promise without a figure unbounded", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", job_ids: [fixtureId(3)], component: "EquityCashValue" },
    ).run();

    expect(rows(result)[0]?.min).toBeNull();
    expect(rows(result)[0]?.max).toBeNull();
  });

  it("keeps a capital share without a currency", async () => {
    const result = await compare(
      { invented: shapesBoard },
      {
        board: "invented",
        job_ids: [fixtureId(3)],
        component: "EquityPercentage",
        interval: "NONE",
      },
    ).run();

    expect(rows(result)[0]?.currency).toBeNull();
  });
});

describe("the ceilings and the refusals", () => {
  it("refuses a limit beyond a hundred rows before reading the board", async () => {
    const { fake, run } = compare({ invented: shapesBoard }, { board: "invented", limit: 101 });

    const result = await run();

    expect(result.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a token no board answers", async () => {
    const result = await compare({ invented: shapesBoard }, { board: "nobody" }).run();

    expect(result.isError).toBe(true);
  });

  // An identifier that matches nothing is a question the board cannot answer,
  // and dropping it in silence would read as a posting without a published range.
  it("refuses an identifier the board does not carry", async () => {
    const result = await compare(
      { invented: shapesBoard },
      { board: "invented", job_ids: [fixtureId(999)] },
    ).run();

    expect(result.isError).toBe(true);
  });
});
