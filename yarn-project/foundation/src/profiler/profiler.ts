import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

interface Span {
  label: string;
  start: number;
  dur: number;
  count: number;
  children: Span[];
  parent: Span | undefined;
}

interface ProfileData {
  spans: SerializedSpan[];
  timestamp: string;
  totalTime: number;
}

interface SerializedSpan {
  label: string;
  dur: number;
  count: number;
  children: SerializedSpan[];
}

const als = new AsyncLocalStorage<Span>();
const roots: Span[] = [];

function reset(): void {
  roots.length = 0;
}

// Strip out circular references (parent) and unused fields (start) for JSON serialization
function serializeSpans(spans: Span[]): SerializedSpan[] {
  return spans.map(span => ({
    label: span.label,
    dur: span.dur,
    count: span.count,
    children: serializeSpans(span.children),
  }));
}

let i = 0;
function save(): void {
  if (roots.length === 0) {
    return;
  }

  // Find max single execution time across all spans (dur/count since dur is accumulated)
  const findMaxSingleDuration = (spans: Span[]): number => {
    let max = 0;
    for (const span of spans) {
      const singleDur = span.dur / span.count;
      max = Math.max(max, singleDur);
      if (span.children.length > 0) {
        max = Math.max(max, findMaxSingleDuration(span.children));
      }
    }
    return max;
  };

  const profileData: ProfileData = {
    spans: serializeSpans(roots),
    timestamp: new Date().toISOString(),
    totalTime: findMaxSingleDuration(roots),
  };

  const profilePath = path.join(process.cwd(), `profile-${i++}.json`);
  process.stdout.write(`Writing profile data to ${profilePath}\n`);
  fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
}

// Hook into Jest to save after each test
if (typeof afterEach === 'function') {
  afterEach(() => {
    save();
    reset();
  });
}

// Also save on process exit for non-Jest environments
process.on('exit', () => {
  save();
});

// Wrapper for async functions to maintain context properly
async function runAsync<ReturnType>(label: string, fn: () => Promise<ReturnType>): Promise<ReturnType> {
  const parent = als.getStore();

  // Check if we already have a span with this label in the current context
  let existingSpan: Span | undefined;
  if (parent) {
    existingSpan = parent.children.find(c => c.label === label);
  } else {
    existingSpan = roots.find(r => r.label === label);
  }

  let span: Span;
  if (existingSpan) {
    // Reuse existing span and increment count
    span = existingSpan;
    span.count++;
  } else {
    // Create new span
    span = { label, start: performance.now(), dur: 0, count: 1, children: [], parent };
    if (parent) {
      parent.children.push(span);
    } else {
      roots.push(span);
    }
  }

  const startTime = performance.now();
  const result: ReturnType = await als.run(span, fn);
  const elapsed = performance.now() - startTime;

  // Add to total duration (for averaging)
  span.dur += elapsed;

  return result;
}

export const profiler = { reset, runAsync };
