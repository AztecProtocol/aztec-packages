import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import {
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

import { getFeePayerClaimAmount, getTxFeeLimit } from './fee_payer_balance.js';

/**
 * Validates that a transaction's fee payer has sufficient FeeJuice balance.
 *
 * Reads the fee payer's FeeJuice balance from public state, adds any pending
 * claim from a setup-phase `_increase_public_balance` call, and rejects if the
 * total is less than the tx's fee limit (gasLimits * maxFeePerGas).
 *
 * Used by: gossip (stage 1), RPC, and block building validators.
 */
export class FeePayerBalanceValidator implements TxValidator<Tx> {
  #log: Logger;
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;

  constructor(publicDataSource: PublicStateSource, feeJuiceAddress: AztecAddress, bindings?: LoggerBindings) {
    this.#log = createLogger('sequencer:tx_validator:fee_payer_balance', bindings);
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const feePayer = tx.data.feePayer;
    const feeLimit = getTxFeeLimit(tx);

    const initialBalance = await this.#publicDataSource.storageRead(
      this.#feeJuiceAddress,
      await computeFeePayerBalanceStorageSlot(feePayer),
    );

    const claimAmount = await getFeePayerClaimAmount(tx, this.#feeJuiceAddress);
    const balance = initialBalance.toBigInt() + claimAmount;

    if (balance < feeLimit) {
      this.#log.verbose(`Rejecting transaction due to not enough fee payer balance`, {
        feePayer,
        balance,
        feeLimit,
      });
      return { result: 'invalid', reason: [TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE] };
    }
    return { result: 'valid' };
  }
}
