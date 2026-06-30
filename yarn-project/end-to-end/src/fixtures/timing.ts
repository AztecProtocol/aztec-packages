/**
 * E2e span instrumentation. Wrapping a shared test helper in {@link span} / {@link spanSync} records
 * how long it ran, attributed to the test (or suite) that was executing, so a full CI run can be
 * aggregated into a ranked list of where the suite spends wall-clock (setup, protocol waits, client
 * proving, warp scans, ...). See the A-1178 timing environment in `shared/timing_env.mjs`.
 *
 * Everything here is gated on the collector installed by that environment, which only exists when
 * `TEST_TIMING_FILE` is set. When it is unset, {@link span} calls `fn()` directly with no extra work
 * and no clock reads — instrumentation is exactly zero-cost and cannot change a test's behavior or
 * timing.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Async-context owner override. A span normally attributes itself to the running test
 * (`collector.current`), but a background producer (e.g. the mempool feeder) runs interleaved with
 * arbitrary tests, so its spans would smear across whichever test happened to be current when each
 * round fired. Running such work inside {@link withSpanOwner} pins every span in that async call tree
 * to a fixed owner instead — isolated by async context from concurrent test-body spans.
 */
const ownerOverride = new AsyncLocalStorage<string | null>();

/**
 * Runs `fn` with every {@link span} inside its async call tree attributed to `owner` instead of the
 * currently running test. Use a non-test sentinel owner (e.g. `other:mempool-feeder`) to keep a
 * background producer's spans out of the per-test view.
 */
export function withSpanOwner<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  return ownerOverride.run(owner, fn);
}

/** One recorded span occurrence on the process-wide `performance.now()` clock. */
export type TimingSpan = {
  /** Full name of the test running when the span started, or `null` if inside a beforeAll/afterAll hook. */
  owner: string | null;
  /** Stable `category:label` tag, aggregated across occurrences (e.g. `wait:checkpoint`, `spawn:node`). */
  name: string;
  /** `performance.now()` at span start. */
  start: number;
  /** `performance.now()` at span end. */
  end: number;
};

/**
 * The collector shared by the timing environment on `globalThis.__e2eTimings`. `current` is the full
 * name of the test currently running (`null` during beforeAll/afterAll); the environment sets it. The
 * `spans` array accumulates every recorded span until the environment folds it into the per-test /
 * per-suite JSONL line at flush.
 */
export type SpanCollector = {
  /** Full name of the running test, or `null` during a beforeAll/afterAll hook. */
  current: string | null;
  /** All recorded spans, drained by the timing environment at flush time. */
  spans: TimingSpan[];
};

function getCollector(): SpanCollector | undefined {
  return (globalThis as { __e2eTimings?: SpanCollector }).__e2eTimings;
}

/**
 * Times `fn` and records a span tagged `name`, attributed to the test (or suite) running when it
 * started. The span is recorded even when `fn` throws. Pure passthrough: when no collector is
 * installed (i.e. `TEST_TIMING_FILE` is unset) this calls `fn()` directly with zero overhead.
 *
 * Use stable `category:label` tags and prefer wrapping at the leaf wait/spawn/tx level — labels are
 * forever aggregation keys, and leaf-level tagging keeps spans additive. See `SPEEDUP_FOLLOWUPS` and
 * the A-1179 design doc for the tag taxonomy.
 */
export async function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const collector = getCollector();
  if (!collector) {
    return fn();
  }
  const owner = ownerOverride.getStore() ?? collector.current;
  const start = performance.now();
  try {
    return await fn();
  } finally {
    collector.spans.push({ owner, name, start, end: performance.now() });
  }
}

/** Synchronous variant of {@link span} for non-async helpers. Same zero-cost guarantee when unset. */
export function spanSync<T>(name: string, fn: () => T): T {
  const collector = getCollector();
  if (!collector) {
    return fn();
  }
  const owner = ownerOverride.getStore() ?? collector.current;
  const start = performance.now();
  try {
    return fn();
  } finally {
    collector.spans.push({ owner, name, start, end: performance.now() });
  }
}
