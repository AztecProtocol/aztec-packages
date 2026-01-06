import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { GasTxValidator } from '../../../msg_validators/index.js';
import type { TxPoolOptions } from '../tx_pool.js';
import {
  type EvictionContext,
  EvictionEvent,
  type EvictionResult,
  type EvictionRule,
  type PendingTxInfo,
  type TxPoolOperations,
} from './eviction_strategy.js';

export class InsufficientFeePayerBalanceRule implements EvictionRule {
  public readonly name = 'InsufficientFeePayerBalance';
  public readonly reason = 'insufficient_fee_juice';

  public constructor(private worldState: ReadonlyWorldStateAccess) {}

  private log = createLogger('p2p:mempool:tx_pool:insufficient_fee_payer_balance_rule');

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    try {
      if (context.event === EvictionEvent.CHAIN_PRUNED) {
        const affectedTxs = await txPool.getPendingTxInfos();
        return this.evictTxs(affectedTxs, context.blockNumber, txPool);
      }

      if (context.event === EvictionEvent.BLOCK_MINED) {
        const affectedTxs = await txPool.getPendingTxsWithFeePayer(context.minedFeePayers);

        // TODO: fix this edge-case
        // This can lead to a race condition if we are catching up in the p2p client.
        // Let's say we have 3 txs for the same fee payer, which get mined in blocks 1, 2, 3.
        // Tx1 consumes fee juice, tx2 increases it, tx3 consumes it again. We see block1 with tx1 first, run this rule, and evict tx3.
        // But tx3 was valid (due to tx2) and mined on block3. And we have just removed from the mempool a tx we needed for proving/reexec.
        // -----
        // Proposed fix: evict only if node is synched
        return this.evictTxs(affectedTxs, context.block.getBlockNumber(), txPool);
      }

      return {
        reason: this.reason,
        success: true,
        txsEvicted: [],
      };
    } catch (err) {
      this.log.error('Failed to evict invalid transactions after mining', { err });
      return {
        reason: this.reason,
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict invalid txs after mining', { cause: err }),
      };
    }
  }

  private async evictTxs(
    candidateTxs: PendingTxInfo[],
    blockNumber: number,
    txPool: TxPoolOperations,
  ): Promise<EvictionResult> {
    const txsToEvict: TxHash[] = [];
    const gasValidator = this.createGasTxValidator(this.worldState.getSnapshot(blockNumber));

    for (const { txHash, isEvictable } of candidateTxs) {
      if (!isEvictable) {
        continue;
      }

      const tx = await txPool.getTxByHash(txHash);
      if (!tx) {
        continue;
      }

      this.log.debug(`Validating tx balance ${txHash}`);

      if ((await gasValidator.validateTxFee(tx)).result === 'invalid') {
        this.log.verbose(`Evicting tx ${txHash} from pool due to an insufficient fee payer balance`);
        txsToEvict.push(txHash);
        continue;
      }
    }

    if (txsToEvict.length > 0) {
      await txPool.deleteTxs(txsToEvict);
    }

    this.log.verbose(`Evicted ${txsToEvict.length} invalid txs after block mined`, { txsToEvict });

    return {
      reason: this.reason,
      success: true,
      txsEvicted: txsToEvict,
    };
  }

  private createGasTxValidator(db: MerkleTreeReadOperations): GasTxValidator {
    return new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, GasFees.empty());
  }

  updateConfig(_config: TxPoolOptions): void {}
}
