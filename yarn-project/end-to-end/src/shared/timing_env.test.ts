import { aggregateSpans, foldSpansInto } from './timing_env.mjs';

describe('aggregateSpans', () => {
  it('sums serial non-overlapping spans', () => {
    expect(
      aggregateSpans([
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ]),
    ).toEqual({ count: 2, totalMs: 20, busyMs: 20, maxMs: 10 });
  });

  it('collapses concurrent spans into their union for busyMs', () => {
    const result = aggregateSpans([
      { start: 0, end: 100 },
      { start: 10, end: 50 },
      { start: 20, end: 120 },
    ]);
    // totalMs naively sums all three (100 + 40 + 100); busyMs is the union [0, 120).
    expect(result).toEqual({ count: 3, totalMs: 240, busyMs: 120, maxMs: 100 });
    // The concurrency property: union wall-clock is strictly below the naive sum.
    expect(result.busyMs).toBeLessThan(result.totalMs);
  });

  it('handles fully nested spans', () => {
    expect(
      aggregateSpans([
        { start: 0, end: 100 },
        { start: 10, end: 20 },
      ]),
    ).toEqual({ count: 2, totalMs: 110, busyMs: 100, maxMs: 100 });
  });

  it('treats touching spans as one contiguous interval', () => {
    expect(
      aggregateSpans([
        { start: 0, end: 5 },
        { start: 5, end: 10 },
      ]),
    ).toEqual({ count: 2, totalMs: 10, busyMs: 10, maxMs: 5 });
  });

  it('keeps a gap between disjoint spans out of busyMs', () => {
    expect(
      aggregateSpans([
        { start: 0, end: 5 },
        { start: 6, end: 10 },
      ]),
    ).toEqual({ count: 2, totalMs: 9, busyMs: 9, maxMs: 5 });
  });

  it('sorts internally and does not mutate the caller array when input is unsorted', () => {
    const input = [
      { start: 20, end: 120 },
      { start: 10, end: 50 },
      { start: 0, end: 100 },
    ];
    const snapshot = input.map(s => ({ ...s }));
    const result = aggregateSpans(input);
    expect(result.busyMs).toEqual(120);
    expect(input).toEqual(snapshot);
  });
});

describe('foldSpansInto', () => {
  it('attaches per-tag aggregates and derives setup/teardown from the renamed setup:env keys', () => {
    const testRecord: Record<string, unknown> = { type: 'test', name: 'suite testA', setupFnMs: 0, teardownFnMs: 0 };
    const recordsByName = new Map([['suite testA', testRecord]]);
    const suiteRecord: Record<string, unknown> = { name: null, beforeHooksMs: 0, afterHooksMs: 0 };

    const spans = [
      { owner: 'suite testA', name: 'wait:block', start: 0, end: 10 },
      { owner: 'suite testA', name: 'wait:block', start: 20, end: 35 },
      { owner: null, name: 'setup:env:fake', start: 0, end: 500 },
      { owner: null, name: 'teardown:env', start: 600, end: 700 },
      { owner: 'other:mempool-feeder', name: 'wait:block', start: 0, end: 999 },
    ];

    const rawSpans = foldSpansInto(spans, { recordsByName, suiteRecord });

    const testSpans = testRecord.spans as Record<string, unknown>;
    expect(testSpans['wait:block']).toEqual({ count: 2, totalMs: 25, busyMs: 25, maxMs: 15 });
    // Back-compat derivation reads the renamed `setup:env:fake` tag; a 0 here means Rename B was missed.
    expect(suiteRecord.setupFnMs).toEqual(500);
    expect(suiteRecord.teardownFnMs).toEqual(100);
    // The unknown owner matches no record, so nothing is attributed to it and no record is created.
    expect(recordsByName.has('other:mempool-feeder')).toBe(false);
    // No per-occurrence lines unless emitSpanLines is set.
    expect(rawSpans).toEqual([]);
  });

  it('emits per-occurrence raw spans only when emitSpanLines is set', () => {
    const recordsByName = new Map();
    const suiteRecord = { name: null };
    const spans = [{ owner: null, name: 'setup:env:none', start: 0, end: 7 }];

    expect(foldSpansInto(spans, { recordsByName, suiteRecord, emitSpanLines: true })).toEqual([
      { owner: null, name: 'setup:env:none', ms: 7 },
    ]);
  });
});
