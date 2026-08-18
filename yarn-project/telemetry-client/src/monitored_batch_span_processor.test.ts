import { jest } from '@jest/globals';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';

import { MonitoredBatchSpanProcessor } from './monitored_batch_span_processor.js';

class CollectingSpanExporter implements SpanExporter {
  public readonly spans: ReadableSpan[] = [];

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    this.spans.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/** Models collector backpressure: batches leave the queue but never complete, so nothing drains behind them. */
class StallingSpanExporter implements SpanExporter {
  private readonly pending: Parameters<SpanExporter['export']>[1][] = [];

  export(_spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    this.pending.push(resultCallback);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /** Releases the stalled exports so the SDK clears its pending export timeouts. Settling one batch lets
   * the SDK start the next, so this keeps going until nothing is in flight. */
  async drain(): Promise<void> {
    while (this.pending.length > 0) {
      while (this.pending.length > 0) {
        this.pending.pop()!({ code: ExportResultCode.SUCCESS });
      }
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

const makeLog = () => ({ warn: jest.fn() }) as any;

function makeSpan(durationMs: number, statusCode = SpanStatusCode.OK): ReadableSpan {
  const seconds = Math.floor(durationMs / 1000);
  const nanos = (durationMs - seconds * 1000) * 1_000_000;
  return {
    attributes: {},
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    duration: [seconds, nanos],
    ended: true,
    endTime: [seconds, nanos],
    events: [],
    instrumentationLibrary: {} as any,
    kind: SpanKind.INTERNAL,
    links: [],
    name: `span-${durationMs}`,
    resource: {} as any,
    spanContext: () => ({ spanId: '0'.repeat(16), traceFlags: 1, traceId: '0'.repeat(32) }),
    startTime: [0, 0],
    status: { code: statusCode },
  };
}

function makeUnsampledSpan(): ReadableSpan {
  const span = makeSpan(1);
  return { ...span, spanContext: () => ({ spanId: '0'.repeat(16), traceFlags: 0, traceId: '0'.repeat(32) }) };
}

describe('MonitoredBatchSpanProcessor', () => {
  it('does not export successful spans shorter than the configured duration', async () => {
    const exporter = new CollectingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, makeLog(), { minTraceDurationMs: 10 });

    processor.onEnd(makeSpan(9));
    processor.onEnd(makeSpan(10));
    await processor.forceFlush();

    expect(exporter.spans.map(span => span.name)).toEqual(['span-10']);
  });

  it('exports short error spans', async () => {
    const exporter = new CollectingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, makeLog(), { minTraceDurationMs: 10 });

    processor.onEnd(makeSpan(1, SpanStatusCode.ERROR));
    await processor.forceFlush();

    expect(exporter.spans.map(span => span.name)).toEqual(['span-1']);
  });

  it('allows short successful spans when the minimum duration is disabled', async () => {
    const exporter = new CollectingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, makeLog(), { minTraceDurationMs: 0 });

    processor.onEnd(makeSpan(1));
    await processor.forceFlush();

    expect(exporter.spans.map(span => span.name)).toEqual(['span-1']);
  });

  it('warns when the queue fills up', async () => {
    const log = makeLog();
    const exporter = new StallingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, log, {
      maxQueueSize: 4,
      maxExportBatchSize: 2,
      minTraceDurationMs: 0,
    });

    // The first two spans are handed to the stalled exporter; the next four fill the queue behind it.
    for (let i = 0; i < 6; i++) {
      processor.onEnd(makeSpan(1));
    }
    expect(log.warn).not.toHaveBeenCalled();

    processor.onEnd(makeSpan(1));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('queue full'), expect.anything());

    await exporter.drain();
  });

  it('does not drop spans below the previous 2048 default with the larger default queue', () => {
    const log = makeLog();
    const processor = new MonitoredBatchSpanProcessor(new CollectingSpanExporter(), log, { minTraceDurationMs: 0 });

    for (let i = 0; i < 2049; i++) {
      processor.onEnd(makeSpan(1));
    }

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('frees queue capacity as spans are exported', async () => {
    const log = makeLog();
    const exporter = new CollectingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, log, {
      maxQueueSize: 4,
      maxExportBatchSize: 4,
      minTraceDurationMs: 0,
    });

    // Push far more spans than the queue holds, letting the SDK's own batch export drain them in
    // between. forceFlush() is deliberately not used: the scheduled export path is the one that runs in
    // a live node, and the queue estimate has to track it or the processor reports drops that never
    // happened.
    for (let batch = 0; batch < 100; batch++) {
      for (let i = 0; i < 4; i++) {
        processor.onEnd(makeSpan(1));
      }
      await new Promise(resolve => setImmediate(resolve));
    }
    await processor.forceFlush();

    expect(exporter.spans).toHaveLength(400);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('does not count spans the SDK never queues against the queue', async () => {
    const log = makeLog();
    const exporter = new StallingSpanExporter();
    const processor = new MonitoredBatchSpanProcessor(exporter, log, {
      maxQueueSize: 4,
      maxExportBatchSize: 2,
      minTraceDurationMs: 0,
    });

    // Unsampled spans are discarded by BatchSpanProcessor before they reach the buffer, so they must not
    // consume queue capacity.
    for (let i = 0; i < 100; i++) {
      processor.onEnd(makeUnsampledSpan());
    }

    for (let i = 0; i < 6; i++) {
      processor.onEnd(makeSpan(1));
    }
    expect(log.warn).not.toHaveBeenCalled();

    processor.onEnd(makeSpan(1));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('queue full'), expect.anything());

    await exporter.drain();
  });
});
