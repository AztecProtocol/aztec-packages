import {
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

  recordEvictions(count: number) {
    this.#evictedCounter.add(count);
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
