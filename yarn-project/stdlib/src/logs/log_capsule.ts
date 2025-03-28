import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

// Copied over from `log_capsule.nr`
export const LOG_CAPSULE_ARRAY_BASE_SLOT = new Fr(8240937);

export class LogCapsule {
  constructor(
    public log: Fr[],
    public txHash: Fr,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
    public recipient: AztecAddress,
  ) {}

  toFields(): Fr[] {
    return [
      ...serializeBoundedVec(this.log, PRIVATE_LOG_SIZE_IN_FIELDS),
      this.txHash,
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
