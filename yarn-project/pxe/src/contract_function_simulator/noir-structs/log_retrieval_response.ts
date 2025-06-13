import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN, PUBLIC_LOG_PLAINTEXT_LEN } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import type { TxHash } from '@aztec/stdlib/tx';

const MAX_LOG_CONTENT_LEN = Math.max(PUBLIC_LOG_PLAINTEXT_LEN, PRIVATE_LOG_CIPHERTEXT_LEN);

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `bulkRetrieveLogs` oracle stores values of this
 * type in a `CapsuleArray`.
 */
export class LogRetrievalResponse {
  constructor(
    public logPayload: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toFields(): Fr[] {
    return [
      ...serializeBoundedVec(this.logPayload, MAX_LOG_CONTENT_LEN),
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static toEmptyFields(): Fr[] {
    const serializationLen =
      MAX_LOG_CONTENT_LEN +
      1 /* logPayload BVec */ +
      1 /* txHash */ +
      MAX_NOTE_HASHES_PER_TX +
      1 /* uniqueNoteHashesInTx BVec */ +
      1; /* firstNullifierInTx */
    return range(serializationLen).map(_ => Fr.zero());
  }

  static toSerializedOption(response?: LogRetrievalResponse): Fr[] {
    if (response) {
      return [new Fr(1), ...response.toFields()];
    } else {
      return [new Fr(0), ...this.toEmptyFields()];
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
  const lengthDiff = maxLength - values.length;
  const zeroPaddingArray = Array(lengthDiff).fill(Fr.ZERO);
  const storage = values.concat(zeroPaddingArray);
  return [...storage, new Fr(values.length)];
}
