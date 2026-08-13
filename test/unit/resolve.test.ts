import { describe, expect, it } from "vitest";
import { boardForms, resolveBoard } from "../../src/ashby/resolve.js";
import { MAX_BOARD_FORMS } from "../../src/ashby/config.js";
import { captureError, fakeReader } from "./_harness.js";
import { emptyBoard, shapesBoard, wideBoard } from "./_corpus.js";

describe("the ladder of spellings", () => {
  it("is capped at four forms, each one costing a request and a second", () => {
    expect(MAX_BOARD_FORMS).toBe(4);
  });

  it("starts with the name the caller wrote", () => {
    expect(boardForms("Eleven Labs", 4)[0]).toBe("Eleven Labs");
  });

  it("carries the name lowercased and joined", () => {
    expect(boardForms("Eleven Labs", 4)).toContain("elevenlabs");
  });

  it("carries the name hyphenated", () => {
    expect(boardForms("Eleven Labs", 4)).toContain("eleven-labs");
  });

  it("carries the name stripped of its punctuation", () => {
    expect(boardForms("Eleven Labs, Inc.", 4).some((form) => form === "elevenlabsinc")).toBe(true);
  });

  it("holds no form twice", () => {
    const forms = boardForms("ashby", 4);
    expect(new Set(forms).size).toBe(forms.length);
  });

  it("collapses to a single form for a name already shaped like a token", () => {
    expect(boardForms("ashby", 4)).toEqual(["ashby"]);
  });

  it("stops at the number of forms asked for", () => {
    expect(boardForms("Eleven Labs, Inc.", 2)).toHaveLength(2);
  });

  it("returns nothing when no form is allowed", () => {
    expect(boardForms("Eleven Labs", 0)).toEqual([]);
  });
});

describe("resolving a company name to a board token", () => {
  it("stops at the first form that answers", async () => {
    const reader = fakeReader({ "Eleven Labs": wideBoard, elevenlabs: wideBoard });

    const resolution = await resolveBoard("Eleven Labs", reader);

    expect(reader.tokens).toEqual(["Eleven Labs"]);
    expect(resolution.found[0]?.board).toBe("Eleven Labs");
  });

  it("walks down the ladder until a form answers", async () => {
    const reader = fakeReader({ elevenlabs: wideBoard });

    const resolution = await resolveBoard("Eleven Labs", reader);

    expect(resolution.found[0]?.board).toBe("elevenlabs");
    expect(reader.tokens[0]).toBe("Eleven Labs");
  });

  it("reports the forms it actually sent, and nothing more", async () => {
    const reader = fakeReader({ elevenlabs: wideBoard });

    const resolution = await resolveBoard("Eleven Labs", reader);

    expect(resolution.tried).toEqual(reader.tokens);
    expect(resolution.tried).toEqual(["Eleven Labs", "elevenlabs"]);
  });

  it("repeats the name the caller handed in", async () => {
    const reader = fakeReader({ elevenlabs: wideBoard });

    const resolution = await resolveBoard("Eleven Labs", reader);

    expect(resolution.input).toBe("Eleven Labs");
  });

  it("counts the postings the board publishes", async () => {
    const reader = fakeReader({ invented: shapesBoard });

    const resolution = await resolveBoard("invented", reader);

    expect(resolution.found[0]?.jobCount).toBe(15);
    expect(resolution.found[0]?.publishes).toBe(true);
  });

  it("finds a board between two campaigns, which publishes nothing", async () => {
    const reader = fakeReader({ invented: emptyBoard });

    const resolution = await resolveBoard("invented", reader);

    expect(resolution.found).toHaveLength(1);
    expect(resolution.found[0]?.jobCount).toBe(0);
    expect(resolution.found[0]?.publishes).toBe(false);
  });

  it("states a resolution failure as an empty list of boards", async () => {
    const reader = fakeReader({ someoneelse: wideBoard });

    const resolution = await resolveBoard("Eleven Labs", reader);

    expect(resolution.found).toEqual([]);
  });

  it("names every form it tried when nothing answered", async () => {
    const reader = fakeReader({ someoneelse: wideBoard });

    const resolution = await resolveBoard("Eleven Labs, Inc.", reader);

    expect(resolution.tried.length).toBeGreaterThan(1);
    expect(resolution.tried).toEqual(reader.tokens);
  });

  it("sends no more forms than the configured ceiling", async () => {
    const reader = fakeReader({ someoneelse: wideBoard });

    await resolveBoard("A Company With A Very Long Name, Inc.", reader);

    expect(reader.tokens.length).toBeLessThanOrEqual(MAX_BOARD_FORMS);
  });

  it("keeps the spelling that answered, claiming no canonical form", async () => {
    const reader = fakeReader({ AsHbY: shapesBoard });

    const resolution = await resolveBoard("AsHbY", reader);

    expect(resolution.found[0]?.board).toBe("AsHbY");
  });

  // A cut connection is a failure of the read rather than an answer about the
  // company, and the layer forbids rendering a failure as an empty result.
  it("raises rather than reporting an outage as a company that was not found", async () => {
    const reader = fakeReader({ invented: "cut" });

    const error = await captureError(() => resolveBoard("invented", reader));

    expect(error.code).toBe("network_error");
  });
});
