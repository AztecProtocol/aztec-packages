import type { Logger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { Tx, type TxHash, type TxWithHash } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import type { TxPool, TxPoolEvents } from '../../mem_pools/tx_pool/tx_pool.js';
import { TxCollectionInstrumentation } from './instrumentation.js';
import type { CollectionMethod } from './tx_collection.js';

/**
 * Executes collection requests from the fast and slow collection loops, and handles collected txs
 * by adding them to the tx pool and emitting events, as well as handling logging and metrics.
 */
export class TxCollectionSink extends (EventEmitter as new () => TypedEventEmitter<TxPoolEvents>) {
  private readonly instrumentation: TxCollectionInstrumentation;

  constructor(
    private readonly txPool: TxPool,
    telemetryClient: TelemetryClient,
    private readonly log: Logger,
  ) {
    super();
    this.instrumentation = new TxCollectionInstrumentation(telemetryClient, 'TxCollection');
  }

  public async collect(
    collectFn: (txHashes: TxHash[]) => Promise<(Tx | undefined)[]>,
    requested: TxHash[],
    info: Record<string, any> & { description: string; method: CollectionMethod },
  ) {
    this.log.trace(`Requesting ${requested.length} txs via ${info.description}`, {
      ...info,
      requestedTxs: requested.map(t => t.toString()),
    });

    // Execute collection function and measure the time taken, catching any errors.
    const [duration, txs] = await elapsed(async () => {
      try {
        const response = await collectFn(requested);
        return await Tx.toTxsWithHashes(response.filter(tx => tx !== undefined));
      } catch (err) {
        this.log.error(`Error collecting txs via ${info.description}`, err, {
          ...info,
          requestedTxs: requested.map(hash => hash.toString()),
        });
        return [] as TxWithHash[];
      }
    });

    if (txs.length === 0) {
      this.log.trace(`No txs found via ${info.description}`, {
        ...info,
        requestedTxs: requested.map(t => t.toString()),
      });
      return { txs, requested, duration };
    }

    this.log.verbose(
      `Collected ${txs.length} txs out of ${requested.length} requested via ${info.description} in ${duration}ms`,
      { ...info, duration, txs: txs.map(t => t.txHash.toString()), requestedTxs: requested.map(t => t.toString()) },
    );

    return await this.foundTxs(txs, { ...info, duration });
  }

  private async foundTxs(
    txs: TxWithHash[],
    info: Record<string, any> & { description: string; method: CollectionMethod; duration: number },
  ) {
    // Report metrics for the collection
    this.instrumentation.increaseTxsFor(info.method, txs.length, info.duration);

    // Mark txs as found in the slow missing txs set and all fast requests
    this.emit('txs-added', { txs });

    // Add the txs to the tx pool (should not fail, but we catch it just in case)
    try {
      await this.txPool.addTxs(txs, { source: `tx-collection` });
    } catch (err) {
      this.log.error(`Error adding txs to the pool via ${info.description}`, err, {
        ...info,
        txs: txs.map(tx => tx.txHash.toString()),
      });
      // Return no txs since none have been added
      return { txs: [] };
    }

    return { txs };
  }
}
