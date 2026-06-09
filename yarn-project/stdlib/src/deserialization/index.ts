/**
 * Constants for deserialization bounds checking.
 * These constants define maximum allowed sizes during deserialization
 * to prevent DoS attacks via maliciously crafted messages.
 */
import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB } from '@aztec/constants';

/** Max transactions per block for deserialization validation */
export const MAX_TXS_PER_BLOCK = 2 ** 16;

/** Max committee size - theoretical max from bitmap design (256 bytes × 8 bits) */
export const MAX_COMMITTEE_SIZE = 2048;

<<<<<<< HEAD
/** Max blocks per checkpoint */
export const MAX_BLOCKS_PER_CHECKPOINT = 72;
=======
/**
 * Maximum number of L2 blocks in a provable checkpoint. Used for deserialization and when ingesting
 * checkpoints already accepted by L1.
 *
 * This MUST be >= the number of blocks the proving system can carry, or a structurally-valid, provable
 * checkpoint that L1 accepts would be rejected on ingest (`validateCheckpoint`) and wedge the archiver.
 * The circuits and L1 impose no explicit per-checkpoint block count; the ceiling comes from the
 * blob-field budget:
 *
 *   budget = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB = 6 * 4096 = 24,576 fields
 *
 *   per-block minimal blob footprint:
 *     first block  (may be empty)   = 7 fields   (NUM_FIRST_BLOCK_END_BLOB_FIELDS)
 *     every other  (needs >= 1 tx)  = 6 + 4 = 10 fields
 *                                     (NUM_BLOCK_END_BLOB_FIELDS + a 4-field minimal tx:
 *                                      tx start marker + tx hash + fee + 1 mandatory nullifier)
 *     + 1 checkpoint-end marker      (NUM_CHECKPOINT_END_MARKER_FIELDS)
 *
 *   max N:  7 + 10*(N - 1) + 1 <= 24,576  =>  10*(N - 1) <= 24,568  =>  N <= 2,457
 *
 * Only the first block may be empty; every other block needs >= 1 tx (the circuits have no empty-tx
 * variant for non-first blocks), so 2457 is the largest provable checkpoint. The blob format can encode
 * more blocks than this (up to ~4095 with all-empty blocks), but such a checkpoint is unprovable and
 * can only reach L1 with a malicious committee supermajority — a terminal network compromise where a
 * wedged archiver is an acceptable outcome. We therefore bound ingest to the provable maximum.
 * Invariant checked by the unit test in deserialization.test.ts.
 */
export const MAX_CAPACITY_BLOCKS_PER_CHECKPOINT = 2457;

/**
 * Max blocks per checkpoint we are willing to build or attest to (conservative client policy, and the
 * default block-count limit for `validateCheckpoint`). Distinct from {@link MAX_CAPACITY_BLOCKS_PER_CHECKPOINT},
 * which is the higher ceiling we tolerate when deserializing checkpoints already accepted by L1.
 */
export const MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT = 72;
>>>>>>> 7baab8368b0 (feat: merge-train/spartan-v5 (#23965))

/** Max tx effects per body (based on blob capacity per checkpoint) */
export const MAX_TX_EFFECTS_PER_BODY = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;

/** Max block hash string length (hex: 0x + 64 chars, with generous headroom) */
export const MAX_BLOCK_HASH_STRING_LENGTH = 128;
