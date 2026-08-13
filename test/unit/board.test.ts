import { describe, expect, it } from "vitest";
import { probeBoard, readBoard } from "../../src/ashby/board.js";
import type { BoardReader } from "../../src/ashby/board.js";
import type { RawBoard } from "../../src/types.js";
import { ALLOWED_HOST, captureError, fakeReader } from "./_harness.js";
import { emptyBoard, shapesBoard, unknownVocabulary, wideBoard } from "./_corpus.js";

/** A reader answering one payload, used where the payload itself is under test. */
function readerServing(value: unknown): BoardReader {
  return {
    async read() {
      return { value: value as RawBoard, cached: false };
    },
  };
}

describe("reading a board", () => {
  it("hands back the postings the board publishes", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const read = await readBoard("invented", reader);

    expect(read.data).toHaveLength(15);
    expect(read.data[0]?.title).toBe("Posting whose company withholds its ranges");
  });

  it("reports a network read as uncached", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const read = await readBoard("invented", reader);

    expect(read.cached).toBe(false);
  });

  it("reports a stored read as cached", async () => {
    const reader = fakeReader({ invented: shapesBoard });
    reader.cachedTokens.add("invented");

    const read = await readBoard("invented", reader);

    expect(read.cached).toBe(true);
  });

  it("leaves the skipped list absent when the read discarded nothing", async () => {
    const reader = fakeReader({ invented: wideBoard });

    const read = await readBoard("invented", reader);

    expect(read.skipped).toBeUndefined();
  });

  it("requests the address the configuration builds, on the allowed host", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    await readBoard("invented", reader);

    const requested = new URL(reader.urls[0]!);
    expect(requested.host).toBe(ALLOWED_HOST);
    expect(requested.searchParams.get("includeCompensation")).toBe("true");
  });

  it("requests the token with the spelling the caller wrote", async () => {
    const reader = fakeReader({ InVenTed: shapesBoard });

    await readBoard("InVenTed", reader);

    expect(reader.urls[0]).toContain("InVenTed");
  });

  it("encodes a token carrying a space", async () => {
    const reader = fakeReader({ "eleven labs": shapesBoard });

    await readBoard("eleven labs", reader);

    expect(reader.urls[0]).not.toContain(" ");
    expect(new URL(reader.urls[0]!).host).toBe(ALLOWED_HOST);
  });

  it("lets a value this server has never seen travel through", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const read = await readBoard("invented", reader);
    const posting = read.data.find((job) => job.id === unknownVocabulary().id);

    expect(posting?.employmentType).toBe("Seasonal");
    expect(posting?.workplaceType).toBe("Nomadic");
  });
});

describe("a board publishing nothing", () => {
  it("hands back an empty list of postings", async () => {
    const reader = fakeReader({ invented: emptyBoard });

    const read = await readBoard("invented", reader);

    expect(read.data).toEqual([]);
  });

  it("is reported as existing by the probe", async () => {
    const reader = fakeReader({ invented: emptyBoard });

    const probe = await probeBoard("invented", reader);

    expect(probe.exists).toBe(true);
    expect(probe.jobCount).toBe(0);
  });
});

describe("an unknown token", () => {
  it("raises not_found when the board is read", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const error = await captureError(() => readBoard("nobody", reader));

    expect(error.code).toBe("not_found");
  });

  it("is reported as absent by the probe, which asks a question an exception does not answer", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const probe = await probeBoard("nobody", reader);

    expect(probe.exists).toBe(false);
    expect(probe.jobCount).toBe(0);
  });
});

describe("a probe on a board that publishes", () => {
  it("counts the postings the board carries", async () => {
    const reader = fakeReader({ invented: wideBoard });

    const probe = await probeBoard("invented", reader);

    expect(probe.exists).toBe(true);
    expect(probe.jobCount).toBe(120);
  });

  it("reports where the payload came from", async () => {
    const reader = fakeReader({ invented: wideBoard });
    reader.cachedTokens.add("invented");

    const probe = await probeBoard("invented", reader);

    expect(probe.cached).toBe(true);
  });
});

describe("a payload that is not a board", () => {
  it("raises parse_failure when the envelope carries no postings", async () => {
    const error = await captureError(() =>
      readBoard("invented", readerServing({ apiVersion: "1" })),
    );

    expect(error.code).toBe("parse_failure");
  });

  it("raises parse_failure when the postings are not a list", async () => {
    const error = await captureError(() =>
      readBoard("invented", readerServing({ apiVersion: "1", jobs: "several" })),
    );

    expect(error.code).toBe("parse_failure");
  });

  it("raises parse_failure on a payload that is not an object", async () => {
    const error = await captureError(() => readBoard("invented", readerServing("Not Found")));

    expect(error.code).toBe("parse_failure");
  });

  it("keeps an unreadable payload distinct from an absent board on the probe", async () => {
    const reader = fakeReader({ invented: "unreadable" });

    const error = await captureError(() => probeBoard("invented", reader));

    expect(error.code).toBe("parse_failure");
  });

  it("keeps a cut connection distinct from an absent board on the probe", async () => {
    const reader = fakeReader({ invented: "cut" });

    const error = await captureError(() => probeBoard("invented", reader));

    expect(error.code).toBe("network_error");
  });
});
