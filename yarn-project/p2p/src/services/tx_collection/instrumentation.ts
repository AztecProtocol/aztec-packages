import { Attributes, type Histogram, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

import type { CollectionMethod } from './tx_collection.js';

export class TxCollectionInstrumentation {
  private txsCollected: UpDownCounter;
  private collectionDurationPerTx: Histogram;
  private collectionDurationPerRequest: Histogram;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.txsCollected = meter.createUpDownCounter(Metrics.TX_COLLECTOR_COUNT);

    this.collectionDurationPerTx = meter.createHistogram(Metrics.TX_COLLECTOR_DURATION_PER_TX);

    this.collectionDurationPerRequest = meter.createHistogram(Metrics.TX_COLLECTOR_DURATION_PER_REQUEST);
  }

  increaseTxsFor(what: CollectionMethod, count: number, duration: number) {
    const durationPerTx = Math.ceil(duration / count);
    this.collectionDurationPerTx.record(durationPerTx, { [Attributes.TX_COLLECTION_METHOD]: what });
    this.collectionDurationPerRequest.record(Math.ceil(duration), { [Attributes.TX_COLLECTION_METHOD]: what });
    this.txsCollected.add(count, { [Attributes.TX_COLLECTION_METHOD]: what });
  }
}
