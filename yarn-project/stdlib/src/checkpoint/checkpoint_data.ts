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

/** Lightweight checkpoint metadata without full block data. */
export type CheckpointData = {
  checkpointNumber: CheckpointNumber;
  header: CheckpointHeader;
  archive: AppendOnlyTreeSnapshot;
  checkpointOutHash: Fr;
  startBlock: BlockNumber;
  blockCount: number;
  attestations: CommitteeAttestation[];
  l1: L1PublishedData;
};

export const CheckpointDataSchema = z
  .object({
    checkpointNumber: CheckpointNumberSchema,
    header: CheckpointHeader.schema,
    archive: AppendOnlyTreeSnapshot.schema,
    checkpointOutHash: schemas.Fr,
    startBlock: BlockNumberSchema,
    blockCount: schemas.Integer,
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
      attestations: obj.attestations,
      l1: obj.l1,
    }),
  );
