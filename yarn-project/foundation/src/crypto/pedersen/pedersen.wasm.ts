import { BarretenbergSync } from '@aztec/bb.js';

import { Fr } from '../../curves/bn254/field.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Create a pedersen commitment (point) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
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
 * @param input - The input fieldables to hash.
 * @param index - The separator index to use for the hash.
 * @returns The pedersen hash.
 */
export async function pedersenHash(input: Fieldable[], index = 0): Promise<Fr> {
  const inputFields = serializeToFields(input);
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.pedersenHash({
    inputs: inputFields.map(i => i.toBuffer()),
    hashIndex: index,
  });
  return Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a pedersen hash from an arbitrary length buffer.
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
