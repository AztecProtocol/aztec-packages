import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';

import { TxHash } from '../tx/tx_hash.js';

/**
 * The resolved on-chain context of a transaction, looked up by its hash.
 *
 * Carries the note hashes and first nullifier needed to discover notes that originated from the transaction, plus the
 * number and hash of the block in which it was mined. The block fields let callers anchor block-sensitive state (e.g.
 * offchain message processing records the resolving block so a reorg of that block can retract the result).
 *
 * A TS version of `resolved_tx.nr`.
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

  toNoirStruct() {
    /* eslint-disable camelcase */
    return {
      tx_hash: this.txHash.hash,
      unique_note_hashes_in_tx: this.uniqueNoteHashesInTx,
      first_nullifier_in_tx: this.firstNullifierInTx,
      block_number: this.blockNumber,
      block_hash: this.blockHash,
    };
    /* eslint-enable camelcase */
  }

  static empty(): ResolvedTx {
    return new ResolvedTx(TxHash.zero(), [], Fr.ZERO, 0, Fr.ZERO);
  }

  static toEmptyFields(): Fr[] {
    const serializationLen =
      1 /* txHash */ +
      MAX_NOTE_HASHES_PER_TX +
      1 /* uniqueNoteHashesInTx BVec */ +
      1 /* firstNullifierInTx */ +
      1 /* blockNumber */ +
      1; /* blockHash */
    return range(serializationLen).map(_ => Fr.zero());
  }

  static toSerializedOption(resolved: ResolvedTx | null): Fr[] {
    if (resolved) {
      return [new Fr(1), ...resolved.toFields()];
    } else {
      return [new Fr(0), ...ResolvedTx.toEmptyFields()];
    }
  }
}

/**
 * Helper function to serialize a bounded vector according to Noir's BoundedVec format
 * @param values - The values to serialize
 * @param maxLength - The maximum length of the bounded vector
 * @returns The serialized bounded vector as Fr[]
 * @dev Copied over from message_context.ts.
 */
function serializeBoundedVec(values: Fr[], maxLength: number): Fr[] {
  if (values.length > maxLength) {
    throw new Error(`Attempted to serialize ${values} values into a BoundedVec with max length ${maxLength}`);
  }

  const lengthDiff = maxLength - values.length;
  const zeroPaddingArray = Array(lengthDiff).fill(Fr.ZERO);
  const storage = values.concat(zeroPaddingArray);
  return [...storage, new Fr(values.length)];
}
