import type { Logger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { L2Block } from '@aztec/stdlib/block';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import type { TxPoolV2, TxPoolV2Events } from '../../mem_pools/tx_pool_v2/interfaces.js';
import { TxCollectionInstrumentation } from './instrumentation.js';
import type { CollectionMethod } from './tx_collection.js';

/** Context determining how collected txs should be added to the pool. */
export type TxAddContext = { type: 'proposal'; blockHeader: BlockHeader } | { type: 'mined'; block: L2Block };

/**
 * Executes collection requests from the fast and slow collection loops, and handles collected txs
 * by adding them to the tx pool and emitting events, as well as handling logging and metrics.
 */
export class TxCollectionSink extends (EventEmitter as new () => TypedEventEmitter<TxPoolV2Events>) {
  private readonly instrumentation: TxCollectionInstrumentation;

  constructor(
    private readonly txPool: TxPoolV2,
    telemetryClient: TelemetryClient,
    private readonly log: Logger,
  ) {
    super();
    this.instrumentation = new TxCollectionInstrumentation(telemetryClient, 'TxCollection');
  }

  public async collect(
    collectValidTxsFn: (txHashes: TxHash[]) => Promise<(Tx | undefined)[]>,
    requested: TxHash[],
    info: Record<string, any> & { description: string; method: CollectionMethod },
    context?: TxAddContext,
  ) {
    this.log.trace(`Requesting ${requested.length} txs via ${info.description}`, {
      ...info,
      requestedTxs: requested.map(t => t.toString()),
    });

    // Execute collection function and measure the time taken, catching any errors.
    const [duration, txs] = await elapsed(async () => {
      try {
        const response = await collectValidTxsFn(requested);
        return response.filter(tx => tx !== undefined);
      } catch (err) {
        this.log.error(`Error collecting txs via ${info.description}`, err, {
          ...info,
          requestedTxs: requested.map(hash => hash.toString()),
        });
        return [] as Tx[];
      }
    });

    if (txs.length === 0) {
      this.log.trace(`No txs found via ${info.description}`, {
        ...info,
        requestedTxs: requested.map(t => t.toString()),
      });
      return { txs, requested, duration };
    }

    // Validate tx hashes for all collected txs from external sources
    const validTxs: Tx[] = [];
    const invalidTxHashes: string[] = [];
    await Promise.all(
      txs.map(async tx => {
        const isValid = await tx.validateTxHash();
        if (isValid) {
          validTxs.push(tx);
        } else {
          invalidTxHashes.push(tx.getTxHash().toString());
        }
      }),
    );

    if (invalidTxHashes.length > 0) {
      this.log.warn(`Rejecting ${invalidTxHashes.length} txs with invalid hashes from ${info.description}`, {
        ...info,
        invalidTxHashes,
      });
    }

    if (validTxs.length === 0) {
      this.log.trace(`No valid txs found via ${info.description} after validation`, {
        ...info,
        requestedTxs: requested.map(t => t.toString()),
        invalidTxHashes,
      });
      return { txs: [], requested, duration };
    }

    this.log.verbose(
      `Collected ${validTxs.length} txs out of ${requested.length} requested via ${info.description} in ${duration}ms`,
      {
        ...info,
        duration,
        txs: validTxs.map(t => t.getTxHash().toString()),
        requestedTxs: requested.map(t => t.toString()),
        rejectedCount: invalidTxHashes.length,
      },
    );

    return await this.foundTxs(validTxs, { ...info, duration }, context);
  }

  private async foundTxs(
    txs: Tx[],
    info: Record<string, any> & { description: string; method: CollectionMethod; duration: number },
    context?: TxAddContext,
  ) {
    // Report metrics for the collection
    this.instrumentation.increaseTxsFor(info.method, txs.length, info.duration);

    // Mark txs as found in the slow missing txs set and all fast requests
    this.emit('txs-added', { txs });

    // Add the txs to the tx pool using the appropriate method based on context
    try {
      if (context?.type === 'mined') {
        await this.txPool.addMinedTxs(txs, context.block.header, { source: 'tx-collection' });
      } else if (context?.type === 'proposal') {
        await this.txPool.addProtectedTxs(txs, context.blockHeader, { source: 'tx-collection' });
      } else {
        await this.txPool.addPendingTxs(txs, { source: 'tx-collection' });
      }
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
