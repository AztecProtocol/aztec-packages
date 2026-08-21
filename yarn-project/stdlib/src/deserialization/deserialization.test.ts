import {
  NUM_BLOCK_END_BLOB_FIELDS,
  NUM_CHECKPOINT_END_MARKER_FIELDS,
  getNumTxBlobFields,
} from '@aztec/blob-lib/encoding';
import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB } from '@aztec/constants';

import { MAX_CAPACITY_BLOCKS_PER_CHECKPOINT } from './index.js';

describe('MAX_CAPACITY_BLOCKS_PER_CHECKPOINT', () => {
  // Smallest blob footprint of a single tx: start marker + tx hash + fee + 1 mandatory nullifier.
  // Derived from getNumTxBlobFields so it tracks the tx encoding automatically.
  const MIN_TX_BLOB_FIELDS = getNumTxBlobFields({
    numNoteHashes: 0,
    numNullifiers: 1,
    numL2ToL1Msgs: 0,
    numPublicDataWrites: 0,
    numPrivateLogs: 0,
    privateLogsLength: 0,
    publicLogsLength: 0,
    contractClassLogLength: 0,
  });

  // Largest checkpoint that fits in the blob budget with the most compact construction:
  // one (possibly empty) first block + (N - 1) single-nullifier blocks + a checkpoint-end marker. Every block
  // spends the same block-end overhead, including the per-block l1-to-l2 root.
  // This is the real ceiling the proving system / L1 enforce — there is no explicit block-count cap.
  const blobBudget = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;
  const maxBlocksThatFitInBlobs =
    1 +
    Math.floor(
      (blobBudget - NUM_CHECKPOINT_END_MARKER_FIELDS - NUM_BLOCK_END_BLOB_FIELDS) /
        (NUM_BLOCK_END_BLOB_FIELDS + MIN_TX_BLOB_FIELDS),
    );

  it('is not stricter than the blob-capacity ceiling enforced by the circuits/L1', () => {
    // If the node bound were below what blobs can carry, a structurally-valid checkpoint that L1
    // accepts (and can be proven) would be rejected on ingest and permanently wedge the archiver.
    expect(MAX_CAPACITY_BLOCKS_PER_CHECKPOINT).toBeGreaterThanOrEqual(maxBlocksThatFitInBlobs);
  });

  it('matches the documented ceiling for the current blob constants', () => {
    // Pins the arithmetic so a change to BLOBS_PER_CHECKPOINT / FIELDS_PER_BLOB / block-field counts
    // is noticed and the constant + its comment get revisited.
    expect(maxBlocksThatFitInBlobs).toBe(2234);
    expect(MAX_CAPACITY_BLOCKS_PER_CHECKPOINT).toBe(2234);
  });
});
