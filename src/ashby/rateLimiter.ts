/**
 * One request at a time, with a floor between two departures.
 *
 * Ashby publishes no crawl delay and no quota header, so the floor is a
 * courtesy set by the weight of what is asked for. Configuration widens it and
 * never narrows it.
 */
export class RateLimiter {
  private chain: Promise<unknown> = Promise.resolve();
  private nextDeparture = 0;

  constructor(private readonly intervalMs: number) {}

  /** Runs the task once its turn comes, no sooner than the floor allows. */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.nextDeparture - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      this.nextDeparture = Date.now() + this.intervalMs;
      return task();
    });
    // A failed task leaves the queue running: the chain follows the outcome
    // rather than the value, so one refusal does not strand the departures
    // behind it.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Holds every departure back, for a delay the service named. */
  pause(ms: number): void {
    this.nextDeparture = Math.max(this.nextDeparture, Date.now() + ms);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
