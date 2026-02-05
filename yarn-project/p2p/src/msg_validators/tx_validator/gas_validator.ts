import { AVM_MAX_PROCESSABLE_L2_GAS, FIXED_DA_GAS, FIXED_L2_GAS } from '@aztec/constants';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import {
  TX_ERROR_GAS_LIMIT_TOO_HIGH,
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  TX_ERROR_INSUFFICIENT_GAS_LIMIT,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

import { getFeePayerClaimAmount, getTxFeeLimit } from './fee_payer_balance.js';

export class GasTxValidator implements TxValidator<Tx> {
  #log: Logger;
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;
  #gasFees: GasFees;

  constructor(
    publicDataSource: PublicStateSource,
    feeJuiceAddress: AztecAddress,
    gasFees: GasFees,
    bindings?: LoggerBindings,
  ) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
    this.#gasFees = gasFees;
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const gasLimitValidation = this.#validateGasLimit(tx);
    if (gasLimitValidation.result === 'invalid') {
      return Promise.resolve(gasLimitValidation);
    }
    if (this.#shouldSkip(tx)) {
      return Promise.resolve({ result: 'skipped', reason: [TX_ERROR_INSUFFICIENT_FEE_PER_GAS] });
    }
    return await this.validateTxFee(tx);
  }

  /**
   * Check whether the tx's max fees are valid for the current block, and skip if not.
   * We skip instead of invalidating since the tx may become eligible later.
   * Note that circuits check max fees even if fee payer is unset, so we
   * keep this validation even if the tx does not pay fees.
   */
  #shouldSkip(tx: Tx): boolean {
    const gasSettings = tx.data.constants.txContext.gasSettings;

    // Skip the tx if its max fees are not enough for the current block's gas fees.
    const maxFeesPerGas = gasSettings.maxFeesPerGas;
    const notEnoughMaxFees =
      maxFeesPerGas.feePerDaGas < this.#gasFees.feePerDaGas || maxFeesPerGas.feePerL2Gas < this.#gasFees.feePerL2Gas;

    if (notEnoughMaxFees) {
      this.#log.verbose(`Skipping transaction ${tx.getTxHash().toString()} due to insufficient fee per gas`, {
        txMaxFeesPerGas: maxFeesPerGas.toInspect(),
        currentGasFees: this.#gasFees.toInspect(),
      });
    }
    return notEnoughMaxFees;
  }

  /**
   * Check whether the tx's gas limit is above the minimum amount.
   */
  #validateGasLimit(tx: Tx): TxValidationResult {
    const gasLimits = tx.data.constants.txContext.gasSettings.gasLimits;
    const minGasLimits = new Gas(FIXED_DA_GAS, FIXED_L2_GAS);

    if (minGasLimits.gtAny(gasLimits)) {
      this.#log.verbose(`Rejecting transaction due to the gas limit(s) not being above the minimum gas limit`, {
        gasLimits,
        minGasLimits,
      });
      return { result: 'invalid', reason: [TX_ERROR_INSUFFICIENT_GAS_LIMIT] };
    }

    if (gasLimits.l2Gas > AVM_MAX_PROCESSABLE_L2_GAS) {
      this.#log.verbose(`Rejecting transaction due to the gas limit(s) being higher than the maximum processable gas`, {
        gasLimits,
        minGasLimits,
      });
      return { result: 'invalid', reason: [TX_ERROR_GAS_LIMIT_TOO_HIGH] };
    }

    return { result: 'valid' };
  }

  public async validateTxFee(tx: Tx): Promise<TxValidationResult> {
    const feePayer = tx.data.feePayer;

    // Compute the maximum fee that this tx may pay, based on its gasLimits and maxFeePerGas
    const feeLimit = getTxFeeLimit(tx);

    // Read current balance of the feePayer
    const initialBalance = await this.#publicDataSource.storageRead(
      this.#feeJuiceAddress,
      await computeFeePayerBalanceStorageSlot(feePayer),
    );

    // If there is a claim in this tx that increases the fee payer balance in Fee Juice, add it to balance
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
