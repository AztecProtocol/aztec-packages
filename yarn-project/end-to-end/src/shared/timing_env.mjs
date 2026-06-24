import { appendFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import CustomEnvironment from '../../../foundation/src/jest/env.mjs';

// Per-test e2e timing environment. Gated entirely on the E2E_TIMING_FILE env var: when unset, this
// behaves exactly like the base CustomEnvironment (it only delegates). When set, it records, per test
// worker process, the time spent in jest before/after hooks and the test body, and merges in the
// function-level time captured by setup.ts/teardown.ts via a collector shared on `this.global`.
//
// Output is one JSONL file per worker process (the env runs once per worker). Each line is either:
//   - a per-test line (`name` set): beforeEach hooks, the it() body, afterEach hooks; or
//   - a single suite-scoped line (`name: null`): beforeAll/afterAll hooks for the whole file.
export default class TimingEnvironment extends CustomEnvironment {
  constructor(config, context) {
    super(config, context);

    this.timingFile = process.env.E2E_TIMING_FILE;
    if (!this.timingFile) {
      return;
    }

    this.suite = basename(context?.testPath ?? config?.testPath ?? 'unknown').replace(/\.test\.[cm]?[jt]s$/, '');
    this.meta = {
      commit: process.env.COMMIT_HASH ?? null,
      branch: process.env.TARGET_BRANCH ?? process.env.REF_NAME ?? null,
      runId: process.env.RUN_ID ?? null,
    };

    // Shared collector. setup.ts (running in the sandbox realm) reads `globalThis.__e2eTimings`; this
    // env (host realm) reads `this.global.__e2eTimings` — they are the same object. `current` is the
    // full name of the test currently running (null during beforeAll/afterAll), used to tag fn spans.
    this.collector = { current: null, fnSpans: [] };
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
        this.mergeFnSpans(name, record);
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

  /** Moves fn spans tagged with `name` into the matching record's setup/teardown buckets. */
  mergeFnSpans(name, record) {
    if (!record) {
      return;
    }
    const remaining = [];
    for (const span of this.collector.fnSpans) {
      if (span.name === name) {
        if (span.kind === 'setup') {
          record.setupFnMs += span.ms;
        } else if (span.kind === 'teardown') {
          record.teardownFnMs += span.ms;
        }
      } else {
        remaining.push(span);
      }
    }
    this.collector.fnSpans = remaining;
  }

  /** Finalizes the suite-scoped record (untagged fn spans + beforeAll/afterAll) and writes all JSONL. */
  finalizeAndFlush() {
    if (this.flushed || !this.timingFile) {
      return;
    }
    this.flushed = true;
    const suite = {
      setupFnMs: 0,
      beforeHooksMs: this.suiteRecord.beforeHooksMs,
      teardownFnMs: 0,
      afterHooksMs: this.suiteRecord.afterHooksMs,
    };
    for (const span of this.collector.fnSpans) {
      if (span.name === null || span.name === undefined) {
        if (span.kind === 'setup') {
          suite.setupFnMs += span.ms;
        } else if (span.kind === 'teardown') {
          suite.teardownFnMs += span.ms;
        }
      }
    }
    this.collector.fnSpans = [];

    const lines = [];
    for (const record of this.records) {
      lines.push(this.toLine({ ...record }));
    }
    lines.push(
      this.toLine({
        name: null,
        status: 'passed',
        setupFnMs: suite.setupFnMs,
        beforeHooksMs: suite.beforeHooksMs,
        teardownFnMs: suite.teardownFnMs,
        afterHooksMs: suite.afterHooksMs,
        totalMs: suite.beforeHooksMs + suite.afterHooksMs,
      }),
    );

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

  /** Flattens metadata onto a record and serializes to a single JSON line. */
  toLine(record) {
    return JSON.stringify({ suite: this.suite, ...record, ...this.meta });
  }
}
