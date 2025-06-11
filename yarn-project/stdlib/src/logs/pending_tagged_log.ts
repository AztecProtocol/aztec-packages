import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';
import type { TxHash } from '../tx/tx_hash.js';

/**
 * Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle
 * inserts found private logs. A TS version of `pending_tagged_log.nr`.
 */
export class PendingTaggedLog {
  constructor(
    public log: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
    public recipient: AztecAddress,
  ) {}

  toFields(): Fr[] {
    return [
      ...serializeBoundedVec(this.log, PRIVATE_LOG_SIZE_IN_FIELDS),
      this.txHash.hash,
      ...serializeBoundedVec(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
      this.recipient.toField(),
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
  const lengthDiff = maxLength - values.length;
  const zeroPaddingArray = Array(lengthDiff).fill(Fr.ZERO);
  const storage = values.concat(zeroPaddingArray);
  return [...storage, new Fr(values.length)];
}
