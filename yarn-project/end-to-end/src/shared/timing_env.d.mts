/** A single recorded span occurrence on the shared `performance.now()` clock. */
export type TimingSpan = {
  /** Full name of the test running when the span started, or `null` during a beforeAll/afterAll hook. */
  owner?: string | null;
  /** Stable `category:label` tag. */
  name?: string;
  /** Clock value at span start. */
  start: number;
  /** Clock value at span end. */
  end: number;
};

/** Aggregate of one tag's occurrences. */
export type SpanAggregate = {
  count: number;
  totalMs: number;
  busyMs: number;
  maxMs: number;
};

/**
 * Aggregates a list of `{ start, end }` spans of one tag into `{ count, totalMs, busyMs, maxMs }`.
 * Does not mutate the input array.
 */
export function aggregateSpans(spans: TimingSpan[]): SpanAggregate;

/**
 * Groups `spans` by owner then tag, attaches a `spans` aggregate map to the matching record (or
 * `suiteRecord` for `null`-owner spans), derives back-compat `setupFnMs` / `teardownFnMs`, drops spans
 * whose owner matches no record, and returns the raw per-occurrence list (empty unless `emitSpanLines`).
 */
export function foldSpansInto(
  spans: TimingSpan[],
  options: {
    recordsByName: Map<string, Record<string, unknown>>;
    suiteRecord: Record<string, unknown>;
    emitSpanLines?: boolean;
  },
): { owner: string | null; name: string; ms: number }[];
