import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

const MAX_LOG_CONTENT_LEN = PRIVATE_LOG_CIPHERTEXT_LEN;

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `bulkRetrieveLogs` oracle stores values of
 * this type in per-request CapsuleArrays.
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
      // We need to trim the payload since public logs can be larger than MAX_LOG_CONTENT_LEN.
      // This is currently not a problem since this class is only used with public logs for note completion.
      ...serializeBoundedVec(this.logPayload.slice(0, MAX_LOG_CONTENT_LEN), MAX_LOG_CONTENT_LEN),
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
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
