import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockHash } from '@aztec/stdlib/block';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle stores values of
 * this type in a `EphemeralArray`.
 *
 * The `blockNumber`/`blockHash` pair mirrors the noir `origin_block: OriginBlock` field: it anchors a discovered note's
 * completion to the block the log was mined in, so the resulting fact is pruned if that block is reorged away.
 */
export type LogRetrievalResponse = {
  logPayload: Fr[];
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
  blockNumber: BlockNumber;
  blockHash: BlockHash;
};
