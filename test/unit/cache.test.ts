import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../../src/ashby/cache.js";
import { EPOCH } from "./_harness.js";

/** A missing board is stored like a value, so the type carries the absence. */
const absent = null as unknown as string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("what the cache hands back", () => {
  it("returns the value, the validator and the instant it was stored", () => {
    const cache = new Cache<string>(60_000, 10);

    cache.set("ashby", "a board", 'W/"job-board:v1"');
    const entry = cache.get("ashby");

    expect(entry?.value).toBe("a board");
    expect(entry?.etag).toBe('W/"job-board:v1"');
    expect(entry?.storedAt).toBe(EPOCH);
  });

  it("returns nothing for a key that was never stored", () => {
    const cache = new Cache<string>(60_000, 10);

    expect(cache.get("ashby")).toBeUndefined();
  });

  it("replaces the value, the validator and the instant on a second write", () => {
    const cache = new Cache<string>(60_000, 10);

    cache.set("ashby", "first", 'W/"v1"');
    vi.setSystemTime(EPOCH + 5000);
    cache.set("ashby", "second", 'W/"v2"');

    const entry = cache.get("ashby");
    expect(entry?.value).toBe("second");
    expect(entry?.etag).toBe('W/"v2"');
    expect(entry?.storedAt).toBe(EPOCH + 5000);
  });

  it("stores an absence the way it stores a value", () => {
    const cache = new Cache<string>(60_000, 10);

    cache.set("unknown-token", absent, absent);
    const entry = cache.get("unknown-token");

    expect(entry).toBeDefined();
    expect(entry?.value).toBeNull();
    expect(cache.isFresh(entry!)).toBe(true);
  });
});

describe("freshness", () => {
  it("holds while the age stays under the lifetime", () => {
    const cache = new Cache<string>(60_000, 10);
    cache.set("ashby", "a board", 'W/"v1"');

    vi.setSystemTime(EPOCH + 59_999);

    expect(cache.isFresh(cache.get("ashby")!)).toBe(true);
  });

  it("ends at the lifetime itself", () => {
    const cache = new Cache<string>(60_000, 10);
    cache.set("ashby", "a board", 'W/"v1"');

    vi.setSystemTime(EPOCH + 60_000);

    expect(cache.isFresh(cache.get("ashby")!)).toBe(false);
  });

  it("stays ended beyond the lifetime", () => {
    const cache = new Cache<string>(60_000, 10);
    cache.set("ashby", "a board", 'W/"v1"');

    vi.setSystemTime(EPOCH + 3_600_000);

    expect(cache.isFresh(cache.get("ashby")!)).toBe(false);
  });

  it("hands back a stale entry with its validator, which is what allows revalidation", () => {
    const cache = new Cache<string>(60_000, 10);
    cache.set("ashby", "a board", 'W/"v1"');

    vi.setSystemTime(EPOCH + 120_000);
    const entry = cache.get("ashby");

    expect(entry?.value).toBe("a board");
    expect(entry?.etag).toBe('W/"v1"');
    expect(cache.isFresh(entry!)).toBe(false);
  });
});

describe("eviction", () => {
  it("drops the least recently read entry when the ceiling is passed", () => {
    const cache = new Cache<string>(60_000, 2);

    cache.set("first", "1", 'W/"1"');
    cache.set("second", "2", 'W/"2"');
    cache.get("first");
    cache.set("third", "3", 'W/"3"');

    expect(cache.get("first")?.value).toBe("1");
    expect(cache.get("third")?.value).toBe("3");
    expect(cache.get("second")).toBeUndefined();
  });

  it("keeps an entry a touch has marked as read", () => {
    const cache = new Cache<string>(60_000, 2);

    cache.set("first", "1", 'W/"1"');
    cache.set("second", "2", 'W/"2"');
    cache.touch("first");
    cache.set("third", "3", 'W/"3"');

    expect(cache.get("first")?.value).toBe("1");
    expect(cache.get("second")).toBeUndefined();
  });

  it("leaves the stored value and instant untouched when an entry is touched", () => {
    const cache = new Cache<string>(60_000, 2);
    cache.set("first", "1", 'W/"1"');

    vi.setSystemTime(EPOCH + 10_000);
    cache.touch("first");

    const entry = cache.get("first");
    expect(entry?.value).toBe("1");
    expect(entry?.storedAt).toBe(EPOCH);
  });

  it("holds entries up to the ceiling without dropping any", () => {
    const cache = new Cache<string>(60_000, 3);

    cache.set("a", "1", 'W/"1"');
    cache.set("b", "2", 'W/"2"');
    cache.set("c", "3", 'W/"3"');

    expect(cache.get("a")?.value).toBe("1");
    expect(cache.get("b")?.value).toBe("2");
    expect(cache.get("c")?.value).toBe("3");
  });
});
