import {
  Attributes,
  type Histogram,
  type Meter,
  Metrics,
  type ObservableGauge,
  type ObservableResult,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

/** Callback that returns the current estimated metadata memory in bytes. */
export type MetadataMemoryCallback = () => number;

/** Instrumentation for TxPoolV2Impl internal operations. */
export class TxPoolV2Instrumentation {
  #evictedCounter: UpDownCounter;
  #ignoredCounter: UpDownCounter;
  #rejectedCounter: UpDownCounter;
  #softDeletedHitsCounter: UpDownCounter;
  #missingOnProtectCounter: UpDownCounter;
  #missingPreviouslyEvictedCounter: UpDownCounter;
  #metadataMemoryGauge: ObservableGauge;

  constructor(telemetry: TelemetryClient, metadataMemoryCallback: MetadataMemoryCallback) {
    const meter: Meter = telemetry.getMeter('TxPoolV2Impl');

    this.#evictedCounter = createUpDownCounterWithDefault(meter, Metrics.MEMPOOL_TX_POOL_V2_EVICTED_COUNT);
    this.#ignoredCounter = createUpDownCounterWithDefault(meter, Metrics.MEMPOOL_TX_POOL_V2_IGNORED_COUNT);
    this.#rejectedCounter = createUpDownCounterWithDefault(meter, Metrics.MEMPOOL_TX_POOL_V2_REJECTED_COUNT);
    this.#softDeletedHitsCounter = createUpDownCounterWithDefault(meter, Metrics.MEMPOOL_TX_POOL_V2_SOFT_DELETED_HITS);
    this.#missingOnProtectCounter = createUpDownCounterWithDefault(
      meter,
      Metrics.MEMPOOL_TX_POOL_V2_MISSING_ON_PROTECT,
    );
    this.#missingPreviouslyEvictedCounter = createUpDownCounterWithDefault(
      meter,
      Metrics.MEMPOOL_TX_POOL_V2_MISSING_PREVIOUSLY_EVICTED,
    );
    this.#metadataMemoryGauge = meter.createObservableGauge(Metrics.MEMPOOL_TX_POOL_V2_METADATA_MEMORY);
    this.#metadataMemoryGauge.addCallback((result: ObservableResult) => {
      result.observe(metadataMemoryCallback());
    });
  }

  recordEvictions(count: number, reason: string) {
    this.#evictedCounter.add(count, { [Attributes.TX_POOL_EVICTION_REASON]: reason });
  }

  recordIgnored(count: number) {
    this.#ignoredCounter.add(count);
  }

  recordRejected(count: number) {
    this.#rejectedCounter.add(count);
  }

  recordSoftDeletedHits(count: number) {
    this.#softDeletedHitsCounter.add(count);
  }

  recordMissingOnProtect(count: number) {
    this.#missingOnProtectCounter.add(count);
  }

  recordMissingPreviouslyEvicted(count: number) {
    this.#missingPreviouslyEvictedCounter.add(count);
  }
}

/**
 * Instrumentation for the tx pool serial queue: how long operations wait behind other queued work,
 * how long they take to execute once running, and the current queue depth. All pool operations share
 * a single serial queue, so contention here directly delays gossip tx validation.
 */
export class TxPoolQueueInstrumentation {
  #queueWait: Histogram;
  #queueExecution: Histogram;

  constructor(telemetry: TelemetryClient, getQueueLength: () => number) {
    const meter: Meter = telemetry.getMeter('TxPoolQueue');
    this.#queueWait = meter.createHistogram(Metrics.MEMPOOL_TX_POOL_V2_QUEUE_WAIT);
    this.#queueExecution = meter.createHistogram(Metrics.MEMPOOL_TX_POOL_V2_QUEUE_EXECUTION);
    const queueLength = meter.createObservableGauge(Metrics.MEMPOOL_TX_POOL_V2_QUEUE_LENGTH);
    queueLength.addCallback((result: ObservableResult) => {
      result.observe(getQueueLength());
    });
  }

  record(operation: string, waitMs: number, executionMs: number) {
    const attributes = { [Attributes.MEMPOOL_OPERATION]: operation };
    this.#queueWait.record(Math.ceil(waitMs), attributes);
    this.#queueExecution.record(Math.ceil(executionMs), attributes);
  }
}
