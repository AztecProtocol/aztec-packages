import type { Logger } from '@aztec/foundation/log';

import { type Context, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import { type ExportResult, hrTimeToMilliseconds } from '@opentelemetry/core';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, type BufferConfig, type ReadableSpan, type Span } from '@opentelemetry/sdk-trace-node';

/** Minimum interval between drop warnings to avoid log spam. */
const DROP_WARNING_INTERVAL_MS = 30_000;

const DEFAULT_MIN_TRACE_DURATION_MS = 10;

const DEFAULT_MAX_QUEUE_SIZE = 16384;

/** Cap on the per-export batch size, so a large queue can actually be drained instead of dribbling out
 * at the SDK default of 512 spans per scheduled export. Kept <= maxQueueSize per the BatchSpanProcessor contract. */
const DEFAULT_MAX_EXPORT_BATCH_SIZE = 2048;

export type MonitoredBatchSpanProcessorConfig = BufferConfig & {
  minTraceDurationMs?: number;
};

/** Shared counter of spans sitting in the SDK's queue. It is a plain object rather than a field on the
 * processor because the exporter wrapper that decrements it is built before `super()` runs, when `this`
 * is not yet available. */
type QueueGauge = { size: number };

/**
 * Delegating exporter that reports how many spans left the queue.
 *
 * `BatchSpanProcessor` removes a batch from its internal buffer and hands it straight to
 * `exporter.export()` — exactly once per batch — so this is an exact drain signal. Spans in flight are
 * already off the queue, which matches how the SDK evaluates its own `maxQueueSize` limit.
 */
class DrainCountingExporter implements SpanExporter {
  constructor(
    private readonly inner: SpanExporter,
    private readonly queue: QueueGauge,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.queue.size = Math.max(0, this.queue.size - spans.length);
    this.inner.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

/**
 * Wraps BatchSpanProcessor to emit warnings when spans are dropped due to a full queue.
 * The standard BatchSpanProcessor silently discards spans when its internal queue reaches
 * maxQueueSize, making telemetry data loss invisible to operators.
 */
export class MonitoredBatchSpanProcessor extends BatchSpanProcessor {
  private readonly maxQueueSize: number;
  private readonly maxExportBatchSize: number;
  private readonly minTraceDurationMs: number;
  private readonly log: Logger;
  private readonly queue: QueueGauge;

  private droppedSinceLastWarning = 0;
  private totalDropped = 0;
  private lastWarningTime = 0;
  private shuttingDown = false;

  constructor(exporter: SpanExporter, log: Logger, config?: MonitoredBatchSpanProcessorConfig) {
    const maxQueueSize = config?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    const maxExportBatchSize = Math.min(config?.maxExportBatchSize ?? DEFAULT_MAX_EXPORT_BATCH_SIZE, maxQueueSize);
    const queue: QueueGauge = { size: 0 };
    super(new DrainCountingExporter(exporter, queue), { ...config, maxQueueSize, maxExportBatchSize });
    this.queue = queue;
    this.maxQueueSize = maxQueueSize;
    this.maxExportBatchSize = maxExportBatchSize;
    this.minTraceDurationMs = Math.max(0, config?.minTraceDurationMs ?? DEFAULT_MIN_TRACE_DURATION_MS);
    this.log = log;
  }

  override onStart(span: Span, parentContext: Context): void {
    super.onStart(span, parentContext);
  }

  override onEnd(span: ReadableSpan): void {
    if (this.shouldDropShortSpan(span)) {
      return;
    }

    if (this.isQueued(span)) {
      if (this.queue.size >= this.maxQueueSize) {
        this.droppedSinceLastWarning++;
        this.totalDropped++;
        this.maybeLogDropWarning();
      } else {
        this.queue.size++;
      }
    }

    super.onEnd(span);
  }

  override async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.totalDropped > 0) {
      this.log.warn(`BatchSpanProcessor shutting down with ${this.totalDropped} total spans dropped`, {
        totalDropped: this.totalDropped,
      });
    }
    await super.shutdown();
  }

  private shouldDropShortSpan(span: ReadableSpan): boolean {
    return (
      this.minTraceDurationMs > 0 &&
      span.status.code !== SpanStatusCode.ERROR &&
      hrTimeToMilliseconds(span.duration) < this.minTraceDurationMs
    );
  }

  /** Mirrors the guards the SDK applies before buffering a span. Spans it discards outright never reach the
   * queue and never reach the exporter, so counting them would leak the estimate upwards forever. */
  private isQueued(span: ReadableSpan): boolean {
    return !this.shuttingDown && (span.spanContext().traceFlags & TraceFlags.SAMPLED) !== 0;
  }

  private maybeLogDropWarning(): void {
    const now = Date.now();
    if (now - this.lastWarningTime >= DROP_WARNING_INTERVAL_MS) {
      this.log.warn(
        `BatchSpanProcessor dropping spans: queue full (maxQueueSize=${this.maxQueueSize}, ` +
          `maxExportBatchSize=${this.maxExportBatchSize}). ` +
          `${this.droppedSinceLastWarning} dropped since last warning, ${this.totalDropped} total.`,
        {
          droppedSinceLastWarning: this.droppedSinceLastWarning,
          totalDropped: this.totalDropped,
          maxQueueSize: this.maxQueueSize,
          maxExportBatchSize: this.maxExportBatchSize,
        },
      );
      this.droppedSinceLastWarning = 0;
      this.lastWarningTime = now;
    }
  }
}
