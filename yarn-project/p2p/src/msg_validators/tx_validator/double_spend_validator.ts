import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import {
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_EXISTING_NULLIFIER,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export interface NullifierSource {
  nullifiersExist: (nullifiers: Buffer[]) => Promise<boolean[]>;
}

/** Structural interface for double-spend validation. */
export interface HasNullifierData {
  txHash: { toString(): string };
  data: { getNonEmptyNullifiers(): Fr[] };
}

export class DoubleSpendTxValidator<T extends HasNullifierData> implements TxValidator<T> {
  #log: Logger;
  #nullifierSource: NullifierSource;

  constructor(nullifierSource: NullifierSource, bindings?: LoggerBindings) {
    this.#nullifierSource = nullifierSource;
    this.#log = createLogger('p2p:tx_validator:tx_double_spend', bindings);
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const nullifiers = tx.data.getNonEmptyNullifiers();

    // Ditch this tx if it has repeated nullifiers
    const uniqueNullifiers = new Set(nullifiers.map(n => n.toBigInt()));
    if (uniqueNullifiers.size !== nullifiers.length) {
      this.#log.verbose(`Rejecting tx ${tx.txHash} for emitting duplicate nullifiers`);
      return { result: 'invalid', reason: [TX_ERROR_DUPLICATE_NULLIFIER_IN_TX] };
    }

    if ((await this.#nullifierSource.nullifiersExist(nullifiers.map(n => n.toBuffer()))).some(Boolean)) {
      this.#log.verbose(`Rejecting tx ${tx.txHash} for repeating a nullifier`);
      return { result: 'invalid', reason: [TX_ERROR_EXISTING_NULLIFIER] };
    }

    return { result: 'valid' };
  }
}
