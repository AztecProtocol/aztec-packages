import {
  MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
  MAX_PROCESSABLE_L2_GAS,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
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

/** Structural interface for types that carry gas limit data, used by {@link GasLimitsValidator}. */
export interface HasGasLimitData {
  txHash: { toString(): string };
  data: {
    // We just need to know whether there is something here or not
    forPublic?: unknown;
    constants: {
      txContext: {
        gasSettings: { gasLimits: Gas };
      };
    };
  };
}

/**
 * Validates that a transaction's gas limits are within acceptable bounds.
 *
 * Rejects transactions whose gas limits fall below the fixed minimums (FIXED_DA_GAS,
 * FIXED_L2_GAS) or exceed the AVM's maximum processable L2 gas. This is a cheap,
 * stateless check that operates on gas settings alone.
 *
 * Generic over T so it can validate both full {@link Tx} objects and {@link TxMetaData}
 * (used during pending pool migration).
 *
 * Used by: pending pool migration (via factory), and indirectly by {@link GasTxValidator}.
 */
export class GasLimitsValidator<T extends HasGasLimitData> implements TxValidator<T> {
  #log: Logger;
  #effectiveMaxL2Gas: number;
  #effectiveMaxDAGas: number;
  #rollupManaLimit: number;
  #maxBlockL2Gas: number;
  #maxBlockDAGas: number;

  constructor(opts?: {
    rollupManaLimit?: number;
    maxBlockL2Gas?: number;
    maxBlockDAGas?: number;
    bindings?: LoggerBindings;
  }) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', opts?.bindings);
    this.#rollupManaLimit = opts?.rollupManaLimit ?? Infinity;
    this.#maxBlockL2Gas = opts?.maxBlockL2Gas ?? Infinity;
    this.#maxBlockDAGas = opts?.maxBlockDAGas ?? Infinity;
    this.#effectiveMaxL2Gas = Math.min(MAX_PROCESSABLE_L2_GAS, this.#rollupManaLimit, this.#maxBlockL2Gas);
    this.#effectiveMaxDAGas = Math.min(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, this.#maxBlockDAGas);
  }

  validateTx(tx: T): Promise<TxValidationResult> {
    return Promise.resolve(this.validateGasLimit(tx));
  }

  /** Checks gas limits are >= fixed minimums and <= effective max gas (L2 and DA). */
  validateGasLimit(tx: T): TxValidationResult {
    const gasLimits = tx.data.constants.txContext.gasSettings.gasLimits;
    const minGasLimits = new Gas(
      TX_DA_GAS_OVERHEAD,
      tx.data.forPublic ? PUBLIC_TX_L2_GAS_OVERHEAD : PRIVATE_TX_L2_GAS_OVERHEAD,
    );

    if (minGasLimits.gtAny(gasLimits)) {
      this.#log.verbose(`Rejecting transaction due to the gas limit(s) not being above the minimum gas limit`, {
        gasLimits,
        minGasLimits,
      });
      return { result: 'invalid', reason: [TX_ERROR_INSUFFICIENT_GAS_LIMIT] };
    }

    if (gasLimits.l2Gas > this.#effectiveMaxL2Gas) {
      this.#log.verbose(`Rejecting transaction due to the L2 gas limit being higher than the effective maximum`, {
        gasLimits,
        effectiveMaxL2Gas: this.#effectiveMaxL2Gas,
        rollupManaLimit: this.#rollupManaLimit,
        maxBlockL2Gas: this.#maxBlockL2Gas,
      });
      return { result: 'invalid', reason: [TX_ERROR_GAS_LIMIT_TOO_HIGH] };
    }

    if (gasLimits.daGas > this.#effectiveMaxDAGas) {
      this.#log.verbose(`Rejecting transaction due to the DA gas limit being higher than the effective maximum`, {
        gasLimits,
        effectiveMaxDAGas: this.#effectiveMaxDAGas,
        maxBlockDAGas: this.#maxBlockDAGas,
      });
      return { result: 'invalid', reason: [TX_ERROR_GAS_LIMIT_TOO_HIGH] };
    }

    return { result: 'valid' };
  }
}

/**
 * Validates that a transaction can pay its gas fees.
 *
 * Runs three checks in order:
 * 1. **Gas limits** (delegates to {@link GasLimitsValidator}) — rejects if limits are
 *    out of bounds.
 * 2. **Max fee per gas** — skips (not rejects) the tx if its maxFeesPerGas is below
 *    the current block's gas fees. We skip rather than reject because the tx may
 *    become eligible in a later block with lower fees.
 * 3. **Fee payer balance** — reads the fee payer's FeeJuice balance from public state,
 *    adds any pending claim from a setup-phase `_increase_public_balance` call, and
 *    rejects if the total is less than the tx's fee limit (gasLimits * maxFeePerGas).
 *
 * Used by: gossip (stage 1), RPC, and block building validators.
 */
export class GasTxValidator implements TxValidator<Tx> {
  #log: Logger;
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;
  #gasFees: GasFees;
  #gasLimitOpts?: { rollupManaLimit?: number; maxBlockL2Gas?: number; maxBlockDAGas?: number };

  constructor(
    publicDataSource: PublicStateSource,
    feeJuiceAddress: AztecAddress,
    gasFees: GasFees,
    private bindings?: LoggerBindings,
    opts?: { rollupManaLimit?: number; maxBlockL2Gas?: number; maxBlockDAGas?: number },
  ) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
    this.#gasFees = gasFees;
    this.#gasLimitOpts = opts;
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const gasLimitValidation = new GasLimitsValidator({
      ...this.#gasLimitOpts,
      bindings: this.bindings,
    }).validateGasLimit(tx);
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
      return { result: 'invalid', reason: [TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE] };
    }
    return { result: 'valid' };
  }
}
