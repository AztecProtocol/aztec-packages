import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import { getFeePayerBalanceDelta } from '../../../msg_validators/tx_validator/fee_payer_balance.js';
import { getTxPriorityFee } from '../priority.js';
import {
  type FeePayerTxInfo,
  type PreAddEvictionResult,
  type PreAddEvictionRule,
  type PreAddPoolAccess,
} from './eviction_strategy.js';

/**
 * Pre-add rule that checks if a fee payer has sufficient balance to cover the incoming transaction.
 *
 * When an incoming tx is added:
 * - Get the fee payer's on-chain balance
 * - Get all existing pending txs for this fee payer
 * - Insert incoming tx in priority order
 * - Walk through in priority order, tracking running balance
 * - If incoming tx can be covered: accept, mark lower-priority txs for eviction if needed
 * - If incoming tx cannot be covered: ignore it
 */
export class FeePayerBalancePreAddRule implements PreAddEvictionRule {
  public readonly name = 'FeePayerBalancePreAdd';

  private log = createLogger('p2p:mempool:tx_pool:fee_payer_balance_pre_add_rule');

  async check(tx: Tx, poolAccess: PreAddPoolAccess): Promise<PreAddEvictionResult> {
    // Skip if pool access doesn't support fee payer balance methods
    if (!poolAccess.getFeePayerBalance || !poolAccess.getFeePayerPendingTxs) {
      return { shouldIgnore: false, txHashesToEvict: [] };
    }

    const feePayer = tx.data.feePayer;
    const incomingTxHash = tx.getTxHash();

    // Get fee-related info for the incoming tx
    const { feeLimit, claimAmount } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);
    const incomingPriority = getTxPriorityFee(tx);

    // Get fee payer's on-chain balance
    const initialBalance = await poolAccess.getFeePayerBalance(feePayer);

    // Get existing pending txs for this fee payer
    const existingTxs = await poolAccess.getFeePayerPendingTxs(feePayer);

    // Create combined list with incoming tx
    const allTxs: Array<{
      txHash: TxHash;
      priority: bigint;
      feeLimit: bigint;
      claimAmount: bigint;
      isIncoming: boolean;
    }> = [
      ...existingTxs.map(t => ({ ...t, isIncoming: false })),
      { txHash: incomingTxHash, priority: incomingPriority, feeLimit, claimAmount, isIncoming: true },
    ];

    // Sort by priority descending (highest first), with hash as tiebreaker
    allTxs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority > b.priority ? -1 : 1;
      }
      return a.txHash.toBigInt() >= b.txHash.toBigInt() ? -1 : 1;
    });

    // Walk through in priority order, tracking balance
    let balance = initialBalance;
    let incomingTxCovered = false;
    const txsToEvict: TxHash[] = [];

    for (const txInfo of allTxs) {
      const available = balance + txInfo.claimAmount;

      if (available >= txInfo.feeLimit) {
        // This tx can be covered
        balance = available - txInfo.feeLimit;
        if (txInfo.isIncoming) {
          incomingTxCovered = true;
        }
      } else {
        // This tx cannot be covered
        if (txInfo.isIncoming) {
          // Incoming tx cannot be covered - ignore it
          this.log.debug(
            `Ignoring tx ${incomingTxHash.toString()}: fee payer ${feePayer.toString()} has insufficient balance`,
            { balance: initialBalance, feeLimit, claimAmount },
          );
          return {
            shouldIgnore: true,
            txHashesToEvict: [],
            reason: `fee payer ${feePayer.toString()} has insufficient balance`,
          };
        } else {
          // Existing tx cannot be covered after adding incoming - mark for eviction
          txsToEvict.push(txInfo.txHash);
        }
      }
    }

    if (!incomingTxCovered) {
      // This shouldn't happen if the logic above is correct, but just in case
      this.log.warn(`Incoming tx ${incomingTxHash.toString()} was not covered but also not ignored - this is a bug`);
      return {
        shouldIgnore: true,
        txHashesToEvict: [],
        reason: 'internal error: tx coverage not determined',
      };
    }

    if (txsToEvict.length > 0) {
      this.log.debug(
        `Accepting tx ${incomingTxHash.toString()}, evicting ${txsToEvict.length} lower-priority txs due to fee payer balance`,
      );
    }

    return {
      shouldIgnore: false,
      txHashesToEvict: txsToEvict,
    };
  }
}
