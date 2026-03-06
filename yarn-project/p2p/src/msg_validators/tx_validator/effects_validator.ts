import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import {
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

/**
 * Validates the effects (side effects) of a transaction. These checks depend only
 * on the tx itself and not on the state of the chain or any node-specific configuration.
 *
 * Checks for duplicate nullifiers within a single tx. For public txs, only
 * non-revertible nullifiers are checked because revertible nullifiers may
 * legitimately collide (the revert handling will take care of it). For private
 * txs, all nullifiers are checked.
 */
export class EffectsTxValidator implements TxValidator<Tx> {
  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('p2p:tx_validator:tx_effects', bindings);
  }

  validateTx(tx: Tx): Promise<TxValidationResult> {
    const reason = this.#hasNoDuplicateNullifiers(tx);
    return Promise.resolve(reason ? { result: 'invalid', reason: [reason] } : { result: 'valid' });
  }

  /** Rejects txs with repeated nullifiers within the same transaction. */
  #hasNoDuplicateNullifiers(tx: Tx): string | undefined {
    const nullifiers = tx.data.forPublic
      ? tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero())
      : tx.data.getNonEmptyNullifiers();

    const unique = new Set(nullifiers.map(n => n.toBigInt()));
    if (unique.size !== nullifiers.length) {
      this.#log.verbose(`Rejecting tx ${tx.getTxHash().toString()} for emitting duplicate nullifiers`);
      return TX_ERROR_DUPLICATE_NULLIFIER_IN_TX;
    }
    return undefined;
  }
}
