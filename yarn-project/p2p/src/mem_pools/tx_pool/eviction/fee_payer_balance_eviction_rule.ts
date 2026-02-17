import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import type { TxPoolOptions } from '../tx_pool.js';
import {
  type EvictionContext,
  EvictionEvent,
  type EvictionResult,
  type EvictionRule,
  type FeePayerTxInfo,
  type TxPoolOperations,
} from './eviction_strategy.js';

export class FeePayerBalanceEvictionRule implements EvictionRule {
  public readonly name = 'FeePayerBalanceEviction';
  public readonly reason = 'fee_payer_balance';

  private log = createLogger('p2p:mempool:tx_pool:fee_payer_balance_eviction_rule');

  constructor(private worldState: WorldStateSynchronizer) {}

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    try {
      if (context.event === EvictionEvent.TXS_ADDED) {
        return await this.evictForFeePayers(context.feePayers, this.worldState.getCommitted(), txPool);
      }

      if (context.event === EvictionEvent.BLOCK_MINED) {
        const blockNumber = context.block.getBlockNumber();
        // Ensure world state is synced to this block before accessing the snapshot.
        // This handles the race where a block is added to the archiver
        // but the world state hasn't synced it yet.
        await this.worldState.syncImmediate(blockNumber);
        return await this.evictForFeePayers(context.feePayers, this.worldState.getSnapshot(blockNumber), txPool);
      }

      // TODO: fix this edge-case
      // This can lead to a race condition if we are catching up in the p2p client.
      // Let's say we have 3 txs for the same fee payer, which get mined in blocks 1, 2, 3.
      // Tx1 consumes fee juice, tx2 increases it, tx3 consumes it again. We see block1 with tx1 first, run this rule, and evict tx3.
      // But tx3 was valid (due to tx2) and mined on block3. And we have just removed from the mempool a tx we needed for proving/reexec.
      //
      // NOTE: this will happen only in case of that lower-priority-fee tx entered in e.g. block 2, and we have higher-priority-fee tx in block 3
      // (simply because that was the timing of these txs). But, in case of higher-priority-fee txs being in block 2, the tx3 won't be evicted
      // -----
      // Proposed fix: evict only if node is synched
      if (context.event === EvictionEvent.CHAIN_PRUNED) {
        // Ensure world state is synced to this block before accessing the snapshot.
        await this.worldState.syncImmediate(context.blockNumber);
        const feePayers = await txPool.getPendingFeePayers();
        return await this.evictForFeePayers(feePayers, this.worldState.getSnapshot(context.blockNumber), txPool);
      }

      return {
        reason: this.reason,
        success: true,
        txsEvicted: [],
      };
    } catch (err) {
      this.log.error('Failed to evict txs due to fee payer balance', { err });
      return {
        reason: this.reason,
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict txs due to fee payer balance', { cause: err }),
      };
    }
  }

  updateConfig(_config: TxPoolOptions): void {}

  private async evictForFeePayers(
    feePayers: Array<AztecAddress>, // assumed to be unique
    db: MerkleTreeReadOperations,
    txPool: TxPoolOperations,
  ): Promise<EvictionResult> {
    const publicStateSource = this.createPublicStateSource(db);

    const txsToEvict = (
      await Promise.all(feePayers.map(feePayer => this.getEvictionsForFeePayer(feePayer, publicStateSource, txPool)))
    ).flat();

    if (txsToEvict.length > 0) {
      await txPool.deleteTxs(txsToEvict);
    }

    return {
      reason: this.reason,
      success: true,
      txsEvicted: txsToEvict,
    };
  }

  private async getEvictionsForFeePayer(
    feePayer: AztecAddress,
    publicStateSource: DatabasePublicStateSource,
    txPool: TxPoolOperations,
  ): Promise<TxHash[]> {
    const initialBalance = (
      await publicStateSource.storageRead(
        ProtocolContractAddress.FeeJuice,
        //TODO: cache this LRU-style
        await computeFeePayerBalanceStorageSlot(feePayer),
      )
    ).toBigInt();

    const txs: FeePayerTxInfo[] = [];
    for await (const entry of txPool.getFeePayerTxInfos(feePayer)) {
      txs.push(entry);
    }

    if (txs.length === 0) {
      return [];
    }

    const txsToEvict: TxHash[] = [];
    let balance = initialBalance;
    let hasNonEvictableOverBalance = false;

    // Evaluate balance in priority order so later claims cannot fund earlier spends.
    // This sorts so that higher priority txs come first.
    txs.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.txHash.toBigInt() >= b.txHash.toBigInt() ? -1 : 1;
      }

      return a.priority > b.priority ? -1 : 1;
    });

    for (const tx of txs) {
      const available = balance + tx.claimAmount;
      if (available >= tx.feeLimit) {
        balance = available - tx.feeLimit;
        continue;
      }

      if (tx.isEvictable) {
        txsToEvict.push(tx.txHash);
      } else {
        hasNonEvictableOverBalance = true;
      }
    }

    if (hasNonEvictableOverBalance) {
      this.log.verbose('Fee payer balance cannot be satisfied due to non-evictable txs', {
        feePayer: feePayer.toString(),
        balance: initialBalance,
      });
    }

    return txsToEvict;
  }

  private createPublicStateSource(db: MerkleTreeReadOperations): DatabasePublicStateSource {
    return new DatabasePublicStateSource(db);
  }
}
