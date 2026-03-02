import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Intermediate struct used to return resolved message contexts from PXE. The
 * `utilityResolveMessageContexts` oracle stores values of this type in a CapsuleArray.
 */
export class MessageTxContext {
  constructor(
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toFields(): Fr[] {
    return [
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static toEmptyFields(): Fr[] {
    const serializationLen =
      1 /* txHash */ + MAX_NOTE_HASHES_PER_TX + 1 /* uniqueNoteHashesInTx BVec */ + 1; /* firstNullifierInTx */
    return range(serializationLen).map(_ => Fr.zero());
  }

  static toSerializedOption(response: MessageTxContext | null): Fr[] {
    if (response) {
      return [new Fr(1), ...response.toFields()];
    } else {
      return [new Fr(0), ...MessageTxContext.toEmptyFields()];
    }
  }
}

/**
 * Helper function to serialize a bounded vector according to Noir's BoundedVec format
 * @param values - The values to serialize
 * @param maxLength - The maximum length of the bounded vector
 * @returns The serialized bounded vector as Fr[]
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
