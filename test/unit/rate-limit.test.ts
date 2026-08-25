import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/ashby/rateLimiter.js";
import { MIN_INTERVAL_MS, resolveInterval } from "../../src/ashby/config.js";
import { EPOCH, clientWith, fakeFetch } from "./_harness.js";
import { shapesBoard, wideBoard } from "./_corpus.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Records the simulated instant at which each task started. */
function recorder(): { starts: number[]; task: (label: string) => () => Promise<string> } {
  const starts: number[] = [];
  const order: string[] = [];
  const task = (label: string) => async (): Promise<string> => {
    starts.push(Date.now());
    order.push(label);
    return label;
  };
  return { starts, task };
}

describe("the pace between two requests", () => {
  it("separates two tasks scheduled together by at least the interval", async () => {
    const limiter = new RateLimiter(1000);
    const { starts, task } = recorder();

    const first = limiter.schedule(task("first")).catch(() => undefined);
    const second = limiter.schedule(task("second")).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);

    expect(starts).toHaveLength(2);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
  });

  it("holds the second task back while the interval has not elapsed", async () => {
    const limiter = new RateLimiter(1000);
    const { starts, task } = recorder();

    limiter.schedule(task("first")).catch(() => undefined);
    limiter.schedule(task("second")).catch(() => undefined);

    await vi.advanceTimersByTimeAsync(999);
    expect(starts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toHaveLength(2);
  });

  it("starts tasks in the order they were scheduled", async () => {
    const limiter = new RateLimiter(1000);
    const seen: string[] = [];
    const task = (label: string) => async (): Promise<string> => {
      seen.push(label);
      return label;
    };

    const all = Promise.all([
      limiter.schedule(task("first")),
      limiter.schedule(task("second")),
      limiter.schedule(task("third")),
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    await all;

    expect(seen).toEqual(["first", "second", "third"]);
  });

  it("runs one task at a time, waiting for the one in flight", async () => {
    const limiter = new RateLimiter(1000);
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = limiter.schedule(async () => {
      seen.push("first");
      await held;
      return "first";
    });
    const second = limiter.schedule(async () => {
      seen.push("second");
      return "second";
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen).toEqual(["first"]);

    release();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);
    expect(seen).toEqual(["first", "second"]);
  });

  it("hands back what the task returned", async () => {
    const limiter = new RateLimiter(1000);

    const value = limiter.schedule(async () => 42);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(value).resolves.toBe(42);
  });

  it("hands back the failure the task raised", async () => {
    const limiter = new RateLimiter(1000);

    const failing = limiter.schedule(async () => {
      throw new Error("the task failed");
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(failing).rejects.toThrow("the task failed");
  });

  it("keeps the queue moving after a task fails", async () => {
    const limiter = new RateLimiter(1000);
    const seen: string[] = [];

    const failing = limiter.schedule(async () => {
      seen.push("failing");
      throw new Error("the task failed");
    });
    failing.catch(() => undefined);
    const following = limiter.schedule(async () => {
      seen.push("following");
      return "following";
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(following).resolves.toBe("following");
    expect(seen).toEqual(["failing", "following"]);
  });
});

describe("a pause", () => {
  it("delays the next departure by the amount asked for", async () => {
    const limiter = new RateLimiter(1000);
    const { starts, task } = recorder();

    limiter.schedule(task("first")).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    limiter.pause(5000);
    limiter.schedule(task("second")).catch(() => undefined);

    await vi.advanceTimersByTimeAsync(4000);
    expect(starts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(starts).toHaveLength(2);
  });

  it("leaves the task in flight running", async () => {
    const limiter = new RateLimiter(1000);
    let finished = false;

    const first = limiter.schedule(async () => {
      limiter.pause(30_000);
      finished = true;
      return "first";
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toBe("first");
    expect(finished).toBe(true);
  });
});

describe("the floor the configuration may widen", () => {
  it("is one second", () => {
    expect(MIN_INTERVAL_MS).toBe(1000);
  });

  it("keeps a request wider than the floor", () => {
    expect(resolveInterval(5000)).toBe(5000);
  });

  it("raises a request below the floor to the floor", () => {
    expect(resolveInterval(1)).toBe(MIN_INTERVAL_MS);
  });

  it("raises a negative request to the floor", () => {
    expect(resolveInterval(-1000)).toBe(MIN_INTERVAL_MS);
  });

  it("falls back to the floor when nothing is requested", () => {
    expect(resolveInterval()).toBe(MIN_INTERVAL_MS);
  });

  it("falls back to the floor for a value that is not a number", () => {
    expect(resolveInterval(Number.NaN)).toBe(MIN_INTERVAL_MS);
  });

  it("falls back to the floor for an infinite value", () => {
    expect(resolveInterval(Number.POSITIVE_INFINITY)).toBe(MIN_INTERVAL_MS);
  });

  it("holds on the published client, which cannot ask for a faster pace", async () => {
    const fake = fakeFetch({ first: shapesBoard, second: wideBoard });
    const client = clientWith(fake, { minIntervalMs: 1 });

    const reads = Promise.all([client.readBoard("first"), client.readBoard("second")]);
    reads.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS - 1);
    expect(fake.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fake.calls).toHaveLength(2);
  });
});
