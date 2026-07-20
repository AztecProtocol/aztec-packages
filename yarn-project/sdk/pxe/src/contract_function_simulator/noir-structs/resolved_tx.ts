import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TxHash } from '@aztec/stdlib/tx';

/**
 * The resolved on-chain context of a transaction.
 *
 * Carries the note hashes and first nullifier needed to discover notes that originated from the transaction, plus the
 * number and hash of the block in which it was mined.
 *
 * A TS version of the `ResolvedTx` struct in `oracle/tx_resolution.nr`.
 */
export class ResolvedTx {
  constructor(
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
    public blockNumber: number,
    public blockHash: Fr,
  ) {}

  toFields(): Fr[] {
    return [
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
      new Fr(this.blockNumber),
      this.blockHash,
    ];
  }

  static empty(): ResolvedTx {
    return new ResolvedTx(TxHash.zero(), [], Fr.ZERO, 0, Fr.ZERO);
  }
}

/**
 * Helper function to serialize a bounded vector according to Noir's BoundedVec format: the storage array padded to
 * `maxLength`, followed by the actual length.
 * @param values - The values to serialize
 * @param maxLength - The maximum length of the bounded vector
 * @returns The serialized bounded vector as Fr[]
 */
function serializeBoundedVec(values: Fr[], maxLength: number): Fr[] {
  const storage = padArrayEnd(
    values,
    Fr.ZERO,
    maxLength,
    `Attempted to serialize ${values} values into a BoundedVec with max length ${maxLength}`,
  );
  return [...storage, new Fr(values.length)];
}
