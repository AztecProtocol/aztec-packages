import { pedersenHash as cryptoPedersen } from '@aztec/foundation/crypto';

import { Buffer } from 'buffer';

// TODO: DELETE THIS FILE!

/**
 * Hashes two arrays.
 * @param wasm - The barretenberg module.
 * @param lhs - The first array.
 * @param rhs - The second array.
 * @returns The new 32-byte hash.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export function pedersenHash(lhs: Uint8Array, rhs: Uint8Array): Buffer {
  return pedersenHashWithHashIndex([Buffer.from(lhs), Buffer.from(rhs)], 0);
}

/**
 * Computes the hash of an array of buffers.
 * @param wasm - The barretenberg module.
 * @param inputs - The array of buffers to hash.
 * @returns The new 32-byte hash.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export function pedersenHashInputs(inputs: Buffer[]): Buffer {
  return pedersenHashWithHashIndex(inputs, 0);
}

/**
 * Hashes an array of buffers.
 * @param wasm - The barretenberg module.
 * @param inputs - The array of buffers to hash.
 * @param hashIndex - Hash index of the generator to use (See GeneratorIndex enum).
 * @returns The resulting 32-byte hash.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export function pedersenHashWithHashIndex(inputs: Buffer[], hashIndex: number): Buffer {
  return cryptoPedersen(inputs, hashIndex);
}
