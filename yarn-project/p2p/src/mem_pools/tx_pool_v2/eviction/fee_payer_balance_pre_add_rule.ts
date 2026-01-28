import { createLogger } from '@aztec/foundation/log';

import type { TxMetaData } from '../tx_metadata.js';
import type { PreAddPoolAccess, PreAddResult, PreAddRule } from './interfaces.js';

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
export class FeePayerBalancePreAddRule implements PreAddRule {
  public readonly name = 'FeePayerBalancePreAdd';

  private log = createLogger('p2p:tx_pool_v2:fee_payer_balance_pre_add_rule');

  async check(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess): Promise<PreAddResult> {
    // Get fee payer's on-chain balance
    const initialBalance = await poolAccess.getFeePayerBalance(incomingMeta.feePayer);

    // Get existing pending txs for this fee payer
    const existingTxs = poolAccess.getFeePayerPendingTxs(incomingMeta.feePayer);

    // Create combined list with incoming tx
    const allTxs: Array<{
      txHash: string;
      priority: bigint;
      feeLimit: bigint;
      claimAmount: bigint;
      isIncoming: boolean;
    }> = [
      ...existingTxs.map(t => ({
        txHash: t.txHash,
        priority: t.priorityFee,
        feeLimit: t.feeLimit,
        claimAmount: t.claimAmount,
        isIncoming: false,
      })),
      {
        txHash: incomingMeta.txHash,
        priority: incomingMeta.priorityFee,
        feeLimit: incomingMeta.feeLimit,
        claimAmount: incomingMeta.claimAmount,
        isIncoming: true,
      },
    ];

    // Sort by priority descending (highest first), with hash as tiebreaker
    allTxs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority > b.priority ? -1 : 1;
      }
      return a.txHash >= b.txHash ? -1 : 1;
    });

    // Walk through in priority order, tracking balance
    let balance = initialBalance;
    let incomingTxCovered = false;
    const txsToEvict: string[] = [];

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
            `Ignoring tx ${incomingMeta.txHash}: fee payer ${incomingMeta.feePayer} has insufficient balance`,
            { balance: initialBalance, feeLimit: incomingMeta.feeLimit, claimAmount: incomingMeta.claimAmount },
          );
          return {
            shouldIgnore: true,
            txHashesToEvict: [],
            reason: `fee payer ${incomingMeta.feePayer} has insufficient balance`,
          };
        } else {
          // Existing tx cannot be covered after adding incoming - mark for eviction
          txsToEvict.push(txInfo.txHash);
        }
      }
    }

    if (!incomingTxCovered) {
      // This shouldn't happen if the logic above is correct, but just in case
      this.log.warn(`Incoming tx ${incomingMeta.txHash} was not covered but also not ignored - this is a bug`);
      return {
        shouldIgnore: true,
        txHashesToEvict: [],
        reason: 'internal error: tx coverage not determined',
      };
    }

    if (txsToEvict.length > 0) {
      this.log.debug(
        `Accepting tx ${incomingMeta.txHash}, evicting ${txsToEvict.length} lower-priority txs due to fee payer balance`,
      );
    }

    return {
      shouldIgnore: false,
      txHashesToEvict: txsToEvict,
    };
  }
}
