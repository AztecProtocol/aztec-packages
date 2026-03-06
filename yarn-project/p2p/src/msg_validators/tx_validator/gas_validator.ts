import {
  MAX_PROCESSABLE_L2_GAS,
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
 * Used by: gossip (stage 1), RPC, block building, and pending pool migration validators.
 */
export class GasLimitsValidator<T extends HasGasLimitData> implements TxValidator<T> {
  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('sequencer:tx_validator:tx_gas', bindings);
  }

  validateTx(tx: T): Promise<TxValidationResult> {
    return Promise.resolve(this.validateGasLimit(tx));
  }

  /** Checks gas limits are >= fixed minimums and <= AVM max processable L2 gas. */
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

    if (gasLimits.l2Gas > MAX_PROCESSABLE_L2_GAS) {
      this.#log.verbose(`Rejecting transaction due to the gas limit(s) being higher than the maximum processable gas`, {
        gasLimits,
        minGasLimits,
      });
      return { result: 'invalid', reason: [TX_ERROR_GAS_LIMIT_TOO_HIGH] };
    }

    return { result: 'valid' };
  }
}
