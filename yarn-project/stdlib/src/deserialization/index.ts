/**
 * Constants for deserialization bounds checking.
 * These constants define maximum allowed sizes during deserialization
 * to prevent DoS attacks via maliciously crafted messages.
 */
import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, MAX_BLOCKS_PER_CHECKPOINT } from '@aztec/constants';

/** Max transactions per block for deserialization validation */
export const MAX_TXS_PER_BLOCK = 2 ** 16;

/** Max committee size - theoretical max from bitmap design (256 bytes × 8 bits) */
export const MAX_COMMITTEE_SIZE = 2048;

/**
 * Maximum number of L2 blocks in a provable checkpoint. Used for deserialization and when ingesting
 * checkpoints already accepted by L1.
 *
 * This MUST be >= the number of blocks the proving system can carry, or a structurally-valid, provable
 * checkpoint that L1 accepts would be rejected on ingest (`validateCheckpoint`) and wedge the archiver.
 * The checkpoint root circuit caps a checkpoint at {@link MAX_BLOCKS_PER_CHECKPOINT} blocks, well under
 * the looser ceiling the blob-field budget imposes:
 *
 *   budget = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB = 6 * 4096 = 24,576 fields
 *
 *   per-block minimal blob footprint (every block carries a per-block l1-to-l2 root):
 *     a block with no txs           = 7 fields   (NUM_BLOCK_END_BLOB_FIELDS)
 *     a block with one minimal tx   = 7 + 4 = 11 fields
 *                                     (NUM_BLOCK_END_BLOB_FIELDS + a 4-field minimal tx:
 *                                      tx start marker + tx hash + fee + 1 mandatory nullifier)
 *     + 1 checkpoint-end marker      (NUM_CHECKPOINT_END_MARKER_FIELDS)
 *
 *   max N:  7 + 11*(N - 1) + 1 <= 24,576  =>  11*(N - 1) <= 24,568  =>  N <= 2,234
 *
 * 2234 is kept as the deserialization bound: it is far above the circuit cap, so it never rejects a
 * provable checkpoint, while still bounding how much a malformed blob payload can allocate. L1 carries
 * no block count of its own, so an over-cap (and therefore unprovable) checkpoint can only reach it with
 * a malicious committee supermajority — a terminal network compromise. Invariant checked by the unit
 * test in deserialization.test.ts.
 */
export const MAX_CAPACITY_BLOCKS_PER_CHECKPOINT = 2234;

/**
 * Max blocks per checkpoint we are willing to build or attest to, and the default block-count limit for
 * `validateCheckpoint`. This is the protocol cap the checkpoint root circuit enforces: anything above it
 * is unprovable, so a node must never build or attest to it. Distinct from
 * {@link MAX_CAPACITY_BLOCKS_PER_CHECKPOINT}, the looser bound used when deserializing untrusted payloads.
 */
export const MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT = MAX_BLOCKS_PER_CHECKPOINT;

/** Max tx effects per body (based on blob capacity per checkpoint) */
export const MAX_TX_EFFECTS_PER_BODY = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;

/** Max block hash string length (hex: 0x + 64 chars, with generous headroom) */
export const MAX_BLOCK_HASH_STRING_LENGTH = 128;
