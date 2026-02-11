import {
  type Meter,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

/** Instrumentation for TxPoolV2Impl internal operations. */
export class TxPoolV2Instrumentation {
  #evictedCounter: UpDownCounter;
  #ignoredCounter: UpDownCounter;
  #rejectedCounter: UpDownCounter;
  #softDeletedHitsCounter: UpDownCounter;
  #missingOnProtectCounter: UpDownCounter;
  #missingPreviouslyEvictedCounter: UpDownCounter;

  constructor(telemetry: TelemetryClient) {
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
