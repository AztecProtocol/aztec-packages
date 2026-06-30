import { appendFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import CustomEnvironment from '../../../foundation/src/jest/env.mjs';

// Per-test e2e timing environment. Gated entirely on the TEST_TIMING_FILE env var: when unset, this
// behaves exactly like the base CustomEnvironment (it only delegates). When set, it records, per test
// worker process, the time spent in jest before/after hooks and the test body, and folds in the named
// spans recorded via the `span()` wrapper (fixtures/timing.ts) through a collector shared on
// `this.global`.
//
// Output is one JSONL file per worker process (the env runs once per worker). Each line carries a
// `type` discriminator and is one of:
//   - `type: 'test'` (`name` set): beforeEach hooks, the it() body, afterEach hooks for one test; or
//   - `type: 'suite'` (`name: null`): the suite-scoped beforeAll/afterAll hooks for the whole file.
//
// Each line also gains a `spans` map: per `category:label` tag the test/suite touched, the collector
// records `{ count, totalMs, busyMs, maxMs }`. `busyMs` is the duration of the union of the spans'
// `[start, end)` intervals on the shared `performance.now()` clock, so concurrent spans (Promise.all
// fan-out) do not inflate it the way `totalMs` does. The legacy `setupFnMs`/`teardownFnMs` fields are
// kept for back-compat, derived from the `setup:env`/`teardown:env` spans.
//
// When `TEST_TIMING_SPANS=1`, the collector additionally retains every raw span occurrence and emits
// one `type:"span"` line per occurrence (owner, name, ms) for deep dives, at the cost of a larger file.
export default class TimingEnvironment extends CustomEnvironment {
  constructor(config, context) {
    super(config, context);

    this.timingFile = process.env.TEST_TIMING_FILE;
    if (!this.timingFile) {
      return;
    }

    this.suite = basename(context?.testPath ?? config?.testPath ?? 'unknown').replace(/\.test\.[cm]?[jt]s$/, '');
    this.meta = {
      commit: process.env.COMMIT_HASH ?? null,
      branch: process.env.TARGET_BRANCH ?? process.env.REF_NAME ?? null,
      runId: process.env.RUN_ID ?? null,
    };

    // Opt-in per-occurrence emission for deep dives (off by default keeps the JSONL one line per test).
    this.emitSpanLines = process.env.TEST_TIMING_SPANS === '1';

    // Shared collector. The instrumented helpers (running in the sandbox realm) read
    // `globalThis.__e2eTimings`; this env (host realm) reads `this.global.__e2eTimings` — they are the
    // same object. `current` is the full name of the test currently running (null during
    // beforeAll/afterAll), used to attribute each span to a test or to the suite-scoped line. `spans`
    // accumulates every recorded span until flush. The `start`/`end` timestamps come from the sandbox
    // realm's `performance.now()`; Node's perf clock is process-wide (one monotonic origin across all
    // realms), so merging the intervals here for `busyMs` is valid.
    this.collector = { current: null, spans: [] };
    this.global.__e2eTimings = this.collector;

    // Records to flush as JSONL on teardown. One per test plus one suite-scoped record.
    this.records = [];
    this.recordsByName = new Map();
    // The suite-scoped record (beforeAll/afterAll); bodyMs/totalMs are computed at flush time.
    this.suiteRecord = { name: null, status: 'passed', beforeHooksMs: 0, afterHooksMs: 0 };
    // Start times keyed by hook type (beforeAll/beforeEach/afterAll/afterEach).
    this.hookStarts = {};
    this.testStarts = new Map();
    // Guards against double-flushing (we flush on both the teardown event and the teardown method).
    this.flushed = false;
    // Raw per-occurrence spans retained only when TEST_TIMING_SPANS=1, emitted as `type:"span"` lines.
    this.rawSpans = [];
  }

  // Flush on the teardown method too: the jest lifecycle always calls this, whereas the 'teardown'
  // event is not reliably delivered when a test run is interrupted. Whichever fires first wins.
  async teardown() {
    this.finalizeAndFlush();
    await super.teardown();
  }

  async handleTestEvent(event, state) {
    // Run the base env first so its unhandledRejection patching for after-hooks stays intact.
    await super.handleTestEvent(event, state);

    if (!this.timingFile) {
      return;
    }

    const now = Date.now();
    switch (event.name) {
      case 'hook_start': {
        this.hookStarts[event.hook.type] = now;
        break;
      }
      case 'hook_success':
      case 'hook_failure': {
        const start = this.hookStarts[event.hook.type];
        if (start === undefined) {
          break;
        }
        delete this.hookStarts[event.hook.type];
        const ms = now - start;
        if (event.hook.type === 'beforeEach') {
          this.addToCurrent('beforeHooksMs', ms);
        } else if (event.hook.type === 'afterEach') {
          this.addToCurrent('afterHooksMs', ms);
        } else if (event.hook.type === 'beforeAll') {
          this.suiteRecord.beforeHooksMs += ms;
        } else if (event.hook.type === 'afterAll') {
          this.suiteRecord.afterHooksMs += ms;
        }
        break;
      }
      case 'test_start': {
        const name = this.fullTestName(event.test);
        const record = {
          type: 'test',
          name,
          status: 'passed',
          setupFnMs: 0,
          beforeHooksMs: 0,
          bodyMs: 0,
          teardownFnMs: 0,
          afterHooksMs: 0,
          totalMs: 0,
          startedAt: new Date(now).toISOString(),
        };
        this.records.push(record);
        this.recordsByName.set(name, record);
        this.testStarts.set(name, now);
        this.collector.current = name;
        break;
      }
      case 'test_fn_start': {
        this.testStarts.set(`fn:${this.fullTestName(event.test)}`, now);
        break;
      }
      case 'test_fn_success':
      case 'test_fn_failure': {
        const name = this.fullTestName(event.test);
        const start = this.testStarts.get(`fn:${name}`);
        const record = this.recordsByName.get(name);
        if (record && start !== undefined) {
          record.bodyMs = now - start;
        }
        if (record && event.name === 'test_fn_failure') {
          record.status = 'failed';
        }
        break;
      }
      case 'test_done': {
        const name = this.fullTestName(event.test);
        const record = this.recordsByName.get(name);
        const start = this.testStarts.get(name);
        if (record && start !== undefined) {
          record.totalMs = now - start;
        }
        if (record && event.test?.errors?.length) {
          record.status = 'failed';
        }
        this.collector.current = null;
        break;
      }
      case 'teardown': {
        this.finalizeAndFlush();
        break;
      }
      default:
        break;
    }
  }

  /** The record for the test currently running, if any. */
  currentRecord() {
    return this.collector.current ? this.recordsByName.get(this.collector.current) : undefined;
  }

  /** Adds `ms` to a hook bucket on the current per-test record, or the suite record during beforeAll/afterAll. */
  addToCurrent(field, ms) {
    const record = this.currentRecord();
    if (record) {
      record[field] += ms;
    }
  }

  /** Builds the full test name by walking up the describe blocks, matching jest's currentTestName. */
  fullTestName(test) {
    if (!test) {
      return null;
    }
    const parts = [];
    let node = test;
    while (node && node.name && node.name !== 'ROOT_DESCRIBE_BLOCK') {
      parts.unshift(node.name);
      node = node.parent;
    }
    return parts.join(' ');
  }

  /**
   * Aggregates a list of `{ start, end }` spans of one tag into `{ count, totalMs, busyMs, maxMs }`.
   * `totalMs` is the naive sum of per-occurrence durations (correct for serial repeats); `busyMs` is
   * the duration of the union of the `[start, end)` intervals (concurrency-correct — N concurrent
   * spans collapse to their wall-clock span instead of summing to ~N×); `maxMs` is the longest single
   * occurrence. All durations are on the shared process-wide `performance.now()` clock.
   */
  aggregateSpans(spans) {
    let totalMs = 0;
    let maxMs = 0;
    for (const span of spans) {
      const ms = span.end - span.start;
      totalMs += ms;
      if (ms > maxMs) {
        maxMs = ms;
      }
    }
    // busyMs: sort by start and merge overlapping intervals, summing the merged lengths.
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    let busyMs = 0;
    let mergeStart = null;
    let mergeEnd = null;
    for (const span of sorted) {
      if (mergeStart === null) {
        mergeStart = span.start;
        mergeEnd = span.end;
      } else if (span.start <= mergeEnd) {
        if (span.end > mergeEnd) {
          mergeEnd = span.end;
        }
      } else {
        busyMs += mergeEnd - mergeStart;
        mergeStart = span.start;
        mergeEnd = span.end;
      }
    }
    if (mergeStart !== null) {
      busyMs += mergeEnd - mergeStart;
    }
    return { count: spans.length, totalMs, busyMs, maxMs };
  }

  /**
   * Groups the collected spans by owner, then by tag, and attaches a `spans` map of aggregates to the
   * matching per-test / suite record. Also derives the back-compat `setupFnMs` / `teardownFnMs` fields
   * from the `spawn:env:<mode>` / `teardown:env` aggregates. Spans whose owner matches no record (e.g.
   * the pinned `other:mempool-feeder` owner) are dropped. Drains `collector.spans` once done.
   */
  foldSpans() {
    // Group by owner (null owner → suite record), then by tag.
    const byOwner = new Map();
    for (const span of this.collector.spans) {
      const owner = span.owner ?? null;
      let byName = byOwner.get(owner);
      if (!byName) {
        byName = new Map();
        byOwner.set(owner, byName);
      }
      let list = byName.get(span.name);
      if (!list) {
        list = [];
        byName.set(span.name, list);
      }
      list.push(span);
      if (this.emitSpanLines) {
        this.rawSpans.push({ owner, name: span.name, ms: span.end - span.start });
      }
    }

    for (const [owner, byName] of byOwner) {
      const record = owner === null ? this.suiteRecord : this.recordsByName.get(owner);
      if (!record) {
        continue;
      }
      const aggregates = {};
      for (const [name, list] of byName) {
        aggregates[name] = this.aggregateSpans(list);
      }
      record.spans = aggregates;
      // Back-compat: the legacy fn-span buckets are derived from the top-level env spawn/teardown tags.
      // The top-level setup is tagged `spawn:env:<proverMode>` (the mode is a closed set, distinct from
      // the `:anvil`/`:l1-deploy`/... sub-phase tags), so sum those three exact tags.
      const setupFnMs =
        (aggregates['spawn:env:none']?.totalMs ?? 0) +
        (aggregates['spawn:env:fake']?.totalMs ?? 0) +
        (aggregates['spawn:env:real']?.totalMs ?? 0);
      record.setupFnMs = setupFnMs + (record.setupFnMs ?? 0);
      record.teardownFnMs = (aggregates['teardown:env']?.totalMs ?? 0) + (record.teardownFnMs ?? 0);
    }
    this.collector.spans = [];
  }

  /** Folds spans into records, finalizes the suite-scoped record, and writes all JSONL. */
  finalizeAndFlush() {
    if (this.flushed || !this.timingFile) {
      return;
    }
    this.flushed = true;
    this.foldSpans();

    const lines = [];
    for (const record of this.records) {
      lines.push(this.toLine({ ...record }));
    }
    lines.push(
      this.toLine({
        type: 'suite',
        name: null,
        status: 'passed',
        setupFnMs: this.suiteRecord.setupFnMs ?? 0,
        beforeHooksMs: this.suiteRecord.beforeHooksMs,
        teardownFnMs: this.suiteRecord.teardownFnMs ?? 0,
        afterHooksMs: this.suiteRecord.afterHooksMs,
        totalMs: this.suiteRecord.beforeHooksMs + this.suiteRecord.afterHooksMs,
        spans: this.suiteRecord.spans,
      }),
    );
    for (const raw of this.rawSpans) {
      lines.push(this.toLine({ type: 'span', name: raw.owner, span: raw.name, ms: raw.ms }));
    }

    const payload = lines.join('\n') + '\n';
    try {
      // One file per worker process, but a worker may run several suites: append so we keep them all.
      appendFileSync(this.timingFile, payload);
    } catch {
      try {
        writeFileSync(this.timingFile, payload);
      } catch {
        // Timing is best-effort; never fail a test because we couldn't write the file.
      }
    }
  }

  /** Flattens metadata onto a record and serializes to a single JSON line, rounding all Ms fields. */
  toLine(record) {
    const obj = { suite: this.suite, ...record, ...this.meta };
    for (const key of Object.keys(obj)) {
      if (key.endsWith('Ms') && typeof obj[key] === 'number') {
        obj[key] = Math.round(obj[key]);
      }
    }
    // Round the nested span aggregates' Ms fields too (totalMs/busyMs/maxMs per tag).
    if (obj.spans && typeof obj.spans === 'object') {
      for (const agg of Object.values(obj.spans)) {
        for (const key of Object.keys(agg)) {
          if (key.endsWith('Ms') && typeof agg[key] === 'number') {
            agg[key] = Math.round(agg[key]);
          }
        }
      }
    }
    return JSON.stringify(obj);
  }
}
