import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';

import { type TxMetaData, comparePriority } from '../tx_metadata.js';
import type { EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes transactions when fee payers have insufficient balance.
 * Triggers on TXS_ADDED, BLOCK_MINED, and CHAIN_PRUNED events.
 */
export class FeePayerBalanceEvictionRule implements EvictionRule {
  public readonly name = 'FeePayerBalanceEviction';
  public readonly reason = 'fee_payer_balance';

  private log = createLogger('p2p:tx_pool_v2:fee_payer_balance_eviction_rule');

  constructor(private worldState: WorldStateSynchronizer) {}

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    try {
      if (context.event === EvictionEvent.TXS_ADDED) {
        return await this.evictForFeePayers(context.feePayers, this.worldState.getCommitted(), pool);
      }

      if (context.event === EvictionEvent.BLOCK_MINED) {
        const blockNumber = context.block.getBlockNumber();
        await this.worldState.syncImmediate(blockNumber);
        return await this.evictForFeePayers(context.feePayers, this.worldState.getSnapshot(blockNumber), pool);
      }

      if (context.event === EvictionEvent.CHAIN_PRUNED) {
        await this.worldState.syncImmediate(context.blockNumber);
        const feePayers = pool.getPendingFeePayers();
        return await this.evictForFeePayers(feePayers, this.worldState.getSnapshot(context.blockNumber), pool);
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

  private async evictForFeePayers(
    feePayers: string[],
    db: MerkleTreeReadOperations,
    pool: PoolOperations,
  ): Promise<EvictionResult> {
    const publicStateSource = new DatabasePublicStateSource(db);

    const txsToEvict = (
      await Promise.all(feePayers.map(feePayer => this.getEvictionsForFeePayer(feePayer, publicStateSource, pool)))
    ).flat();

    if (txsToEvict.length > 0) {
      await pool.deleteTxs(txsToEvict);
    }

    return {
      reason: this.reason,
      success: true,
      txsEvicted: txsToEvict,
    };
  }

  private async getEvictionsForFeePayer(
    feePayerStr: string,
    publicStateSource: DatabasePublicStateSource,
    pool: PoolOperations,
  ): Promise<string[]> {
    const feePayer = AztecAddress.fromString(feePayerStr);
    const initialBalance = (
      await publicStateSource.storageRead(
        ProtocolContractAddress.FeeJuice,
        await computeFeePayerBalanceStorageSlot(feePayer),
      )
    ).toBigInt();

    const txs: TxMetaData[] = pool.getFeePayerPendingTxs(feePayerStr);

    if (txs.length === 0) {
      return [];
    }

    const txsToEvict: string[] = [];
    let balance = initialBalance;

    // Sort by priority descending (highest first), with hash as tiebreaker
    txs.sort((a, b) => -comparePriority(a, b));

    for (const tx of txs) {
      const available = balance + tx.claimAmount;
      if (available >= tx.feeLimit) {
        balance = available - tx.feeLimit;
        continue;
      }

      // This tx cannot be covered - mark for eviction
      txsToEvict.push(tx.txHash);
    }

    return txsToEvict;
  }
}
