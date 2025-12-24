import type { Gossipable } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  LmdbMetrics,
  type LmdbStatsCallback,
  type Meter,
  Metrics,
  type MetricsType,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

export enum PoolName {
  TX_POOL = 'TxPool',
  ATTESTATION_POOL = 'AttestationPool',
}

type MetricsLabels = {
  objectInMempool: MetricsType;
  objectSize: MetricsType;
  itemsAdded: MetricsType;
  itemMinedDelay: MetricsType;
};

/**
 * Get the metrics labels for a given pool name.
 * They must all have different names, as if duplicates appear, it will brick
 * the metrics instance
 */
function getMetricsLabels(name: PoolName): MetricsLabels {
  if (name === PoolName.TX_POOL) {
    return {
      objectInMempool: Metrics.MEMPOOL_TX_COUNT,
      objectSize: Metrics.MEMPOOL_TX_SIZE,
      itemsAdded: Metrics.MEMPOOL_TX_ADDED_COUNT,
      itemMinedDelay: Metrics.MEMPOOL_TX_MINED_DELAY,
    };
  } else if (name === PoolName.ATTESTATION_POOL) {
    return {
      objectInMempool: Metrics.MEMPOOL_ATTESTATIONS_COUNT,
      objectSize: Metrics.MEMPOOL_ATTESTATIONS_SIZE,
      itemsAdded: Metrics.MEMPOOL_ATTESTATIONS_ADDED_COUNT,
      itemMinedDelay: Metrics.MEMPOOL_ATTESTATIONS_MINED_DELAY,
    };
  }

  throw new Error('Invalid pool type');
}

export type PoolStatsCallback = () => Promise<{
  itemCount: number | Record<string, number>;
}>;

/**
 * Instrumentation class for the Pools (TxPool, AttestationPool, etc).
 */
export class PoolInstrumentation<PoolObject extends Gossipable> {
  /** The number of txs in the mempool */
  private objectsInMempool: ObservableGauge;
  private addObjectCounter: UpDownCounter;
  /** Tracks tx size */
  private objectSize: Histogram;
  /** Track delay between transaction added and evicted */
  private minedDelay: Histogram;

  private dbMetrics: LmdbMetrics;

  private defaultAttributes;
  private meter: Meter;

  private txAddedTimestamp: Map<string, number> = new Map<string, number>();

  constructor(
    telemetry: TelemetryClient,
    name: PoolName,
    private poolStats: PoolStatsCallback,
    dbStats?: LmdbStatsCallback,
  ) {
    this.meter = telemetry.getMeter(name);
    this.defaultAttributes = { [Attributes.POOL_NAME]: name };

    const metricsLabels = getMetricsLabels(name);

    this.objectsInMempool = this.meter.createObservableGauge(metricsLabels.objectInMempool, {
      description: 'The current number of transactions in the mempool',
    });

    this.objectSize = this.meter.createHistogram(metricsLabels.objectSize, {
      unit: 'By',
      description: 'The size of transactions in the mempool',
    });

    this.dbMetrics = new LmdbMetrics(
      this.meter,
      {
        [Attributes.DB_DATA_TYPE]: 'tx-pool',
      },
      dbStats,
    );

    this.addObjectCounter = this.meter.createUpDownCounter(metricsLabels.itemsAdded, {
      description: 'The number of transactions added to the mempool',
    });

    this.minedDelay = this.meter.createHistogram(metricsLabels.itemMinedDelay, {
      description: 'Delay between transaction added and evicted from the mempool',
    });

    this.meter.addBatchObservableCallback(this.observeStats, [this.objectsInMempool]);
  }

  public recordSize(poolObject: PoolObject) {
    this.objectSize.record(poolObject.getSize());
  }

  public incrementAddedObjects(count: number) {
    this.addObjectCounter.add(count);
  }

  public transactionsAdded(transactions: Tx[]) {
    const timestamp = Date.now();
    for (const transaction of transactions) {
      this.txAddedTimestamp.set(transaction.txHash.toString(), timestamp);
    }
  }

  public transactionsRemoved(hashes: TxHash[]) {
    const timestamp = Date.now();
    for (const hash of hashes) {
      const key = hash.toString();
      const addedAt = this.txAddedTimestamp.get(key);
      if (addedAt) {
        this.txAddedTimestamp.delete(key);
        this.minedDelay.record(addedAt - timestamp);
      }
    }
  }

  private observeStats = async (observer: BatchObservableResult) => {
    const { itemCount } = await this.poolStats();
    if (typeof itemCount === 'number') {
      observer.observe(this.objectsInMempool, itemCount, this.defaultAttributes);
    } else {
      for (const [status, count] of Object.entries(itemCount)) {
        observer.observe(this.objectsInMempool, count, {
          ...this.defaultAttributes,
          [Attributes.STATUS]: status,
        });
      }
    }
  };
}
