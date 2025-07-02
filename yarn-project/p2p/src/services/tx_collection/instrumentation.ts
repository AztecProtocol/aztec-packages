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
  private collectionDurationPerTx: Histogram;
  private collectionDurationPerRequest: Histogram;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.txsCollected = meter.createUpDownCounter(Metrics.TX_COLLECTOR_COUNT, {
      description: 'The number of txs collected',
    });

    this.collectionDurationPerTx = meter.createHistogram(Metrics.TX_COLLECTOR_DURATION_PER_TX, {
      unit: 'ms',
      description: 'Average duration per tx of an individual tx collection request',
      valueType: ValueType.INT,
    });

    this.collectionDurationPerRequest = meter.createHistogram(Metrics.TX_COLLECTOR_DURATION_PER_REQUEST, {
      unit: 'ms',
      description: 'Total duration of an individual tx collection request',
      valueType: ValueType.INT,
    });
  }

  increaseTxsFor(what: CollectionMethod, count: number, duration: number) {
    const durationPerTx = Math.ceil(duration / count);
    this.collectionDurationPerTx.record(durationPerTx, { [Attributes.TX_COLLECTION_METHOD]: what });
    this.collectionDurationPerRequest.record(Math.ceil(duration), { [Attributes.TX_COLLECTION_METHOD]: what });
    this.txsCollected.add(count, { [Attributes.TX_COLLECTION_METHOD]: what });
  }
}
