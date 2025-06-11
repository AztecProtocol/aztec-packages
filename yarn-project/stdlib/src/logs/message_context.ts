import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';
import type { TxEffect } from '../tx/tx_effect.js';
import type { TxHash } from '../tx/tx_hash.js';

/**
 * Additional information needed to process a message. A TS version of `message_context.nr`.
 */
export class MessageContext {
  constructor(
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
    public recipient: AztecAddress,
  ) {}

  toFields(): Fr[] {
    return [
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
      this.recipient.toField(),
    ];
  }

  toNoirStruct() {
    /* eslint-disable camelcase */
    return {
      tx_hash: this.txHash.hash,
      // TODO: This ugly encoding should be unnecessary once the following PR is merged:
      // https://github.com/AztecProtocol/aztec-packages/pull/14891
      unique_note_hashes_in_tx: {
        storage: serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX).slice(0, -1),
        len: this.uniqueNoteHashesInTx.length,
      },
      first_nullifier_in_tx: this.firstNullifierInTx,
      recipient: this.recipient,
    };
    /* eslint-enable camelcase */
  }

  static fromTxEffectAndRecipient(txEffect: TxEffect, recipient: AztecAddress): MessageContext {
    return new MessageContext(txEffect.txHash, txEffect.noteHashes, txEffect.nullifiers[0], recipient);
  }
}

/**
 * Helper function to serialize a bounded vector according to Noir's BoundedVec format
 * @param values - The values to serialize
 * @param maxLength - The maximum length of the bounded vector
 * @returns The serialized bounded vector as Fr[]
 * TODO(benesjan): Copied over from pending_tagged_log.ts. Remove once we have a shared utils file.
 */
function serializeBoundedVec(values: Fr[], maxLength: number): Fr[] {
  const lengthDiff = maxLength - values.length;
  const zeroPaddingArray = Array(lengthDiff).fill(Fr.ZERO);
  const storage = values.concat(zeroPaddingArray);
  return [...storage, new Fr(values.length)];
}
