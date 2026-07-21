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

  it('warns when the queue fills up', () => {
    const log = makeLog();
    const processor = new MonitoredBatchSpanProcessor(new CollectingSpanExporter(), log, {
      maxQueueSize: 2,
      minTraceDurationMs: 0,
    });

    processor.onEnd(makeSpan(1));
    processor.onEnd(makeSpan(1));
    expect(log.warn).not.toHaveBeenCalled();

    processor.onEnd(makeSpan(1));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('queue full'), expect.anything());
  });

  it('does not drop spans below the previous 2048 default with the larger default queue', () => {
    const log = makeLog();
    const processor = new MonitoredBatchSpanProcessor(new CollectingSpanExporter(), log, { minTraceDurationMs: 0 });

    for (let i = 0; i < 2049; i++) {
      processor.onEnd(makeSpan(1));
    }

    expect(log.warn).not.toHaveBeenCalled();
  });
});
