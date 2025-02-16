import { type AnyTx, Tx, type TxValidationResult, type TxValidator, hasPublicCalls } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';

export interface NullifierSource {
  nullifiersExist: (nullifiers: Buffer[]) => Promise<boolean[]>;
}

export class DoubleSpendTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_double_spend');
  #nullifierSource: NullifierSource;

  constructor(nullifierSource: NullifierSource) {
    this.#nullifierSource = nullifierSource;
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    // Don't need to check for duplicate nullifiers if the tx has public calls
    // because the AVM will perform merkle insertions as it goes and will fail on
    // duplicate nullifier. In fact we CANNOT check here because the nullifiers
    // have already been inserted, and so they will exist in nullifierSource.
    if (!hasPublicCalls(tx)) {
      const nullifiers = tx instanceof Tx ? tx.data.getNonEmptyNullifiers() : tx.txEffect.nullifiers;

      // Ditch this tx if it has repeated nullifiers
      const uniqueNullifiers = new Set(nullifiers);
      if (uniqueNullifiers.size !== nullifiers.length) {
        this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)} for emitting duplicate nullifiers`);
        return { result: 'invalid', reason: ['Duplicate nullifier in tx'] };
      }

      if ((await this.#nullifierSource.nullifiersExist(nullifiers.map(n => n.toBuffer()))).some(Boolean)) {
        this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)} for repeating a nullifier`);
        return { result: 'invalid', reason: ['Existing nullifier'] };
      }
    }
    return { result: 'valid' };
  }
}
