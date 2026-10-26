import {
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Gas } from '@aztec/stdlib/gas';
import {
  TX_ERROR_GAS_LIMIT_TOO_HIGH,
  TX_ERROR_INSUFFICIENT_GAS_LIMIT,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

/**
 * Structural interface for types that carry gas limit data, used by {@link MinGasLimitsValidator} and
 * {@link MaxGasLimitsValidator}.
 */
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
 * Validates that a transaction declares at least the gas it is guaranteed to be charged.
 *
 * Rejects transactions whose gas limits fall below the fixed protocol overheads
 * ({@link TX_DA_GAS_OVERHEAD} and {@link PRIVATE_TX_L2_GAS_OVERHEAD} / {@link PUBLIC_TX_L2_GAS_OVERHEAD}).
 * This is a cheap, stateless check that operates on gas settings alone.
 *
 * The floor is a protocol property with no exemptions: a tx below it can never be mined, so every entry
 * point applies it, including gas estimation.
 *
 * Generic over T so it can validate both full {@link Tx} objects and {@link TxMetaData}
 * (used during pending pool migration).
 */
export class MinGasLimitsValidator<T extends HasGasLimitData> implements TxValidator<T> {
  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
  }

  validateTx(tx: T): Promise<TxValidationResult> {
    return Promise.resolve(this.validateGasLimit(tx));
  }

  /** Checks gas limits are >= the fixed protocol overheads (L2 and DA). */
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

    return { result: 'valid' };
  }
}

/**
 * Validates that a transaction does not declare more gas than it is allowed to.
 *
 * Rejects transactions whose gas limits exceed the per-tx protocol maxima, optionally tightened to the
 * network admission limits. This is a cheap, stateless check that operates on gas settings alone.
 *
 * Unlike the floor, the ceiling is exempted on the gas estimation path, where limits are deliberately
 * inflated past what the protocol allows (see {@link GasSettings.forEstimation}).
 *
 * Generic over T so it can validate both full {@link Tx} objects and {@link TxMetaData}
 * (used during pending pool migration).
 */
export class MaxGasLimitsValidator<T extends HasGasLimitData> implements TxValidator<T> {
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

  /** Checks gas limits are <= the effective max gas (L2 and DA). */
  validateGasLimit(tx: T): TxValidationResult {
    const gasLimits = tx.data.constants.txContext.gasSettings.gasLimits;

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
