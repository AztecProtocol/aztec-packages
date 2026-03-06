import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { TX_ERROR_EXISTING_NULLIFIER, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export interface NullifierSource {
  nullifiersExist: (nullifiers: Buffer[]) => Promise<boolean[]>;
}

/** Structural interface for double-spend validation. */
export interface HasNullifierData {
  txHash: { toString(): string };
  data: { getNonEmptyNullifiers(): Fr[] };
}

/** Checks that a transaction's nullifiers do not already exist in the nullifier tree. */
export class DoubleSpendTxValidator<T extends HasNullifierData> implements TxValidator<T> {
  #log: Logger;
  #nullifierSource: NullifierSource;

  constructor(nullifierSource: NullifierSource, bindings?: LoggerBindings) {
    this.#nullifierSource = nullifierSource;
    this.#log = createLogger('p2p:tx_validator:tx_double_spend', bindings);
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const nullifiers = tx.data.getNonEmptyNullifiers();

    if ((await this.#nullifierSource.nullifiersExist(nullifiers.map(n => n.toBuffer()))).some(Boolean)) {
      this.#log.verbose(`Rejecting tx ${tx.txHash} for repeating a nullifier`);
      return { result: 'invalid', reason: [TX_ERROR_EXISTING_NULLIFIER] };
    }

    return { result: 'valid' };
  }
}
