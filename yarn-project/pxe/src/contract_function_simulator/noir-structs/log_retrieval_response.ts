import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockHash } from '@aztec/stdlib/block';
import type { TxHash } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `getLogsByTagV3` oracle stores values of this type
 * in a `EphemeralArray`.
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

/**
 * The variant of {@link LogRetrievalResponse} carried by the `getLogsByTagV2` oracle, whose origin-block field is the
 * block timestamp rather than its hash. Retained only so the PXE can keep serving that oracle to already-deployed
 * contracts; partial-note completion uses `getLogsByTagV3`, which carries `blockHash`.
 */
export type LogRetrievalResponseV2 = {
  logPayload: Fr[];
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
  blockNumber: BlockNumber;
  blockTimestamp: UInt64;
};
