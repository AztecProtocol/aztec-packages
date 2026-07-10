import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockHash } from '@aztec/stdlib/block';
import type { TxHash } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle stores values of this
 * type in a `EphemeralArray`.
 */
export type LogRetrievalResponse = {
  logPayload: Fr[];
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
  blockNumber: BlockNumber;
  blockTimestamp: UInt64;
  blockHash: BlockHash;
};
