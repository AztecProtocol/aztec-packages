import { type Gossipable } from '@aztec/circuit-types';
import {
  Attributes,
  type Histogram,
  LmdbMetrics,
  type LmdbStatsCallback,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

export enum PoolName {
  TX_POOL = 'TxPool',
  ATTESTATION_POOL = 'AttestationPool',
  EPOCH_PROOF_QUOTE_POOL = 'EpochProofQuotePool',
}

type MetricsLabels = {
  objectInMempool: Metrics;
  objectSize: Metrics;
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
    };
  } else if (name === PoolName.ATTESTATION_POOL) {
    return {
      objectInMempool: Metrics.MEMPOOL_ATTESTATIONS_COUNT,
      objectSize: Metrics.MEMPOOL_ATTESTATIONS_SIZE,
    };
  } else if (name === PoolName.EPOCH_PROOF_QUOTE_POOL) {
    return {
      objectInMempool: Metrics.MEMPOOL_PROVER_QUOTE_COUNT,
      objectSize: Metrics.MEMPOOL_PROVER_QUOTE_SIZE,
    };
  }

  throw new Error('Invalid pool type');
}

/**
 * Instrumentation class for the Pools (TxPool, AttestationPool, etc).
 */
export class PoolInstrumentation<PoolObject extends Gossipable> {
  /** The number of txs in the mempool */
  private objectsInMempool: UpDownCounter;
  /** Tracks tx size */
  private objectSize: Histogram;

  private dbMetrics: LmdbMetrics;

  private defaultAttributes;

  constructor(telemetry: TelemetryClient, name: PoolName, dbStats?: LmdbStatsCallback) {
    const meter = telemetry.getMeter(name);
    this.defaultAttributes = { [Attributes.POOL_NAME]: name };

    const metricsLabels = getMetricsLabels(name);

    this.objectsInMempool = meter.createUpDownCounter(metricsLabels.objectInMempool, {
      description: 'The current number of transactions in the mempool',
    });

    this.objectSize = meter.createHistogram(metricsLabels.objectSize, {
      unit: 'By',
      description: 'The size of transactions in the mempool',
      advice: {
        explicitBucketBoundaries: [
          5_000, // 5KB
          10_000,
          20_000,
          50_000,
          75_000,
          100_000, // 100KB
          200_000,
        ],
      },
    });

    this.dbMetrics = new LmdbMetrics(
      meter,
      {
        name: Metrics.MEMPOOL_DB_MAP_SIZE,
        description: 'Database map size for the Tx mempool',
      },
      {
        name: Metrics.MEMPOOL_DB_USED_SIZE,
        description: 'Database used size for the Tx mempool',
      },
      {
        name: Metrics.MEMPOOL_DB_NUM_ITEMS,
        description: 'Num items in database for the Tx mempool',
      },
      dbStats,
    );
  }

  public recordSize(poolObject: PoolObject) {
    this.objectSize.record(poolObject.getSize());
  }

  /**
   * Updates the metrics with the new objects.
   * @param txs - The objects to record
   */
  public recordAddedObjects(count = 1, status?: string) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }
    const attributes = status
      ? {
          ...this.defaultAttributes,
          [Attributes.STATUS]: status,
        }
      : this.defaultAttributes;

    this.objectsInMempool.add(count, attributes);
  }

  /**
   * Updates the metrics by removing objects from the mempool.
   * @param count - The number of objects to remove from the mempool
   */
  public recordRemovedObjects(count = 1, status?: string) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }

    const attributes = status
      ? {
          ...this.defaultAttributes,
          [Attributes.STATUS]: status,
        }
      : this.defaultAttributes;
    this.objectsInMempool.add(-1 * count, attributes);
  }
}
