/**
 * Constants for P2P message deserialization bounds checking.
 * These constants define maximum allowed sizes during deserialization
 * to prevent DoS attacks via maliciously crafted messages.
 */

/** Max transactions per block for deserialization validation (~300x default of 32) */
export { MAX_TXS_PER_BLOCK } from '@aztec/stdlib/deserialization';

/** Max version string length (e.g., "1.0.0-alpha.123") */
export const MAX_VERSION_STRING_LENGTH = 64;

/** Max block hash string length (hex: 0x + 64 chars, with generous headroom) */
export const MAX_BLOCK_HASH_STRING_LENGTH = 128;
