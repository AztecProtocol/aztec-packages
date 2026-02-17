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

/** Max blocks per checkpoint */
export const MAX_BLOCKS_PER_CHECKPOINT = 72;

/** Max tx effects per body (based on blob capacity per checkpoint) */
export const MAX_TX_EFFECTS_PER_BODY = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;

/** Max block hash string length (hex: 0x + 64 chars, with generous headroom) */
export const MAX_BLOCK_HASH_STRING_LENGTH = 128;
