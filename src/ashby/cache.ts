export interface CacheEntry<T> {
  value: T;
  /** The validator the read carried, replayed on revalidation. */
  etag: string | null;
  storedAt: number;
}

/**
 * What the server holds between calls, keyed by address.
 *
 * A board weighs megabytes and four of the five tools read one that is already
 * down, so this is the piece that decides what the server costs. Past the TTL
 * an entry is revalidated rather than fetched again: a board that has not
 * changed answers 304 with no body, and its stored value stands.
 *
 * An absence is held like anything else. Resolving one company probes several
 * spellings, and re-asking for the same missing one would otherwise pay for
 * each of them twice.
 */
export class Cache<T> {
  /** Insertion order is the eviction order, and reading moves an entry to the end. */
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  /** The entry, fresh or stale, with what is needed to revalidate it. */
  get(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    this.touch(key);
    return entry;
  }

  /** True while an entry may be served without asking again. */
  isFresh(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.storedAt < this.ttlMs;
  }

  set(key: string, value: T, etag: string | null): void {
    this.entries.delete(key);
    this.entries.set(key, { value, etag, storedAt: Date.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Marks a held entry as read again, without replacing what it holds. */
  touch(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  /** Stamps a revalidated entry as current, keeping the value it holds. */
  refresh(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    entry.storedAt = Date.now();
    this.touch(key);
  }
}
