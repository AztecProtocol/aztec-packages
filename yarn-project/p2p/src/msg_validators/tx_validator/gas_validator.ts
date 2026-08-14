import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasFees } from '@aztec/stdlib/gas';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import {
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

import { getFeePayerClaimAmount, getTxFeeLimit } from './fee_payer_balance.js';

/** Structural interface for types that carry max fee per gas data, used by {@link MaxFeePerGasValidator}. */
export interface HasMaxFeePerGasData {
  txHash: { toString(): string };
  data: {
    constants: {
      txContext: {
        gasSettings: { maxFeesPerGas: GasFees };
      };
    };
  };
}

/**
 * Validates that a transaction's max fee per gas meets the current block's gas fees.
 *
 * Rejects transactions whose maxFeesPerGas is below the current block's gas fees
 * on either dimension (DA or L2). This is a cheap, stateless check.
 *
 * Generic over T so it can validate both full {@link Tx} objects and {@link TxMetaData}
 * (used during pending pool migration).
 *
 * Used by: pending pool migration (via factory), and indirectly by {@link GasTxValidator}.
 */
export class MaxFeePerGasValidator<T extends HasMaxFeePerGasData> implements TxValidator<T> {
  #log: Logger;
  #gasFees: GasFees;

  constructor(gasFees: GasFees, bindings?: LoggerBindings) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
    this.#gasFees = gasFees;
  }

  validateTx(tx: T): Promise<TxValidationResult> {
    return Promise.resolve(this.validateMaxFeePerGas(tx));
  }

  /** Checks maxFeesPerGas >= current block gas fees on both dimensions. */
  validateMaxFeePerGas(tx: T): TxValidationResult {
    const maxFeesPerGas = tx.data.constants.txContext.gasSettings.maxFeesPerGas;
    const notEnoughMaxFees =
      maxFeesPerGas.feePerDaGas < this.#gasFees.feePerDaGas || maxFeesPerGas.feePerL2Gas < this.#gasFees.feePerL2Gas;

    if (notEnoughMaxFees) {
      this.#log.verbose(`Rejecting transaction ${tx.txHash.toString()} due to insufficient fee per gas`, {
        txMaxFeesPerGas: maxFeesPerGas.toInspect(),
        currentGasFees: this.#gasFees.toInspect(),
      });
      return {
        result: 'invalid',
        reason: [
          `${TX_ERROR_INSUFFICIENT_FEE_PER_GAS} (maxFee=da:${maxFeesPerGas.feePerDaGas},l2:${maxFeesPerGas.feePerL2Gas} required=da:${this.#gasFees.feePerDaGas},l2:${this.#gasFees.feePerL2Gas})`,
        ],
      };
    }
    return { result: 'valid' };
  }
}

/**
 * Validates that a transaction can pay its gas fees.
 *
 * Runs two checks in order:
 * 1. **Max fee per gas** (delegates to {@link MaxFeePerGasValidator}) — rejects the tx if its
 *    maxFeesPerGas is below the current block's gas fees.
 * 2. **Fee payer balance** — reads the fee payer's FeeJuice balance from public state,
 *    adds any pending claim from a setup-phase `_increase_public_balance` call, and
 *    rejects if the total is less than the tx's fee limit (gasLimits * maxFeePerGas).
 *
 * Gas limits are deliberately not checked here: they are owned by {@link GasLimitsValidator}, which factories
 * include separately so that exemptions (e.g. gas estimation) don't change fee enforcement.
 *
 * Used by: gossip (stage 1), RPC, and block building validators.
 */
export class GasTxValidator implements TxValidator<Tx> {
  #log: Logger;
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;
  #gasFees: GasFees;

  constructor(
    publicDataSource: PublicStateSource,
    feeJuiceAddress: AztecAddress,
    gasFees: GasFees,
    private bindings?: LoggerBindings,
  ) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
    this.#gasFees = gasFees;
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const maxFeeValidation = new MaxFeePerGasValidator(this.#gasFees, this.bindings).validateMaxFeePerGas(tx);
    if (maxFeeValidation.result === 'invalid') {
      return maxFeeValidation;
    }
    return await this.validateTxFee(tx);
  }

  /**
   * Checks the fee payer has enough FeeJuice balance to cover the tx's fee limit.
   * Accounts for any pending claim from a setup-phase `_increase_public_balance` call.
   */
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
      return {
        result: 'invalid',
        reason: [`${TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE} (required=${feeLimit}, available=${balance})`],
      };
    }
    return { result: 'valid' };
  }
}
