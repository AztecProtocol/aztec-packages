/**
 * Pedersen hash and commitment operations using barretenberg bbapi.
 */

import { BarretenbergSync } from '../../barretenberg/index.js';
import { Bn254Fr } from '../../types/fields.js';

/**
 * Create a pedersen commitment (point) from an array of input buffers.
 * Left pads any inputs less than 32 bytes.
 * @param input - Input buffers (max 32 bytes each).
 * @param offset - Hash index offset.
 * @returns Point as [x, y] buffers.
 */
export async function pedersenCommit(input: Buffer[], offset = 0) {
  if (!input.every(i => i.length <= 32)) {
    throw new Error('All Pedersen Commit input buffers must be <= 32 bytes.');
  }
  input = input.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.pedersenCommit({
    inputs: input,
    hashIndex: offset,
  });
  return [Buffer.from(response.point.x), Buffer.from(response.point.y)];
}

/**
 * Create a pedersen hash (field) from an array of input fields.
 * @param input - Input fields (Bn254Fr or convertible to Bn254Fr).
 * @param index - The separator index to use for the hash.
 * @returns The pedersen hash.
 */
export async function pedersenHash(input: Bn254Fr[], index = 0): Promise<Bn254Fr> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.pedersenHash({
    inputs: input.map(i => i.toBuffer()),
    hashIndex: index,
  });
  return Bn254Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a pedersen hash from an arbitrary length buffer.
 * @param input - Input buffer.
 * @param index - The separator index.
 * @returns The hash as a buffer.
 */
export async function pedersenHashBuffer(input: Buffer, index = 0) {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.pedersenHashBuffer({
    input,
    hashIndex: index,
  });
  return Buffer.from(response.hash);
}
