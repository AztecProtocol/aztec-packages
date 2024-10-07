import { Gossipable } from '@aztec/circuit-types';
import { Attributes, type Histogram, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

export type TxStatus = 'pending' | 'mined';

/**
 * Instrumentation class for the Pools (TxPool, AttestationPool, etc).
 */
export class PoolInstrumentation<PoolObject extends Gossipable> {
  /** The number of txs in the mempool */
  private objectsInMempool: UpDownCounter;
  /** Tracks tx size */
  private objectSize: Histogram;

  constructor(telemetry: TelemetryClient, name: string) {
    const meter = telemetry.getMeter(name);
    this.objectsInMempool = meter.createUpDownCounter(Metrics.MEMPOOL_TX_COUNT, {
      description: 'The current number of transactions in the mempool',
    });

    this.objectSize = meter.createHistogram(Metrics.MEMPOOL_TX_SIZE, {
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
  }

  public recordSize(poolObject: PoolObject) {
    this.objectSize.record(poolObject.getSize());
  }

  /**
   * Updates the metrics with the new objects.
   * @param txs - The objects to record
   */
  public recordAddedObjectsWithStatus(status: string, count = 1) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }
    this.objectsInMempool.add(count, {
      [Attributes.STATUS]: status,
    });
  }

  public recordAddedObjects(count = 1) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }
    this.objectsInMempool.add(count);
  }

  /**
   * Updates the metrics by removing objects from the mempool.
   * @param count - The number of objects to remove from the mempool
   */
  public recordRemovedObjectsWithStatus(status: string, count = 1) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }
    this.objectsInMempool.add(-1 * count, {
      [Attributes.STATUS]: status,
    });
  }

  public recordRemovedObjects(count = 1) {
    if (count < 0) {
      throw new Error('Count must be positive');
    }
    if (count === 0) {
      return;
    }
    this.objectsInMempool.add(-1 * count);
  }
}
