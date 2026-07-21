import {
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
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

  /**
   * @param maxTxL2Gas - The network admission limit on L2 gas a single tx may declare (the per-block mana
   * allocation, see {@link computeNetworkTxGasLimits}). Defaults to the per-tx protocol maximum, so callers
   * that pass nothing (e.g. block building) enforce only the protocol ceiling.
   * @param maxTxDAGas - The network admission limit on DA gas a single tx may declare. Defaults to the
   * per-tx protocol maximum {@link MAX_TX_DA_GAS}.
   */
  constructor(opts?: { maxTxL2Gas?: number; maxTxDAGas?: number; bindings?: LoggerBindings }) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', opts?.bindings);
    // The passed limits are network admission limits; clamp to the per-tx protocol maxima as a hard ceiling.
    // MAX_TX_DA_GAS bounds DA by what a single tx can actually post to a blob; declaring more is meaningless
    // and would let a tx reserve checkpoint/block DA budget during proposal building it can't use.
    this.#effectiveMaxL2Gas = Math.min(MAX_PROCESSABLE_L2_GAS, opts?.maxTxL2Gas ?? Infinity);
    this.#effectiveMaxDAGas = Math.min(MAX_TX_DA_GAS, opts?.maxTxDAGas ?? Infinity);
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
      return {
        result: 'invalid',
        reason: [
          `${TX_ERROR_INSUFFICIENT_GAS_LIMIT} (required=da:${minGasLimits.daGas},l2:${minGasLimits.l2Gas} got=da:${gasLimits.daGas},l2:${gasLimits.l2Gas})`,
        ],
      };
    }

    if (gasLimits.l2Gas > this.#effectiveMaxL2Gas) {
      this.#log.verbose(`Rejecting transaction due to the L2 gas limit being higher than the effective maximum`, {
        gasLimits,
        effectiveMaxL2Gas: this.#effectiveMaxL2Gas,
      });
      return {
        result: 'invalid',
        reason: [`${TX_ERROR_GAS_LIMIT_TOO_HIGH} (l2Gas=${gasLimits.l2Gas}, max=${this.#effectiveMaxL2Gas})`],
      };
    }

    if (gasLimits.daGas > this.#effectiveMaxDAGas) {
      this.#log.verbose(`Rejecting transaction due to the DA gas limit being higher than the effective maximum`, {
        gasLimits,
        effectiveMaxDAGas: this.#effectiveMaxDAGas,
      });
      return {
        result: 'invalid',
        reason: [`${TX_ERROR_GAS_LIMIT_TOO_HIGH} (daGas=${gasLimits.daGas}, max=${this.#effectiveMaxDAGas})`],
      };
    }

    return { result: 'valid' };
  }
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
 * Runs three checks in order:
 * 1. **Gas limits** (delegates to {@link GasLimitsValidator}) — rejects if limits are
 *    out of bounds.
 * 2. **Max fee per gas** — rejects the tx if its maxFeesPerGas is below
 *    the current block's gas fees.
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
  #gasLimitOpts?: { maxTxL2Gas?: number; maxTxDAGas?: number };

  constructor(
    publicDataSource: PublicStateSource,
    feeJuiceAddress: AztecAddress,
    gasFees: GasFees,
    private bindings?: LoggerBindings,
    opts?: { maxTxL2Gas?: number; maxTxDAGas?: number },
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
      return gasLimitValidation;
    }
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
