import type { Logger } from '@aztec/foundation/log';

import type { Context } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, type BufferConfig, type ReadableSpan, type Span } from '@opentelemetry/sdk-trace-node';

/** Minimum interval between drop warnings to avoid log spam. */
const DROP_WARNING_INTERVAL_MS = 30_000;

/**
 * Wraps BatchSpanProcessor to emit warnings when spans are dropped due to a full queue.
 * The standard BatchSpanProcessor silently discards spans when its internal queue reaches
 * maxQueueSize, making telemetry data loss invisible to operators.
 */
export class MonitoredBatchSpanProcessor extends BatchSpanProcessor {
  private readonly maxQueueSize: number;
  private readonly log: Logger;

  private approxQueueSize = 0;
  private droppedSinceLastWarning = 0;
  private totalDropped = 0;
  private lastWarningTime = 0;

  constructor(exporter: SpanExporter, log: Logger, config?: BufferConfig) {
    const maxQueueSize = config?.maxQueueSize ?? 2048;
    super(exporter, { ...config, maxQueueSize });
    this.maxQueueSize = maxQueueSize;
    this.log = log;
  }

  override onStart(span: Span, parentContext: Context): void {
    super.onStart(span, parentContext);
  }

  override onEnd(span: ReadableSpan): void {
    if (this.approxQueueSize >= this.maxQueueSize) {
      this.droppedSinceLastWarning++;
      this.totalDropped++;
      this.maybeLogDropWarning();
    } else {
      this.approxQueueSize++;
    }
    super.onEnd(span);
  }

  override async forceFlush(): Promise<void> {
    await super.forceFlush();
    this.approxQueueSize = 0;
  }

  override async shutdown(): Promise<void> {
    if (this.totalDropped > 0) {
      this.log.warn(`BatchSpanProcessor shutting down with ${this.totalDropped} total spans dropped`, {
        totalDropped: this.totalDropped,
      });
    }
    await super.shutdown();
  }

  private maybeLogDropWarning(): void {
    const now = Date.now();
    if (now - this.lastWarningTime >= DROP_WARNING_INTERVAL_MS) {
      this.log.warn(
        `BatchSpanProcessor dropping spans: queue full (maxQueueSize=${this.maxQueueSize}). ` +
          `${this.droppedSinceLastWarning} dropped since last warning, ${this.totalDropped} total.`,
        { droppedSinceLastWarning: this.droppedSinceLastWarning, totalDropped: this.totalDropped },
      );
      this.droppedSinceLastWarning = 0;
      this.lastWarningTime = now;
    }
  }
}
