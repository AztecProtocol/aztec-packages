import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';

import { TxHash } from '../tx/tx_hash.js';

/**
 * Additional information needed to process a message.
 *
 * All messages exist in the context of a transaction, and information about that transaction is typically required
 * in order to perform validation, store results, etc. For example, messages containing notes require knowledge of note
 * hashes and the first nullifier in order to find the note's nonce.
 *
 * A TS version of `message_context.nr`.
 */
export class MessageContext {
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

  toNoirStruct() {
    /* eslint-disable camelcase */
    return {
      tx_hash: this.txHash.hash,
      unique_note_hashes_in_tx: this.uniqueNoteHashesInTx,
      first_nullifier_in_tx: this.firstNullifierInTx,
    };
    /* eslint-enable camelcase */
  }

  static empty(): MessageContext {
    return new MessageContext(TxHash.zero(), [], Fr.ZERO);
  }

  static toEmptyFields(): Fr[] {
    const serializationLen =
      1 /* txHash */ + MAX_NOTE_HASHES_PER_TX + 1 /* uniqueNoteHashesInTx BVec */ + 1; /* firstNullifierInTx */
    return range(serializationLen).map(_ => Fr.zero());
  }

  static toSerializedOption(response: MessageContext | null): Fr[] {
    if (response) {
      return [new Fr(1), ...response.toFields()];
    } else {
      return [new Fr(0), ...MessageContext.toEmptyFields()];
    }
  }
}

/**
 * Helper function to serialize a bounded vector according to Noir's BoundedVec format
 * @param values - The values to serialize
 * @param maxLength - The maximum length of the bounded vector
 * @returns The serialized bounded vector as Fr[]
 * @dev Copied over from pending_tagged_log.ts.
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
