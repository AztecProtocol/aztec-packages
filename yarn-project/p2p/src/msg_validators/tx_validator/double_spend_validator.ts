import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_EXISTING_NULLIFIER,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

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
    const nullifiers = tx instanceof Tx ? tx.data.getNonEmptyNullifiers() : tx.txEffect.nullifiers;

    // Ditch this tx if it has repeated nullifiers
    const uniqueNullifiers = new Set(nullifiers.map(n => n.toBigInt()));
    if (uniqueNullifiers.size !== nullifiers.length) {
      this.#log.verbose(`Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} for emitting duplicate nullifiers`);
      return { result: 'invalid', reason: [TX_ERROR_DUPLICATE_NULLIFIER_IN_TX] };
    }

    if ((await this.#nullifierSource.nullifiersExist(nullifiers.map(n => n.toBuffer()))).some(Boolean)) {
      this.#log.verbose(`Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} for repeating a nullifier`);
      return { result: 'invalid', reason: [TX_ERROR_EXISTING_NULLIFIER] };
    }

    return { result: 'valid' };
  }
}
