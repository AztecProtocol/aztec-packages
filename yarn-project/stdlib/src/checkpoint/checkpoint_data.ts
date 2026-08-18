import {
  BlockNumber,
  BlockNumberSchema,
  CheckpointNumber,
  CheckpointNumberSchema,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { CommitteeAttestation } from '../block/proposal/committee_attestation.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { L1PublishedData } from './published_checkpoint.js';

/** Base type for checkpoint data */
export type CommonCheckpointData = {
  checkpointNumber: CheckpointNumber;
  header: CheckpointHeader;
  startBlock: BlockNumber;
  blockCount: number;
};

/** Data stored with checkpoint data after publishing on l1 */
export type L1EnrichedCheckpointData = {
  attestations: CommitteeAttestation[];
  l1: L1PublishedData;
};

/** Data stored alongside checkpoint data in storage */
export type StorageEnrichedCheckpointData = {
  archive: AppendOnlyTreeSnapshot;
  checkpointOutHash: Fr;
  /** Fee asset price modifier in basis points. Defaults to 0 (no change) when not explicitly set. */
  feeAssetPriceModifier: bigint;
};

/** Data stored only with proposed checkpoint data  */
export type ProposedOnlyCheckpointData = {
  totalManaUsed: bigint;
  feeAssetPriceModifier: bigint;
};

/** Inbox consumption record of a proposed checkpoint, mirroring what `propose` writes for it on L1. */
export type ProposedInboxConsumption = {
  /**
   * Cumulative Inbox message count consumed as of this checkpoint: its last block's L1-to-L2 message tree leaf count
   * under compact indexing. L1 records this per checkpoint and reads it back as the parent total
   * when validating the next checkpoint's consumption, so a simulation against a not-yet-mined parent must override
   * the parent's cell with it — otherwise the parent reads as having consumed nothing and the child's consumption
   * looks larger than it is.
   */
  inboxMsgTotal: bigint;
};

/** Lightweight checkpoint metadata without full block data. */
export type CheckpointData = CommonCheckpointData & StorageEnrichedCheckpointData & L1EnrichedCheckpointData;

/** Input for setting a proposed checkpoint. The archive and checkpointOutHash are computed
 *  internally by the block store from the stored blocks. */
export type ProposedCheckpointInput = CommonCheckpointData & ProposedOnlyCheckpointData;

/** Full data for a proposed checkpoint (proposed but not yet L1-confirmed).
 *  Includes fee-relevant fields used during pipelining to compute the fee header override. */
export type ProposedCheckpointData = ProposedCheckpointInput & StorageEnrichedCheckpointData & ProposedInboxConsumption;

export const ProposedCheckpointDataSchema = z.object({
  checkpointNumber: CheckpointNumberSchema,
  header: CheckpointHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  checkpointOutHash: schemas.Fr,
  startBlock: BlockNumberSchema,
  blockCount: z.number(),
  totalManaUsed: schemas.BigInt,
  feeAssetPriceModifier: schemas.BigInt,
  inboxMsgTotal: schemas.BigInt,
});

export const CheckpointDataSchema = z
  .object({
    checkpointNumber: CheckpointNumberSchema,
    header: CheckpointHeader.schema,
    archive: AppendOnlyTreeSnapshot.schema,
    checkpointOutHash: schemas.Fr,
    startBlock: BlockNumberSchema,
    blockCount: schemas.Integer,
    feeAssetPriceModifier: schemas.BigInt,
    attestations: z.array(CommitteeAttestation.schema),
    l1: L1PublishedData.schema,
  })
  .transform(
    (obj): CheckpointData => ({
      checkpointNumber: obj.checkpointNumber,
      header: obj.header,
      archive: obj.archive,
      checkpointOutHash: obj.checkpointOutHash,
      startBlock: obj.startBlock,
      blockCount: obj.blockCount,
      feeAssetPriceModifier: obj.feeAssetPriceModifier,
      attestations: obj.attestations,
      l1: obj.l1,
    }),
  );
