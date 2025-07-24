import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { GasTxValidator } from '../../../msg_validators/index.js';
import type { EvictionContext, EvictionResult, EvictionRule, TxPoolOperations } from './eviction_strategy.js';

export class OutOfBalanceTxsAfterMining implements EvictionRule {
  public readonly name = 'OutOfBalanceTxsAfterMining';

  public constructor(private worldState: ReadonlyWorldStateAccess) {}

  private log = createLogger('p2p:mempool:tx_pool:out_of_balance_txs_after_mining_rule');

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== 'block_mined') {
      return {
        reason: 'block_mined_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    if (!context.block || !context.newNullifiers) {
      this.log.warn('Invalid context for block mined eviction', { context });
      return {
        reason: 'block_mined_invalid_txs',
        success: false,
        txsEvicted: [],
        error: new Error('Invalid block mined context'),
      };
    }

    try {
      const txsToEvict: TxHash[] = [];
      const affectedTxs = await txPool.getPendingTxsWithFeePayer(context.minedFeePayers);
      const gasValidator = this.createGasTxValidator(this.worldState.getSnapshot(context.block.getBlockNumber()));

      for (const { txHash, isEvictable } of affectedTxs) {
        // Skip non-evictable transactions
        if (!isEvictable) {
          continue;
        }

        const tx = await txPool.getTxByHash(txHash);
        if (!tx) {
          continue;
        }

        if ((await gasValidator.validateTxFee(tx)).result === 'invalid') {
          this.log.verbose(`Evicting tx ${txHash} from pool due to an insufficient fee payer balance`);
          txsToEvict.push(txHash);
          continue;
        }
      }

      if (txsToEvict.length > 0) {
        await txPool.deleteTxs(txsToEvict);
      }

      this.log.debug(`Evicted ${txsToEvict.length} invalid txs after block mined`);

      return {
        reason: 'insufficient_fee_juice',
        success: true,
        txsEvicted: txsToEvict,
      };
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

  /**
   * Creates a GasTxValidator instance.
   * @param db - DB for the validator to use
   * @returns A GasTxValidator instance
   */
  protected createGasTxValidator(db: MerkleTreeReadOperations): GasTxValidator {
    return new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, GasFees.empty());
  }
}
