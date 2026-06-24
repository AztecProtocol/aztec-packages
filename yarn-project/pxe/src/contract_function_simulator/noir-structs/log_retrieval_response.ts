import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle stores values of this
 * type in a `EphemeralArray`.
 */
export type LogRetrievalResponse = {
  logPayload: Fr[];
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
};
