import { pedersenHashWithHashIndex as cryptoPedersen } from '@aztec/foundation/crypto';
import { IWasmModule } from '@aztec/foundation/wasm';

import { Buffer } from 'buffer';

/**
 * Hashes two arrays.
 * @param wasm - The barretenberg module.
 * @param lhs - The first array.
 * @param rhs - The second array.
 * @returns The new 32-byte hash.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export function pedersenHash(wasm: IWasmModule, lhs: Uint8Array, rhs: Uint8Array): Buffer {
  return pedersenHashWithHashIndex(wasm, [Buffer.from(lhs), Buffer.from(rhs)], 0);
}

/**
 * Computes the hash of an array of buffers.
 * @param wasm - The barretenberg module.
 * @param inputs - The array of buffers to hash.
 * @returns The new 32-byte hash.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export function pedersenHashInputs(wasm: IWasmModule, inputs: Buffer[]): Buffer {
  return pedersenHashWithHashIndex(wasm, inputs, 0);
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
export function pedersenHashWithHashIndex(wasm: IWasmModule, inputs: Buffer[], hashIndex: number): Buffer {
  return cryptoPedersen(inputs, hashIndex);
}
