import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import type { CollectionMethod } from './tx_collection.js';

export class TxCollectionInstrumentation {
  private txsCollected: UpDownCounter;
  private collectionDuration: Histogram;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.txsCollected = meter.createUpDownCounter(Metrics.TX_COLLECTOR_COUNT, {
      description: 'The number of txs collected',
    });

    this.collectionDuration = meter.createHistogram(Metrics.TX_COLLECTOR_DURATION, {
      unit: 'ms',
      description: 'Duration of an individual tx collection request',
      valueType: ValueType.INT,
    });
  }

  increaseTxsFor(what: CollectionMethod, count: number, duration: number) {
    this.collectionDuration.record(duration, { [Attributes.TX_COLLECTION_METHOD]: what });
    this.txsCollected.add(count, { [Attributes.TX_COLLECTION_METHOD]: what });
  }
}
