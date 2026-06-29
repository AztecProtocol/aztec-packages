import { PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

import { ResolvedTx } from './resolved_tx.js';

/**
 * Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle
 * inserts found private logs. A TS version of `pending_tagged_log.nr`.
 */
export class PendingTaggedLog {
  private context: ResolvedTx;

  constructor(
    public log: Fr[],
    txHash: TxHash,
    uniqueNoteHashesInTx: Fr[],
    firstNullifierInTx: Fr,
    blockNumber: number,
    blockHash: Fr,
  ) {
    this.context = new ResolvedTx(txHash, uniqueNoteHashesInTx, firstNullifierInTx, blockNumber, blockHash);
  }

  toFields(): Fr[] {
    return [...serializeBoundedVec(this.log, PRIVATE_LOG_SIZE_IN_FIELDS), ...this.context.toFields()];
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
