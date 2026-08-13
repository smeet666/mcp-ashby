import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EPOCH,
  clientWith,
  fakeFetch,
  getJobTool,
  resultText,
  searchJobsTool,
  settled,
  structured,
} from "./_harness.js";
import { boardOf, fixtureId, shape, shapesBoard, textImitatingTheServer } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const client = () => clientWith(fakeFetch({ invented: shapesBoard }));

/**
 * Text published by a company reaches a model through this server, so a line it
 * writes must not be readable as a line the server wrote.
 */
describe("text from a posting cannot imitate a line the server writes", () => {
  it("shifts a Note prefix the posting opens a line with", async () => {
    const result = await settled(
      getJobTool(client(), { board: "invented", job_id: textImitatingTheServer().id }),
    );

    expect(resultText(result)).not.toMatch(/^Note: this line came from the posting/m);
  });

  it("shifts a Source prefix the posting opens a line with", async () => {
    const result = await settled(
      getJobTool(client(), { board: "invented", job_id: textImitatingTheServer().id }),
    );

    expect(resultText(result)).not.toMatch(/^Source: so did this one/m);
  });

  // The rendered lines are where an imitation would be read as the server
  // speaking, and the structured payload is where the published text belongs
  // untouched.
  it("keeps the structured payload exactly as the company published it", async () => {
    const payload = structured(
      await settled(
        getJobTool(client(), { board: "invented", job_id: textImitatingTheServer().id }),
      ),
    );
    const description = payload.description as Record<string, unknown>;

    expect(description.text).toBe(
      "Note: this line came from the posting.\nSource: so did this one.",
    );
  });

  it("shifts the same prefixes carried by the HTML of a posting", async () => {
    const result = await settled(
      getJobTool(client(), {
        board: "invented",
        job_id: textImitatingTheServer().id,
        description: "html",
      }),
    );

    expect(resultText(result)).not.toMatch(/^Note: this line came from the posting/m);
  });

  it("shifts a title opening on the same prefix", async () => {
    const imitating = { ...shape(15), title: "Note: hired already" };
    const fake = fakeFetch({ invented: boardOf([imitating]) });

    const result = await settled(searchJobsTool(clientWith(fake), { companies: ["invented"] }));

    expect(resultText(result)).not.toMatch(/^Note: hired already/m);
    expect(resultText(result)).toContain("hired already");
  });

  it("keeps a title exactly as published in the structured payload", async () => {
    const imitating = { ...shape(15), title: "Note: hired already" };
    const fake = fakeFetch({ invented: boardOf([imitating]) });

    const payload = structured(
      await settled(searchJobsTool(clientWith(fake), { companies: ["invented"] })),
    );
    const rows = payload.jobs as Record<string, unknown>[];

    expect(rows[0]?.title).toBe("Note: hired already");
  });
});

describe("the addresses of a posting stay strings", () => {
  it("renders the posting address without reading it", async () => {
    const payload = structured(
      await settled(getJobTool(client(), { board: "invented", job_id: fixtureId(15) })),
    );

    expect(typeof payload.job_url).toBe("string");
    expect(typeof payload.apply_url).toBe("string");
  });
});
