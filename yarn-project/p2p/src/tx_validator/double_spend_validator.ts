import { type AnyTx, Tx, type TxValidator } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';

export interface NullifierSource {
  getNullifierIndices: (nullifiers: Buffer[]) => Promise<bigint[]>;
}

export class DoubleSpendTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_double_spend');
  #nullifierSource: NullifierSource;

  constructor(nullifierSource: NullifierSource, private readonly isValidatingBlock: boolean = true) {
    this.#nullifierSource = nullifierSource;
  }

  async validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[]]> {
    const validTxs: T[] = [];
    const invalidTxs: T[] = [];
    const thisBlockNullifiers = new Set<bigint>();

    for (const tx of txs) {
      if (!(await this.#uniqueNullifiers(tx, thisBlockNullifiers))) {
        invalidTxs.push(tx);
        continue;
      }

      validTxs.push(tx);
    }

    return [validTxs, invalidTxs];
  }

  validateTx(tx: T): Promise<boolean> {
    return this.#uniqueNullifiers(tx, new Set<bigint>());
  }

  async #uniqueNullifiers(tx: AnyTx, thisBlockNullifiers: Set<bigint>): Promise<boolean> {
    const nullifiers = (tx instanceof Tx ? tx.data.getNonEmptyNullifiers() : tx.txEffect.nullifiers);

    // Ditch this tx if it has repeated nullifiers
    const uniqueNullifiers = new Set(nullifiers);
    if (uniqueNullifiers.size !== nullifiers.length) {
      this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for emitting duplicate nullifiers`);
      return false;
    }

    if (this.isValidatingBlock) {
      // TODO: remove all this type casting
      for (const nullifier of nullifiers.map(n => n.toBigInt())) {
        if (thisBlockNullifiers.has(nullifier)) {
          this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for repeating a nullifier in the same block`);
          return false;
        }

        thisBlockNullifiers.add(nullifier);
      }
    }

    const nullifierIndexes = await this.#nullifierSource.getNullifierIndices(nullifiers.map(n => n.toBuffer()));

    const hasDuplicates = nullifierIndexes.some(index => index !== undefined);
    if (hasDuplicates) {
      this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for repeating nullifiers present in state trees`);
      return false;
    }

    return true;
  }
}
