import { poseidon2HashWithSeparator } from '../crypto/poseidon/index.js';
import { sha256Trunc } from '../crypto/sha256/index.js';

/**
 * Defines hasher interface used by Merkle trees.
 */
export interface Hasher {
  /**
   * Hash two arrays.
   * @param lhs - The first array.
   * @param rhs - The second array.
   * @returns The new 32-byte hash.
   */
  hash(lhs: Uint8Array, rhs: Uint8Array): Buffer<ArrayBuffer>;

  /**
   * Hashes an array of buffers.
   * @param inputs - The array of buffers to hash.
   * @returns The resulting 32-byte hash.
   */
  hashInputs(inputs: Buffer[]): Buffer<ArrayBuffer>;
}

/**
 * Defines an async hasher interface used by Merkle trees.
 */
export interface AsyncHasher {
  /**
   * Hash two arrays.
   * @param lhs - The first array.
   * @param rhs - The second array.
   * @returns The new 32-byte hash.
   */
  hash(lhs: Uint8Array, rhs: Uint8Array): Promise<Buffer<ArrayBuffer>>;

  /**
   * Hashes an array of buffers.
   * @param inputs - The array of buffers to hash.
   * @returns The resulting 32-byte hash.
   */
  hashInputs(inputs: Buffer[]): Promise<Buffer<ArrayBuffer>>;
}

export const shaMerkleHash: Hasher['hash'] = (left: Buffer, right: Buffer) =>
  sha256Trunc(Buffer.concat([left, right])) as Buffer<ArrayBuffer>;

/** Creates a poseidon2 merkle hasher with the given domain separator. */
export const makePoseidonMerkleHash =
  (separator: number): AsyncHasher['hash'] =>
  async (left: Buffer, right: Buffer) =>
    (await poseidon2HashWithSeparator([left, right], separator)).toBuffer() as Buffer<ArrayBuffer>;
