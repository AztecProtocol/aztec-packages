import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { GasTxValidator } from '../../../msg_validators/index.js';
import type {
  EvictionContext,
  EvictionResult,
  EvictionRule,
  PendingTxInfo,
  TxPoolOperations,
} from './eviction_strategy.js';

export class InsufficientFeePayerBalanceRule implements EvictionRule {
  public readonly name = 'InsufficientFeePayerBalance';

  public constructor(private worldState: ReadonlyWorldStateAccess) {}

  private log = createLogger('p2p:mempool:tx_pool:insufficient_fee_payer_balance_rule');

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    try {
      if (context.event === 'block_mined') {
        const affectedTxs = await txPool.getPendingTxsWithFeePayer(context.minedFeePayers);
        return this.evictTxs(affectedTxs, context.block.getBlockNumber(), txPool);
      } else if (context.event === 'chain_pruned') {
        const affectedTxs = await txPool.getPendingTxs();
        return this.evictTxs(affectedTxs, context.blockNumber, txPool);
      } else {
        return {
          reason: 'insufficient_fee_juice',
          success: true,
          txsEvicted: [],
        };
      }
    } catch (err) {
      this.log.error('Failed to evict invalid transactions after mining', { err });
      return {
        reason: 'insufficient_fee_juice',
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
      await txPool.deleteTxs(txsToEvict, true);
    }

    this.log.debug(`Evicted ${txsToEvict.length} invalid txs after block mined`);

    return {
      reason: 'insufficient_fee_juice',
      success: true,
      txsEvicted: txsToEvict,
    };
  }

  private createGasTxValidator(db: MerkleTreeReadOperations): GasTxValidator {
    return new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, GasFees.empty());
  }
}
