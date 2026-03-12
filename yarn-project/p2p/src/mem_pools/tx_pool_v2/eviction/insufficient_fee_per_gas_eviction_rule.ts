import { createLogger } from '@aztec/foundation/log';
import type { BlockMinFeesProvider } from '@aztec/stdlib/gas';

import type { EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes transactions whose maxFeesPerGas no longer meets
 * the projected minimum gas fees after a new block is mined.
 * Uses the BlockMinFeesProvider (forward-looking) to get the projected minimum fees.
 * Only triggers on BLOCK_MINED events.
 */
export class InsufficientFeePerGasEvictionRule implements EvictionRule {
  public readonly name = 'InsufficientFeePerGas';

  private log = createLogger('p2p:tx_pool_v2:insufficient_fee_per_gas_eviction_rule');

  constructor(private blockMinFeesProvider: BlockMinFeesProvider) {}

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.BLOCK_MINED) {
      return {
        reason: 'insufficient_fee_per_gas',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const gasFees = await this.blockMinFeesProvider.getCurrentMinFees();
      const txsToEvict: string[] = [];
      const pendingTxs = pool.getPendingTxs();

      for (const meta of pendingTxs) {
        const maxFeesPerGas = meta.data.constants.txContext.gasSettings.maxFeesPerGas;
        if (maxFeesPerGas.feePerDaGas < gasFees.feePerDaGas || maxFeesPerGas.feePerL2Gas < gasFees.feePerL2Gas) {
          this.log.verbose(`Evicting tx ${meta.txHash} from pool due to insufficient fee per gas`, {
            txMaxFeesPerGas: maxFeesPerGas.toInspect(),
            blockGasFees: gasFees.toInspect(),
          });
          txsToEvict.push(meta.txHash);
        }
      }

      if (txsToEvict.length > 0) {
        this.log.info(`Evicted ${txsToEvict.length} txs with insufficient fee per gas after block mined`);
        await pool.deleteTxs(txsToEvict, this.name);
      }

      return {
        reason: 'insufficient_fee_per_gas',
        success: true,
        txsEvicted: txsToEvict,
      };
    } catch (err) {
      this.log.error('Failed to evict transactions with insufficient fee per gas', { err });
      return {
        reason: 'insufficient_fee_per_gas',
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict txs with insufficient fee per gas', { cause: err }),
      };
    }
  }
}
